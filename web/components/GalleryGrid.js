/**
 * 画师网格组件
 * 显示所有画师卡片
 */
import { h } from '../lib/preact.mjs';
import { GalleryCard } from './GalleryCard.js';

export function GalleryGrid({ artists, favorites, onFavoriteToggle, onImageClick, onEdit, onDelete }) {
    if (artists.length === 0) {
        return h('div', { class: 'gallery-empty' }, '🔍 没有找到匹配的画师');
    }
    return h(
        'div',
        { class: 'gallery-grid' },
        artists.map((artist, index) =>
            h(GalleryCard, {
                key: artist.name,
                artist,
                artistIndex: index,
                favorites,
                onFavoriteToggle,
                onImageClick,
                onEdit,
                onDelete,
            }),
        ),
    );
}
