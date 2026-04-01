/**
 * 画师卡片组件
 * 显示单个画师的信息和图片
 */
import { h } from '../lib/preact.mjs';
import { useState } from '../lib/hooks.mjs';
import { buildImageUrl } from '../utils.js';
import { BaseCard } from './BaseCard.js';
import { useContextMenu } from './ContextMenu.js';

export function GalleryCard({
    artist,
    artistIndex,
    favorites,
    onFavoriteToggle,
    onImageClick,
    onDelete,
    onEdit,
    onSetCover,
    onMove,
    onCopy,
    onExport,
    // 多选相关props
    selectionMode = false,
    selected = false,
    onSelect,
}) {
    const [copied, setCopied] = useState(false);
    const isFav = favorites.has(artist.name);
    const hasImages = artist.imageCount > 0;
    const { showContextMenu } = useContextMenu();

    // 生成选择键（用于多选）
    const selectionKey = `artist:${artist.categoryId}:${artist.name}`;

    // 封面图路径
    const coverPath = artist.coverImagePath;
    const coverImage = coverPath ? { path: coverPath } : null;

    // ============ 事件处理 ============

    const handleCopy = () => {
        navigator.clipboard.writeText(artist.name).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };

    const handleContextMenu = (e) => {
        // 多选模式下不显示右键菜单
        if (selectionMode) return;

        const menuItems = [
            { icon: '📋', label: '复制名称', action: handleCopy },
            {
                icon: '☆',
                label: '收藏',
                action: () => onFavoriteToggle(artist.name),
            },
            {
                icon: '✏️',
                label: '编辑',
                action: () => onEdit && onEdit(artist),
            },
            {
                icon: '📦',
                label: '移动',
                action: () => onMove && onMove(artist),
            },
            {
                icon: '📄',
                label: '复制到',
                action: () => onCopy && onCopy(artist),
            },
            {
                icon: '📤',
                label: '导出',
                action: () => onExport && onExport(artist),
            },
            {
                icon: '🗑️',
                label: '删除',
                action: () => onDelete && onDelete(artist),
            },
        ];

        showContextMenu(e, menuItems);
    };

    // ============ 渲染函数 ============

    /**
     * 渲染卡片头部（包含信息 + 收藏按钮）
     */
    const renderHeader = () => {
        return h('div', { class: 'gallery-card-header' }, [
            // 左侧：画师名称和数量
            h(
                'span',
                {
                    class: 'gallery-artist-name',
                    title: artist.name,
                },
                artist.displayName || artist.name,
            ),
            h(
                'span',
                { class: 'gallery-artist-count' },
                `${artist.imageCount}张`,
            ),

            // 右侧：收藏按钮
            // h(
            //     'button',
            //     {
            //         class: `gallery-fav-btn ${isFav ? 'fav-active' : ''}`,
            //         onClick: (e) => {
            //             e.stopPropagation();
            //             onFavoriteToggle(artist.name);
            //         },
            //         title: isFav ? '取消收藏' : '添加收藏',
            //     },
            //     isFav ? '⭐' : '☆',
            // ),
        ]);
    };

    /**
     * 渲染封面图片
     */
    const renderCoverImage = () => {
        if (!coverImage) return renderEmptyState();

        return h(
            'div',
            {
                class: 'gallery-image-cover',
                onClick: (e) => {
                    if (!selectionMode) {
                        onImageClick && onImageClick(artistIndex);
                    }
                },
            },
            h('img', {
                src: buildImageUrl(coverImage.path),
                alt: artist.name,
                loading: 'lazy',
            }),
        );
    };

    /**
     * 渲染空状态（无图片）
     */
    const renderEmptyState = () => {
        return h('div', { class: 'gallery-card-empty' }, [
            h('div', { class: 'gallery-card-empty-icon' }, '🎨'),
            h('div', { class: 'gallery-card-empty-text' }, '暂无图片'),
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
        },
        [
            renderHeader(), // 头部（包含名称、数量和收藏按钮）
            renderImages(), // 图片区域
        ],
    );
}
