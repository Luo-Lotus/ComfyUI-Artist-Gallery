/**
 * 封面图片选择器组件
 * 在编辑画师时选择封面图片
 */
import { h } from '../lib/preact.mjs';
import { buildImageUrl } from '../utils.js';

export function CoverImageSelector({ artist, selectedImageId, onSelect }) {
    const handleSelect = (imagePath) => {
        if (onSelect) {
            onSelect(imagePath);
        }
    };

    if (!artist || !artist.images || artist.images.length === 0) {
        return h('div', { class: 'cover-selector-empty' }, '暂无图片可供选择封面');
    }

    return h('div', { class: 'cover-selector' }, [
        h('label', {}, '选择封面图片'),
        h('div', { class: 'cover-grid' },
            artist.images.map((img, index) =>
                h('div', {
                    key: img.path,
                    class: `cover-item ${selectedImageId === img.path ? 'selected' : ''}`,
                    onClick: () => handleSelect(img.path),
                    title: `点击设置为封面 (${index + 1}/${artist.images.length})`
                }, [
                    h('img', {
                        src: buildImageUrl(img.path),
                        alt: `图片 ${index + 1}`,
                        loading: 'lazy'
                    }),
                    selectedImageId === img.path && h('div', { class: 'cover-badge' }, '✓ 封面')
                ])
            )
        )
    ]);
}
