/**
 * 分类卡片组件
 * 显示单个分类的卡片（文件夹样式）
 */
import { h } from '../lib/preact.mjs';
import { useState } from '../lib/hooks.mjs';
import { useContextMenu } from './ContextMenu.js';

export function CategoryCard({
    category,
    artistCount = 0,
    onClick,
    onEdit,
    onDelete,
    onMove,
}) {
    const [isHovered, setIsHovered] = useState(false);
    const isRoot = category.name === '全部';
    const { showContextMenu } = useContextMenu();

    const handleClick = () => {
        if (onClick) {
            onClick(category);
        }
    };

    const handleContextMenu = (e) => {
        if (isRoot) return;

        const menuItems = [
            {
                icon: '✏️',
                label: '编辑',
                action: () => onEdit && onEdit(category),
            },
            {
                icon: '📦',
                label: '移动',
                action: () => onMove && onMove(category),
            },
            {
                icon: '🗑️',
                label: '删除',
                action: () => onDelete && onDelete(category),
            },
        ];

        showContextMenu(e, menuItems);
    };

    return h(
        'div',
        {
            class: `category-card`,
            onClick: handleClick,
            onContextMenu: handleContextMenu,
        },
        [
            // 文件夹图标
            h('div', { class: 'category-icon' }, '📁'),

            // 分类信息
            h('div', { class: 'category-info' }, [
                h('div', { class: 'category-name' }, category.name),
                h(
                    'div',
                    { class: 'category-meta' },
                    artistCount > 0 ? `${artistCount} 位画师` : '空分类',
                ),
            ]),
        ],
    );
}
