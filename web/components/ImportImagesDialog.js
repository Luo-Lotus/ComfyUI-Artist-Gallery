/**
 * 导入图片对话框
 * 支持两种视图模式：
 * - Prompt详情视图：自动代入当前Prompt，直接导入
 * - 分类视图：自动代入当前分类，显示解析配置选项
 */

import { h } from '../lib/preact.mjs';
import { useState, useEffect } from '../lib/hooks.mjs';
import { Dialog, DialogButton } from './Dialog.js';
import { FileUploader } from './FileUploader.js';
import { ImportPreview } from './ImportPreview.js';
import { showToast } from './Toast.js';
import { Icon } from '../lib/icons.mjs';

export function ImportImagesDialog({
  isOpen,
  onClose,
  viewMode, // 'gallery' | 'prompt'
  currentCategory,
  currentPrompt, // 仅在prompt视图时传入
  categories,
  onSuccess,
}) {
  // ============ 状态管理 ============
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);

  // 自定义导入配置（仅分类视图）
  const [parseStrategy, setParseStrategy] = useState('auto_create');
  const [regexPattern, setRegexPattern] = useState('@([^,]+),');
  const [autoCreatePrompt, setAutoCreatePrompt] = useState(true);
  const [urlDecode, setUrlDecode] = useState(false);
  const [separateStorage, setSeparateStorage] = useState(false);

  // 打开时重置配置状态（对话框常驻挂载，状态会跨次打开残留）
  useEffect(() => {
    if (isOpen) {
      setParseStrategy('auto_create');
      setRegexPattern('@([^,]+),');
      setUrlDecode(false);
      setSeparateStorage(false);
    }
  }, [isOpen]);

  // ============ 工具函数 ============

  const buildConfig = () => {
    if (viewMode === 'prompt') {
      // Prompt详情视图：使用当前Prompt信息
      return {
        mode: 'single',
        categoryId: currentPrompt.categoryId,
        promptName: currentPrompt.value,
        displayName: currentPrompt.name || currentPrompt.value,
        separateStorage,
      };
    } else {
      // 分类视图：使用解析配置
      return {
        mode: 'custom',
        parseStrategy: parseStrategy,
        defaultCategoryId: currentCategory,
        regexPattern: regexPattern,
        autoCreatePrompt: autoCreatePrompt,
        urlDecode: urlDecode,
        separateStorage,
      };
    }
  };

  const buildRequestBody = () => {
    // 构建请求体，确保顶层mode和config里的mode一致
    if (viewMode === 'prompt') {
      return {
        mode: 'single',
        images: null, // 稍后在handleImport中填充
        config: buildConfig(),
        separateStorage,
      };
    } else {
      return {
        mode: 'custom',
        images: null, // 稍后在handleImport中填充
        config: buildConfig(),
        separateStorage,
      };
    }
  };

  const loadPreview = async () => {
    if (selectedFiles.length === 0) {
      setPreview(null);
      return;
    }

    const filenames = selectedFiles.map((f) => f.name);

    try {
      const requestBody = {
        filenames,
        config: buildConfig(),
      };

      const response = await fetch('/prompt_gallery/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();
      setPreview(data.preview);
    } catch (error) {
      console.error('预览加载失败:', error);
      showToast('预览加载失败', 'error');
    }
  };

  const handleImport = async () => {
    if (selectedFiles.length === 0) {
      showToast('请选择要导入的图片', 'warning');
      return;
    }

    setImporting(true);

    try {
      // 读取文件为base64
      const filePromises = selectedFiles.map(async (file) => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve({
              filename: file.name,
              data: reader.result.split(',')[1],
              size: file.size,
            });
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      });

      const images = await Promise.all(filePromises);

      // 调用导入API
      const requestBody = {
        mode: viewMode === 'prompt' ? 'single' : 'custom',
        images: images,
        config: buildConfig(),
        separateStorage,
      };

      const response = await fetch('/prompt_gallery/import/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      if (result.success) {
        const successMsg = result.imported > 0 ? `导入成功: ${result.imported}张` : '导入完成';

        const errorMsg = result.failed > 0 ? `，失败: ${result.failed}张` : '';

        showToast(successMsg + errorMsg, result.failed > 0 ? 'warning' : 'success');

        if (onSuccess) onSuccess();
        handleClose();
      } else {
        showToast('导入失败: ' + (result.error || '未知错误'), 'error');
      }
    } catch (error) {
      console.error('导入失败:', error);
      showToast('导入失败: ' + error.message, 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setSelectedFiles([]);
    setPreview(null);
    onClose();
  };

  const getDialogTitle = () => {
    if (viewMode === 'prompt') {
      return `导入图片到 ${currentPrompt.name || currentPrompt.value}`;
    } else {
      const category = categories.find((c) => c.id === currentCategory);
      const categoryName = category ? category.name : currentCategory;
      return `导入图片到 ${categoryName}`;
    }
  };

  // ============ 渲染函数 ============

  const renderConfigOptions = () => {
    const separateStorageCheckbox = h('div', { class: 'form-checkbox' }, [
      h('input', {
        type: 'checkbox',
        checked: separateStorage,
        onInput: (e) => setSeparateStorage(e.target.checked),
      }),
      h('label', {}, '分离存储（写入新文件而非追加到主文件）'),
    ]);

    // 分类视图：显示完整配置
    if (viewMode !== 'prompt') {
      return h('div', { class: 'import-config' }, [
        h('div', { class: 'form-group' }, [
          h('label', {}, '解析策略:'),
          h(
            'select',
            {
              value: parseStrategy,
              onInput: (e) => setParseStrategy(e.target.value),
            },
            [h('option', { value: 'regex' }, '正则提取'), h('option', { value: 'auto_create' }, '直接使用文件名')],
          ),
        ]),

        parseStrategy === 'regex' &&
          h('div', { class: 'form-group' }, [
            h('label', {}, '正则模式:'),
            h('input', {
              type: 'text',
              value: regexPattern,
              placeholder: '例如: @([^,]+),',
              onInput: (e) => setRegexPattern(e.target.value),
            }),
            h(
              'div',
              { class: 'form-hint' },
              '提示: 使用捕获组()提取Prompt名，例如 @([^,]+), 会从 @akakura,_1.png 提取 akakura',
            ),
          ]),

        h('div', { class: 'form-checkbox' }, [
          h('input', {
            type: 'checkbox',
            checked: autoCreatePrompt,
            onInput: (e) => setAutoCreatePrompt(e.target.checked),
          }),
          h('label', {}, '自动创建不存在的Prompt'),
        ]),

        h('div', { class: 'form-checkbox' }, [
          h('input', {
            type: 'checkbox',
            checked: urlDecode,
            onInput: (e) => setUrlDecode(e.target.checked),
          }),
          h('label', {}, 'URL解码文件名'),
        ]),

        separateStorageCheckbox,
      ]);
    }

    // Prompt视图：仅显示分离存储选项
    return h('div', { class: 'import-config' }, [separateStorageCheckbox]);
  };

  const renderFooter = () => {
    return [
      h(DialogButton, { onClick: handleClose }, '取消'),
      h(
        DialogButton,
        {
          variant: 'primary',
          onClick: handleImport,
          disabled: importing || selectedFiles.length === 0,
        },
        importing ? '导入中...' : '导入',
      ),
    ];
  };

  // ============ 主渲染 ============

  return h(
    Dialog,
    {
      isOpen,
      onClose: handleClose,
      title: getDialogTitle(),
      titleIcon: h(Icon, { name: 'download', size: 18 }),
      maxWidth: '700px',
      footer: renderFooter(),
    },
    [
      h(FileUploader, {
        files: selectedFiles,
        onChange: setSelectedFiles,
        onPreview: loadPreview,
      }),

      renderConfigOptions(),

      // Prompt详情视图的简单提示
      viewMode === 'prompt' &&
        selectedFiles.length > 0 &&
        h(
          'div',
          {
            class: 'import-single-prompt-hint',
          },
          [h('p', {}, `所有图片将导入到: ${currentPrompt.name || currentPrompt.value}`)],
        ),

      // 分类视图的预览
      viewMode === 'gallery' &&
        preview &&
        h(ImportPreview, {
          preview,
          categories,
        }),
    ],
  );
}
