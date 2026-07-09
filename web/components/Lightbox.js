/**
 * 图片灯箱组件
 * 全屏查看图片 + 右侧信息面板 + 编辑模式（混淆/画笔）
 */
import { h } from '../lib/preact.mjs';
import { useState, useEffect, useCallback } from '../lib/hooks.mjs';
import { Icon } from '../lib/icons.mjs';
import { buildImageUrl } from '../utils.js';
import { showToast } from './Toast.js';
import { useLightboxEditor } from './hooks/useLightboxEditor.js';

function CopyButton({ text, label }) {
  return h(
    'button',
    {
      class: 'lightbox-info-copy-btn',
      onClick: (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text).then(
          () => showToast(`${label || '内容'}已复制`, 'success'),
          () => showToast('复制失败', 'error'),
        );
      },
      title: '复制',
    },
    h(Icon, { name: 'copy', size: 12 }),
  );
}

function InfoBlock({ title, icon, children, copyText, copyLabel }) {
  return h('div', { class: 'lightbox-info-block' }, [
    h('div', { class: 'lightbox-info-block-title' }, [
      h(Icon, { name: icon, size: 14 }),
      h('span', {}, title),
      copyText && h(CopyButton, { text: copyText, label: copyLabel }),
    ]),
    h('div', { class: 'lightbox-info-block-content' }, children),
  ]);
}

function parseImageInfo(info, imagePath) {
  if (!info) return null;

  const pnginfo = info.pnginfo || {};

  // 提取工作流 JSON；没有 workflow 时降级使用 prompt metadata。
  let workflowText = '';
  let workflowSource = '';
  try {
    if (pnginfo.workflow) {
      const wf = JSON.parse(pnginfo.workflow);
      workflowText = JSON.stringify(wf, null, 2);
      workflowSource = 'workflow';
    }
  } catch {
    workflowText = pnginfo.workflow || '';
    workflowSource = workflowText ? 'workflow' : '';
  }
  if (!workflowText && pnginfo.prompt) {
    try {
      const prompt = JSON.parse(pnginfo.prompt);
      workflowText = JSON.stringify(prompt, null, 2);
    } catch {
      workflowText = pnginfo.prompt || '';
    }
    workflowSource = workflowText ? 'prompt' : '';
  }

  return { workflowText, workflowSource, imagePath };
}

function InfoPanel({ info, loading, imagePath, customFieldValues, imageFields }) {
  if (loading) {
    return h('div', { class: 'lightbox-info-loading' }, h(Icon, { name: 'loader', size: 20, class: 'spin' }));
  }

  if (!info) {
    return h('div', { class: 'lightbox-info-empty' }, '暂无信息');
  }

  const { imagePath: path } = info; // workflowText 已移至操作栏

  // 按字段定义顺序展示所有有值的字段（含内置 + 自定义，通过 evaluate API）
  const fieldEntries = (customFieldValues && imageFields)
    ? imageFields
        .filter(f => {
          const v = customFieldValues[f.id];
          return v !== undefined && v !== null && v !== '';
        })
        .map(f => ({ id: f.id, name: f.name, value: customFieldValues[f.id] }))
    : [];

  // 判断值是否适合单行显示
  const isShortValue = (v) => typeof v === 'string' && v.length <= 80 && !v.includes('\n');

  return h('div', { class: 'lightbox-info-content' }, [
    // 路径快捷复制
    path && h('div', { class: 'lightbox-info-copy-row' }, [h(CopyButton, { text: path, label: '路径' })]),

    // 每个字段单独一个 InfoBlock
    ...fieldEntries.map(entry =>
      h(
        InfoBlock,
        { title: entry.name, icon: 'info-circle', copyText: entry.value, copyLabel: entry.name },
        [isShortValue(entry.value)
          ? h('span', { class: 'lightbox-info-inline-value' }, entry.value)
          : h('pre', { class: 'lightbox-info-pre' }, entry.value)
        ],
      ),
    ),

    fieldEntries.length === 0 &&
      h('div', { class: 'lightbox-info-empty' }, '暂无额外信息'),
  ]);
}

