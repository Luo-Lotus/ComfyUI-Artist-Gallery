/**
 * 图片预览 Hook
 * 用 Preact 组件渲染到 body，不受节点 transform 影响
 */
import { h } from '../../../lib/preact.mjs';
import { buildImageUrl } from '../../../utils.js';
import { useBodyRender } from './useBodyRender.js';

function ImagePreviewPopup({ imageUrl, alt, x, y }) {
    return h('div', {
        class: 'artist-selector-hover-preview',
        style: `position:fixed;left:${x}px;top:${y}px;pointer-events:none;`,
    }, h('img', { src: imageUrl, alt }));
}

export function useImagePreview() {
    const { renderToBody, clear } = useBodyRender();

    const showPreview = (artist, event) => {
        const coverPath = artist.coverImagePath;
        if (!coverPath) return;

        renderToBody(h(ImagePreviewPopup, {
            imageUrl: buildImageUrl(coverPath),
            alt: artist.displayName || artist.name,
            x: event.clientX + 15,
            y: event.clientY + 15,
        }));
    };

    const removePreview = () => {
        clear();
    };

    return { showPreview, removePreview };
}
