/**
 * 分类卡片组件
 * 显示单个分类的卡片（文件夹样式）
 */
import { h } from '../lib/preact.mjs';
import { useEffect, useRef } from '../lib/hooks.mjs';
import { Icon } from '../lib/icons.mjs';
import { BaseCard } from './BaseCard.js';
import { useContextMenu } from './ContextMenu.js';

export function CategoryCard({
  category,
  promptCount = 0,
  onClick,
  onEdit,
  onDelete,
  onMove,
  onExport,
  onTogglePinned,
  // 多选相关props
  selectionMode = false,
  selected = false,
  onSelect,
  selectorMode = false,
}) {
  const isRoot = category.id === 'root';
  const { showContextMenu } = useContextMenu();
  const clickTimerRef = useRef(null);

  useEffect(() => () => clearTimeout(clickTimerRef.current), []);

  // 生成选择键（用于多选）
  const selectionKey = `category:${category.id}`;

  const handleContextMenu = (e) => {
    // 多选模式或根分类不显示右键菜单
    if (selectionMode || isRoot) return;

    e.preventDefault();
    const menuItems = [
      {
        icon: 'bookmark',
        label: category.metadata?.pinned ? '取消置顶' : '置顶',
        action: () => onTogglePinned && onTogglePinned('category', category),
      },
      {
        icon: 'edit',
        label: '编辑',
        action: () => onEdit && onEdit(category),
      },
      {
        icon: 'move',
        label: '移动',
        action: () => onMove && onMove(category),
      },
      // 「复制到」已移除：后端暂无分类复制接口
      {
        icon: 'upload',
        label: '导出',
        action: () => onExport && onExport(category),
      },
      {
        icon: 'trash-2',
        label: '删除',
        action: () => onDelete && onDelete(category),
      },
    ];

    showContextMenu(e, menuItems);
  };

  const handleSelect = (key, shiftKey) => {
    if (!selectorMode) {
      onSelect?.(key, shiftKey);
      return;
    }
    clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      onSelect?.(key, false);
      clickTimerRef.current = null;
    }, 220);
  };

  const handleDoubleClick = (e) => {
    if (!selectorMode) return;
    e.stopPropagation();
    clearTimeout(clickTimerRef.current);
    clickTimerRef.current = null;
    onClick?.(category);
  };

  return h(
    BaseCard,
    {
      cardType: 'category',
      selectionMode,
      selected,
      selectionKey,
      onSelect: handleSelect,
      onClick: () => onClick && onClick(category),
      onDoubleClick: handleDoubleClick,
      onContextMenu: handleContextMenu,
    },
    [
      // 文件夹图标
      h('div', { class: 'category-icon' }, h(Icon, { name: 'folder', size: 48 })),
      category.metadata?.pinned && h('span', { class: 'gallery-pinned-badge', title: '已置顶' }, h(Icon, { name: 'bookmark', size: 12 })),

      // 分类信息
      h('div', { class: 'category-info' }, [h('div', { class: 'category-name' }, category.name)]),
    ],
  );
}
