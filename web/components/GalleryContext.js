/**
 * 画廊全局 Context
 * 管理画廊的所有共享状态、数据和操作函数
 */
import { h, createContext } from '../lib/preact.mjs';
import { useState, useEffect, useMemo, useRef, useCallback, useContext } from '../lib/hooks.mjs';
import {
  Storage,
  fetchGalleryData,
  exportPrompts,
  exportCategory,
} from '../utils.js';
import {
  deletePromptByKey,
  updateCategoryMetadata,
  updatePromptMetadata,
} from '../services/promptApi.js';
import { useCategoryManager } from './hooks/useCategoryManager.js';
import { useGalleryData } from './hooks/useGalleryData.js';
import { useFilteredPrompts } from './hooks/useFilteredPrompts.js';
import { useSelection } from './hooks/useSelection.js';
import { useItemOperations } from './hooks/useItemOperations.js';
import { showToast } from './Toast.js';

const GalleryContext = createContext(null);

// 将主题同步到画廊外的浮层容器（对话框/Toast/右键菜单渲染在独立容器中，
// 不在 .gallery-modal-content 内，需要单独设置 data-theme 才能应用浅色主题变量）
const THEMED_CONTAINER_IDS = [
  'prompt-gallery-modal-container',
  'prompt-gallery-toast-container',
  'global-context-menu-container',
];

function applyThemeToPortals(theme) {
  THEMED_CONTAINER_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.setAttribute('data-theme', theme);
  });
}

export function useGallery() {
  const ctx = useContext(GalleryContext);
  return ctx;
}

