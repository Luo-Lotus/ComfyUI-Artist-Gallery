/**
 * 图片灯箱组件
 * 用于全屏查看图片
 */
import { h } from '../lib/preact.mjs';
import { useState, useEffect } from '../lib/hooks.mjs';
import { Icon } from '../lib/icons.mjs';
import { buildImageUrl } from '../utils.js';

export function Lightbox({ isOpen, artist, imageIndex, onClose, onNavigate }) {

    if (!isOpen || !artist) return null;

    const img = artist.images[imageIndex];
    const handlePrev = () => onNavigate(-1);
    const handleNext = () => onNavigate(1);

    const handleKeyDown = (e) => {
        if (e.key === 'Escape') onClose();
        if (e.key === 'ArrowLeft') handlePrev();
        if (e.key === 'ArrowRight') handleNext();
    };

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [imageIndex]);

    // 获取当前图片关联的画师名列表
    const relatedArtists = img?.artistNames || [];

    return h(
        'div',
        {
            class: `gallery-lightbox ${isOpen ? 'open' : ''}`,
            onClick: (e) => {
                if (e.target.classList.contains('gallery-lightbox')) onClose();
            },
        },
        h('div', { class: 'gallery-lightbox-content' },
            h(
                'button',
                {
                    class: 'gallery-lightbox-close',
                    onClick: onClose,
                },
                h(Icon, { name: 'x', size: 20 }),
            ),
            // 关联画师名展示（图片上方）
            relatedArtists.length > 0 && h('div', { class: 'gallery-lightbox-artists' },
                relatedArtists.map((name) =>
                    h('span', { class: 'gallery-lightbox-artist-tag', key: name }, name)
                ),
            ),
            h('img', {
                class: 'gallery-lightbox-img',
                src: buildImageUrl(img.path),
                alt: artist.name,
            }),
            h(
                'button',
                {
                    class: 'gallery-lightbox-nav gallery-lightbox-prev',
                    onClick: handlePrev,
                },
                h(Icon, { name: 'chevron-left', size: 24 }),
            ),
            h(
                'button',
                {
                    class: 'gallery-lightbox-nav gallery-lightbox-next',
                    onClick: handleNext,
                },
                h(Icon, { name: 'chevron-right', size: 24 }),
            ),
            h(
                'div',
                { class: 'gallery-lightbox-info' },
                `${artist.displayName || artist.name} · ${imageIndex + 1} / ${artist.images.length}`,
            ),
        ),
    );
}
