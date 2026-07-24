/**
 * Prompt过滤和排序 Hook
 */
import { useMemo } from '../../lib/hooks.mjs';

export function isPinned(item) {
  return !!item?.metadata?.pinned;
}

export function comparePinned(a, b) {
  return Number(isPinned(b)) - Number(isPinned(a));
}

export function useFilteredPrompts(data, searchQuery, sortBy, sortOrder, showFavoritesOnly, favorites, categories) {
  const filteredPrompts = useMemo(() => {
    if (!data) return [];
    let result = [...data.prompts];

    // 搜索过滤（搜索 value、name、alias、分类名称）
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      // 构建 categoryId -> 分类名称 的查找表
      const categoryNameMap = new Map();
      if (categories) {
        for (const cat of categories) {
          categoryNameMap.set(cat.id, (cat.name || '').toLowerCase());
        }
      }
      result = result.filter((a) => {
        const value = (a.value || '').toLowerCase();
        const name = (a.name || '').toLowerCase();
        const alias = (a.alias || '').toLowerCase();
        if (value.includes(query) || name.includes(query) || alias.includes(query)) return true;
        // 匹配分类名称
        const catName = categoryNameMap.get(a.categoryId);
        return catName && catName.includes(query);
      });
    }

    // 收藏过滤
    if (showFavoritesOnly) {
      result = result.filter((a) => favorites.has(a.value));
    }

    // 排序
    result.sort((a, b) => {
      const pinnedComparison = comparePinned(a, b);
      if (pinnedComparison !== 0) return pinnedComparison;

      let comparison = 0;
      if (sortBy === 'name') {
        comparison = a.value.localeCompare(b.value, 'zh-CN');
      } else if (sortBy === 'time' || sortBy === 'created_at') {
        comparison = (a.maxTime || 0) - (b.maxTime || 0);
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [data, searchQuery, sortBy, sortOrder, showFavoritesOnly, favorites, categories]);

  return filteredPrompts;
}
