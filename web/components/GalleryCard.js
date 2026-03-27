/**
 * 画师卡片组件
 * 显示单个画师的信息和图片
 */
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
    const { h } = self.preactCore;
    const { useState } = self.preactHooks;
    const [copied, setCopied] = useState(false);
    const isFav = favorites.has(artist.name);

    const handleCopy = () => {
        navigator.clipboard.writeText(artist.name).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };

    const hasImages = artist.images && artist.images.length > 0;

    return h(
        'div',
        { class: 'gallery-card' },
        h(
            'div',
            { class: 'gallery-card-header' },
            h(
                'span',
                {
                    class: 'gallery-artist-name',
                    title: artist.name,
                },
                artist.displayName || artist.name,
            ),
            h('span', { class: 'gallery-artist-count' }, `${artist.imageCount}张`),
            h(
                'div',
                { class: 'gallery-actions' },
                h(
                    'button',
                    {
                        class: `gallery-icon-btn ${copied ? 'copied' : ''}`,
                        onClick: handleCopy,
                    },
                    copied ? '✓' : '📋',
                ),
                h(
                    'button',
                    {
                        class: `gallery-icon-btn ${isFav ? 'fav-active' : ''}`,
                        onClick: () => onFavoriteToggle(artist.name),
                    },
                    isFav ? '⭐' : '☆',
                ),
                onEdit && h(
                    'button',
                    {
                        class: 'gallery-icon-btn',
                        onClick: () => onEdit(artist),
                    },
                    '✏️',
                ),
                onDelete && h(
                    'button',
                    {
                        class: 'gallery-icon-btn',
                        onClick: () => onDelete(artist),
                        style: {
                            color: '#ef4444'
                        }
                    },
                    '🗑️',
                ),
            ),
        ),
        h(
            'div',
            { class: 'gallery-image-container' },
            hasImages ? [
                h(
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
                ),
                artist.images.length > 1 &&
                    h(
                        'div',
                        { class: 'gallery-image-thumbnails' },
                        artist.images.slice(1).map((img, imgIndex) =>
                            h(
                                'div',
                                {
                                    key: `${artist.name}-${imgIndex + 1}`,
                                    class: 'gallery-image-item',
                                    onClick: () =>
                                        onImageClick(artistIndex, imgIndex + 1),
                                },
                                h('img', {
                                    src: buildImageUrl(img.path),
                                    alt: artist.name,
                                    loading: 'lazy',
                                }),
                            ),
                        ),
                    ),
            ] : h(
                'div',
                {
                    class: 'gallery-image-main',
                    style: {
                        height: '200px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#2a2a2a',
                        borderRadius: '8px'
                    }
                },
                h(
                    'div',
                    {
                        style: {
                            textAlign: 'center',
                            color: '#888'
                        }
                    },
                    h('div', {
                        style: {
                            fontSize: '48px',
                            marginBottom: '10px'
                        }
                    }, '🎨'),
                    h('div', {
                        style: {
                            fontSize: '14px'
                        }
                    }, '暂无图片')
                )
            )
        ),
    );
}
