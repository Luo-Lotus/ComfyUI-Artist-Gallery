/**
 * 画廊全局 Context
 * 管理画廊的所有共享状态、数据和操作函数
 */
import { h, createContext } from '../lib/preact.mjs';
import { useState, useEffect, useMemo, useRef, useCallback, useContext } from '../lib/hooks.mjs';
import {
    Storage,
    importArtists,
    createCombination as createCombinationApi,
    updateCombination as updateCombinationApi,
    deleteCombination as deleteCombinationApi,
    moveCombination as moveCombinationApi,
    fetchCombinationImages,
    fetchGalleryData,
    exportArtists,
    exportCategory,
} from '../utils.js';
import { useCategoryManager } from './hooks/useCategoryManager.js';
import { useGalleryData } from './hooks/useGalleryData.js';
import { useFilteredArtists } from './hooks/useFilteredArtists.js';
import { useSelection } from './hooks/useSelection.js';
import { useItemOperations } from './hooks/useItemOperations.js';
import { showToast } from './Toast.js';

const GalleryContext = createContext(null);

export function useGallery() {
    const ctx = useContext(GalleryContext);
    return ctx;
}

export function GalleryProvider({ children, onClose, initialNavigation }) {
    // ============ 基础 UI 状态 ============
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('name');
    const [sortOrder, setSortOrder] = useState('desc');
    const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
    const [favorites, setFavorites] = useState(Storage.getFavorites());
    const [cardSize, setCardSize] = useState(() => Storage.getCardSize());
    const [viewMode, setViewMode] = useState('gallery');
    const [currentArtist, setCurrentArtist] = useState(null);
    const [imageSearchQuery, setImageSearchQuery] = useState('');
    const [imageSortBy, setImageSortBy] = useState('name');
    const [imageSortOrder, setImageSortOrder] = useState('asc');
    const [lightbox, setLightbox] = useState({ open: false, artist: null, imageIndex: 0 });

    // ============ 对话框状态 ============
    const [showAddArtistDialog, setShowAddArtistDialog] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [artistToDelete, setArtistToDelete] = useState(null);
    const [editModeArtist, setEditModeArtist] = useState(null);
    const [showImportDialog, setShowImportDialog] = useState(false);

    // ============ 组合相关状态 ============
    const [showCombinationDialog, setShowCombinationDialog] = useState(false);
    const [combinationDialogMode, setCombinationDialogMode] = useState('add');
    const [editingCombination, setEditingCombination] = useState(null);
    const [viewModeCombination, setViewModeCombination] = useState(null);

    // ============ 导出对话框状态 ============
    const [showExportDialog, setShowExportDialog] = useState(false);
    const [exportPayload, setExportPayload] = useState(null);

    // ============ Hooks ============

    // 返回画廊视图
    const navigateToGallery = useCallback(() => {
        setViewMode('gallery');
        setCurrentArtist(null);
        setViewModeCombination(null);
        setImageSearchQuery('');
    }, []);

    // 分类管理
    const categoryMgr = useCategoryManager({
        viewMode,
        currentArtist,
        viewModeCombination,
        onNavigateToGallery: navigateToGallery,
    });

    const currentCategory = categoryMgr.currentCategory;

    // 数据获取
    const { data, loading, error, loadData, setData } = useGalleryData(currentCategory);

    // 自动加载数据
    useEffect(() => {
        loadData();
    }, [currentCategory]);

    // 过滤排序
    const filteredArtists = useFilteredArtists(
        data,
        searchQuery,
        sortBy,
        sortOrder,
        showFavoritesOnly,
        favorites,
    );

    // 打开批量导出对话框（需在 useSelection 之前定义）
    const handleOpenBatchExportDialog = useCallback(() => {
        setExportPayload({ type: 'batch' });
        setShowExportDialog(true);
    }, []);

    // 多选管理
    const selection = useSelection({
        categories: categoryMgr.categories,
        filteredArtists,
        currentArtist,
        currentCategory,
        loadData,
        setCurrentArtist,
        refreshCategories: categoryMgr.refreshCategories,
        openBatchExportDialog: handleOpenBatchExportDialog,
    });

    // 移动/复制操作
    const itemOps = useItemOperations({
        currentArtist,
        currentCategory,
        viewMode,
        loadData,
        refreshCategories: categoryMgr.refreshCategories,
        setCurrentArtist,
        setViewMode,
        getSelectedDetails: selection.getSelectedDetails,
        batchOperation: selection.batchOperation,
        resetSelection: selection.resetSelection,
    });

    // ============ 计算值 ============

    const currentCombinations = useMemo(() => {
        return data?.combinations || [];
    }, [data]);

    const filteredArtistImages = useMemo(() => {
        let images = [...(currentArtist?.images || [])];
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
    }, [currentArtist?.images, imageSearchQuery, imageSortBy, imageSortOrder]);

    const filteredCombinationImages = useMemo(() => {
        let images = [...(viewModeCombination?.images || [])];
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
    }, [viewModeCombination?.images, imageSearchQuery, imageSortBy, imageSortOrder]);

    const galleryOrderedKeys = useMemo(() => {
        const keys = [];
        categoryMgr.currentCategoryChildren.forEach((cat) => {
            keys.push(`category:${cat.id}`);
        });
        currentCombinations.forEach((comb) => {
            keys.push(`combination:${comb.id}`);
        });
        filteredArtists.forEach((artist) => {
            keys.push(`artist:${artist.categoryId}:${artist.name}`);
        });
        return keys;
    }, [categoryMgr.currentCategoryChildren, currentCombinations, filteredArtists]);

    const artistOrderedKeys = useMemo(() => {
        return filteredArtistImages.map((img) => `image:${img.path}`);
    }, [filteredArtistImages]);

    const combinationOrderedKeys = useMemo(() => {
        return filteredCombinationImages.map((img) => `image:${img.path}`);
    }, [filteredCombinationImages]);

    // ============ 事件处理 ============

    const handleFavoriteToggle = useCallback((artistName) => {
        const updated = Storage.toggleFavorite(artistName, favorites);
        setFavorites(new Set(updated));
    }, [favorites]);

    const handleCardClick = useCallback(async (artistIndex) => {
        const artist = filteredArtists[artistIndex];
        setCurrentArtist(artist);
        setViewMode('artist');
        if (!artist.images || artist.images.length === 0) {
            try {
                const res = await fetch(
                    `/artist_gallery/artist_images?name=${encodeURIComponent(artist.name)}`,
                );
                const result = await res.json();
                if (result.success && result.images) {
                    setCurrentArtist((prev) =>
                        prev === artist
                            ? { ...prev, images: result.images }
                            : prev,
                    );
                }
            } catch (err) {
                console.error('Failed to load artist images:', err);
            }
        }
    }, [filteredArtists]);

    const handleLightboxNavigate = useCallback((direction) => {
        setLightbox((prev) => {
            if (!prev.artist?.images) return prev;
            let newIndex = prev.imageIndex + direction;
            if (newIndex < 0) newIndex = prev.artist.images.length - 1;
            if (newIndex >= prev.artist.images.length) newIndex = 0;
            return { ...prev, imageIndex: newIndex };
        });
    }, []);

    const openLightbox = useCallback((artist, imageIndex) => {
        setLightbox({ open: true, artist, imageIndex });
    }, []);

    const closeLightbox = useCallback(() => {
        setLightbox({ open: false, artist: null, imageIndex: 0 });
    }, []);

    // 对话框打开
    const openAddDialog = useCallback(() => {
        setEditModeArtist(null);
        setShowAddArtistDialog(true);
    }, []);

    const openEditDialog = useCallback((artist) => {
        setEditModeArtist(artist);
        setShowAddArtistDialog(true);
    }, []);

    const openDeleteConfirm = useCallback((artist) => {
        setArtistToDelete(artist);
        setShowDeleteConfirm(true);
    }, []);

    // 组合事件
    const handleCombinationClick = useCallback(async (combination) => {
        try {
            const result = await fetchCombinationImages(combination.id);
            if (result.success) {
                setViewModeCombination({
                    ...combination,
                    images: result.images,
                });
                setViewMode('combination');
            }
        } catch (err) {
            showToast('加载组合图片失败: ' + err.message, 'error');
        }
    }, []);

    const handleCombinationEdit = useCallback((combination) => {
        setEditingCombination(combination);
        setCombinationDialogMode('edit');
        setShowCombinationDialog(true);
    }, []);

    const handleCombinationDuplicate = useCallback((combination) => {
        itemOps.openCopyDialog(combination, 'combination');
    }, [itemOps]);

    const handleCombinationDelete = useCallback(async (combination) => {
        if (!confirm(`确定要删除组合"${combination.name}"吗？`)) return;
        try {
            await deleteCombinationApi(combination.id);
            showToast('已删除组合', 'success');
            await loadData();
        } catch (err) {
            showToast('删除组合失败: ' + err.message, 'error');
        }
    }, [loadData]);

    const handleCombinationDialogSave = useCallback(async (data) => {
        try {
            if (combinationDialogMode === 'add') {
                await createCombinationApi({
                    ...data,
                    categoryId: currentCategory,
                });
                showToast('组合创建成功', 'success');
            } else {
                await updateCombinationApi(editingCombination.id, data);
                showToast('组合更新成功', 'success');
            }
            setShowCombinationDialog(false);
            setEditingCombination(null);
            await loadData();
        } catch (err) {
            showToast('操作失败: ' + err.message, 'error');
        }
    }, [combinationDialogMode, currentCategory, editingCombination, loadData]);

    const openCombinationDialog = useCallback((mode, combination = null) => {
        setCombinationDialogMode(mode);
        setEditingCombination(combination);
        setShowCombinationDialog(true);
    }, []);

    // 导出
    const handleExportArtist = useCallback((artist) => {
        setExportPayload({ type: 'artist', artist });
        setShowExportDialog(true);
    }, []);

    // 打开分类导出对话框
    const handleOpenExportDialog = useCallback((category) => {
        setExportPayload({ type: 'category', category });
        setShowExportDialog(true);
    }, []);

    // 统一导出确认
    const handleExportConfirm = useCallback(async (includeImages, maxImages) => {
        if (!exportPayload) return;
        const opts = { includeImages, maxImagesPerArtist: maxImages };

        try {
            if (exportPayload.type === 'category') {
                await exportCategory(exportPayload.category.id, opts);
                showToast(
                    `已导出分类: ${exportPayload.category.name}${includeImages ? '' : ' (仅结构)'}`,
                    'success',
                );
            } else if (exportPayload.type === 'artist') {
                await exportArtists([{
                    categoryId: exportPayload.artist.categoryId,
                    name: exportPayload.artist.name,
                }], opts);
                showToast(
                    `已导出画师: ${exportPayload.artist.displayName || exportPayload.artist.name}`,
                    'success',
                );
            } else if (exportPayload.type === 'batch') {
                const details = selection.getSelectedDetails();
                const artistKeys = details.artists.map(a => ({
                    categoryId: a.categoryId,
                    name: a.name,
                }));
                if (artistKeys.length === 0) {
                    showToast('请选择画师后导出', 'warning');
                    return;
                }
                await exportArtists(artistKeys, opts);
                showToast(`已导出 ${artistKeys.length} 个画师`, 'success');
            }
        } catch (error) {
            showToast('导出失败: ' + error.message, 'error');
        }
    }, [exportPayload, selection]);

    // 导入画师
    const handleImportArtists = useCallback(async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const result = await importArtists(file, currentCategory);
            if (result.success) {
                const parts = [];
                if (result.addedCategories > 0) parts.push(`${result.addedCategories} 个分类`);
                if (result.addedArtists > 0) parts.push(`${result.addedArtists} 个画师`);
                if (result.addedCombinations > 0) parts.push(`${result.addedCombinations} 个组合`);
                if (result.addedImages > 0) parts.push(`${result.addedImages} 张图片`);
                showToast(
                    `导入成功: ${parts.join(', ') || '无新增内容'}`,
                    'success',
                );
                await categoryMgr.refreshCategories();
                await loadData();
            } else {
                showToast(result.error || '导入失败', 'error');
            }
        } catch (error) {
            showToast('导入失败: ' + error.message, 'error');
        }
        e.target.value = '';
    }, [currentCategory, loadData, categoryMgr]);

    // 画师详情回调
    const handleArtistDeleteImageSuccess = useCallback(async () => {
        await loadData();
        const updatedData = await fetch(
            `/artist_gallery/data?category=${currentCategory}`,
        );
        const result = await updatedData.json();
        const updatedArtist = result.artists?.find(
            (a) =>
                a.categoryId === currentArtist?.categoryId &&
                a.name === currentArtist?.name,
        );
        if (updatedArtist) {
            setCurrentArtist(updatedArtist);
        }
    }, [currentCategory, currentArtist, loadData]);

    const handleArtistSetCoverSuccess = useCallback((imagePath) => {
        setCurrentArtist((prev) => ({
            ...prev,
            coverImagePath: imagePath,
        }));
    }, []);

    // 组合详情回调
    const handleCombinationDeleteImageSuccess = useCallback(async () => {
        if (!viewModeCombination) return;
        const result = await fetchCombinationImages(viewModeCombination.id);
        if (result.success) {
            setViewModeCombination({
                ...viewModeCombination,
                images: result.images,
            });
        }
    }, [viewModeCombination]);

    const handleCombinationSetCoverSuccess = useCallback((imagePath) => {
        setViewModeCombination((prev) => ({
            ...prev,
            coverImageId: imagePath,
            coverImagePath: imagePath,
        }));
    }, []);

    // 封装选择处理
    const handleGallerySelect = useCallback((key, shiftKey) => {
        selection.handleSelectItem(key, shiftKey, galleryOrderedKeys);
    }, [selection, galleryOrderedKeys]);

    const handleArtistSelect = useCallback((key, shiftKey) => {
        selection.handleSelectItem(key, shiftKey, artistOrderedKeys);
    }, [selection, artistOrderedKeys]);

    const handleCombinationSelect = useCallback((key, shiftKey) => {
        selection.handleSelectItem(key, shiftKey, combinationOrderedKeys);
    }, [selection, combinationOrderedKeys]);

    // 全选（按当前视图）
    const handleSelectAllInView = useCallback(() => {
        if (viewMode === 'artist' && currentArtist?.images) {
            const newSet = new Set();
            filteredArtistImages.forEach((img) => newSet.add(`image:${img.path}`));
            selection.setSelectedItems(newSet);
        } else if (viewMode === 'combination' && viewModeCombination?.images) {
            const newSet = new Set();
            filteredCombinationImages.forEach((img) => newSet.add(`image:${img.path}`));
            selection.setSelectedItems(newSet);
        } else {
            selection.handleSelectAll();
        }
    }, [viewMode, currentArtist, viewModeCombination, filteredArtistImages, filteredCombinationImages, selection]);

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

    // 分类删除（封装 loadData 回调）
    const handleCategoryDelete = useCallback(async (cat) => {
        await categoryMgr.handleDeleteCategory(cat);
        loadData();
    }, [categoryMgr, loadData]);

    // 组合移动
    const handleCombinationMove = useCallback((combination) => {
        itemOps.openMoveDialog(combination, 'combination');
    }, [itemOps]);

    // ============ 外部导航处理 ============
    const navRef = useRef(null);

    useEffect(() => {
        if (!initialNavigation) return;
        if (navRef.current === initialNavigation) return;

        const nav = initialNavigation;
        const targetCategoryId = nav.categoryId || 'root';

        categoryMgr.setCurrentCategory(targetCategoryId);
        setViewMode('gallery');
        setCurrentArtist(null);
        setViewModeCombination(null);
        setImageSearchQuery('');

        const loadDataAndNavigate = async () => {
            const result = await fetchGalleryData(targetCategoryId);
            result.artists = result.artists.map(artist => ({
                ...artist,
                maxTime: artist.images && artist.images.length > 0
                    ? Math.max(...artist.images.map(img => img.mtime))
                    : artist.createdAt || 0,
            }));

            navRef.current = initialNavigation;
            setData(result);

            if (nav.type === 'artist' && nav.artistName) {
                const artist = result.artists?.find(a =>
                    a.name === nav.artistName && a.categoryId === targetCategoryId
                );
                if (artist) {
                    setCurrentArtist(artist);
                    setViewMode('artist');
                    if (!artist.images || artist.images.length === 0) {
                        fetch(`/artist_gallery/artist_images?name=${encodeURIComponent(artist.name)}`)
                            .then(res => res.json())
                            .then(imgResult => {
                                if (imgResult.success && imgResult.images) {
                                    setCurrentArtist(prev =>
                                        prev?.name === artist.name
                                            ? { ...prev, images: imgResult.images }
                                            : prev
                                    );
                                }
                            })
                            .catch(err => console.error('Failed to load artist images:', err));
                    }
                }
            } else if (nav.type === 'combination' && nav.combinationId) {
                const combination = result.combinations?.find(c => c.id === nav.combinationId);
                if (combination) {
                    handleCombinationClick(combination);
                }
            }
        };

        loadDataAndNavigate();
    }, [initialNavigation]);

    // ============ Context Value ============
    const contextValue = useMemo(() => ({
        // Navigation
        viewMode, setViewMode,
        currentArtist, setCurrentArtist,
        viewModeCombination, setViewModeCombination,
        currentCategory,
        navigateToGallery,

        // Data
        data, loading, error, loadData,

        // Categories
        categories: categoryMgr.categories,
        allArtists: categoryMgr.allArtists,
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

        // Filtering
        filteredArtists,
        searchQuery, setSearchQuery,
        sortBy, setSortBy,
        sortOrder, setSortOrder,
        showFavoritesOnly, setShowFavoritesOnly,
        favorites,
        handleFavoriteToggle,
        cardSize, setCardSize,
        imageSearchQuery, setImageSearchQuery,
        imageSortBy, setImageSortBy,
        imageSortOrder, setImageSortOrder,
        filteredArtistImages,
        filteredCombinationImages,
        currentCombinations,

        // Selection
        selectionMode: selection.selectionMode,
        selectedItems: selection.selectedItems,
        getSelectionType: selection.getSelectionType,
        handleToggleSelectionMode: selection.handleToggleSelectionMode,
        handleGallerySelect,
        handleArtistSelect,
        handleCombinationSelect,
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
        showAddArtistDialog, setShowAddArtistDialog,
        editModeArtist, setEditModeArtist,
        openAddDialog, openEditDialog,
        showDeleteConfirm, setShowDeleteConfirm,
        artistToDelete, setArtistToDelete,
        openDeleteConfirm,
        showImportDialog, setShowImportDialog,
        showExportDialog, setShowExportDialog,
        exportPayload, setExportPayload,
        showCombinationDialog, setShowCombinationDialog,
        combinationDialogMode, setCombinationDialogMode,
        editingCombination, setEditingCombination,
        openCombinationDialog,

        // Lightbox
        lightbox,
        openLightbox, closeLightbox,
        handleLightboxNavigate,

        // Business callbacks
        handleCardClick,
        handleCombinationClick,
        handleCombinationEdit,
        handleCombinationDuplicate,
        handleCombinationDelete,
        handleCombinationMove,
        handleCombinationDialogSave,
        handleExportArtist,
        handleOpenExportDialog,
        handleOpenBatchExportDialog,
        handleExportConfirm,
        handleImportArtists,
        handleArtistDeleteImageSuccess,
        handleArtistSetCoverSuccess,
        handleCombinationDeleteImageSuccess,
        handleCombinationSetCoverSuccess,

        // Props from parent
        onClose,
    }), [
        viewMode, currentArtist, viewModeCombination, currentCategory,
        data, loading, error,
        categoryMgr.categories, categoryMgr.allArtists, categoryMgr.categoryPath,
        categoryMgr.currentCategoryChildren, categoryMgr.refreshCategories,
        categoryMgr.showCategoryDialog, categoryMgr.categoryDialogMode, categoryMgr.editingCategory,
        filteredArtists, searchQuery, sortBy, sortOrder, showFavoritesOnly, favorites,
        cardSize, imageSearchQuery, imageSortBy, imageSortOrder,
        filteredArtistImages, filteredCombinationImages, currentCombinations,
        selection.selectionMode, selection.selectedItems, selection.showBatchConfirm,
        selection.batchOperation,
        itemOps.showMoveDialog, itemOps.moveItem, itemOps.moveItemType,
        itemOps.showCopyDialog, itemOps.copyItem, itemOps.copyItemType,
        showAddArtistDialog, editModeArtist,
        showDeleteConfirm, artistToDelete,
        showImportDialog,
        showExportDialog, exportPayload,
        showCombinationDialog, combinationDialogMode, editingCombination,
        lightbox,
        onClose,
    ]);

    return h(GalleryContext.Provider, { value: contextValue }, children);
}
