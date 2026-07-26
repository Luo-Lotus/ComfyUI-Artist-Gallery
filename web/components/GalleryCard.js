/**
 * Prompt卡片组件
 * 显示单个Prompt的信息和图片
 */
import { h } from '../lib/preact.mjs';
import { Icon } from '../lib/icons.mjs';
import { useState, useRef, useCallback } from '../lib/hooks.mjs';
import { buildImageUrl } from '../utils.js';
import { BaseCard } from './BaseCard.js';
import { useContextMenu } from './ContextMenu.js';
import { showToast } from './Toast.js';

export function GalleryCard({
  prompt,
  promptIndex,
  favorites,
  onFavoriteToggle,
  onImageClick,
  onDelete,
  onEdit,
  onSetCover,
  onMove,
  onCopy,
  onExport,
  onTogglePinned,
  // 多选相关props
  selectionMode = false,
  selected = false,
  onSelect,
}) {
  const [copied, setCopied] = useState(false);
  const isFav = favorites.has(prompt.value);
  const hasImages = !!prompt.coverImagePath;
  const { showContextMenu } = useContextMenu();

  // 生成选择键（用于多选）
  const selectionKey = `prompt:${prompt.categoryId}:${prompt.value}`;

  // 封面图路径
  const coverPath = prompt.coverImagePath;
  const coverImage = coverPath ? { path: coverPath } : null;

  // 封面图宽高比：图片加载后从 naturalWidth/naturalHeight 获取
  const [aspectRatio, setAspectRatio] = useState(1);
  const imgRef = useRef(null);
  const handleImgLoad = useCallback(() => {
    const img = imgRef.current;
    if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
      setAspectRatio(Math.max(0.5, Math.min(3.0, img.naturalWidth / img.naturalHeight)));
    }
  }, []);

  // ============ 事件处理 ============

  const handleCopy = () => {
    navigator.clipboard
      .writeText(prompt.value)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => showToast('复制失败', 'error'));
  };

  const handleContextMenu = (e) => {
    // 多选模式下不显示右键菜单
    if (selectionMode) return;

    const menuItems = [
      {
        icon: 'bookmark',
        label: prompt.metadata?.pinned ? '取消置顶' : '置顶',
        action: () => onTogglePinned && onTogglePinned('prompt', prompt),
      },
      { icon: 'clipboard-list', label: '复制名称', action: handleCopy },
      {
        icon: 'star',
        label: '收藏',
        action: () => onFavoriteToggle(prompt.value),
      },
      {
        icon: 'edit',
        label: '编辑',
        action: () => onEdit && onEdit(prompt),
      },
      {
        icon: 'move',
        label: '移动',
        action: () => onMove && onMove(prompt),
      },
      {
        icon: 'copy',
        label: '复制到',
        action: () => onCopy && onCopy(prompt),
      },
      {
        icon: 'upload',
        label: '导出',
        action: () => onExport && onExport(prompt),
      },
      {
        icon: 'trash-2',
        label: '删除',
        action: () => onDelete && onDelete(prompt),
      },
    ];

    showContextMenu(e, menuItems);
  };

  // ============ 渲染函数 ============

  /**
   * 渲染覆盖信息层（名称+value左上角，数量右上角）
   */
  const name = prompt.name || prompt.value;

  const renderOverlay = () => {
    const value = prompt.value;
    const showValue = value && value !== name;

    return h('div', { class: 'gallery-card-overlay' }, [
      h(
        'span',
        { class: 'gallery-card-name-tag' },
        [
          prompt.metadata?.pinned && h(Icon, { name: 'bookmark', size: 11 }),
          name,
        ],
      ),
      h('div', { class: 'gallery-card-bottom-bar' }, [
        showValue &&
          h(
            'span',
            { class: 'gallery-card-value-tag', title: value },
            value,
          ),
      ]),
    ]);
  };

  /**
   * 渲染封面图片（含覆盖信息层）
   */
  const renderCoverImage = () => {
    if (!coverImage) return renderEmptyState();

    return h(
      'div',
      {
        class: 'gallery-image-cover',
        onClick: (e) => {
          if (!selectionMode) {
            onImageClick && onImageClick(promptIndex);
          }
        },
      },
      [
        h('img', {
          ref: imgRef,
          src: buildImageUrl(coverImage.path),
          alt: name,
          loading: 'lazy',
          decoding: 'async',
          onLoad: handleImgLoad,
        }),
        renderOverlay(),
      ],
    );
  };

  /**
   * 渲染空状态（无图片，仍显示覆盖信息）
   */
  const renderEmptyState = () => {
    return h('div', {
      class: 'gallery-card-empty',
      onClick: (e) => {
        if (!selectionMode) {
          onImageClick && onImageClick(promptIndex);
        }
      },
    }, [
      h('div', { class: 'gallery-card-empty-icon' }, h(Icon, { name: 'palette', size: 32 })),
      h('div', { class: 'gallery-card-empty-text' }, '暂无图片'),
      renderOverlay(),
    ]);
  };

  /**
   * 渲染图片区域
   */
  const renderImages = () => {
    return hasImages ? renderCoverImage() : renderEmptyState();
  };

  // ============ 主渲染 ============

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
    [renderImages()],
  );
}
