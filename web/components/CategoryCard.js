/**
 * 分类卡片组件
 * 显示单个分类的卡片（文件夹样式）
 */
import { h } from '../lib/preact.mjs';
import { Icon } from '../lib/icons.mjs';
import { BaseCard } from './BaseCard.js';
import { useContextMenu } from './ContextMenu.js';

export function CategoryCard({
    category,
    artistCount = 0,
    onClick,
    onEdit,
    onDelete,
    onMove,
    onCopy,
    onExport,
    // 多选相关props
    selectionMode = false,
    selected = false,
    onSelect,
}) {
    const isRoot = category.id === 'root';
    const { showContextMenu } = useContextMenu();

    // 生成选择键（用于多选）
    const selectionKey = `category:${category.id}`;

    const handleContextMenu = (e) => {
        // 多选模式或根分类不显示右键菜单
        if (selectionMode || isRoot) return;

        e.preventDefault();
        const menuItems = [
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
            {
                icon: 'copy',
                label: '复制到',
                action: () => onCopy && onCopy(category),
            },
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

    return h(BaseCard, {
        cardType: 'category',
        selectionMode,
        selected,
        selectionKey,
        onSelect,
        onClick: () => onClick && onClick(category),
        onContextMenu: handleContextMenu,
    }, [
        // 文件夹图标
        h('div', { class: 'category-icon' }, h(Icon, { name: 'folder', size: 48 })),

        // 分类信息
        h('div', { class: 'category-info' }, [
            h('div', { class: 'category-name' }, category.name),
            h(
                'div',
                { class: 'category-meta' },
                artistCount > 0 ? `${artistCount} 位画师` : '空分类',
            ),
        ]),
    ]);
}
