/**
 * 分区项组件
 * 显示单个分区及其内容（扁平列表 + 拖拽排序）
 */
import { h } from '../../lib/preact.mjs';
import { useState, useEffect, useRef } from '../../lib/hooks.mjs';
import { Icon } from '../../lib/icons.mjs';
import { PartitionHeader } from './PartitionHeader.js';
import { useBodyRender } from './hooks/useBodyRender.js';
import { usePartitionPreview } from './hooks/usePartitionPreview.js';

function getWeightColor(weight) {
  const w = Math.max(0, Math.min(2, weight));
  let h, s, l;
  if (w <= 1) {
    const t = w;
    h = 220 - 3 * t;
    s = 25 + 66 * t;
    l = 55 + 5 * t;
  } else {
    const t = w - 1;
    h = 217 + 33 * t;
    s = 91 - 6 * t;
    l = 60 - 35 * t;
  }
  return `hsl(${h}, ${s}%, ${l}%)`;
}

function WeightSliderPopup({ weight, style, onChange, onMouseEnter, onMouseLeave }) {
  const [value, setValue] = useState(weight);

  const handleInput = (e) => {
    const val = Math.round(parseFloat(e.target.value) * 10) / 10;
    setValue(val);
    onChange(val);
  };

  return h(
    'div',
    {
      class: 'weight-slider-popup',
      style,
      onMouseEnter,
      onMouseLeave,
    },
    [
      h('input', {
        type: 'range',
        class: 'weight-slider-input',
        min: 0,
        max: 2,
        step: 0.1,
        value,
        onInput: handleInput,
      }),
      h('span', { class: 'weight-slider-popup-value' }, value.toFixed(1)),
    ],
  );
}