export function GalleryProvider({ children, isOpen, onClose, initialNavigation }) {
  // ============ 基础 UI 状态 ============
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('desc');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState(Storage.getFavorites());
  const [cardSize, setCardSize] = useState(() => Storage.getCardSize());
  const [cardLayoutMode, setCardLayoutMode] = useState(() => Storage.getCardLayoutMode());
  const [theme, setThemeState] = useState(() => Storage.getTheme());
  const setTheme = useCallback((newTheme) => {
    setThemeState(newTheme);
    Storage.saveTheme(newTheme);
  }, []);

  // 主题变化时同步到浮层容器（对话框、Toast、右键菜单）
  useEffect(() => {
    applyThemeToPortals(theme);
  }, [theme]);
  const [viewMode, setViewMode] = useState('gallery');
  const [rawCurrentPrompt, setCurrentPrompt] = useState(null);
  const [currentPromptGroups, setCurrentPromptGroups] = useState(null);
  const [imageSearchQuery, setImageSearchQuery] = useState('');
  const [imageSortBy, setImageSortBy] = useState('name');
  const [imageSortOrder, setImageSortOrder] = useState('asc');
  const [imageTotalCount, setImageTotalCount] = useState(0);
  const [includeComfyOutput, setIncludeComfyOutput] = useState(() => {
    try { return localStorage.getItem('prompt-gallery-include-comfy-output') === '1'; }
    catch { return false; }
  });
  const handleSetIncludeComfyOutput = useCallback((val) => {
    setIncludeComfyOutput((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      try { localStorage.setItem('prompt-gallery-include-comfy-output', next ? '1' : '0'); }
      catch {}
      return next;
    });
  }, []);
  const [lightbox, setLightbox] = useState({
    open: false,
    prompt: null,
    imageIndex: 0,
  });

  // ============ 对话框状态 ============
  const [showAddPromptDialog, setShowAddPromptDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [promptToDelete, setPromptToDelete] = useState(null);
  const [editModePrompt, setEditModePrompt] = useState(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showImportZipDialog, setShowImportZipDialog] = useState(false);
  const [showImportOutputDialog, setShowImportOutputDialog] = useState(false);

  // ============ 自定义筛查状态 ============
  const [customFilters, setCustomFilters] = useState([]);
  const [customFilterValues, setCustomFilterValues] = useState({});
  const [appliedFilterValues, setAppliedFilterValues] = useState({});
  const [showCustomFilterEditDialog, setShowCustomFilterEditDialog] = useState(false);
  const [editingCustomFilter, setEditingCustomFilter] = useState(null);

  // ============ 图片字段状态 ============
  const [imageFields, setImageFields] = useState([]);
  const [groupByField, setGroupByFieldState] = useState(() => {
    try { return localStorage.getItem('prompt-gallery-group-by') || 'builtin_date'; }
    catch { return 'builtin_date'; }
  });
  const setGroupByField = useCallback((val) => {
    const v = typeof val === 'function' ? val(groupByField) : val;
    setGroupByFieldState(v);
    try { localStorage.setItem('prompt-gallery-group-by', v); }
    catch {}
  }, [groupByField]);

  // ============ 导出对话框状态 ============
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportPayload, setExportPayload] = useState(null);

  // ============ Hooks ============

  // 返回画廊视图
  const navigateToGallery = useCallback(() => {
    setViewMode('gallery');
    setCurrentPrompt(null);
    setImageSearchQuery('');
    setImageTotalCount(0);
  }, []);

  // 导航到历史视图
  const navigateToHistory = useCallback(() => {
    setViewMode('history');
    setCurrentPrompt(null);
    setImageSearchQuery('');
    setImageTotalCount(0);
  }, []);

  // ============ 从 ImageGroupView 上抛的分组数据派生扁平图片列表 ============

  const flatPromptImages = useMemo(
    () => (currentPromptGroups || []).flatMap((g) => g.images || []),
    [currentPromptGroups],
  );

  // 保持 currentPrompt 带有 images 字段，供筛选和批量选择复用。
  const currentPrompt = useMemo(
    () => rawCurrentPrompt ? { ...rawCurrentPrompt, images: flatPromptImages } : null,
    [rawCurrentPrompt, flatPromptImages],
  );

  // 分类管理
  const categoryMgr = useCategoryManager({
    viewMode,
    currentPrompt,
    onNavigateToGallery: navigateToGallery,
  });

  const currentCategory = categoryMgr.currentCategory;

  // 数据获取
  const { data, loading, error, loadData, setData } = useGalleryData(currentCategory);

  // 首次打开时加载数据
  const hasOpenedRef = useRef(false);
  useEffect(() => {
    if (isOpen && !hasOpenedRef.current) {
      hasOpenedRef.current = true;
      loadData();
    }
  }, [isOpen]);

  // 分类切换时重新加载并重置搜索
  useEffect(() => {
    if (isOpen && hasOpenedRef.current) {
      setSearchQuery('');
      loadData();
    }
  }, [currentCategory]);

  // 过滤排序
  const filteredPrompts = useFilteredPrompts(data, searchQuery, sortBy, sortOrder, showFavoritesOnly, favorites, categoryMgr.categories);

  // 打开批量导出对话框
  const handleOpenBatchExportDialog = useCallback(() => {
    setExportPayload({ type: 'batch' });
    setShowExportDialog(true);
  }, []);

  // 多选管理
  const selection = useSelection({
    categories: categoryMgr.categories,
    currentCategoryChildren: categoryMgr.currentCategoryChildren,
    allPrompts: data?.prompts || [],
    filteredPrompts,
    currentPrompt,
    currentCategory,
    loadData,
    setCurrentPrompt,
    refreshCategories: categoryMgr.refreshCategories,
    openBatchExportDialog: handleOpenBatchExportDialog,
  });

  // 移动/复制操作
  const itemOps = useItemOperations({
    currentPrompt,
    currentCategory,
    viewMode,
    loadData,
    refreshCategories: categoryMgr.refreshCategories,
    setCurrentPrompt,
    setViewMode,
    getSelectedDetails: selection.getSelectedDetails,
    batchOperation: selection.batchOperation,
    resetSelection: selection.resetSelection,
  });

  // ============ 计算值 ============

  const filteredPromptImages = useMemo(() => {
    let images = [...flatPromptImages];
    if (imageSearchQuery) {
      const q = imageSearchQuery.toLowerCase();
      images = images.filter((img) => {
        const filename = (img.path || '').split(/[/\\]/).pop().toLowerCase();
        return filename.includes(q);
      });
    }
    images.sort((a, b) => {
      let cmp = 0;
      if (imageSortBy === 'time') {
        cmp = (a.mtime || 0) - (b.mtime || 0);
      } else {
        cmp = (a.path || '').localeCompare(b.path || '');
      }
      return imageSortOrder === 'asc' ? cmp : -cmp;
    });
    return images;
  }, [flatPromptImages, imageSearchQuery, imageSortBy, imageSortOrder]);

  const galleryOrderedKeys = useMemo(() => {
    const keys = [];
    categoryMgr.currentCategoryChildren.forEach((cat) => {
      keys.push(`category:${cat.id}`);
    });
    filteredPrompts.forEach((prompt) => {
      keys.push(`prompt:${prompt.categoryId}:${prompt.value}`);
    });
    return keys;
  }, [categoryMgr.currentCategoryChildren, filteredPrompts]);

  const promptOrderedKeys = useMemo(() => {
    return filteredPromptImages.map((img) => `image:${img.path}`);
  }, [filteredPromptImages]);

  // ============ 事件处理 ============

  const handleFavoriteToggle = useCallback(
    (promptName) => {
      const updated = Storage.toggleFavorite(promptName, favorites);
      setFavorites(new Set(updated));
    },
    [favorites],
  );

  const handleTogglePinned = useCallback(
    async (type, item) => {
      const pinned = !item?.metadata?.pinned;
      try {
        if (type === 'category') {
          await updateCategoryMetadata(item.id, { pinned });
          await categoryMgr.refreshCategories();
        } else if (type === 'prompt') {
          await updatePromptMetadata(item.categoryId, item.value, { pinned });
        }
        await loadData();
        showToast(pinned ? '已置顶' : '已取消置顶', 'success');
      } catch (err) {
        showToast('置顶操作失败: ' + err.message, 'error');
      }
    },
    [categoryMgr.refreshCategories, loadData],
  );

  const handleCardClick = useCallback(
    (promptIndex) => {
      const prompt = filteredPrompts[promptIndex];
      setCurrentPrompt(prompt);
      setCurrentPromptGroups(null);
      setViewMode('prompt');
      // 图片数据由 PromptDetailView → ImageGroupView fetch /images_grouped 后
      // 通过 onGroupedData 上抛到 currentPromptGroups，再经 flatPromptImages 派生到 currentPrompt.images
    },
    [filteredPrompts],
  );

  const handleLightboxNavigate = useCallback((direction) => {
    setLightbox((prev) => {
      if (!prev.prompt?.images) return prev;
      let newIndex = prev.imageIndex + direction;
      if (newIndex < 0) newIndex = prev.prompt.images.length - 1;
      if (newIndex >= prev.prompt.images.length) newIndex = 0;
      return { ...prev, imageIndex: newIndex };
    });
  }, []);

  const openLightbox = useCallback((prompt, imageIndex) => {
    setLightbox({ open: true, prompt, imageIndex });
  }, []);

  const closeLightbox = useCallback(() => {
    setLightbox({ open: false, prompt: null, imageIndex: 0 });
  }, []);

  // 对话框打开
  const openAddDialog = useCallback(() => {
    setEditModePrompt(null);
    setShowAddPromptDialog(true);
  }, []);

  const openEditDialog = useCallback((prompt) => {
    setEditModePrompt(prompt);
    setShowAddPromptDialog(true);
  }, []);

  const openDeleteConfirm = useCallback((prompt) => {
    setPromptToDelete(prompt);
    setShowDeleteConfirm(true);
  }, []);

  const confirmDeletePrompt = useCallback(async () => {
    if (!promptToDelete) return;
    try {
      await deletePromptByKey(promptToDelete.categoryId, promptToDelete.value);
      showToast('已删除 Prompt', 'success');
      setShowDeleteConfirm(false);
      setPromptToDelete(null);
      await loadData();
      await categoryMgr.refreshCategories();
    } catch (err) {
      showToast('删除失败: ' + err.message, 'error');
    }
  }, [promptToDelete, loadData, categoryMgr]);

  // 导出
  const handleExportPrompt = useCallback((prompt) => {
    setExportPayload({ type: 'prompt', prompt });
    setShowExportDialog(true);
  }, []);

  // 打开分类导出对话框
  const handleOpenExportDialog = useCallback((category) => {
    setExportPayload({ type: 'category', category });
    setShowExportDialog(true);
  }, []);

  // 统一导出确认
  const handleExportConfirm = useCallback(
    async (includeImages, maxImages) => {
      if (!exportPayload) return;
      const opts = { includeImages, maxImagesPerPrompt: maxImages };

      try {
        if (exportPayload.type === 'category') {
          await exportCategory(exportPayload.category.id, opts);
          showToast(`已导出分类: ${exportPayload.category.name}${includeImages ? '' : ' (仅结构)'}`, 'success');
        } else if (exportPayload.type === 'prompt') {
          await exportPrompts(
            [
              {
                categoryId: exportPayload.prompt.categoryId,
                value: exportPayload.prompt.value,
              },
            ],
            opts,
          );
          showToast(`已导出Prompt: ${exportPayload.prompt.name || exportPayload.prompt.value}`, 'success');
        } else if (exportPayload.type === 'batch') {
          const details = selection.getSelectedDetails();
          const promptKeys = details.prompts.map((a) => ({
            categoryId: a.categoryId,
            value: a.value,
          }));
          if (promptKeys.length === 0) {
            showToast('请选择Prompt后导出', 'warning');
            return;
          }
          await exportPrompts(promptKeys, opts);
          showToast(`已导出 ${promptKeys.length} 个Prompt`, 'success');
        }
      } catch (error) {
        showToast('导出失败: ' + error.message, 'error');
      }
    },
    [exportPayload, selection],
  );

  // 导入Prompt（打开ZIP导入对话框）
  const handleImportPrompts = useCallback(() => {
    setShowImportZipDialog(true);
  }, []);

  // ============ 自定义筛查 ============

  // 加载筛查项配置
  const loadCustomFilters = useCallback(async () => {
    try {
      const res = await fetch('/prompt_gallery/custom_filters');
      const result = await res.json();
      if (result.success) {
        setCustomFilters(result.filters);
      }
    } catch (e) {
      console.error('Failed to load custom filters:', e);
    }
  }, []);

  // 首次打开历史视图时加载筛查项
  useEffect(() => {
    if (viewMode === 'history' && customFilters.length === 0) {
      loadCustomFilters();
    }
  }, [viewMode]);

  // 加载图片字段
  const loadImageFields = useCallback(async () => {
    try {
      const res = await fetch('/prompt_gallery/image_fields');
      const result = await res.json();
      if (result.success) setImageFields(result.fields);
    } catch (e) {
      console.error('Failed to load image fields:', e);
    }
  }, []);

  // 首次打开历史视图或 prompt 视图时加载图片字段
  useEffect(() => {
    if ((viewMode === 'history' || viewMode === 'prompt') && imageFields.length === 0) {
      loadImageFields();
    }
  }, [viewMode]);

  // 筛选值变化（仅更新输入框，不触发查询）
  const handleCustomFilterChange = useCallback((filterId, value) => {
    setCustomFilterValues(prev => ({ ...prev, [filterId]: value }));
  }, []);

  // 应用筛选（点击查询按钮）
  const handleApplyCustomFilters = useCallback(() => {
    setAppliedFilterValues({ ...customFilterValues });
  }, [customFilterValues]);

  // 清空所有筛选
  const handleClearCustomFilters = useCallback(() => {
    setCustomFilterValues({});
    setAppliedFilterValues({});
  }, []);

  // 删除筛查项
  const handleDeleteCustomFilter = useCallback(async (filterId) => {
    if (!confirm('确定要删除这个筛查项吗？')) return;
    try {
      await fetch(`/prompt_gallery/custom_filters/${filterId}`, { method: 'DELETE' });
      setCustomFilters(prev => prev.filter(f => f.id !== filterId));
      setCustomFilterValues(prev => {
        const next = { ...prev };
        delete next[filterId];
        return next;
      });
      setAppliedFilterValues(prev => {
        const next = { ...prev };
        delete next[filterId];
        return next;
      });
      showToast('已删除筛查项', 'success');
    } catch (e) {
      showToast('删除失败: ' + e.message, 'error');
    }
  }, []);

  // 提取选项
  const handleExtractCustomFilter = useCallback(async (filterId) => {
    try {
      showToast('正在提取选项...', 'info');
      const res = await fetch(`/prompt_gallery/custom_filters/${filterId}/extract`, { method: 'POST' });
      const result = await res.json();
      if (result.success) {
        setCustomFilters(prev => prev.map(f =>
          f.id === filterId ? { ...f, options: result.options } : f
        ));
        showToast(`提取完成: ${result.options.length} 个选项`, 'success');
      } else {
        showToast('提取失败: ' + (result.error || ''), 'error');
      }
    } catch (e) {
      showToast('提取失败: ' + e.message, 'error');
    }
  }, []);

  // 打开编辑弹窗
  const handleEditCustomFilter = useCallback((filterItem) => {
    setEditingCustomFilter(filterItem);
    setShowCustomFilterEditDialog(true);
  }, []);

  // 编辑保存后
  const handleCustomFilterSaved = useCallback((savedFilter) => {
    setCustomFilters(prev => {
      const idx = prev.findIndex(f => f.id === savedFilter.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = savedFilter;
        return next;
      }
      return [...prev, savedFilter];
    });
  }, []);

  // 构建传给后端的 filters 参数（仅依赖已应用的值）
  const activeCustomFilters = useMemo(() => {
    return Object.entries(appliedFilterValues)
      .filter(([, v]) => v && v.trim())
      .map(([id, value]) => ({ id, value: value.trim() }));
  }, [appliedFilterValues]);

  // Prompt详情回调
  const handlePromptDeleteImageSuccess = useCallback(async () => {
    await loadData();
    const updatedData = await fetch(`/prompt_gallery/data?category=${currentCategory}`);
    const result = await updatedData.json();
    const updatedPrompt = result.prompts?.find(
      (a) => a.categoryId === currentPrompt?.categoryId && a.value === currentPrompt?.value,
    );
    if (updatedPrompt) {
      setCurrentPrompt(updatedPrompt);
    }
  }, [currentCategory, currentPrompt, loadData]);

  const handlePromptSetCoverSuccess = useCallback((imagePath) => {
    setCurrentPrompt((prev) => ({
      ...prev,
      coverImagePath: imagePath,
    }));
  }, []);

  // 封装选择处理
  const handleGallerySelect = useCallback(
    (key, shiftKey) => {
      selection.handleSelectItem(key, shiftKey, galleryOrderedKeys);
    },
    [selection, galleryOrderedKeys],
  );

  const handlePromptSelect = useCallback(
    (key, shiftKey) => {
      selection.handleSelectItem(key, shiftKey, promptOrderedKeys);
    },
    [selection, promptOrderedKeys],
  );

  // 全选（按当前视图）
  const handleSelectAllInView = useCallback(() => {
    if (viewMode === 'prompt' && currentPrompt?.images) {
      const newSet = new Set();
      filteredPromptImages.forEach((img) => newSet.add(`image:${img.path}`));
      selection.setSelectedItems(newSet);
    } else {
      selection.handleSelectAll();
    }
  }, [viewMode, currentPrompt, filteredPromptImages, selection]);

  // 批量移动/复制（封装 itemOps setter 注入）
  const handleBatchMoveAction = useCallback(() => {
    selection.handleBatchMove({
      setMoveItem: itemOps.setMoveItem,
      setMoveItemType: itemOps.setMoveItemType,
      setShowMoveDialog: itemOps.setShowMoveDialog,
    });
  }, [selection, itemOps]);

  const handleBatchCopyAction = useCallback(() => {
    selection.handleBatchCopy({
      setCopyItem: itemOps.setCopyItem,
      setCopyItemType: itemOps.setCopyItemType,
      setShowCopyDialog: itemOps.setShowCopyDialog,
    });
  }, [selection, itemOps]);

  // 分类删除（打开确认对话框）
  const handleCategoryDelete = useCallback(
    (cat) => {
      categoryMgr.openCategoryDeleteConfirm(cat);
    },
    [categoryMgr],
  );

  // ============ 外部导航处理 ============
  const navRef = useRef(null);

  useEffect(() => {
    if (!initialNavigation) return;
    if (navRef.current === initialNavigation) return;

    const nav = initialNavigation;
    const targetCategoryId = nav.categoryId || 'root';

    categoryMgr.setCurrentCategory(targetCategoryId);
    setViewMode('gallery');
    setCurrentPrompt(null);
    setImageSearchQuery('');

    const loadDataAndNavigate = async () => {
      const result = await fetchGalleryData(targetCategoryId);
      result.prompts = result.prompts.map((prompt) => ({
        ...prompt,
        maxTime:
          prompt.images && prompt.images.length > 0
            ? Math.max(...prompt.images.map((img) => img.mtime))
            : prompt.createdAt || 0,
      }));

      navRef.current = initialNavigation;
      setData(result);

      if (nav.type === 'prompt' && nav.promptName) {
        const prompt = result.prompts?.find((a) => a.value === nav.promptName && a.categoryId === targetCategoryId);
        if (prompt) {
          setCurrentPrompt(prompt);
          setCurrentPromptGroups(null);
          setViewMode('prompt');
        }
      }
    };

    loadDataAndNavigate();
  }, [initialNavigation]);

  // ============ Context Value ============
  const contextValue = useMemo(
    () => ({
      // Navigation
      viewMode,
      setViewMode,
      currentPrompt,
      setCurrentPrompt,
      setCurrentPromptGroups,
      currentCategory,
      navigateToGallery,
      navigateToHistory,

      // Data
      data,
      loading,
      error,
      loadData,

      // Categories
      categories: categoryMgr.categories,
      categoryPath: categoryMgr.categoryPath,
      currentCategoryChildren: categoryMgr.currentCategoryChildren,
      refreshCategories: categoryMgr.refreshCategories,
      handleCategorySelect: categoryMgr.handleCategorySelect,
      handleBreadcrumbNavigate: categoryMgr.handleBreadcrumbNavigate,
      handleAddCategory: categoryMgr.handleAddCategory,
      handleEditCategory: categoryMgr.handleEditCategory,
      handleDeleteCategory: handleCategoryDelete,
      handleCategoryDialogSave: categoryMgr.handleCategoryDialogSave,
      showCategoryDialog: categoryMgr.showCategoryDialog,
      categoryDialogMode: categoryMgr.categoryDialogMode,
      editingCategory: categoryMgr.editingCategory,
      setShowCategoryDialog: categoryMgr.setShowCategoryDialog,
      showCategoryDeleteConfirm: categoryMgr.showCategoryDeleteConfirm,
      categoryToDelete: categoryMgr.categoryToDelete,
      setShowCategoryDeleteConfirm: categoryMgr.setShowCategoryDeleteConfirm,
      setCategoryToDelete: categoryMgr.setCategoryToDelete,
      confirmDeleteCategory: categoryMgr.confirmDeleteCategory,

      // Filtering
      filteredPrompts,
      searchQuery,
      setSearchQuery,
      sortBy,
      setSortBy,
      sortOrder,
      setSortOrder,
      showFavoritesOnly,
      setShowFavoritesOnly,
      favorites,
      handleFavoriteToggle,
      handleTogglePinned,
      cardSize,
      setCardSize,
      cardLayoutMode,
      setCardLayoutMode,
      theme,
      setTheme,
      imageSearchQuery,
      setImageSearchQuery,
      imageSortBy,
      setImageSortBy,
      imageSortOrder,
      setImageSortOrder,
      imageTotalCount,
      setImageTotalCount,
      includeComfyOutput,
      setIncludeComfyOutput: handleSetIncludeComfyOutput,
      filteredPromptImages,

      // Selection
      selectionMode: selection.selectionMode,
      selectedItems: selection.selectedItems,
      getSelectionType: selection.getSelectionType,
      handleToggleSelectionMode: selection.handleToggleSelectionMode,
      handleGallerySelect,
      handlePromptSelect,
      handleSelectAllInView,
      handleDeselectAll: selection.handleDeselectAll,
      getSelectedDetails: selection.getSelectedDetails,
      resetSelection: selection.resetSelection,
      setSelectedItems: selection.setSelectedItems,

      // Batch
      showBatchConfirm: selection.showBatchConfirm,
      batchOperation: selection.batchOperation,
      handleBatchDelete: selection.handleBatchDelete,
      handleBatchMoveAction,
      handleBatchCopyAction,
      handleBatchExport: selection.handleBatchExport,
      handleBatchConfirm: selection.handleBatchConfirm,
      setShowBatchConfirm: selection.setShowBatchConfirm,

      // Custom filters
      customFilters,
      customFilterValues,
      showCustomFilterEditDialog,
      setShowCustomFilterEditDialog,
      editingCustomFilter,
      setEditingCustomFilter,
      activeCustomFilters,
      handleCustomFilterChange,
      handleApplyCustomFilters,
      handleClearCustomFilters,
      handleDeleteCustomFilter,
      handleExtractCustomFilter,
      handleEditCustomFilter,
      handleCustomFilterSaved,
      loadCustomFilters,

      // Image fields
      imageFields,
      groupByField,
      setGroupByField,
      loadImageFields,

      // Item operations
      showMoveDialog: itemOps.showMoveDialog,
      moveItem: itemOps.moveItem,
      moveItemType: itemOps.moveItemType,
      showCopyDialog: itemOps.showCopyDialog,
      copyItem: itemOps.copyItem,
      copyItemType: itemOps.copyItemType,
      openMoveDialog: itemOps.openMoveDialog,
      openCopyDialog: itemOps.openCopyDialog,
      closeMoveDialog: itemOps.closeMoveDialog,
      closeCopyDialog: itemOps.closeCopyDialog,
      handleMove: itemOps.handleMove,
      handleCopy: itemOps.handleCopy,

      // Dialog state
      showAddPromptDialog,
      setShowAddPromptDialog,
      editModePrompt,
      setEditModePrompt,
      openAddDialog,
      openEditDialog,
      showDeleteConfirm,
      setShowDeleteConfirm,
      promptToDelete,
      setPromptToDelete,
      openDeleteConfirm,
      confirmDeletePrompt,
      showImportDialog,
      setShowImportDialog,
      showImportZipDialog,
      setShowImportZipDialog,
      showImportOutputDialog,
      setShowImportOutputDialog,
      showExportDialog,
      setShowExportDialog,
      exportPayload,
      setExportPayload,
      // Lightbox
      lightbox,
      openLightbox,
      closeLightbox,
      handleLightboxNavigate,

      // Business callbacks
      handleCardClick,
      handleExportPrompt,
      handleOpenExportDialog,
      handleOpenBatchExportDialog,
      handleExportConfirm,
      handleImportPrompts,
      handlePromptDeleteImageSuccess,
      handlePromptSetCoverSuccess,
      // Props from parent
      isOpen,
      onClose,
    }),
    [
      viewMode,
      currentPrompt,
      currentCategory,
      data,
      loading,
      error,
      categoryMgr.categories,
      categoryMgr.categoryPath,
      categoryMgr.currentCategoryChildren,
      categoryMgr.refreshCategories,
      categoryMgr.showCategoryDialog,
      categoryMgr.categoryDialogMode,
      categoryMgr.editingCategory,
      categoryMgr.showCategoryDeleteConfirm,
      categoryMgr.categoryToDelete,
      filteredPrompts,
      searchQuery,
      sortBy,
      sortOrder,
      showFavoritesOnly,
      favorites,
      handleTogglePinned,
      cardSize,
      cardLayoutMode,
      theme,
      imageSearchQuery,
      imageSortBy,
      imageSortOrder,
      imageTotalCount,
      includeComfyOutput,
      filteredPromptImages,
      selection.selectionMode,
      selection.selectedItems,
      selection.showBatchConfirm,
      selection.batchOperation,
      itemOps.showMoveDialog,
      itemOps.moveItem,
      itemOps.moveItemType,
      itemOps.showCopyDialog,
      itemOps.copyItem,
      itemOps.copyItemType,
      showAddPromptDialog,
      editModePrompt,
      showDeleteConfirm,
      promptToDelete,
      showImportDialog,
      showImportZipDialog,
      showImportOutputDialog,
      customFilters,
      customFilterValues,
      showCustomFilterEditDialog,
      editingCustomFilter,
      activeCustomFilters,
      imageFields,
      groupByField,
      showExportDialog,
      exportPayload,
      lightbox,
      isOpen,
      onClose,
    ],
  );

  return h(GalleryContext.Provider, { value: contextValue }, children);
}