function EditToolbar({ editor }) {
  const { activeTool, setActiveTool, applyObfuscation, restoreOriginal, handleUndo, exitEditMode } = editor;

  const toolbarBtn = (icon, title, onClick, isActive) =>
    h(
      'button',
      {
        class: isActive ? 'active' : '',
        onClick: (e) => { e.stopPropagation(); onClick(); },
        title,
      },
      h(Icon, { name: icon, size: 16 }),
    );

  return h('div', { class: 'gallery-lightbox-edit-toolbar' }, [
    toolbarBtn('grid-3x3', '马赛克', () => setActiveTool(activeTool === 'mosaic' ? 'none' : 'mosaic'), activeTool === 'mosaic'),
    toolbarBtn('shuffle', '混淆', applyObfuscation, false),
    toolbarBtn('refresh-cw', '还原', restoreOriginal, false),
    toolbarBtn('brush', '画笔', () => setActiveTool(activeTool === 'brush' ? 'none' : 'brush'), activeTool === 'brush'),
    toolbarBtn('undo', '撤销', handleUndo, false),
    toolbarBtn('x', '退出编辑', exitEditMode, false),
  ]);
}

function MosaicPanel({ brushSize, blockSize, onBrushSizeChange, onBlockSizeChange }) {
  return h('div', { class: 'gallery-lightbox-brush-panel gallery-lightbox-mosaic-panel' }, [
    h('span', { class: 'brush-size-label mosaic-label' }, `范围 ${brushSize}px`),
    h('input', {
      type: 'range',
      min: 12,
      max: 160,
      value: brushSize,
      onInput: (e) => onBrushSizeChange(parseInt(e.target.value)),
      title: '马赛克范围',
    }),
    h('span', { class: 'brush-size-label mosaic-label' }, `块 ${blockSize}px`),
    h('input', {
      type: 'range',
      min: 4,
      max: 40,
      value: blockSize,
      onInput: (e) => onBlockSizeChange(parseInt(e.target.value)),
      title: '马赛克块大小',
    }),
    h('div', {
      class: 'mosaic-size-preview',
      style: {
        width: `${Math.max(8, blockSize)}px`,
        height: `${Math.max(8, blockSize)}px`,
      },
    }),
  ]);
}

function BrushPanel({ brushColor, brushSize, onColorChange, onSizeChange }) {
  return h('div', { class: 'gallery-lightbox-brush-panel' }, [
    h('input', {
      type: 'color',
      value: brushColor,
      onInput: (e) => onColorChange(e.target.value),
      title: '画笔颜色',
    }),
    h('span', { class: 'brush-size-label' }, `${brushSize}px`),
    h('input', {
      type: 'range',
      min: 1,
      max: 50,
      value: brushSize,
      onInput: (e) => onSizeChange(parseInt(e.target.value)),
      title: '画笔大小',
    }),
    h('div', {
      class: 'brush-size-preview',
      style: {
        width: `${Math.max(4, brushSize)}px`,
        height: `${Math.max(4, brushSize)}px`,
        borderRadius: '50%',
        background: brushColor,
      },
    }),
  ]);
}

