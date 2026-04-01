/**
 * 组合卡片组件
 * 显示组合信息，复用 BaseCard 包装
 */
import { h } from '../lib/preact.mjs';
import { useState } from '../lib/hooks.mjs';
import { buildImageUrl } from '../utils.js';
import { BaseCard } from './BaseCard.js';
import { useContextMenu } from './ContextMenu.js';

export function CombinationCard({
    combination,
    artists = [],
    onClick,
    onEdit,
    onDuplicate,
    onMove,
    onDelete,
    // 多选相关
    selectionMode = false,
    selected = false,
    onSelect,
}) {
    const [copied, setCopied] = useState(false);
    const { showContextMenu } = useContextMenu();

    const selectionKey = `combination:${combination.id}`;
    const memberCount = (combination.artistKeys || []).length;

    // 封面图：使用后端提供的 coverImagePath
    const coverImage = combination.coverImagePath
        ? { path: combination.coverImagePath }
        : null;

    const handleCopyText = () => {
        const text = combination.outputContent || combination.artistKeys?.join(',');
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };

    const handleContextMenu = (e) => {
        if (selectionMode) return;

        const menuItems = [
            {
                icon: '📋',
                label: copied ? '已复制' : '复制文本',
                action: handleCopyText,
            },
            {
                icon: '✏️',
                label: '编辑',
                action: () => onEdit && onEdit(combination),
            },
            {
                icon: '📄',
                label: '复制',
                action: () => onDuplicate && onDuplicate(combination),
            },
            {
                icon: '📦',
                label: '移动',
                action: () => onMove && onMove(combination, 'combination'),
            },
            {
                icon: '🗑️',
                label: '删除',
                action: () => onDelete && onDelete(combination),
            },
        ];

        showContextMenu(e, menuItems);
    };

    // ============ 渲染 ============

    const renderHeader = () => {
        return h('div', { class: 'gallery-card-header' }, [
            h(
                'span',
                {
                    class: 'gallery-artist-name',
                    title: combination.name,
                },
                `🔗 ${combination.name}`,
            ),
            h(
                'span',
                { class: 'gallery-artist-count' },
                `${memberCount}人`,
            ),
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
                h('img', {
                    src: buildImageUrl(coverImage.path),
                    alt: combination.name,
                    loading: 'lazy',
                }),
            );
        }

        return h('div', {
            class: 'gallery-card-empty',
            onClick: (e) => {
                if (!selectionMode) {
                    onClick && onClick(combination);
                }
            },
        }, [
            h('div', { class: 'gallery-card-empty-icon' }, '🔗'),
            h('div', { class: 'gallery-card-empty-text' }, `${memberCount} 个画师`),
        ]);
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
        },
        [renderHeader(), renderCover()],
    );
}
