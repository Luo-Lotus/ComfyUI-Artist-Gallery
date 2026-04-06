/**
 * 画廊模态框组件
 * 主容器：视图路由 + 对话框编排
 */
import { h } from '../lib/preact.mjs';
import { useState, useEffect, useMemo } from '../lib/hooks.mjs';
import {
    Storage,
    importArtists,
    createCombination as createCombinationApi,
    updateCombination as updateCombinationApi,
    deleteCombination as deleteCombinationApi,
    moveCombination as moveCombinationApi,
    fetchCombinationImages,
    exportArtists,
} from '../utils.js';
import { GalleryGrid } from './GalleryGrid.js';
import { Lightbox } from './Lightbox.js';
import { AddArtistDialog } from './AddArtistDialog.js';
import { DeleteConfirmDialog } from './DeleteConfirmDialog.js';
import { CategoryDialog } from './CategoryDialog.js';
import { MoveDialog } from './MoveDialog.js';
import { CopyDialog } from './CopyDialog.js';
import { ImportImagesDialog } from './ImportImagesDialog.js';
import { CombinationDialog } from './CombinationDialog.js';
import { BatchActionBar } from './BatchActionBar.js';
import { BatchConfirmDialog } from './BatchConfirmDialog.js';
import { GalleryHeader } from './GalleryHeader.js';
import { GalleryFilterBar } from './GalleryFilterBar.js';
import { ArtistDetailView } from './ArtistDetailView.js';
import { CombinationDetailView } from './CombinationDetailView.js';
import { ImageInfoDialog } from './ImageInfoDialog.js';
import { useGalleryData } from './hooks/useGalleryData.js';
import { useFilteredArtists } from './hooks/useFilteredArtists.js';
import { useCategoryManager } from './hooks/useCategoryManager.js';
import { useSelection } from './hooks/useSelection.js';
import { useItemOperations } from './hooks/useItemOperations.js';
import { showToast } from './Toast.js';
import { computeSizeVars } from './SizePresets.js';
import { Icon } from '../lib/icons.mjs';

