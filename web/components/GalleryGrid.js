/**
 * Prompt网格组件
 * 支持混合渲染分类卡片和 Prompt 卡片
 * 使用 LazyList 实现懒加载
 */
import { h } from '../lib/preact.mjs';
import { useMemo, useCallback } from '../lib/hooks.mjs';
import { GalleryCard } from './GalleryCard.js';
import { CategoryCard } from './CategoryCard.js';
import { LazyList } from './LazyList.js';
import { useGallery } from './GalleryContext.js';
import { computeSizeVars } from './SizePresets.js';
import { comparePinned } from './hooks/useFilteredPrompts.js';

export function GalleryGrid() {
  const ctx = useGallery();

  const gridStyle = useMemo(() => computeSizeVars(ctx.cardSize), [ctx.cardSize]);

  const allCategories = ctx.currentCategoryChildren;
  const prompts = ctx.filteredPrompts;
  const cardSelectionMode = ctx.isSelectorMode || ctx.selectionMode;

  // 搜索时同时过滤分类名称
  const categories = useMemo(() => {
    if (!ctx.searchQuery) return [...allCategories].sort(comparePinned);
    const query = ctx.searchQuery.toLowerCase();
    return allCategories
      .filter((cat) => (cat.name || '').toLowerCase().includes(query))
      .sort(comparePinned);
  }, [allCategories, ctx.searchQuery]);

  // 计算每个分类的Prompt数量
  const categoryPromptCounts = useMemo(() => {
    const counts = {};
    const categoryIds = new Set(categories.map((cat) => cat.id));
    prompts.forEach((prompt) => {
      const categoryId = prompt.categoryId;
      if (categoryIds.has(categoryId)) {
        counts[categoryId] = (counts[categoryId] || 0) + 1;
      }
    });
    return counts;
  }, [categories, prompts]);

  // 合并为扁平数组（分类 → Prompt）
  const allItems = useMemo(() => {
    const catItems = categories.map((cat) => ({
      type: 'category',
      data: cat,
    }));
    const artItems = prompts.map((prompt) => ({
      type: 'prompt',
      data: prompt,
    }));
    return [...catItems, ...artItems];
  }, [categories, prompts]);

  // 渲染单个元素
  const renderItem = useCallback(
    (item, index) => {
      if (item.type === 'category') {
        const category = item.data;
        return h(CategoryCard, {
          key: `cat-${category.id}`,
          category,
          promptCount: categoryPromptCounts[category.id] || 0,
          onClick: (cat) => ctx.handleCategorySelect(cat),
          onEdit: (cat) => ctx.handleEditCategory(cat),
          onDelete: async (cat) => {
            await ctx.handleDeleteCategory(cat);
            ctx.loadData();
          },
          onMove: () => ctx.openMoveDialog(category, 'category'),
          onExport: (cat) => ctx.handleOpenExportDialog(cat),
          onTogglePinned: ctx.handleTogglePinned,
          selectionMode: cardSelectionMode,
          selectorMode: ctx.isSelectorMode,
          selected: ctx.isSelectorMode
            ? ctx.selectorSelectedCategoryIds.has(category.id)
            : ctx.selectedItems.has(`category:${category.id}`),
          onSelect: ctx.isSelectorMode
            ? () => ctx.handleSelectorCategorySelect(category)
            : ctx.handleGallerySelect,
        });
      } else {
        const prompt = item.data;
        const promptIndex = index - categories.length;
        return h(GalleryCard, {
          key: prompt.name,
          prompt,
          promptIndex,
          favorites: ctx.favorites,
          onFavoriteToggle: ctx.handleFavoriteToggle,
          onImageClick: ctx.handleCardClick,
          onEdit: ctx.openEditDialog,
          onDelete: ctx.openDeleteConfirm,
          onMove: () => ctx.openMoveDialog(prompt, 'prompt'),
          onCopy: () => ctx.openCopyDialog(prompt, 'prompt'),
          onExport: () => ctx.handleExportPrompt(prompt),
          onTogglePinned: ctx.handleTogglePinned,
          selectionMode: cardSelectionMode,
          selected: ctx.isSelectorMode
            ? ctx.selectorSelectedPromptKeys.has(`${prompt.categoryId}:${prompt.value}`)
            : ctx.selectedItems.has(`prompt:${prompt.categoryId}:${prompt.value}`),
          onSelect: ctx.isSelectorMode
            ? () => ctx.handleSelectorPromptSelect(prompt)
            : ctx.handleGallerySelect,
        });
      }
    },
    [
      categoryPromptCounts,
      categories.length,
      ctx.favorites,
      ctx.handleCardClick,
      ctx.handleCategorySelect,
      ctx.handleDeleteCategory,
      ctx.handleEditCategory,
      ctx.handleExportPrompt,
      ctx.handleFavoriteToggle,
      ctx.handleGallerySelect,
      ctx.handleOpenExportDialog,
      ctx.handleTogglePinned,
      ctx.handleSelectorCategorySelect,
      ctx.handleSelectorPromptSelect,
      ctx.isSelectorMode,
      ctx.loadData,
      ctx.openCopyDialog,
      ctx.openDeleteConfirm,
      ctx.openEditDialog,
      ctx.openMoveDialog,
      ctx.selectionMode,
      ctx.selectedItems,
      ctx.selectorSelectedCategoryIds,
      ctx.selectorSelectedPromptKeys,
      cardSelectionMode,
    ],
  );

  if (allItems.length === 0) {
    return h('div', { class: 'gallery-empty' }, '没有找到匹配的内容');
  }

  const isAdaptive = ctx.cardLayoutMode === 'adaptive';

  return h('div', { class: 'gallery-grid-wrapper' }, [
    h(LazyList, {
      items: allItems,
      renderItem,
      layout: isAdaptive ? 'flex' : 'grid',
      className: 'gallery-grid' + (isAdaptive ? '' : ' gallery-grid--fixed'),
      style: gridStyle,
      emptyMessage: h('div', { class: 'gallery-empty' }, '没有找到匹配的内容'),
    }),
    h(
      'div',
      { class: 'gallery-hint' },
      ctx.isSelectorMode
        ? '单击选择或取消；双击分类可进入分类'
        : '右键点击卡片可进行编辑、移动、删除等操作',
    ),
  ]);
}
