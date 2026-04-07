/**
 * 画廊筛选栏组件
 * 面包屑导航 + 搜索/排序/筛选/卡片大小调节
 */
import { h } from '../lib/preact.mjs';
import { Breadcrumb } from './Breadcrumb.js';
import { Icon } from '../lib/icons.mjs';
import { Storage } from '../utils.js';
import { useGallery } from './GalleryContext.js';

export function GalleryFilterBar() {
    const ctx = useGallery();
    const isGallery = ctx.viewMode === 'gallery';
    const isArtist = ctx.viewMode === 'artist';
    const isCombination = ctx.viewMode === 'combination';

    // 返回按钮逻辑
    const canGoBack = !isGallery || ctx.currentCategory !== 'root';

    const handleBack = () => {
        if (!isGallery) {
            ctx.navigateToGallery();
        } else if (ctx.currentCategory !== 'root') {
            const parentIndex = ctx.categoryPath.length - 2;
            if (parentIndex >= 0) {
                ctx.handleBreadcrumbNavigate(ctx.categoryPath[parentIndex]);
            } else {
                ctx.handleBreadcrumbNavigate({ id: 'root' });
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
                path: ctx.categoryPath,
                onNavigate: ctx.handleBreadcrumbNavigate,
            }),
        ]),

        // 右侧：筛选和排序控件（仅画廊视图显示）
        isGallery && h('div', { class: 'gallery-filter-section' }, [
            h('input', {
                class: 'gallery-search-input',
                type: 'text',
                placeholder: '搜索画师...',
                value: ctx.searchQuery,
                onInput: (e) => ctx.setSearchQuery(e.target.value),
            }),

            h('button', {
                class: `gallery-filter-btn ${ctx.showFavoritesOnly ? 'active' : ''}`,
                onClick: () => ctx.setShowFavoritesOnly(prev => !prev),
                title: '只显示收藏',
            }, h(Icon, { name: 'star', size: 16 })),

            h('select', {
                class: 'gallery-filter-select',
                value: ctx.sortBy,
                onChange: (e) => ctx.setSortBy(e.target.value),
            }, [
                h('option', { value: 'name' }, '名称'),
                h('option', { value: 'created_at' }, '创建时间'),
                h('option', { value: 'image_count' }, '图片数量'),
            ]),

            h('button', {
                class: 'gallery-filter-btn',
                onClick: () => ctx.setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc'),
                title: ctx.sortOrder === 'asc' ? '升序' : '降序',
            }, ctx.sortOrder === 'asc' ? h(Icon, { name: 'arrow-up', size: 16 }) : h(Icon, { name: 'arrow-down', size: 16 })),

            h('span', { class: 'gallery-count-badge' },
                `${ctx.filteredArtists.length}/${ctx.data?.totalCount || 0}`,
            ),

            h('div', { class: 'gallery-size-slider' }, [
                h('span', { class: 'gallery-size-label' }, '◡'),
                h('input', {
                    type: 'range',
                    min: '0.5',
                    max: '1.5',
                    step: '0.05',
                    value: ctx.cardSize,
                    onInput: (e) => {
                        const val = parseFloat(e.target.value);
                        ctx.setCardSize(val);
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
                value: ctx.imageSearchQuery,
                onInput: (e) => ctx.setImageSearchQuery(e.target.value),
            }),
            h('span', { class: 'gallery-count-badge' },
                `${isArtist ? ctx.filteredArtistImages.length : ctx.filteredCombinationImages.length}/${isArtist ? (ctx.currentArtist?.images?.length || 0) : (ctx.viewModeCombination?.images?.length || 0)}`,
            ),
        ]),
    ]);
}
