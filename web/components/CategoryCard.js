/**
 * 分类卡片组件
 * 显示单个分类的卡片（文件夹样式）
 */
import { h } from '../lib/preact.mjs';
import { useState } from '../lib/hooks.mjs';

export function CategoryCard({
    category,
    artistCount = 0,
    onClick,
    onEdit,
    onDelete
}) {
    const [isHovered, setIsHovered] = useState(false);
    const isRoot = category.name === 'all';

    const handleClick = () => {
        if (onClick) {
            onClick(category);
        }
    };

    const handleEdit = (e) => {
        e.stopPropagation();
        if (onEdit) {
            onEdit(category);
        }
    };

    const handleDelete = (e) => {
        e.stopPropagation();
        if (onDelete) {
            onDelete(category);
        }
    };

    return h('div', {
        class: `category-card ${isHovered ? 'hovered' : ''}`,
        onClick: handleClick,
        onMouseEnter: () => setIsHovered(true),
        onMouseLeave: () => setIsHovered(false)
    }, [
        // 文件夹图标
        h('div', { class: 'category-icon' }, '📁'),

        // 分类信息
        h('div', { class: 'category-info' }, [
            h('div', { class: 'category-name' }, category.displayName),
            h('div', { class: 'category-meta' },
                artistCount > 0 ? `${artistCount} 位画师` : '空分类'
            )
        ]),

        // 操作按钮（悬停时显示）
        !isRoot && h('div', {
            class: `category-actions ${isHovered ? 'visible' : ''}`
        }, [
            h('button', {
                class: 'category-action-btn edit-btn',
                onClick: handleEdit,
                title: '编辑分类'
            }, '✏️'),
            h('button', {
                class: 'category-action-btn delete-btn',
                onClick: handleDelete,
                title: '删除分类'
            }, '🗑️')
        ])
    ]);
}
