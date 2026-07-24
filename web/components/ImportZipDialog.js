/**
 * 导入ZIP对话框
 * 支持拖拽或选择ZIP文件，带分离存储选项
 */
import { h } from '../lib/preact.mjs';
import { useState, useRef } from '../lib/hooks.mjs';
import { Dialog, DialogButton } from './Dialog.js';
import { showToast } from './Toast.js';
import { Icon } from '../lib/icons.mjs';

export function ImportZipDialog({ isOpen, onClose, currentCategory, onSuccess }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [separateStorage, setSeparateStorage] = useState(true);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = (files) => {
    const file = files[0];
    if (!file) return;
    if (!file.name.endsWith('.zip')) {
      showToast('请选择ZIP文件', 'warning');
      return;
    }
    setSelectedFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    handleFileSelect(Array.from(e.dataTransfer.files));
  };

  const handleClick = () => {
    fileInputRef.current.click();
  };

  const handleInputChange = (e) => {
    handleFileSelect(Array.from(e.target.files));
    e.target.value = '';
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleImport = async () => {
    if (!selectedFile) {
      showToast('请选择ZIP文件', 'warning');
      return;
    }

    setImporting(true);
    try {
      const { importPrompts } = await import('../utils.js');
      const result = await importPrompts(selectedFile, currentCategory, separateStorage);
      if (result.success) {
        const parts = [];
        if (result.addedCategories > 0) parts.push(`${result.addedCategories} 个分类`);
        if (result.addedPrompts > 0) parts.push(`${result.addedPrompts} 个Prompt`);
        if (result.addedImages > 0) parts.push(`${result.addedImages} 张图片`);
        showToast(`导入成功: ${parts.join(', ') || '无新增内容'}`, 'success');
        if (onSuccess) onSuccess();
        handleClose();
      } else {
        showToast(result.error || '导入失败', 'error');
      }
    } catch (error) {
      showToast('导入失败: ' + error.message, 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setSeparateStorage(false);
    setDragging(false);
    onClose();
  };

  return h(
    Dialog,
    {
      isOpen,
      onClose: handleClose,
      title: '导入Prompt数据',
      titleIcon: h(Icon, { name: 'download', size: 18 }),
      maxWidth: '500px',
      footer: [
        h(DialogButton, { onClick: handleClose }, '取消'),
        h(
          DialogButton,
          {
            variant: 'primary',
            onClick: handleImport,
            disabled: importing || !selectedFile,
          },
          importing ? '导入中...' : '导入',
        ),
      ],
    },
    [
      // 拖拽区域
      h(
        'div',
        {
          class: `drag-drop-zone ${dragging ? 'dragging' : ''}`,
          onDragOver: handleDragOver,
          onDragLeave: handleDragLeave,
          onDrop: handleDrop,
          onClick: handleClick,
        },
        [
          h('div', { class: 'drag-drop-icon' }, h(Icon, { name: 'package', size: 28 })),
          h('div', { class: 'drag-drop-text' }, '拖拽ZIP文件到此处或点击选择'),
          h('div', { class: 'drag-drop-hint' }, '支持导出的ZIP格式'),
        ],
      ),

      // 隐藏的文件输入
      h('input', {
        type: 'file',
        ref: fileInputRef,
        style: { display: 'none' },
        accept: '.zip',
        onChange: handleInputChange,
      }),

      // 已选文件
      selectedFile &&
        h('div', { class: 'file-list' }, [
          h('div', { class: 'file-item' }, [
            h(Icon, { name: 'package', size: 14 }),
            h('span', { class: 'file-name' }, selectedFile.name),
            h('span', { class: 'file-size' }, formatFileSize(selectedFile.size)),
            h(
              'button',
              {
                class: 'file-remove',
                onClick: (e) => {
                  e.stopPropagation();
                  setSelectedFile(null);
                },
                title: '移除',
              },
              h(Icon, { name: 'x', size: 14 }),
            ),
          ]),
        ]),

      // 分离存储选项
      h('div', { class: 'import-config', style: { marginTop: '12px' } }, [
        h('div', { class: 'form-checkbox' }, [
          h('input', {
            type: 'checkbox',
            id: 'zip-separate-storage',
            checked: separateStorage,
            onInput: (e) => setSeparateStorage(e.target.checked),
          }),
          h('label', { for: 'zip-separate-storage' }, [
            '分离存储',
            h('span', { class: 'form-checkbox-recommend' }, '推荐'),
            ' 写入独立文件，可在设置中随时禁用/删除',
          ]),
        ]),
      ]),
    ],
  );
}
