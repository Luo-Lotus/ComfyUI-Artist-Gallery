/**
 * 画廊筛选栏组件
 * 面包屑导航 + 搜索/排序/筛选/卡片大小调节
 */
import { h } from '../lib/preact.mjs';
import { Breadcrumb } from './Breadcrumb.js';
import { Icon } from '../lib/icons.mjs';
import { Storage } from '../utils.js';

export function GalleryFilterBar({
    viewMode,
    currentCategory,
    categoryPath,
    onBreadcrumbNavigate,
    onBack,
    // 画廊筛选
    searchQuery,
    onSearchChange,
    showFavoritesOnly,
    onToggleFavorites,
    sortBy,
    onSortChange,
    sortOrder,
    onSortOrderToggle,
    filteredCount,
    totalCount,
    cardSize,
    onCardSizeChange,
    // 图片搜索（详情视图）
    imageSearchQuery,
    onImageSearchChange,
    imageFilteredCount,
    imageTotalCount,
}) {
    const isGallery = viewMode === 'gallery';
    const isArtist = viewMode === 'artist';
    const isCombination = viewMode === 'combination';

    // 返回按钮逻辑：非根页面都显示
    const canGoBack = !isGallery || currentCategory !== 'root';

    const handleBack = () => {
        if (!isGallery) {
            onBack();
        } else if (currentCategory !== 'root') {
            const parentIndex = categoryPath.length - 2;
            if (parentIndex >= 0) {
                const parent = categoryPath[parentIndex];
                onBreadcrumbNavigate(parent);
            } else {
                onBreadcrumbNavigate({ id: 'root' });
            }
        }
    };

    return h('div', { class: 'gallery-merged-header' }, [
        // 左侧：返回按钮 + 面包屑导航
        h('div', { class: 'gallery-breadcrumb-section' }, [
            canGoBack && h('button', {
                class: 'gallery-back-btn',
                onClick: handleBack,
                title: isGallery ? '返回上级分类' : '返回画廊',
            }, h(Icon, { name: 'arrow-left', size: 16 })),
            h(Breadcrumb, {
                path: categoryPath,
                onNavigate: onBreadcrumbNavigate,
            }),
        ]),

        // 右侧：筛选和排序控件（仅画廊视图显示）
        isGallery && h('div', { class: 'gallery-filter-section' }, [
            h('input', {
                class: 'gallery-search-input',
                type: 'text',
                placeholder: '搜索画师...',
                value: searchQuery,
                onInput: (e) => onSearchChange(e.target.value),
            }),

            h(
                'button',
                {
                    class: `gallery-filter-btn ${showFavoritesOnly ? 'active' : ''}`,
                    onClick: onToggleFavorites,
                    title: '只显示收藏',
                },
                h(Icon, { name: 'star', size: 16 }),
            ),

            h(
                'select',
                {
                    class: 'gallery-filter-select',
                    value: sortBy,
                    onChange: (e) => onSortChange(e.target.value),
                },
                [
                    h('option', { value: 'name' }, '名称'),
                    h('option', { value: 'created_at' }, '创建时间'),
                    h('option', { value: 'image_count' }, '图片数量'),
                ],
            ),

            h(
                'button',
                {
                    class: 'gallery-filter-btn',
                    onClick: onSortOrderToggle,
                    title: sortOrder === 'asc' ? '升序' : '降序',
                },
                sortOrder === 'asc' ? h(Icon, { name: 'arrow-up', size: 16 }) : h(Icon, { name: 'arrow-down', size: 16 }),
            ),

            h(
                'span',
                { class: 'gallery-count-badge' },
                `${filteredCount}/${totalCount || 0}`,
            ),

            h('div', { class: 'gallery-size-slider' }, [
                h('span', { class: 'gallery-size-label' }, '◡'),
                h('input', {
                    type: 'range',
                    min: '0.5',
                    max: '1.5',
                    step: '0.05',
                    value: cardSize,
                    onInput: (e) => {
                        const val = parseFloat(e.target.value);
                        onCardSizeChange(val);
                        Storage.saveCardSize(val);
                    },
                    title: '调节卡片大小',
                }),
                h('span', { class: 'gallery-size-label' }, '◠'),
            ]),
        ]),

        // 画师/组合详情视图：图片搜索
        (isArtist || isCombination) && h('div', { class: 'gallery-filter-section' }, [
            h('input', {
                class: 'gallery-search-input',
                type: 'text',
                placeholder: '搜索图片...',
                value: imageSearchQuery,
                onInput: (e) => onImageSearchChange(e.target.value),
            }),
            h(
                'span',
                { class: 'gallery-count-badge' },
                `${imageFilteredCount}/${imageTotalCount || 0}`,
            ),
        ]),
    ]);
}
