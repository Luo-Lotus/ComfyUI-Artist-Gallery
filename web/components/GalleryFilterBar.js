/**
 * 画廊筛选栏组件
 * 面包屑导航 + 搜索/排序/筛选/卡片大小调节
 */
import { h, Fragment } from '../lib/preact.mjs';
import { useState, useRef, useCallback } from '../lib/hooks.mjs';
import { Breadcrumb } from './Breadcrumb.js';
import { Icon } from '../lib/icons.mjs';
import { Storage } from '../utils.js';
import { useGallery } from './GalleryContext.js';
import { CustomFilterPanel } from './CustomFilterPanel.js';

export function GalleryFilterBar() {
  const ctx = useGallery();
  const [filterHover, setFilterHover] = useState(false);
  const filterWrapRef = useRef(null);
  const hoverTimerRef = useRef(null);

  const handleFilterEnter = useCallback(() => {
    clearTimeout(hoverTimerRef.current);
    setFilterHover(true);
  }, []);

  const handleFilterLeave = useCallback(() => {
    hoverTimerRef.current = setTimeout(() => setFilterHover(false), 200);
  }, []);
  const isGallery = ctx.viewMode === 'gallery';
  const isPrompt = ctx.viewMode === 'prompt';
  const isHistory = ctx.viewMode === 'history';

  // 返回按钮逻辑
  const canGoBack = !isGallery || ctx.currentCategory !== 'root' || isHistory;

  const handleBack = () => {
    if (isHistory) {
      ctx.navigateToGallery();
      return;
    }
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

  return h(Fragment, {}, [
    h('div', { class: 'gallery-merged-header' }, [
    // 左侧：返回按钮 + 面包屑/标题
    h('div', { class: 'gallery-breadcrumb-section' }, [
      canGoBack &&
        h(
          'button',
          {
            class: 'gallery-back-btn',
            onClick: handleBack,
            title: isHistory ? '返回画廊' : isGallery ? '返回上级分类' : '返回画廊',
          },
          h(Icon, { name: 'arrow-left', size: 16 }),
        ),
      isHistory
        ? h('span', { class: 'gallery-history-title' }, '历史图片')
        : h(Breadcrumb, {
            path: ctx.categoryPath,
            onNavigate: ctx.handleBreadcrumbNavigate,
          }),
    ]),

    // 右侧：筛选和排序控件（仅画廊视图显示）
    isGallery &&
      h('div', { class: 'gallery-filter-section' }, [
        h('input', {
          class: 'gallery-search-input',
          type: 'text',
          placeholder: '搜索Prompt或分类...',
          value: ctx.searchQuery,
          onInput: (e) => ctx.setSearchQuery(e.target.value),
        }),

        h(
          'button',
          {
            class: `gallery-filter-btn ${ctx.showFavoritesOnly ? 'active' : ''}`,
            onClick: () => ctx.setShowFavoritesOnly((prev) => !prev),
            title: '只显示收藏',
          },
          h(Icon, { name: 'star', size: 16 }),
        ),

        h(
          'select',
          {
            class: 'gallery-filter-select',
            value: ctx.sortBy,
            onChange: (e) => ctx.setSortBy(e.target.value),
          },
          [
            h('option', { value: 'name' }, '名称'),
            h('option', { value: 'created_at' }, '创建时间'),
          ],
        ),

        h(
          'button',
          {
            class: 'gallery-filter-btn',
            onClick: () => ctx.setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc')),
            title: ctx.sortOrder === 'asc' ? '升序' : '降序',
          },
          ctx.sortOrder === 'asc' ? h(Icon, { name: 'arrow-up', size: 16 }) : h(Icon, { name: 'arrow-down', size: 16 }),
        ),

        h('span', { class: 'gallery-count-badge' }, `${ctx.filteredPrompts.length}/${ctx.data?.totalCount || 0}`),

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

    // Prompt / 历史视图：搜索 + 计数 + 卡片大小
    (isPrompt || isHistory) &&
      h('div', { class: 'gallery-filter-section' }, [
        h('input', {
          class: 'gallery-search-input',
          type: 'text',
          placeholder: '搜索 Prompt 内容...',
          value: ctx.imageSearchQuery,
          onInput: (e) => ctx.setImageSearchQuery(e.target.value),
        }),
        // 历史视图：画廊外图片按钮
        isHistory && h(
          'button',
          {
            class: `gallery-filter-btn ${ctx.includeComfyOutput ? 'active' : ''}`,
            onClick: () => ctx.setIncludeComfyOutput((prev) => !prev),
            title: '显示通过「导入输出图片」导入的图片',
          },
          '展示画廊外图片',
        ),
        // 历史视图：筛查按钮 + 悬浮面板
        isHistory && h('div', {
          class: 'custom-filter-trigger',
          ref: filterWrapRef,
          onMouseEnter: handleFilterEnter,
          onMouseLeave: handleFilterLeave,
        }, [
          h('button', {
            class: `gallery-filter-btn ${ctx.activeCustomFilters.length > 0 ? 'active' : ''}`,
            title: '自定义筛查',
          }, [
            h(Icon, { name: 'filter', size: 14 }),
            ' 筛选',
          ]),
          filterHover && h(CustomFilterPanel, {
            filters: ctx.customFilters,
            filterValues: ctx.customFilterValues,
            onFilterChange: ctx.handleCustomFilterChange,
            onEdit: ctx.handleEditCustomFilter,
            onDelete: ctx.handleDeleteCustomFilter,
            onExtract: ctx.handleExtractCustomFilter,
            onAdd: () => {
              ctx.setEditingCustomFilter(null);
              ctx.setShowCustomFilterEditDialog(true);
            },
            onApply: ctx.handleApplyCustomFilters,
            onClearAll: ctx.handleClearCustomFilters,
            onMouseEnter: handleFilterEnter,
            onMouseLeave: handleFilterLeave,
          }),
        ]),
        h('span', { class: 'gallery-count-badge' }, `${ctx.imageTotalCount} 张`),
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
    ]),
  ]);
}