export function GalleryModal({ isOpen, onClose }) {
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
    const [lightbox, setLightbox] = useState({ open: false, artist: null, imageIndex: 0 });

    // ============ 对话框状态 ============
    const [showAddArtistDialog, setShowAddArtistDialog] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [artistToDelete, setArtistToDelete] = useState(null);
    const [editModeArtist, setEditModeArtist] = useState(null);
    const [showImportDialog, setShowImportDialog] = useState(false);
    const [showImageInfoDialog, setShowImageInfoDialog] = useState(false);
    const [imageInfoImage, setImageInfoImage] = useState(null);

    // ============ 组合相关状态 ============
    const [showCombinationDialog, setShowCombinationDialog] = useState(false);
    const [combinationDialogMode, setCombinationDialogMode] = useState('add');
    const [editingCombination, setEditingCombination] = useState(null);
    const [viewModeCombination, setViewModeCombination] = useState(null);

    // 计算卡片大小 CSS 变量
    const cardSizeVars = computeSizeVars(cardSize);

    // ============ Hooks ============

    // 返回画廊视图（需要在 hooks 之前定义，供 useCategoryManager 使用）
    const handleBackToGallery = () => {
        setViewMode('gallery');
        setCurrentArtist(null);
        setViewModeCombination(null);
        setImageSearchQuery('');
    };

    // 分类管理
    const categoryMgr = useCategoryManager({
        viewMode,
        currentArtist,
        viewModeCombination,
        onNavigateToGallery: handleBackToGallery,
    });

    const currentCategory = categoryMgr.currentCategory;

    // 数据获取（useGalleryData 内部用 ref 追踪最新 categoryId）
    const { data, loading, error, loadData } = useGalleryData(currentCategory);

    // 自动加载数据
    useEffect(() => {
        if (isOpen) {
            loadData();
        }
    }, [isOpen, currentCategory]);

    // 过滤排序
    const filteredArtists = useFilteredArtists(
        data,
        searchQuery,
        sortBy,
        sortOrder,
        showFavoritesOnly,
        favorites,
    );

    // 多选管理
    const selection = useSelection({
        categories: categoryMgr.categories,
        filteredArtists,
        currentArtist,
        currentCategory,
        loadData,
        setCurrentArtist,
        refreshCategories: categoryMgr.refreshCategories,
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
        const images = currentArtist?.images || [];
        if (!imageSearchQuery) return images;
        const q = imageSearchQuery.toLowerCase();
        return images.filter((img) => {
            const filename = (img.path || '').split(/[/\\]/).pop().toLowerCase();
            return filename.includes(q);
        });
    }, [currentArtist?.images, imageSearchQuery]);

    const filteredCombinationImages = useMemo(() => {
        const images = viewModeCombination?.images || [];
        if (!imageSearchQuery) return images;
        const q = imageSearchQuery.toLowerCase();
        return images.filter((img) => {
            const filename = (img.path || '').split(/[/\\]/).pop().toLowerCase();
            return filename.includes(q);
        });
    }, [viewModeCombination?.images, imageSearchQuery]);

    // 用于 Shift 范围选择的有序 key 列表
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

    // 封装选择处理，自动注入 orderedKeys
    const handleGallerySelect = (key, shiftKey) => {
        selection.handleSelectItem(key, shiftKey, galleryOrderedKeys);
    };
    const handleArtistSelect = (key, shiftKey) => {
        selection.handleSelectItem(key, shiftKey, artistOrderedKeys);
    };
    const handleCombinationSelect = (key, shiftKey) => {
        selection.handleSelectItem(key, shiftKey, combinationOrderedKeys);
    };

    // ============ 事件处理 ============

    const handleFavoriteToggle = (artistName) => {
        const updated = Storage.toggleFavorite(artistName, favorites);
        setFavorites(new Set(updated));
    };

    const handleCardClick = async (artistIndex) => {
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
    };

    const handleLightboxNavigate = (direction) => {
        const currentArtistIndex = filteredArtists.findIndex(
            (a) =>
                a.categoryId === lightbox.artist.categoryId &&
                a.name === lightbox.artist.name,
        );
        const artist = filteredArtists[currentArtistIndex];
        if (!artist || !artist.images) return;
        let newIndex = lightbox.imageIndex + direction;
        if (newIndex < 0) newIndex = artist.images.length - 1;
        if (newIndex >= artist.images.length) newIndex = 0;
        setLightbox((prev) => ({ ...prev, imageIndex: newIndex }));
    };

    // 对话框打开
    const openAddDialog = () => {
        setEditModeArtist(null);
        setShowAddArtistDialog(true);
    };

    const openEditDialog = (artist) => {
        setEditModeArtist(artist);
        setShowAddArtistDialog(true);
    };

    const openDeleteConfirm = (artist) => {
        setArtistToDelete(artist);
        setShowDeleteConfirm(true);
    };

    // 组合事件
    const handleCombinationClick = async (combination) => {
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
    };

    const handleCombinationEdit = (combination) => {
        setEditingCombination(combination);
        setCombinationDialogMode('edit');
        setShowCombinationDialog(true);
    };

    const handleCombinationDuplicate = (combination) => {
        itemOps.openCopyDialog(combination, 'combination');
    };

    const handleCombinationDelete = async (combination) => {
        if (!confirm(`确定要删除组合"${combination.name}"吗？`)) return;
        try {
            await deleteCombinationApi(combination.id);
            showToast('已删除组合', 'success');
            await loadData();
        } catch (err) {
            showToast('删除组合失败: ' + err.message, 'error');
        }
    };

    const handleCombinationDialogSave = async (data) => {
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
    };

    // 导出
    const handleExportArtist = async (artist) => {
        try {
            await exportArtists([
                { categoryId: artist.categoryId, name: artist.name },
            ]);
            showToast(
                `已导出画师: ${artist.displayName || artist.name}`,
                'success',
            );
        } catch (error) {
            showToast('导出失败: ' + error.message, 'error');
        }
    };

    // 导入画师
    const handleImportArtists = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const result = await importArtists(file, currentCategory);
            if (result.success) {
                showToast(
                    `导入成功: ${result.addedArtists} 个画师, ${result.addedImages} 张图片`,
                    'success',
                );
                loadData();
            } else {
                showToast(result.error || '导入失败', 'error');
            }
        } catch (error) {
            showToast('导入失败: ' + error.message, 'error');
        }
        e.target.value = '';
    };

    // 画师详情回调
    const handleArtistDeleteImageSuccess = async () => {
        await loadData();
        const updatedData = await fetch(
            `/artist_gallery/data?category=${currentCategory}`,
        );
        const result = await updatedData.json();
        const updatedArtist = result.artists?.find(
            (a) =>
                a.categoryId === currentArtist.categoryId &&
                a.name === currentArtist.name,
        );
        if (updatedArtist) {
            setCurrentArtist(updatedArtist);
        }
    };

    const handleArtistSetCoverSuccess = (imagePath) => {
        setCurrentArtist((prev) => ({
            ...prev,
            coverImagePath: imagePath,
        }));
    };

    // 组合详情回调
    const handleCombinationDeleteImageSuccess = async () => {
        if (!viewModeCombination) return;
        const result = await fetchCombinationImages(viewModeCombination.id);
        if (result.success) {
            setViewModeCombination({
                ...viewModeCombination,
                images: result.images,
            });
        }
    };

    const handleCombinationSetCoverSuccess = (imagePath) => {
        setViewModeCombination((prev) => ({
            ...prev,
            coverImageId: imagePath,
            coverImagePath: imagePath,
        }));
    };

    // ============ 渲染 ============

    if (!isOpen) return null;

    const renderLoading = () =>
        h('div', { class: 'gallery-loading' }, [
            h('div', { class: 'gallery-loading-spinner' }),
            h('div', {}, '正在加载图库...'),
        ]);

    const renderError = () =>
        h('div', { class: 'gallery-error' }, [
            h('div', { class: 'gallery-error-icon' }, h(Icon, { name: 'alert-triangle', size: 32 })),
            h('div', {}, '加载图库失败'),
            h('div', { class: 'gallery-error-message' }, error),
        ]);

    const renderFilterBar = () =>
        h(GalleryFilterBar, {
            viewMode,
            currentCategory,
            categoryPath: categoryMgr.categoryPath,
            onBreadcrumbNavigate: categoryMgr.handleBreadcrumbNavigate,
            onBack: handleBackToGallery,
            searchQuery,
            onSearchChange: setSearchQuery,
            showFavoritesOnly,
            onToggleFavorites: () => setShowFavoritesOnly((prev) => !prev),
            sortBy,
            onSortChange: setSortBy,
            sortOrder,
            onSortOrderToggle: () => setSortOrder((prev) => prev === 'asc' ? 'desc' : 'asc'),
            filteredCount: filteredArtists.length,
            totalCount: data?.totalCount || 0,
            cardSize,
            onCardSizeChange: setCardSize,
            imageSearchQuery,
            onImageSearchChange: setImageSearchQuery,
            imageFilteredCount: viewMode === 'artist'
                ? filteredArtistImages.length
                : filteredCombinationImages.length,
            imageTotalCount: viewMode === 'artist'
                ? currentArtist?.images?.length || 0
                : viewModeCombination?.images?.length || 0,
        });

    const renderBatchBar = () => {
        if (!selection.selectionMode) return null;
        return h(BatchActionBar, {
            selectedCount: selection.selectedItems.size,
            selectionType: selection.getSelectionType(),
            onSelectAll: () => {
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
            },
            onDeselectAll: selection.handleDeselectAll,
            onMove: () => selection.handleBatchMove({
                setMoveItem: itemOps.setMoveItem,
                setMoveItemType: itemOps.setMoveItemType,
                setShowMoveDialog: itemOps.setShowMoveDialog,
            }),
            onCopy: () => selection.handleBatchCopy({
                setCopyItem: itemOps.setCopyItem,
                setCopyItemType: itemOps.setCopyItemType,
                setShowCopyDialog: itemOps.setShowCopyDialog,
            }),
            onExport: selection.handleBatchExport,
            onDelete: selection.handleBatchDelete,
            onExit: selection.handleToggleSelectionMode,
        });
    };

    const renderBody = () => {
        if (loading) {
            return h('div', { class: 'gallery-container' }, [
                renderFilterBar(),
                renderLoading(),
            ]);
        }

        if (error) {
            return h('div', { class: 'gallery-container' }, [
                renderFilterBar(),
                renderError(),
            ]);
        }

        return h('div', { class: 'gallery-container' }, [
            renderFilterBar(),
            renderBatchBar(),

            // 画廊视图
            h('div', {
                key: 'gallery-view',
                class: 'view-stack-page',
                style: { display: viewMode === 'gallery' ? '' : 'none' },
            }, [
                h(GalleryGrid, {
                    categories: categoryMgr.currentCategoryChildren,
                    combinations: currentCombinations,
                    artists: filteredArtists,
                    allArtists: categoryMgr.allArtists,
                    favorites,
                    onFavoriteToggle: handleFavoriteToggle,
                    onImageClick: handleCardClick,
                    onEdit: openEditDialog,
                    onDelete: openDeleteConfirm,
                    onCategoryClick: categoryMgr.handleCategorySelect,
                    onCategoryEdit: categoryMgr.handleEditCategory,
                    onCategoryDelete: async (cat) => {
                        await categoryMgr.handleDeleteCategory(cat);
                        loadData();
                    },
                    onMove: itemOps.openMoveDialog,
                    onCopy: itemOps.openCopyDialog,
                    onExport: handleExportArtist,
                    onCombinationClick: handleCombinationClick,
                    onCombinationEdit: handleCombinationEdit,
                    onCombinationDuplicate: handleCombinationDuplicate,
                    onCombinationMove: (combination) => itemOps.openMoveDialog(combination, 'combination'),
                    onCombinationDelete: handleCombinationDelete,
                    selectionMode: selection.selectionMode,
                    selectedItems: selection.selectedItems,
                    onSelect: handleGallerySelect,
                }),
            ]),

            // 画师详情
            currentArtist && h('div', {
                key: `artist-${currentArtist.name}`,
                class: 'view-stack-page',
                style: { display: viewMode === 'artist' ? '' : 'none' },
            }, [
                h(ArtistDetailView, {
                    artist: currentArtist,
                    filteredImages: filteredArtistImages,
                    filteredArtists,
                    currentCategory,
                    selectionMode: selection.selectionMode,
                    selectedItems: selection.selectedItems,
                    onLightbox: (artist, imageIndex) => {
                        setLightbox({ open: true, artist, imageIndex });
                    },
                    onMoveImage: (image) => itemOps.openMoveDialog(image, 'image'),
                    onCopyImage: (image) => itemOps.openCopyDialog(image, 'image'),
                    onImageInfo: (image) => {
                        setImageInfoImage(image);
                        setShowImageInfoDialog(true);
                    },
                    onSelect: handleArtistSelect,
                    onDeleteImageSuccess: handleArtistDeleteImageSuccess,
                    onSetCoverSuccess: handleArtistSetCoverSuccess,
                }),
            ]),

            // 组合详情
            viewModeCombination && h('div', {
                key: `combination-${viewModeCombination.id}`,
                class: 'view-stack-page',
                style: { display: viewMode === 'combination' ? '' : 'none' },
            }, [
                h(CombinationDetailView, {
                    combination: viewModeCombination,
                    filteredImages: filteredCombinationImages,
                    selectionMode: selection.selectionMode,
                    selectedItems: selection.selectedItems,
                    onLightbox: (comb, imageIndex) => {
                        setLightbox({ open: true, artist: comb, imageIndex });
                    },
                    onImageInfo: (image) => {
                        setImageInfoImage(image);
                        setShowImageInfoDialog(true);
                    },
                    onSelect: handleCombinationSelect,
                    onDeleteSuccess: handleCombinationDeleteImageSuccess,
                    onSetCoverSuccess: handleCombinationSetCoverSuccess,
                    loadData,
                }),
            ]),
        ]);
    };

    const batchDetails = selection.getSelectedDetails();

    return h(
        'div',
        {
            class: `gallery-modal-overlay ${isOpen ? 'open' : ''}`,
            onClick: (e) => {
                if (e.target.classList.contains('gallery-modal-overlay'))
                    onClose();
            },
        },
        [
            h('div', { class: 'gallery-modal-content', style: cardSizeVars }, [
                h(GalleryHeader, {
                    viewMode,
                    selectionMode: selection.selectionMode,
                    onAddCategory: categoryMgr.handleAddCategory,
                    onAddArtist: openAddDialog,
                    onCreateCombination: () => {
                        setEditingCombination(null);
                        setCombinationDialogMode('add');
                        setShowCombinationDialog(true);
                    },
                    onImportImages: () => setShowImportDialog(true),
                    onImportArtists: handleImportArtists,
                    onRefresh: loadData,
                    onToggleSelectionMode: selection.handleToggleSelectionMode,
                    onClose,
                }),
                h('div', { class: 'gallery-modal-body' }, renderBody()),
            ]),

            // 对话框
            h(Lightbox, {
                isOpen: lightbox.open,
                artist: lightbox.artist,
                imageIndex: lightbox.imageIndex,
                onClose: () =>
                    setLightbox({ open: false, artist: null, imageIndex: 0 }),
                onNavigate: handleLightboxNavigate,
            }),

            h(AddArtistDialog, {
                isOpen: showAddArtistDialog,
                mode: editModeArtist ? 'edit' : 'add',
                editModeArtist,
                currentCategoryId: currentCategory,
                onClose: () => {
                    setShowAddArtistDialog(false);
                    setEditModeArtist(null);
                    loadData();
                },
                onSave: () => {
                    setShowAddArtistDialog(false);
                    setEditModeArtist(null);
                    loadData();
                },
            }),

            h(DeleteConfirmDialog, {
                isOpen: showDeleteConfirm,
                artist: artistToDelete,
                onConfirm: () => {
                    setShowDeleteConfirm(false);
                    setArtistToDelete(null);
                    loadData();
                },
                onCancel: () => {
                    setShowDeleteConfirm(false);
                    setArtistToDelete(null);
                },
            }),

            h(CategoryDialog, {
                isOpen: categoryMgr.showCategoryDialog,
                mode: categoryMgr.categoryDialogMode,
                category: categoryMgr.editingCategory,
                categories: categoryMgr.categories,
                currentCategoryId: currentCategory,
                onClose: () => categoryMgr.setShowCategoryDialog(false),
                onSave: async (data) => {
                    await categoryMgr.handleCategoryDialogSave(data);
                    loadData();
                },
            }),

            h(MoveDialog, {
                isOpen: itemOps.showMoveDialog,
                itemType: itemOps.moveItemType,
                item: itemOps.moveItem,
                categories: categoryMgr.categories,
                artists: categoryMgr.allArtists,
                onClose: itemOps.closeMoveDialog,
                onMove: itemOps.handleMove,
            }),

            h(CopyDialog, {
                isOpen: itemOps.showCopyDialog,
                itemType: itemOps.copyItemType,
                item: itemOps.copyItem,
                categories: categoryMgr.categories,
                artists: categoryMgr.allArtists,
                onClose: itemOps.closeCopyDialog,
                onCopy: itemOps.handleCopy,
            }),

            h(BatchConfirmDialog, {
                isOpen: selection.showBatchConfirm,
                onClose: () => selection.setShowBatchConfirm(false),
                operation: selection.batchOperation,
                items: batchDetails,
                onConfirm: selection.handleBatchConfirm,
            }),

            h(ImportImagesDialog, {
                isOpen: showImportDialog,
                viewMode,
                currentCategory,
                currentArtist,
                categories: categoryMgr.categories,
                onClose: () => setShowImportDialog(false),
                onSuccess: async () => {
                    await loadData();
                    setShowImportDialog(false);
                },
            }),

            h(CombinationDialog, {
                isOpen: showCombinationDialog,
                mode: combinationDialogMode,
                combination: editingCombination,
                currentCategoryId: currentCategory,
                artists: categoryMgr.allArtists,
                onClose: () => {
                    setShowCombinationDialog(false);
                    setEditingCombination(null);
                },
                onSave: async () => {
                    setShowCombinationDialog(false);
                    setEditingCombination(null);
                    await loadData();
                },
            }),

            h(ImageInfoDialog, {
                isOpen: showImageInfoDialog,
                image: imageInfoImage,
                onClose: () => {
                    setShowImageInfoDialog(false);
                    setImageInfoImage(null);
                },
            }),
        ],
    );
}
