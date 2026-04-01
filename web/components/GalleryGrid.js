/**
 * 画师网格组件
 * 支持混合渲染分类卡片、组合卡片和画师卡片
 * 使用 LazyList 实现懒加载
 */
import { h } from '../lib/preact.mjs';
import { useMemo, useCallback } from '../lib/hooks.mjs';
import { GalleryCard } from './GalleryCard.js';
import { CategoryCard } from './CategoryCard.js';
import { CombinationCard } from './CombinationCard.js';
import { LazyList } from './LazyList.js';

export function GalleryGrid({
    categories = [],
    combinations = [],
    artists,
    allArtists,
    favorites,
    onFavoriteToggle,
    onImageClick,
    onEdit,
    onDelete,
    onCombinationClick,
    onCombinationEdit,
    onCombinationDuplicate,
    onCombinationMove,
    onCombinationDelete,
    onCategoryClick,
    onCategoryEdit,
    onCategoryDelete,
    onMove,
    onCopy,
    onExport,
    // 多选相关props
    selectionMode = false,
    selectedItems = new Set(),
    onSelect,
}) {
    // 计算每个分类的画师数量
    const categoryArtistCounts = useMemo(() => {
        const counts = {};
        categories.forEach(cat => {
            counts[cat.id] = artists.filter(a => a.categoryId === cat.id).length;
        });
        return counts;
    }, [categories, artists]);

    // 合并为扁平数组（分类 → 组合 → 画师）
    const allItems = useMemo(() => {
        const catItems = categories.map(cat => ({ type: 'category', data: cat }));
        const combItems = (combinations || []).map(c => ({ type: 'combination', data: c }));
        const artItems = artists.map(artist => ({ type: 'artist', data: artist }));
        return [...catItems, ...combItems, ...artItems];
    }, [categories, combinations, artists]);

    // 渲染单个元素
    const renderItem = useCallback((item, index) => {
        if (item.type === 'category') {
            const category = item.data;
            return h(CategoryCard, {
                key: `cat-${category.id}`,
                category,
                artistCount: categoryArtistCounts[category.id] || 0,
                onClick: onCategoryClick,
                onEdit: onCategoryEdit,
                onDelete: onCategoryDelete,
                onMove: () => onMove && onMove(category, 'category'),
                onCopy: () => onCopy && onCopy(category, 'category'),
                selectionMode,
                selected: selectedItems.has(`category:${category.id}`),
                onSelect,
            });
        } else if (item.type === 'combination') {
            const combination = item.data;
            return h(CombinationCard, {
                key: `comb-${combination.id}`,
                combination,
                artists: allArtists || artists,
                onClick: onCombinationClick,
                onEdit: onCombinationEdit,
                onDuplicate: onCombinationDuplicate,
                onMove: onCombinationMove,
                onDelete: onCombinationDelete,
                selectionMode,
                selected: selectedItems.has(`combination:${combination.id}`),
                onSelect,
            });
        } else {
            const artist = item.data;
            return h(GalleryCard, {
                key: artist.name,
                artist,
                artistIndex: index - categories.length - (combinations || []).length,
                favorites,
                onFavoriteToggle,
                onImageClick,
                onEdit,
                onDelete,
                onMove: () => onMove && onMove(artist, 'artist'),
                onCopy: () => onCopy && onCopy(artist, 'artist'),
                onExport: () => onExport && onExport(artist),
                selectionMode,
                selected: selectedItems.has(`artist:${artist.categoryId}:${artist.name}`),
                onSelect,
            });
        }
    }, [categoryArtistCounts, categories.length, combinations, favorites, onFavoriteToggle,
        onImageClick, onEdit, onDelete, onCategoryClick, onCategoryEdit, onCategoryDelete,
        onMove, onCopy, onExport, onCombinationClick, onCombinationEdit, onCombinationDuplicate,
        onCombinationMove, onCombinationDelete, selectionMode, selectedItems, onSelect, artists]);

    if (allItems.length === 0) {
        return h('div', { class: 'gallery-empty' }, '🔍 没有找到匹配的内容');
    }

    return h(LazyList, {
        items: allItems,
        renderItem,
        layout: 'grid',
        className: 'gallery-grid',
        emptyMessage: h('div', { class: 'gallery-empty' }, '🔍 没有找到匹配的内容'),
    });
}
