/**
 * 画师选择逻辑 Hook
 * 处理画师数据加载、选择状态管理、排序过滤等逻辑
 */
import { useState, useEffect, useMemo, useCallback, useRef } from '../../../lib/hooks.mjs';
import { useNodeSync } from './useNodeSync.js';
import { usePartitionState } from './usePartitionState.js';
import { searchAll, batchResolve, fetchCovers } from '../../../utils.js';

// 辅助函数：构建面包屑路径
function buildBreadcrumbPath(categoryId, categories) {
  const path = [];

  function findPath(id) {
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;

    path.unshift(cat);

    if (cat.parentId) {
      findPath(cat.parentId);
    }
  }

  if (categoryId && categoryId !== 'root') {
    findPath(categoryId);
  }

  return path;
}

export function usePromptSelector(nodeInstance, selectedInput, metadataInput) {
  // 基础状态管理
  const [prompts, setPrompts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedPromptsCache, setSelectedPromptsCache] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [currentCategory, setCurrentCategory] = useState('root');
  const [refreshing, setRefreshing] = useState(false);
  // 搜索结果状态
  const [searchResults, setSearchResults] = useState(null);

  // Shift 范围选择：记录上一次点击的项
  const lastSelectedItemRef = useRef(null);

  // 封面缓存（key -> coverImagePath）
  const coversCacheRef = useRef({});

  // 分区系统状态（由 usePartitionState hook 管理）
  const {
    partitionData,
    itemsByPartition,
    addItemToPartition,
    removeItemFromPartition,
    removeItemGlobally,
    setItemSelected,
    reorderPartitionItems,
    addPartition,
    deletePartition,
    updatePartition,
    setPromptWeight,
    togglePartition,
    setAsDefaultPartition,
    reorderPartitions,
  } = usePartitionState({
    selectedPromptsCache,
    categories,
    metadataInput,
  });

  // 选择状态从 orderItems 推导
  const selectedKeys = useMemo(() => {
    const keys = new Set();
    for (const p of partitionData.partitions) {
      for (const item of p.orderItems) {
        if (item.type === 'prompt') keys.add(item.key);
      }
    }
    return keys;
  }, [partitionData]);

  const selectedCategories = useMemo(() => {
    const keys = new Set();
    for (const p of partitionData.partitions) {
      for (const item of p.orderItems) {
        if (item.type === 'category') keys.add(item.key);
      }
    }
    return keys;
  }, [partitionData]);

  // 计算面包屑路径
  const breadcrumbPath = useMemo(() => {
    return buildBreadcrumbPath(currentCategory, categories);
  }, [currentCategory, categories]);

  // 辅助函数：生成 Prompt key
  const makePromptKey = (categoryId, value) => `${categoryId}:${value}`;

  // 批量获取封面
  const fetchCoversByIds = useCallback(async (promptKeys) => {
    const uncachedPromptKeys = promptKeys.filter((k) => !(k in coversCacheRef.current));

    if (uncachedPromptKeys.length === 0) return;

    try {
      const result = await fetchCovers(uncachedPromptKeys);
      Object.assign(coversCacheRef.current, result.covers || {});
    } catch (err) {
      console.error('[PromptSelector] Failed to fetch covers:', err);
    }
  }, []);

  // 从 /data 响应中提取分类列表（合并去重）
  const mergeCategories = useCallback((newCategories) => {
    setCategories((prev) => {
      const map = new Map();
      for (const c of prev) map.set(c.id, c);
      for (const c of newCategories) map.set(c.id, c);
      return Array.from(map.values());
    });
  }, []);

  // 加载分类数据
  const loadCategories = useCallback(async () => {
    try {
      const response = await fetch('/prompt_gallery/data?category=root');
      const data = await response.json();
      const rootCat = { id: 'root', name: '根分类', parentId: null };
      mergeCategories([rootCat, ...(data.childCategories || [])]);
      return data;
    } catch (err) {
      console.error('[PromptSelector] Failed to load categories:', err);
      return null;
    }
  }, [mergeCategories]);

  // 初始加载
  useEffect(() => {
    const loadInitData = async () => {
      try {
        const data = await loadCategories();
        if (data) {
          setPrompts(data.prompts || []);
        }
      } catch (error) {
        console.error('[PromptSelector] Failed to load init data:', error);
      } finally {
        setLoading(false);
      }
    };
    loadInitData();
  }, []);

  // 补全缓存中缺失的画师和分类信息
  const hydrateAll = useCallback(
    async () => {
      const missingPrompts = Array.from(selectedKeys).filter((key) => !selectedPromptsCache[key]);
      const missingCategories = Array.from(selectedCategories).filter((catId) => !categories.find((c) => c.id === catId));
      if (missingPrompts.length === 0 && missingCategories.length === 0) return;

      try {
        const result = await batchResolve({
          prompts: missingPrompts,
          categories: missingCategories,
        });

        if (result.prompts) {
          setSelectedPromptsCache((prev) => {
            const next = { ...prev };
            let changed = false;
            for (const [key, prompt] of Object.entries(result.prompts)) {
              if (!next[key]) {
                next[key] = prompt;
                changed = true;
              }
            }
            return changed ? next : prev;
          });
        }

        if (result.categories) {
          const resolvedCats = Object.values(result.categories);
          if (resolvedCats.length > 0) {
            mergeCategories(resolvedCats);
          }
        }

      } catch (err) {
        console.error('[PromptSelector] Failed to hydrate cache:', err);
      }
    },
    [selectedKeys, selectedPromptsCache, selectedCategories, categories, mergeCategories],
  );

  // 当选中项变化时，补全缓存中缺失的信息
  useEffect(() => {
    hydrateAll();
  }, [selectedKeys, selectedCategories]);

  // 加载画师列表（根据分类筛选）
  useEffect(() => {
    const loadPrompts = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/prompt_gallery/data?category=${currentCategory}`);
        const data = await response.json();
        setPrompts(data.prompts || []);
        if (data.childCategories) {
          mergeCategories(data.childCategories);
        }
      } catch (error) {
        console.error('[PromptSelector] Failed to load prompts:', error);
      } finally {
        setLoading(false);
      }
    };
    loadPrompts();
  }, [currentCategory]);

  // 搜索
  useEffect(() => {
    if (!searchQuery) {
      setSearchResults(null);
      return;
    }

    const doSearch = async () => {
      try {
        const result = await searchAll(searchQuery);
        setSearchResults({ prompts: result.prompts || [] });
        const coverKeys = (result.prompts || [])
          .filter((p) => p.coverImagePath)
          .map((p) => `${p.categoryId}:${p.value}`);
        for (const key of coverKeys) {
          const p = result.prompts.find((pr) => `${pr.categoryId}:${pr.value}` === key);
          if (p) coversCacheRef.current[key] = p.coverImagePath;
        }
      } catch (err) {
        console.error('[PromptSelector] Search failed:', err);
        setSearchResults({ prompts: [] });
      }
    };

    const timer = setTimeout(doSearch, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 过滤和排序
  const filteredPrompts = useMemo(() => {
    const source = searchResults ? searchResults.prompts : prompts;
    if (!source || source.length === 0) return [];
    let result = [...source];

    if (!searchResults && searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.value.toLowerCase().includes(query) ||
          a.name.toLowerCase().includes(query) ||
          (a.alias && a.alias.toLowerCase().includes(query)),
      );
    }

    result.sort((a, b) => {
      const pinnedComparison = Number(!!b?.metadata?.pinned) - Number(!!a?.metadata?.pinned);
      if (pinnedComparison !== 0) return pinnedComparison;

      let comparison = 0;
      if (sortBy === 'name') {
        comparison = a.value.localeCompare(b.value, 'zh-CN');
      } else if (sortBy === 'created_at') {
        comparison = a.createdAt - b.createdAt;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [prompts, searchResults, searchQuery, sortBy, sortOrder]);

  const filteredCategories = useMemo(() => {
    if (!searchQuery) return categories.filter((c) => c.parentId === currentCategory);
    const query = searchQuery.toLowerCase();
    return categories.filter((c) => c.name.toLowerCase().includes(query));
  }, [categories, searchQuery, currentCategory]);

  // Shift 范围选择：构建当前视图的有序键列表（置顶分类 → Prompt）
  const orderedKeys = useMemo(() => {
    const keys = [];
    // 分类（置顶优先）
    const sortedCats = [...filteredCategories].sort(
      (a, b) => Number(!!b?.metadata?.pinned) - Number(!!a?.metadata?.pinned),
    );
    for (const cat of sortedCats) keys.push(cat.id);
    // Prompt
    for (const prompt of filteredPrompts) keys.push(makePromptKey(prompt.categoryId, prompt.value));
    return keys;
  }, [filteredCategories, filteredPrompts]);

  // 辅助函数：将范围内的项批量添加到默认分区
  const addRangeToDefaultPartition = useCallback(
    (keysToAdd) => {
      const defaultPartition = partitionData.partitions.find((p) => p.isDefault);
      if (!defaultPartition) return;

      // 缓存 prompt 信息
      const cacheUpdates = {};
      for (const key of keysToAdd) {
        if (key.includes(':')) {
          // prompt key 格式为 categoryId:value
          const prompt = prompts.find((a) => makePromptKey(a.categoryId, a.value) === key);
          if (prompt) cacheUpdates[key] = prompt;
        }
      }
      if (Object.keys(cacheUpdates).length > 0) {
        setSelectedPromptsCache((prev) => ({ ...prev, ...cacheUpdates }));
      }

      // 批量添加到默认分区
      for (const key of keysToAdd) {
        if (key.includes(':')) {
          addItemToPartition('prompt', key, defaultPartition.id);
        } else {
          addItemToPartition('category', key, defaultPartition.id);
        }
      }
    },
    [partitionData, prompts, addItemToPartition, setSelectedPromptsCache],
  );

  // 切换画师选择状态
  const toggleSelection = useCallback(
    (categoryId, value, shiftKey = false) => {
      const key = makePromptKey(categoryId, value);

      // Shift 范围选择
      if (shiftKey && lastSelectedItemRef.current && orderedKeys.length > 0) {
        const startIdx = orderedKeys.indexOf(lastSelectedItemRef.current);
        const endIdx = orderedKeys.indexOf(key);
        if (startIdx >= 0 && endIdx >= 0) {
          const from = Math.min(startIdx, endIdx);
          const to = Math.max(startIdx, endIdx);
          const keysToAdd = [];
          for (let i = from; i <= to; i++) {
            // 只添加尚未选中的项
            const k = orderedKeys[i];
            const type = k.includes(':') ? 'prompt' : 'category';
            const isSelected =
              type === 'prompt'
                ? selectedKeys.has(k)
                : selectedCategories.has(k);
            if (!isSelected) keysToAdd.push(k);
          }
          if (keysToAdd.length > 0) addRangeToDefaultPartition(keysToAdd);
          lastSelectedItemRef.current = key;
          return;
        }
      }

      // 普通切换
      const isAdding = !selectedKeys.has(key);
      if (isAdding) {
        const prompt = prompts.find((a) => a.categoryId === categoryId && a.value === value);
        if (prompt) {
          setSelectedPromptsCache((prev) => ({ ...prev, [key]: prompt }));
        }
        const defaultPartition = partitionData.partitions.find((p) => p.isDefault);
        if (defaultPartition) {
          addItemToPartition('prompt', key, defaultPartition.id);
        }
      } else {
        removeItemGlobally('prompt', key);
      }
      lastSelectedItemRef.current = key;
    },
    [selectedKeys, selectedCategories, prompts, partitionData, addItemToPartition, removeItemGlobally, orderedKeys, addRangeToDefaultPartition],
  );

  // 切换分类选择状态
  const toggleCategorySelection = useCallback(
    (categoryId, shiftKey = false) => {
      // Shift 范围选择
      if (shiftKey && lastSelectedItemRef.current && orderedKeys.length > 0) {
        const startIdx = orderedKeys.indexOf(lastSelectedItemRef.current);
        const endIdx = orderedKeys.indexOf(categoryId);
        if (startIdx >= 0 && endIdx >= 0) {
          const from = Math.min(startIdx, endIdx);
          const to = Math.max(startIdx, endIdx);
          const keysToAdd = [];
          for (let i = from; i <= to; i++) {
            const k = orderedKeys[i];
            const type = k.includes(':') ? 'prompt' : 'category';
            const isSelected =
              type === 'prompt'
                ? selectedKeys.has(k)
                : selectedCategories.has(k);
            if (!isSelected) keysToAdd.push(k);
          }
          if (keysToAdd.length > 0) addRangeToDefaultPartition(keysToAdd);
          lastSelectedItemRef.current = categoryId;
          return;
        }
      }

      // 普通切换
      const isAdding = !selectedCategories.has(categoryId);
      if (isAdding) {
        const defaultPartition = partitionData.partitions.find((p) => p.isDefault);
        if (defaultPartition) {
          addItemToPartition('category', categoryId, defaultPartition.id);
        }
      } else {
        removeItemGlobally('category', categoryId);
      }
      lastSelectedItemRef.current = categoryId;
    },
    [selectedKeys, selectedCategories, partitionData, addItemToPartition, removeItemGlobally, orderedKeys, addRangeToDefaultPartition],
  );

  // 画廊选择模式传入完整对象和明确的目标状态，避免弹窗会话持有旧闭包。
  const setGalleryPromptSelection = useCallback(
    (prompt, selected) => {
      if (!prompt) return;
      const key = makePromptKey(prompt.categoryId, prompt.value);
      if (selected) {
        setSelectedPromptsCache((prev) => ({ ...prev, [key]: prompt }));
      }
      setItemSelected('prompt', key, selected);
    },
    [setItemSelected],
  );

  const setGalleryCategorySelection = useCallback(
    (category, selected) => {
      if (!category?.id) return;
      setItemSelected('category', category.id, selected);
    },
    [setItemSelected],
  );

  // 节点同步
  useNodeSync({
    nodeInstance,
    selectedInput,
    metadataInput,
    selectedKeys,
    selectedPromptsCache,
    partitionData,
  });

  // 分类切换处理
  const handleCategoryChange = (categoryId) => {
    setCurrentCategory(categoryId);
    setSearchQuery('');
    setSearchResults(null);
  };

  // 刷新数据
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const response = await fetch(`/prompt_gallery/data?category=${currentCategory}`);
      const data = await response.json();
      setPrompts(data.prompts || []);
      if (data.childCategories) {
        mergeCategories(data.childCategories);
      }
      await hydrateAll();
    } catch (error) {
      console.error('[PromptSelector] Failed to refresh:', error);
    } finally {
      setRefreshing(false);
    }
  };

  return {
    // 状态
    prompts,
    categories,
    selectedKeys,
    selectedCategories,
    loading,
    searchQuery,

    sortBy,
    sortOrder,
    currentCategory,
    filteredPrompts,
    filteredCategories,
    refreshing,
    breadcrumbPath,

    // 封面缓存和获取函数
    coversCache: coversCacheRef.current,
    fetchCoversByIds,

    // 分区系统状态和操作
    partitionData,
    itemsByPartition,
    addPartition,
    deletePartition,
    updatePartition,
    addItemToPartition,
    removeItemFromPartition,
    removeItemGlobally,
    reorderPartitionItems,
    setPromptWeight,
    togglePartition,
    setAsDefaultPartition,
    reorderPartitions,

    // 操作
    setSearchQuery,
    setSortBy,
    setSortOrder,
    toggleSelection,
    toggleCategorySelection,
    setGalleryPromptSelection,
    setGalleryCategorySelection,
    handleCategoryChange,
    handleRefresh,
    makePromptKey,
  };
}
