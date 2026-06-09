/**
 * 组合卡片组件
 * 显示组合信息，复用 BaseCard 包装
 */
import { h } from '../lib/preact.mjs';
import { Icon } from '../lib/icons.mjs';
import { useState, useRef, useCallback } from '../lib/hooks.mjs';
import { buildImageUrl } from '../utils.js';
import { BaseCard } from './BaseCard.js';
import { useContextMenu } from './ContextMenu.js';

export function CombinationCard({
  combination,
  onClick,
  onEdit,
  onDuplicate,
  onMove,
  onDelete,
  onTogglePinned,
  // 多选相关
  selectionMode = false,
  selected = false,
  onSelect,
}) {
  const [copied, setCopied] = useState(false);
  const { showContextMenu } = useContextMenu();

  const selectionKey = `combination:${combination.id}`;

  // 封面图：使用后端提供的 coverImagePath
  const coverImage = combination.coverImagePath ? { path: combination.coverImagePath } : null;

  // 封面图宽高比：图片加载后从 naturalWidth/naturalHeight 获取
  const [aspectRatio, setAspectRatio] = useState(1);
  const imgRef = useRef(null);
  const handleImgLoad = useCallback(() => {
    const img = imgRef.current;
    if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
      setAspectRatio(Math.max(0.5, Math.min(3.0, img.naturalWidth / img.naturalHeight)));
    }
  }, []);

  const handleCopyText = () => {
    const text = combination.outputContent || combination.prompts?.join(',');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleContextMenu = (e) => {
    if (selectionMode) return;

    const menuItems = [
      {
        icon: 'bookmark',
        label: combination.metadata?.pinned ? '取消置顶' : '置顶',
        action: () => onTogglePinned && onTogglePinned('combination', combination),
      },
      {
        icon: 'clipboard-list',
        label: copied ? '已复制' : '复制文本',
        action: handleCopyText,
      },
      {
        icon: 'edit',
        label: '编辑',
        action: () => onEdit && onEdit(combination),
      },
      {
        icon: 'copy',
        label: '复制',
        action: () => onDuplicate && onDuplicate(combination),
      },
      {
        icon: 'move',
        label: '移动',
        action: () => onMove && onMove(combination, 'combination'),
      },
      {
        icon: 'trash-2',
        label: '删除',
        action: () => onDelete && onDelete(combination),
      },
    ];

    showContextMenu(e, menuItems);
  };

  // ============ 渲染 ============

  const renderOverlay = () => {
    const outputText = combination.outputContent || combination.prompts?.join(',');

    return h('div', { class: 'gallery-card-overlay' }, [
      h(
        'span',
        { class: 'gallery-card-name-tag' },
        [
          combination.metadata?.pinned && h(Icon, { name: 'bookmark', size: 11 }),
          combination.name,
        ],
      ),
      outputText &&
        h('div', { class: 'gallery-card-bottom-bar' }, [
          h(
            'span',
            { class: 'gallery-card-value-tag', title: outputText },
            outputText,
          ),
        ]),
    ]);
  };

  const renderCover = () => {
    if (coverImage) {
      return h(
        'div',
        {
          class: 'gallery-image-cover',
          onClick: (e) => {
            if (!selectionMode) {
              onClick && onClick(combination);
            }
          },
        },
        [
          h('img', {
            ref: imgRef,
            src: buildImageUrl(coverImage.path),
            alt: combination.name,
            loading: 'lazy',
            onLoad: handleImgLoad,
          }),
          renderOverlay(),
        ],
      );
    }

    return h(
      'div',
      {
        class: 'gallery-card-empty',
        onClick: (e) => {
          if (!selectionMode) {
            onClick && onClick(combination);
          }
        },
      },
      [
        h('div', { class: 'gallery-card-empty-icon' }, h(Icon, { name: 'link', size: 32 })),
        h('div', { class: 'gallery-card-empty-text' }, '暂无图片'),
        renderOverlay(),
      ],
    );
  };

  return h(
    BaseCard,
    {
      cardType: 'gallery',
      selectionMode,
      selected,
      selectionKey,
      onSelect,
      onContextMenu: handleContextMenu,
      style: { '--card-aspect-ratio': aspectRatio },
    },
    [renderCover()],
  );
}
