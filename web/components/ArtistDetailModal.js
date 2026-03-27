/**
 * 画师详情模态框
 * 显示画师的所有图片（平铺）
 */
import { h } from '../lib/preact.mjs';
import { useState } from '../lib/hooks.mjs';
import { buildImageUrl } from '../utils.js';
import { Lightbox } from './Lightbox.js';

export function ArtistDetailModal({ isOpen, artist, onClose }) {
    const [lightbox, setLightbox] = useState({
        open: false,
        artist: null,
        imageIndex: 0
    });

    const handleImageClick = (imageIndex) => {
        setLightbox({
            open: true,
            artist: artist,
            imageIndex
        });
    };

    const handleLightboxNavigate = (direction) => {
        let newIndex = lightbox.imageIndex + direction;
        if (newIndex < 0) newIndex = artist.images.length - 1;
        if (newIndex >= artist.images.length) newIndex = 0;
        setLightbox(prev => ({ ...prev, imageIndex: newIndex }));
    };

    if (!isOpen || !artist) return null;

    const hasImages = artist.images && artist.images.length > 0;

    const handleOverlayClick = (e) => {
        // 如果 lightbox 没有打开，点击遮罩才关闭
        if (!lightbox.open && e.target.classList.contains('artist-detail-overlay')) {
            onClose();
        }
    };

    return h('div', { class: 'artist-detail-overlay', onClick: handleOverlayClick }, [
        !lightbox.open && h('div', {
            class: 'artist-detail-content',
            onClick: (e) => e.stopPropagation()
        }, [
            // 头部
            h('div', { class: 'artist-detail-header' }, [
                h('h2', {}, artist.displayName || artist.name),
                h('button', {
                    class: 'close-btn',
                    onClick: onClose,
                    title: '关闭'
                }, '✕')
            ]),

            // 图片网格
            hasImages ? h('div', { class: 'artist-detail-grid' },
                artist.images.map((img, index) =>
                    h('div', {
                        key: img.path,
                        class: 'artist-detail-image-item',
                        onClick: () => handleImageClick(index)
                    }, h('img', {
                        src: buildImageUrl(img.path),
                        alt: `${artist.name} - ${index + 1}`,
                        loading: 'lazy'
                    }))
                )
            ) : h('div', { class: 'artist-detail-empty' }, '🎨 暂无图片')
        ]),

        // Lightbox
        lightbox.open && h(Lightbox, {
            isOpen: lightbox.open,
            artist: lightbox.artist || { images: [] },
            imageIndex: lightbox.imageIndex,
            onClose: () => setLightbox({ open: false, artist: null, imageIndex: 0 }),
            onNavigate: handleLightboxNavigate
        })
    ]);
}
