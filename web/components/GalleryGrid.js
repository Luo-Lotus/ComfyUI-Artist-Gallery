/**
 * 画师网格组件
 * 支持混合渲染分类卡片和画师卡片
 */
import { h } from '../lib/preact.mjs';
import { useMemo } from '../lib/hooks.mjs';
import { GalleryCard } from './GalleryCard.js';
import { CategoryCard } from './CategoryCard.js';

export function GalleryGrid({
    categories = [],
    artists,
    favorites,
    onFavoriteToggle,
    onImageClick,
    onEdit,
    onDelete,
    onCategoryClick,
    onCategoryEdit,
    onCategoryDelete,
    onMove
}) {
    // 计算每个分类的画师数量
    const categoryArtistCounts = useMemo(() => {
        const counts = {};
        categories.forEach(cat => {
            counts[cat.id] = artists.filter(a => a.categoryId === cat.id).length;
        });
        return counts;
    }, [categories, artists]);

    if (categories.length === 0 && artists.length === 0) {
        return h('div', { class: 'gallery-empty' }, '🔍 没有找到匹配的内容');
    }

    return h('div', { class: 'gallery-grid' }, [
        // 先渲染分类卡片
        ...categories.map(category =>
            h(CategoryCard, {
                key: `cat-${category.id}`,
                category,
                artistCount: categoryArtistCounts[category.id] || 0,
                onClick: onCategoryClick,
                onEdit: onCategoryEdit,
                onDelete: onCategoryDelete,
                onMove: () => onMove && onMove(category, 'category')
            })
        ),
        // 再渲染画师卡片
        ...artists.map((artist, index) =>
            h(GalleryCard, {
                key: artist.name,
                artist,
                artistIndex: index,
                favorites,
                onFavoriteToggle,
                onImageClick,
                onEdit,
                onDelete,
                onMove: () => onMove && onMove(artist, 'artist')
            }),
        ),
    ]);
}
