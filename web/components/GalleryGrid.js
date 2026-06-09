/**
 * Prompt网格组件
 * 支持混合渲染分类卡片、组合卡片和Prompt卡片
 * 使用 LazyList 实现懒加载
 */
import { h } from '../lib/preact.mjs';
import { useMemo, useCallback } from '../lib/hooks.mjs';
import { GalleryCard } from './GalleryCard.js';
import { CategoryCard } from './CategoryCard.js';
import { CombinationCard } from './CombinationCard.js';
import { LazyList } from './LazyList.js';
import { useGallery } from './GalleryContext.js';
import { computeSizeVars } from './SizePresets.js';
import { comparePinned } from './hooks/useFilteredPrompts.js';

export function GalleryGrid() {
  const ctx = useGallery();

  const gridStyle = useMemo(() => computeSizeVars(ctx.cardSize), [ctx.cardSize]);

  const allCategories = ctx.currentCategoryChildren;
  const combinations = ctx.currentCombinations;
  const prompts = ctx.filteredPrompts;

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
    categories.forEach((cat) => {
      counts[cat.id] = prompts.filter((a) => a.categoryId === cat.id).length;
    });
    return counts;
  }, [categories, prompts]);

  // 合并为扁平数组（分类 → 组合 → Prompt）
  const allItems = useMemo(() => {
    const catItems = categories.map((cat) => ({
      type: 'category',
      data: cat,
    }));
    const combItems = [...combinations].sort(comparePinned).map((c) => ({
      type: 'combination',
      data: c,
    }));
    const artItems = prompts.map((prompt) => ({
      type: 'prompt',
      data: prompt,
    }));
    return [...catItems, ...combItems, ...artItems];
  }, [categories, combinations, prompts]);

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
          onCopy: () => ctx.openCopyDialog(category, 'category'),
          onExport: (cat) => ctx.handleOpenExportDialog(cat),
          onTogglePinned: ctx.handleTogglePinned,
          selectionMode: ctx.selectionMode,
          selected: ctx.selectedItems.has(`category:${category.id}`),
          onSelect: ctx.handleGallerySelect,
        });
      } else if (item.type === 'combination') {
        const combination = item.data;
        return h(CombinationCard, {
          key: `comb-${combination.id}`,
          combination,
          onClick: ctx.handleCombinationClick,
          onEdit: ctx.handleCombinationEdit,
          onDuplicate: ctx.handleCombinationDuplicate,
          onMove: () => ctx.openMoveDialog(combination, 'combination'),
          onDelete: ctx.handleCombinationDelete,
          onTogglePinned: ctx.handleTogglePinned,
          selectionMode: ctx.selectionMode,
          selected: ctx.selectedItems.has(`combination:${combination.id}`),
          onSelect: ctx.handleGallerySelect,
        });
      } else {
        const prompt = item.data;
        const promptIndex = index - categories.length - combinations.length;
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
          selectionMode: ctx.selectionMode,
          selected: ctx.selectedItems.has(`prompt:${prompt.categoryId}:${prompt.value}`),
          onSelect: ctx.handleGallerySelect,
        });
      }
    },
    [
      categoryPromptCounts,
      categories.length,
      combinations.length,
      ctx.currentCombinations,
      ctx.favorites,
      ctx.handleTogglePinned,
      ctx.selectionMode,
      ctx.selectedItems,
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
    h('div', { class: 'gallery-hint' }, '右键点击卡片可进行编辑、移动、删除等操作'),
  ]);
}
