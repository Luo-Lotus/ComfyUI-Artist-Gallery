/**
 * 画师卡片组件
 * 显示单个画师的信息和图片
 */
import { h } from '../lib/preact.mjs';
import { useState } from '../lib/hooks.mjs';
import { buildImageUrl } from '../utils.js';

export function GalleryCard({
    artist,
    artistIndex,
    favorites,
    onFavoriteToggle,
    onImageClick,
    onDelete,
    onEdit,
}) {
    const [copied, setCopied] = useState(false);
    const isFav = favorites.has(artist.name);
    const hasImages = artist.images && artist.images.length > 0;

    // ============ 事件处理 ============

    const handleCopy = () => {
        navigator.clipboard.writeText(artist.name).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };

    // ============ 渲染函数 ============

    /**
     * 渲染卡片头部（包含信息 + 操作按钮）
     */
    const renderHeader = () => {
        return h('div', { class: 'gallery-card-header' }, [
            // 左侧：画师名称和数量
            h('span', {
                class: 'gallery-artist-name',
                title: artist.name,
            }, artist.displayName || artist.name),
            h('span', { class: 'gallery-artist-count' }, `${artist.imageCount}张`),

            // 右侧：操作按钮
            h('div', { class: 'gallery-actions' }, [
                // 复制按钮
                h('button', {
                    class: `gallery-icon-btn ${copied ? 'copied' : ''}`,
                    onClick: handleCopy,
                    title: '复制画师名称',
                }, copied ? '✓' : '📋'),
                // 收藏按钮
                h('button', {
                    class: `gallery-icon-btn ${isFav ? 'fav-active' : ''}`,
                    onClick: () => onFavoriteToggle(artist.name),
                    title: isFav ? '取消收藏' : '添加收藏',
                }, isFav ? '⭐' : '☆'),
                // 编辑按钮
                onEdit && h('button', {
                    class: 'gallery-icon-btn',
                    onClick: () => onEdit(artist),
                    title: '编辑画师',
                }, '✏️'),
                // 删除按钮
                onDelete && h('button', {
                    class: 'gallery-icon-btn',
                    onClick: () => onDelete(artist),
                    style: { color: '#ef4444' },
                    title: '删除画师',
                }, '🗑️'),
            ]),
        ]);
    };

    /**
     * 渲染主图
     */
    const renderMainImage = () => {
        return h(
            'div',
            { class: 'gallery-image-main' },
            h(
                'div',
                {
                    class: 'gallery-image-item',
                    onClick: () => onImageClick(artistIndex, 0),
                },
                h('img', {
                    src: buildImageUrl(artist.images[0].path),
                    alt: artist.name,
                    loading: 'lazy',
                }),
            ),
        );
    };

    /**
     * 渲染缩略图
     */
    const renderThumbnails = () => {
        if (artist.images.length <= 1) return null;

        return h('div', { class: 'gallery-image-thumbnails' }, [
            artist.images.slice(1).map((img, imgIndex) =>
                h(
                    'div',
                    {
                        key: `${artist.name}-${imgIndex + 1}`,
                        class: 'gallery-image-item',
                        onClick: () => onImageClick(artistIndex, imgIndex + 1),
                    },
                    h('img', {
                        src: buildImageUrl(img.path),
                        alt: artist.name,
                        loading: 'lazy',
                    }),
                ),
            ),
        ]);
    };

    /**
     * 渲染有图片的状态
     */
    const renderWithImages = () => {
        return h('div', { class: 'gallery-image-container' }, [
            renderMainImage(),
            renderThumbnails(),
        ]);
    };

    /**
     * 渲染空状态（无图片）
     */
    const renderEmptyState = () => {
        return h(
            'div',
            {
                class: 'gallery-image-main',
                style: {
                    height: '200px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#2a2a2a',
                    borderRadius: '8px',
                },
            },
            h(
                'div',
                {
                    style: {
                        textAlign: 'center',
                        color: '#888',
                    },
                },
                [
                    h(
                        'div',
                        {
                            style: {
                                fontSize: '48px',
                                marginBottom: '10px',
                            },
                        },
                        '🎨',
                    ),
                    h(
                        'div',
                        {
                            style: {
                                fontSize: '14px',
                            },
                        },
                        '暂无图片',
                    ),
                ],
            ),
        );
    };

    /**
     * 渲染图片区域
     */
    const renderImages = () => {
        return hasImages ? renderWithImages() : renderEmptyState();
    };

    // ============ 主渲染 ============

    return h('div', { class: 'gallery-card' }, [
        renderHeader(),  // 头部（包含名称、数量和操作按钮）
        renderImages(),  // 图片区域
    ]);
}
