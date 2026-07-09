/**
 * 导入 ComfyUI 输出图片弹窗
 * 扫描 output 目录，按白名单/黑名单过滤，读取 PNG 元数据
 */
import { h } from '../lib/preact.mjs';
import { useState, useCallback, useRef } from '../lib/hooks.mjs';
import { Dialog, DialogButton, DialogFormGroup, DialogFormItem } from './Dialog.js';
import { showToast } from './Toast.js';
import { Icon } from '../lib/icons.mjs';
import { buildSSEUrl, createSSE } from '../services/sseClient.js';

export function ImportOutputDialog({ isOpen, onClose, onSuccess }) {
  const [filterMode, setFilterMode] = useState('whitelist');
  const [foldersText, setFoldersText] = useState('');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(null);
  const cancelImportRef = useRef(null);

  const handleClose = useCallback(() => {
    if (cancelImportRef.current) {
      cancelImportRef.current();
      cancelImportRef.current = null;
    }
    setFilterMode('whitelist');
    setFoldersText('');
    setImporting(false);
    setProgress(null);
    onClose();
  }, [onClose]);

  const handleImport = useCallback(async () => {
    const folders = foldersText
      .split('\n')
      .map(f => f.trim())
      .filter(f => f.length > 0);

    if (filterMode === 'whitelist' && folders.length === 0) {
      showToast('白名单模式下请至少输入一个文件夹路径', 'warning');
      return;
    }

    setImporting(true);
    setProgress({
      phase: 'preparing',
      scanned: 0,
      processed: 0,
      imported: 0,
      duplicated: 0,
      errorCount: 0,
    });

    const url = buildSSEUrl('/prompt_gallery/import_output', {
      filterMode,
      folders,
    });

    cancelImportRef.current = createSSE(url, {
      onProgress: (data) => {
        setProgress(data);
      },
      onDone: (result) => {
        cancelImportRef.current = null;
        setImporting(false);

        const parts = [`扫描 ${result.totalScanned} 张图片`];
        if (result.imported > 0) parts.push(`导入 ${result.imported} 张`);
        if (result.duplicated > 0) parts.push(`跳过 ${result.duplicated} 张（已存在）`);
        if (result.errorCount > 0) parts.push(`失败 ${result.errorCount} 张`);
        showToast(parts.join('，'), result.errorCount > 0 ? 'warning' : 'success');
        if (onSuccess) onSuccess();
        handleClose();
      },
      onError: (event) => {
        cancelImportRef.current = null;
        setImporting(false);
        let message = '连接中断';
        if (event?.data) {
          try {
            message = JSON.parse(event.data).error || message;
          } catch (e) {
            message = '未知错误';
          }
        }
        showToast('导入失败: ' + (message || '未知错误'), 'error');
      },
    });
  }, [filterMode, foldersText, onSuccess, handleClose]);

  const renderFooter = () => [
    h(DialogButton, { onClick: handleClose }, '取消'),
    h(DialogButton, {
      variant: 'primary',
      onClick: handleImport,
      disabled: importing,
    }, importing ? '导入中...' : '开始导入'),
  ];

  return h(Dialog, {
    isOpen,
    onClose: handleClose,
    title: '导入 ComfyUI 输出图片',
    titleIcon: h(Icon, { name: 'download', size: 18 }),
    maxWidth: '600px',
    maxHeight: '600px',
    footer: renderFooter(),
  }, [
    // 存储说明
    h('div', {
      style: {
        padding: '10px 14px',
        background: 'var(--g-bg-input)',
        border: '1px solid var(--g-border)',
        borderRadius: '8px',
        fontSize: '12px',
        color: 'var(--g-text-muted)',
        marginBottom: '16px',
        lineHeight: '1.5',
      },
    }, [
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' } }, [
        h(Icon, { name: 'info-circle', size: 14 }),
        h('span', { style: { fontWeight: '600', color: 'var(--g-text-secondary)' } }, '存储说明'),
      ]),
      h('div', {}, '数据将存储为: comfy_output.images.json'),
      h('div', {}, '可在插件存储目录中删除此文件以移除所有导入'),
    ]),

    progress && h('div', {
      style: {
        padding: '10px 14px',
        background: 'var(--g-bg-input)',
        border: '1px solid var(--g-border)',
        borderRadius: '8px',
        fontSize: '12px',
        color: 'var(--g-text-secondary)',
        marginBottom: '16px',
        lineHeight: '1.7',
      },
    }, [
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' } }, [
        h(Icon, { name: 'activity', size: 14 }),
        h('span', { style: { fontWeight: '600' } }, _phaseLabel(progress.phase)),
      ]),
      h('div', {}, `已扫描 ${progress.scanned || 0} 张，已处理 ${progress.processed || 0} 张`),
      h('div', {}, `导入 ${progress.imported || 0} 张，跳过 ${progress.duplicated || 0} 张，失败 ${progress.errorCount || 0} 张`),
    ]),

    h(DialogFormGroup, {}, [
      // 过滤模式
      h(DialogFormItem, { label: '过滤模式' }, [
        h('div', { style: { display: 'flex', gap: '12px' } }, [
          _renderRadioOption('whitelist', '白名单', '仅导入列出的目录', filterMode, setFilterMode),
          _renderRadioOption('blacklist', '黑名单', '排除列出的目录', filterMode, setFilterMode),
        ]),
      ]),

      // 文件夹路径
      h(DialogFormItem, { label: '文件夹路径（相对于 ComfyUI 输出目录，每行一个）' }, [
        h('textarea', {
          class: 'gallery-form-textarea',
          value: foldersText,
          onInput: (e) => setFoldersText(e.target.value),
          placeholder: '例如:\n2024-01-01\nmy_workflow/output\n\n黑名单留空 = 导入整个输出目录',
          rows: 6,
          style: { resize: 'vertical' },
        }),
      ]),
    ]),
  ]);
}

function _phaseLabel(phase) {
  switch (phase) {
    case 'preparing':
      return '准备中';
    case 'scanning':
      return '扫描中';
    case 'metadata':
      return '读取元数据';
    case 'writing':
      return '写入数据';
    default:
      return '处理中';
  }
}

function _renderRadioOption(value, label, desc, filterMode, setFilterMode) {
  const selected = filterMode === value;
  return h('label', {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '8px 14px',
      border: `2px solid ${selected ? 'var(--g-accent)' : 'var(--g-border)'}`,
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '13px',
      background: selected ? 'var(--g-accent-light)' : 'var(--g-bg-input)',
      color: 'var(--g-text)',
    },
  }, [
    h('input', {
      type: 'radio',
      name: 'filterMode',
      value,
      checked: selected,
      onChange: () => setFilterMode(value),
      style: { accentColor: 'var(--g-accent)' },
    }),
    h('span', {}, label),
    h('span', { style: { fontSize: '11px', color: 'var(--g-text-muted)' } }, `（${desc}）`),
  ]);
}