export function Lightbox({ isOpen, prompt, imageIndex, onClose, onNavigate, imageFields = [] }) {
  const [showInfo, setShowInfo] = useState(true);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [customFieldValues, setCustomFieldValues] = useState({});
  const editor = useLightboxEditor();

  const img = prompt ? prompt.images[imageIndex] : null;
  const imagePath = img?.path;

  useEffect(() => {
    if (isOpen && imagePath) {
      setLoading(true);
      setInfo(null);
      setCustomFieldValues({});
      fetch(`/prompt_gallery/image/info?path=${encodeURIComponent(imagePath)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setInfo(parseImageInfo(data.info, imagePath));
          } else {
            showToast('获取图片信息失败: ' + (data.error || ''), 'error');
          }
        })
        .catch((err) => showToast('请求失败: ' + err.message, 'error'))
        .finally(() => setLoading(false));

      // 获取自定义字段值
      if (imageFields.length > 0) {
        const fieldIds = imageFields.map(f => f.id);
        fetch('/prompt_gallery/image_fields/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fieldIds, imagePath }),
        })
          .then(res => res.json())
          .then(data => {
            if (data.success) setCustomFieldValues(data.values || {});
          })
          .catch(() => {});
      }
    }
  }, [isOpen, imagePath, imageFields]);

  useEffect(() => {
    if (editor.editMode) {
      editor.exitEditMode();
    }
  }, [imagePath]);

  const handlePrev = () => onNavigate(-1);
  const handleNext = () => onNavigate(1);

  const handleKeyDown = useCallback(
    (e) => {
      if (editor.editMode) {
        if (e.key === 'Escape') {
          editor.exitEditMode();
          return;
        }
      }
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onNavigate(-1);
      if (e.key === 'ArrowRight') onNavigate(1);
    },
    [onClose, onNavigate, editor.editMode, editor.exitEditMode],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!isOpen || !prompt || !img) return null;

  const cursorStyle = editor.editMode && editor.activeTool === 'brush'
    ? 'crosshair'
    : editor.editMode && editor.activeTool === 'mosaic'
      ? 'cell'
    : editor.editMode && editor.activeTool === 'obfuscate'
      ? 'pointer'
      : undefined;

  return h(
    'div',
    {
      class: `gallery-lightbox ${isOpen ? 'open' : ''}`,
      onClick: (e) => {
        if (editor.editMode) return;
        if (
          e.target.classList.contains('gallery-lightbox') ||
          e.target.classList.contains('gallery-lightbox-image-section')
        )
          onClose();
      },
    },
    [
      h('div', { class: 'gallery-lightbox-image-section' }, [
        editor.editMode
          ? h('canvas', {
              ref: (el) => { editor.canvasRef.current = el; },
              class: 'gallery-lightbox-canvas',
              style: cursorStyle ? { cursor: cursorStyle } : undefined,
              onMouseDown: editor.handleBrushStart,
              onMouseMove: editor.handleBrushMove,
              onMouseUp: editor.handleBrushEnd,
              onMouseLeave: editor.handleBrushEnd,
              onTouchStart: editor.handleBrushStart,
              onTouchMove: editor.handleBrushMove,
              onTouchEnd: editor.handleBrushEnd,
            })
          : h('img', {
              class: 'gallery-lightbox-img',
              src: buildImageUrl(img.path, img.type),
              alt: prompt.name || prompt.value,
            }),

        !editor.editMode &&
          h(
            'button',
            {
              class: 'gallery-lightbox-nav gallery-lightbox-prev',
              onClick: handlePrev,
            },
            h(Icon, { name: 'chevron-left', size: 24 }),
          ),

        !editor.editMode &&
          h(
            'button',
            {
              class: 'gallery-lightbox-nav gallery-lightbox-next',
              onClick: handleNext,
            },
            h(Icon, { name: 'chevron-right', size: 24 }),
          ),

        !editor.editMode &&
          h('div', { class: 'gallery-lightbox-action-bar' }, [
            h(
              'button',
              {
                class: 'gallery-lightbox-action-btn',
                onClick: (e) => {
                  e.stopPropagation();
                  editor.enterEditMode(img.path, img.type);
                },
                title: '编辑图片',
              },
              h(Icon, { name: 'edit', size: 16 }),
              h('span', {}, '编辑'),
            ),
            info?.workflowText &&
              h(
                'button',
                {
                  class: 'gallery-lightbox-action-btn',
                  onClick: (e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(info.workflowText).then(
                      () => showToast('工作流已复制', 'success'),
                      () => showToast('复制失败', 'error'),
                    );
                  },
                  title: '复制工作流',
                },
                h(Icon, { name: 'package', size: 16 }),
                h('span', {}, '复制工作流'),
              ),
          ]),

        editor.editMode &&
          h(EditToolbar, { editor }),

        editor.editMode && editor.activeTool === 'mosaic' &&
          h(MosaicPanel, {
            brushSize: editor.mosaicBrushSize,
            blockSize: editor.mosaicBlockSize,
            onBrushSizeChange: editor.setMosaicBrushSize,
            onBlockSizeChange: editor.setMosaicBlockSize,
          }),

        editor.editMode && editor.activeTool === 'brush' &&
          h(BrushPanel, {
            brushColor: editor.brushColor,
            brushSize: editor.brushSize,
            onColorChange: editor.setBrushColor,
            onSizeChange: editor.setBrushSize,
          }),

        h('div', { class: 'gallery-lightbox-info' }, [
          h('span', {}, `${prompt.name || prompt.value} · ${imageIndex + 1} / ${prompt.images.length}`),
          h(
            'button',
            {
              class: `gallery-lightbox-info-toggle ${showInfo ? 'active' : ''}`,
              onClick: () => setShowInfo((prev) => !prev),
              title: showInfo ? '隐藏信息' : '显示信息',
            },
            h(Icon, { name: 'info-circle', size: 14 }),
          ),
        ]),
      ]),

      showInfo &&
        h('div', { class: 'gallery-lightbox-info-panel' }, [
          h('div', { class: 'lightbox-info-header' }, [
            h(Icon, { name: 'info-circle', size: 16 }),
            h('span', {}, '图片信息'),
          ]),
          h(InfoPanel, { info, loading, imagePath: img?.path, customFieldValues, imageFields }),
        ]),
    ],
  );
}
