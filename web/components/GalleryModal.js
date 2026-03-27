/**
 * 画廊模态框组件（重构版）
 * 主容器组件，包含所有子组件
 */
import { h } from '../lib/preact.mjs';
import { useState, useEffect, useMemo } from '../lib/hooks.mjs';
import { Storage, fetchCategories, buildBreadcrumbPath, addCategory, updateCategory, deleteCategory } from '../utils.js';
import { GalleryHeader } from './GalleryHeader.js';
import { GalleryGrid } from './GalleryGrid.js';
import { Lightbox } from './Lightbox.js';
import { AddArtistDialog } from './AddArtistDialog.js';
import { DeleteConfirmDialog } from './DeleteConfirmDialog.js';
import { CategoryDialog } from './CategoryDialog.js';
import { ArtistDetailModal } from './ArtistDetailModal.js';
import { Breadcrumb } from './Breadcrumb.js';
import { useGalleryData } from './hooks/useGalleryData.js';
import { useFilteredArtists } from './hooks/useFilteredArtists.js';

export function GalleryModal({ isOpen, onClose }) {
    // ============ 基础状态 ============
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('name');
    const [sortOrder, setSortOrder] = useState('desc');
    const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
    const [favorites, setFavorites] = useState(Storage.getFavorites());

    // ============ 分类相关状态 ============
    const [categories, setCategories] = useState([]);
    const [currentCategory, setCurrentCategory] = useState('root');
    const [categoryPath, setCategoryPath] = useState([]);
    const [showCategoryDialog, setShowCategoryDialog] = useState(false);
    const [categoryDialogMode, setCategoryDialogMode] = useState('add');
    const [editingCategory, setEditingCategory] = useState(null);
    const [showArtistDetail, setShowArtistDetail] = useState(false);
    const [selectedArtist, setSelectedArtist] = useState(null);

    // ============ 对话框状态 ============
    const [showAddArtistDialog, setShowAddArtistDialog] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [artistToDelete, setArtistToDelete] = useState(null);
    const [editModeArtist, setEditModeArtist] = useState(null);

    // ============ 灯箱状态 ============
    const [lightbox, setLightbox] = useState({
        open: false,
        artist: null,
        imageIndex: 0,
    });

    // ============ 数据获取和过滤 ============
    const { data, loading, error, loadData } = useGalleryData(currentCategory);

    // 加载分类数据
    useEffect(() => {
        const loadCategories = async () => {
            try {
                const result = await fetchCategories();
                setCategories(result.categories || []);
            } catch (err) {
                console.error('加载分类失败:', err);
            }
        };
        loadCategories();
    }, []);

    // 自动加载数据
    useEffect(() => {
        if (isOpen) {
            loadData();
        }
    }, [isOpen, currentCategory]);

    // 更新面包屑路径
    useEffect(() => {
        if (categories.length > 0) {
            const path = buildBreadcrumbPath(currentCategory, categories);
            setCategoryPath(path);
        }
    }, [currentCategory, categories]);

    // 过滤和排序
    const filteredArtists = useFilteredArtists(
        data,
        searchQuery,
        sortBy,
        sortOrder,
        showFavoritesOnly,
        favorites,
    );

    // ============ 事件处理函数 ============

    const handleFavoriteToggle = (artistName) => {
        const updated = Storage.toggleFavorite(artistName, favorites);
        setFavorites(new Set(updated));
    };

    const handleCardClick = (artistIndex) => {
        const artist = filteredArtists[artistIndex];
        setSelectedArtist(artist);
        setShowArtistDetail(true);
    };

    const handleImageClick = (artistIndex, imageIndex) => {
        const artist = filteredArtists[artistIndex];
        setLightbox({
            open: true,
            artist,
            imageIndex,
        });
    };

    const handleLightboxNavigate = (direction) => {
        const currentArtistIndex = filteredArtists.findIndex(
            (a) => a.name === lightbox.artist.name,
        );
        const artist = filteredArtists[currentArtistIndex];
        let newIndex = lightbox.imageIndex + direction;
        if (newIndex < 0) newIndex = artist.images.length - 1;
        if (newIndex >= artist.images.length) newIndex = 0;
        setLightbox((prev) => ({ ...prev, imageIndex: newIndex }));
    };

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

    // ============ 分类相关事件处理 ============

    const handleCategorySelect = (category) => {
        setCurrentCategory(category.id);
    };

    const handleBreadcrumbNavigate = (category, index) => {
        setCurrentCategory(category.id);
    };

    const handleAddCategory = () => {
        setCategoryDialogMode('add');
        setEditingCategory(null);
        setShowCategoryDialog(true);
    };

    const handleEditCategory = (category) => {
        setCategoryDialogMode('edit');
        setEditingCategory(category);
        setShowCategoryDialog(true);
    };

    const handleDeleteCategory = async (category) => {
        if (!confirm(`确定要删除分类"${category.displayName}"吗？`)) return;

        try {
            await deleteCategory(category.id);
            // 重新加载分类和数据
            const result = await fetchCategories();
            setCategories(result.categories || []);
            loadData();
        } catch (err) {
            alert(`删除失败: ${err.message}`);
        }
    };

    const handleCategoryDialogSave = async (data) => {
        try {
            if (categoryDialogMode === 'add') {
                await addCategory(data);
            } else {
                await updateCategory(editingCategory.id, data);
            }
            setShowCategoryDialog(false);
            // 重新加载分类和数据
            const result = await fetchCategories();
            setCategories(result.categories || []);
            loadData();
        } catch (err) {
            throw err;
        }
    };

    // 获取当前分类的子分类
    const currentCategoryChildren = useMemo(() => {
        const flattenCategories = (tree) => {
            const result = [];
            function traverse(node) {
                result.push(node);
                if (node.children) {
                    node.children.forEach(traverse);
                }
            }
            tree.forEach(traverse);
            return result;
        };

        const flatCategories = flattenCategories(categories);
        const currentCat = flatCategories.find(c => c.id === currentCategory);
        return currentCat?.children || [];
    }, [categories, currentCategory]);

    // ============ 对话框回调处理 ============

    const handleAddDialogClose = () => {
        setShowAddArtistDialog(false);
        setEditModeArtist(null);
        loadData(); // 刷新数据
    };

    const handleDeleteConfirm = () => {
        setShowDeleteConfirm(false);
        setArtistToDelete(null);
        loadData(); // 刷新数据
    };

    const handleDeleteCancel = () => {
        setShowDeleteConfirm(false);
        setArtistToDelete(null);
    };

    // ============ 渲染函数 ============

    /**
     * 渲染模态框头部
     */
    const renderHeader = () => {
        return h('div', { class: 'gallery-modal-header' }, [
            h('div', { class: 'gallery-modal-title' }, '🎨 画师图库'),
            h(
                'button',
                {
                    class: 'gallery-modal-btn',
                    onClick: handleAddCategory,
                },
                '📁 新建分类',
            ),
            h(
                'button',
                {
                    class: 'gallery-modal-btn',
                    onClick: openAddDialog,
                },
                '➕ 添加画师',
            ),
            h(
                'button',
                {
                    class: 'gallery-modal-btn',
                    onClick: loadData,
                },
                '🔄 刷新',
            ),
            h(
                'button',
                {
                    class: 'gallery-modal-btn primary',
                    onClick: onClose,
                },
                '✕ 关闭',
            ),
        ]);
    };

    /**
     * 渲染加载状态
     */
    const renderLoading = () => {
        return h('div', { class: 'gallery-loading' }, [
            h('div', { class: 'gallery-loading-spinner' }),
            h('div', {}, '正在加载图库...'),
        ]);
    };

    /**
     * 渲染错误状态
     */
    const renderError = () => {
        return h('div', { class: 'gallery-error' }, [
            h('div', { class: 'gallery-error-icon' }, '⚠️'),
            h('div', {}, '加载图库失败'),
            h('div', { class: 'gallery-error-message' }, error),
        ]);
    };

    /**
     * 渲染主要内容区
     */
    const renderBody = () => {
        if (loading) {
            return renderLoading();
        }

        if (error) {
            return renderError();
        }

        return h('div', { class: 'gallery-container' }, [
            // 面包屑导航
            h(Breadcrumb, {
                path: categoryPath,
                onNavigate: handleBreadcrumbNavigate
            }),

            h(GalleryHeader, {
                totalCount: data?.totalCount || 0,
                currentCount: filteredArtists.length,
                searchQuery,
                sortBy,
                sortOrder,
                showFavoritesOnly,
                onSearchChange: setSearchQuery,
                onSortChange: setSortBy,
                onOrderChange: () =>
                    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc')),
                onFavoriteToggle: () => setShowFavoritesOnly((prev) => !prev),
            }),
            h(GalleryGrid, {
                categories: currentCategoryChildren,
                artists: filteredArtists,
                favorites,
                onFavoriteToggle: handleFavoriteToggle,
                onImageClick: handleCardClick,
                onEdit: openEditDialog,
                onDelete: openDeleteConfirm,
                onCategoryClick: handleCategorySelect,
                onCategoryEdit: handleEditCategory,
                onCategoryDelete: handleDeleteCategory
            }),
        ]);
    };

    /**
     * 渲染模态框内容
     */
    const renderModal = () => {
        return h('div', { class: 'gallery-modal-content' }, [
            renderHeader(),
            h('div', { class: 'gallery-modal-body' }, renderBody()),
        ]);
    };

    /**
     * 渲染灯箱
     */
    const renderLightbox = () => {
        return h(Lightbox, {
            isOpen: lightbox.open,
            artist: lightbox.artist,
            imageIndex: lightbox.imageIndex,
            onClose: () =>
                setLightbox({ open: false, artist: null, imageIndex: 0 }),
            onNavigate: handleLightboxNavigate,
        });
    };

    /**
     * 渲染添加/编辑画师对话框
     */
    const renderAddDialog = () => {
        return h(AddArtistDialog, {
            isOpen: showAddArtistDialog,
            mode: editModeArtist ? 'edit' : 'add',
            editModeArtist,
            categories: categories,
            currentCategoryId: currentCategory,
            onClose: handleAddDialogClose,
            onSave: handleAddDialogClose,
        });
    };

    /**
     * 渲染删除确认对话框
     */
    const renderDeleteDialog = () => {
        return h(DeleteConfirmDialog, {
            isOpen: showDeleteConfirm,
            artist: artistToDelete,
            onConfirm: handleDeleteConfirm,
            onCancel: handleDeleteCancel,
        });
    };

    /**
     * 渲染分类对话框
     */
    const renderCategoryDialog = () => {
        return h(CategoryDialog, {
            isOpen: showCategoryDialog,
            mode: categoryDialogMode,
            category: editingCategory,
            categories: categories,
            currentCategoryId: currentCategory,
            onClose: () => setShowCategoryDialog(false),
            onSave: handleCategoryDialogSave
        });
    };

    /**
     * 渲染画师详情模态框
     */
    const renderArtistDetailModal = () => {
        return h(ArtistDetailModal, {
            isOpen: showArtistDetail,
            artist: selectedArtist,
            onClose: () => {
                setShowArtistDetail(false);
                setSelectedArtist(null);
            }
        });
    };

    // ============ 主渲染 ============

    if (!isOpen) return null;

    return h(
        'div',
        {
            class: `gallery-modal-overlay ${isOpen ? 'open' : ''}`,
            onClick: (e) => {
                if (e.target.classList.contains('gallery-modal-overlay')) onClose();
            },
        },
        [
            renderModal(),
            renderLightbox(),
            renderAddDialog(),
            renderDeleteDialog(),
            renderCategoryDialog(),
            renderArtistDetailModal(),
        ],
    );
}