export function PartitionItem({
  partition,
  items,
  promptWeights,
  coversCache,
  onPartitionAction,
  onItemMove,
  onItemRemove,
  onItemReorder,
  onPromptWeightChange,
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [hoveredKey, setHoveredKey] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(-1);
  const hideTimerRef = useRef(null);
  const draggedItemRef = useRef(null);

  const weightsRef = useRef(promptWeights);
  weightsRef.current = promptWeights;
  const weightChangeRef = useRef(onPromptWeightChange);
  weightChangeRef.current = onPromptWeightChange;

  // body 级渲染（不受节点 transform 影响）
  const { renderToBody, clear: clearSlider } = useBodyRender();

  // 分区预览 hook
  const { onPreviewToggle } = usePartitionPreview();
  const handlePreviewClick = (e) => {
    // 从 items 按 type 分拣传给预览
    const prompts = items.filter((item) => item.type === 'prompt').map((item) => item.data);
    const cats = items.filter((item) => item.type === 'category').map((item) => item.data);
    onPreviewToggle(e, partition, prompts, cats, coversCache);
  };

  // 当标签被删除时清除悬浮状态
  const allKeys = new Set(items.map((item) => item.key));
  if (hoveredKey && !allKeys.has(hoveredKey)) {
    setHoveredKey(null);
  }

  const totalCount = items.length;
  const partitionClass = `partition-item ${partition.isDefault ? 'is-default' : ''} ${!partition.enabled ? 'disabled' : ''} ${isDragOver ? 'drag-over' : ''}`;

  const scheduleHide = () => {
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setHoveredKey(null), 200);
  };

  const cancelHide = () => {
    clearTimeout(hideTimerRef.current);
  };

  // 权重滑条 portal
  useEffect(() => {
    if (!hoveredKey) {
      clearSlider();
      return;
    }

    const tagEl = document.querySelector(`[data-weight-key="${CSS.escape(hoveredKey)}"]`);
    if (!tagEl) return;
    const rect = tagEl.getBoundingClientRect();

    const weights = weightsRef.current;
    const weight = weights && weights[hoveredKey] != null ? weights[hoveredKey] : 1.0;

    renderToBody(
      h(WeightSliderPopup, {
        weight,
        style: {
          position: 'fixed',
          top: `${rect.top - 32}px`,
          left: `${rect.left + rect.width / 2}px`,
          transform: 'translateX(-50%)',
          pointerEvents: 'auto',
        },
        onChange: (val) => {
          weightChangeRef.current && weightChangeRef.current(hoveredKey, val);
        },
        onMouseEnter: cancelHide,
        onMouseLeave: scheduleHide,
      }),
    );

    return () => clearSlider();
  }, [hoveredKey]);

  // 拖拽排序：标签 onDragStart
  const handleTagDragStart = (e, item, index) => {
    draggedItemRef.current = { ...item, index, sourcePartitionId: partition.id };
    e.dataTransfer.setData(
      'text/plain',
      JSON.stringify({
        type: item.type,
        key: item.key,
        id: item.type === 'category' ? item.key : undefined,
        sourcePartitionId: partition.id,
        sourceIndex: index,
      }),
    );
    e.dataTransfer.effectAllowed = 'move';
    // 给拖拽源加样式
    e.currentTarget.classList.add('dragging');
  };

  const handleTagDragEnd = (e) => {
    e.currentTarget.classList.remove('dragging');
    draggedItemRef.current = null;
    setDragOverIndex(-1);
    setIsDragOver(false);
  };

  // 标签 onDragOver：计算插入位置
  const handleTagDragOver = (e, index) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const insertIndex = e.clientX < midX ? index : index + 1;
    setDragOverIndex(insertIndex);
    setIsDragOver(true);
  };

  // 容器 onDragOver
  const handleContainerDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
    setDragOverIndex(-1);
  };

  // 容器 onDrop：处理跨分区移入和分区内排序
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    setDragOverIndex(-1);

    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (!data.type) return;

      // 分区拖拽由 PartitionList 处理
      if (data.type === 'partition') return;

      if (data.sourcePartitionId === partition.id && data.sourceIndex != null) {
        // 分区内排序
        const toIndex = dragOverIndex >= 0 ? (dragOverIndex > data.sourceIndex ? dragOverIndex - 1 : dragOverIndex) : items.length - 1;
        if (data.sourceIndex !== toIndex) {
          onItemReorder && onItemReorder(data.sourceIndex, toIndex);
        }
      } else {
        // 跨分区移入
        onItemMove && onItemMove(data.type, data.key, data.sourcePartitionId, partition.id);
      }
    } catch (error) {
      console.error('[PartitionItem] Failed to parse drop data:', error);
    }
  };

  // 渲染单个标签
  const renderTag = (item, index) => {
    const { type, key, data, orphaned } = item;
    const isPrompt = type === 'prompt';
    const isCategory = type === 'category';

    const tagClasses = [
      'prompt-selector-tag',
      isCategory ? 'category-tag' : '',
      orphaned ? 'orphaned' : '',
      hoveredKey === key ? 'weight-focused' : '',
    ]
      .filter(Boolean)
      .join(' ');

    const weight = isPrompt && promptWeights && promptWeights[key] != null ? promptWeights[key] : 1.0;
    const showWeight = isPrompt && !orphaned && Math.abs(weight - 1.0) > 0.001;
    const tagStyle = isPrompt && !orphaned ? { background: getWeightColor(weight) } : {};

    const icon = isCategory ? 'folder' : orphaned ? 'alert-triangle' : null;

    const displayName = isCategory
      ? (data.name || key)
      : ((data.name || data.value || key) + (orphaned ? ' (未找到)' : ''));

    // 插入指示线
    const showIndicatorBefore = dragOverIndex === index;
    const showIndicatorAfter = dragOverIndex === index + 1 && index === items.length - 1;

    const result = [];

    if (showIndicatorBefore) {
      result.push(h('div', { key: `indicator-${index}`, class: 'partition-item-drop-indicator' }));
    }

    result.push(
      h(
        'span',
        {
          key,
          'data-weight-key': isPrompt ? key : undefined,
          class: tagClasses,
          style: tagStyle,
          draggable: !orphaned,
          onDragStart: orphaned ? undefined : (e) => handleTagDragStart(e, item, index),
          onDragEnd: orphaned ? undefined : handleTagDragEnd,
          onDragOver: (e) => handleTagDragOver(e, index),
          onMouseEnter: isPrompt && !orphaned
            ? () => { cancelHide(); setHoveredKey(key); }
            : undefined,
          onMouseLeave: isPrompt && !orphaned ? () => scheduleHide() : undefined,
        },
        [
          showWeight && h('span', { class: 'prompt-weight-value' }, weight.toFixed(1)),
          icon && h('span', { class: 'prompt-selector-tag-icon' }, h(Icon, { name: icon, size: 12 })),
          h('span', { class: 'prompt-name' }, displayName),
          h(
            'button',
            {
              class: 'prompt-remove-btn',
              onClick: (e) => {
                e.stopPropagation();
                onItemRemove && onItemRemove(type, key);
              },
            },
            h(Icon, { name: 'x', size: 12 }),
          ),
        ],
      ),
    );

    if (showIndicatorAfter) {
      result.push(h('div', { key: `indicator-after-${index}`, class: 'partition-item-drop-indicator' }));
    }

    return result;
  };

  return h('div', { class: partitionClass }, [
    h(PartitionHeader, {
      partition,
      onAction: onPartitionAction,
      onPreviewClick: handlePreviewClick,
    }),

    partition.enabled &&
      h(
        'div',
        {
          class: 'partition-prompts',
          onDragOver: handleContainerDragOver,
          onDragLeave: handleDragLeave,
          onDrop: handleDrop,
        },
        [
          ...items.flatMap((item, index) => renderTag(item, index)),
          totalCount === 0 && h('div', { class: 'partition-empty' }, '选择或拖拽到此处'),
        ],
      ),
  ]);
}
