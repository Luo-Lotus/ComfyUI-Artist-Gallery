/**
 * 画师网格组件
 * 支持混合渲染分类卡片、组合卡片和画师卡片
 * 使用 LazyList 实现懒加载
 */
import { h } from '../lib/preact.mjs';
import { useMemo, useCallback, useEffect } from '../lib/hooks.mjs';
import { GalleryCard } from './GalleryCard.js';
import { CategoryCard } from './CategoryCard.js';
import { CombinationCard } from './CombinationCard.js';
import { LazyList } from './LazyList.js';
import { useGallery } from './GalleryContext.js';
import { applySizeStyles } from './SizePresets.js';

export function GalleryGrid() {
    const ctx = useGallery();

    // Apply card size CSS variables to the grid container
    useEffect(() => {
        const gridEl = document.querySelector('.gallery-grid');
        if (gridEl) applySizeStyles(gridEl, ctx.cardSize);
    }, [ctx.cardSize]);

    const categories = ctx.currentCategoryChildren;
    const combinations = ctx.currentCombinations;
    const artists = ctx.filteredArtists;

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
        const combItems = combinations.map(c => ({ type: 'combination', data: c }));
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
                onClick: (cat) => ctx.handleCategorySelect(cat),
                onEdit: (cat) => ctx.handleEditCategory(cat),
                onDelete: async (cat) => {
                    await ctx.handleDeleteCategory(cat);
                    ctx.loadData();
                },
                onMove: () => ctx.openMoveDialog(category, 'category'),
                onCopy: () => ctx.openCopyDialog(category, 'category'),
                selectionMode: ctx.selectionMode,
                selected: ctx.selectedItems.has(`category:${category.id}`),
                onSelect: ctx.handleGallerySelect,
            });
        } else if (item.type === 'combination') {
            const combination = item.data;
            return h(CombinationCard, {
                key: `comb-${combination.id}`,
                combination,
                artists: ctx.allArtists,
                onClick: ctx.handleCombinationClick,
                onEdit: ctx.handleCombinationEdit,
                onDuplicate: ctx.handleCombinationDuplicate,
                onMove: () => ctx.openMoveDialog(combination, 'combination'),
                onDelete: ctx.handleCombinationDelete,
                selectionMode: ctx.selectionMode,
                selected: ctx.selectedItems.has(`combination:${combination.id}`),
                onSelect: ctx.handleGallerySelect,
            });
        } else {
            const artist = item.data;
            const artistIndex = index - categories.length - combinations.length;
            return h(GalleryCard, {
                key: artist.name,
                artist,
                artistIndex,
                favorites: ctx.favorites,
                onFavoriteToggle: ctx.handleFavoriteToggle,
                onImageClick: ctx.handleCardClick,
                onEdit: ctx.openEditDialog,
                onDelete: ctx.openDeleteConfirm,
                onMove: () => ctx.openMoveDialog(artist, 'artist'),
                onCopy: () => ctx.openCopyDialog(artist, 'artist'),
                onExport: () => ctx.handleExportArtist(artist),
                selectionMode: ctx.selectionMode,
                selected: ctx.selectedItems.has(`artist:${artist.categoryId}:${artist.name}`),
                onSelect: ctx.handleGallerySelect,
            });
        }
    }, [categoryArtistCounts, categories.length, combinations.length,
        ctx.currentCombinations, ctx.allArtists, ctx.favorites,
        ctx.selectionMode, ctx.selectedItems]);

    if (allItems.length === 0) {
        return h('div', { class: 'gallery-empty' }, '没有找到匹配的内容');
    }

    return h(LazyList, {
        items: allItems,
        renderItem,
        layout: 'grid',
        className: 'gallery-grid',
        emptyMessage: h('div', { class: 'gallery-empty' }, '没有找到匹配的内容'),
    });
}
