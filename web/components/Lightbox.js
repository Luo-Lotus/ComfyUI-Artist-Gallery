/**
 * 图片灯箱组件
 * 用于全屏查看图片
 */
import { buildImageUrl } from '../utils.js';

export function Lightbox({ isOpen, artist, imageIndex, onClose, onNavigate }) {
    const { h, useEffect } = self.preactCore;
    const { useState, useEffect: hookUseEffect } = self.preactHooks;

    if (!isOpen || !artist) return null;

    const img = artist.images[imageIndex];
    const handlePrev = () => onNavigate(-1);
    const handleNext = () => onNavigate(1);

    const handleKeyDown = (e) => {
        if (e.key === 'Escape') onClose();
        if (e.key === 'ArrowLeft') handlePrev();
        if (e.key === 'ArrowRight') handleNext();
    };

    hookUseEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [imageIndex]);

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
                '×',
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
                '‹',
            ),
            h(
                'button',
                {
                    class: 'gallery-lightbox-nav gallery-lightbox-next',
                    onClick: handleNext,
                },
                '›',
            ),
            h(
                'div',
                { class: 'gallery-lightbox-info' },
                `${artist.displayName} · ${imageIndex + 1} / ${artist.images.length}`,
            ),
        ),
    );
}
