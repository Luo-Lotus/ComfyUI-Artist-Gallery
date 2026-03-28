/**
 * 画廊模态框组件（重构版）
 * 主容器组件，包含所有子组件
 */
import { h } from '../lib/preact.mjs';
import { useState, useEffect, useMemo } from '../lib/hooks.mjs';
import { Storage, fetchCategories, fetchAllArtists, buildBreadcrumbPath, addCategory, updateCategory, deleteCategory, buildImageUrl } from '../utils.js';
import { GalleryHeader } from './GalleryHeader.js';
import { GalleryGrid } from './GalleryGrid.js';
import { Lightbox } from './Lightbox.js';
import { AddArtistDialog } from './AddArtistDialog.js';
import { DeleteConfirmDialog } from './DeleteConfirmDialog.js';
import { CategoryDialog } from './CategoryDialog.js';
import { ArtistDetailModal } from './ArtistDetailModal.js';
import { Breadcrumb } from './Breadcrumb.js';
import { MoveDialog } from './MoveDialog.js';
import { useGalleryData } from './hooks/useGalleryData.js';
import { useFilteredArtists } from './hooks/useFilteredArtists.js';
import { useContextMenu } from './ContextMenu.js';

export function GalleryModal({ isOpen, onClose }) {
    // 获取右键菜单 hook
    const { showContextMenu } = useContextMenu();
    // ============ 基础状态 ============
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('name');
    const [sortOrder, setSortOrder] = useState('desc');
    const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
    const [favorites, setFavorites] = useState(Storage.getFavorites());

    // ============ 分类相关状态 ============
    const [categories, setCategories] = useState([]);
    const [allArtists, setAllArtists] = useState([]); // 所有画师（用于移动对话框）
    const [currentCategory, setCurrentCategory] = useState('root');
    const [categoryPath, setCategoryPath] = useState([]);
    const [showCategoryDialog, setShowCategoryDialog] = useState(false);
    const [categoryDialogMode, setCategoryDialogMode] = useState('add');
    const [editingCategory, setEditingCategory] = useState(null);

    // ============ 视图模式状态 ============
    const [viewMode, setViewMode] = useState('gallery'); // 'gallery' | 'artist'
    const [currentArtist, setCurrentArtist] = useState(null);

    // ============ 对话框状态 ============
    const [showAddArtistDialog, setShowAddArtistDialog] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [artistToDelete, setArtistToDelete] = useState(null);
    const [editModeArtist, setEditModeArtist] = useState(null);
    const [showMoveDialog, setShowMoveDialog] = useState(false);
    const [moveItem, setMoveItem] = useState(null);
    const [moveItemType, setMoveItemType] = useState(null);

    // ============ 灯箱状态 ============
    const [lightbox, setLightbox] = useState({
        open: false,
        artist: null,
        imageIndex: 0,
    });

    // ============ 数据获取和过滤 ============
    const { data, loading, error, loadData } = useGalleryData(currentCategory);

    // 加载分类数据和所有画师
    useEffect(() => {
        const loadData = async () => {
            try {
                const result = await fetchCategories();
                setCategories(result.categories || []);

                // 加载所有画师（用于移动对话框）
                const artistsData = await fetchAllArtists();
                setAllArtists(artistsData.artists || []);
            } catch (err) {
                console.error('加载数据失败:', err);
            }
        };
        loadData();
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
            let path = buildBreadcrumbPath(currentCategory, categories);

            // 如果在画师详情视图，添加画师名称到面包屑
            if (viewMode === 'artist' && currentArtist) {
                path = [
                    ...path,
                    {
                        id: currentArtist.id,
                        name: currentArtist.displayName || currentArtist.name,
                        type: 'artist'
                    }
                ];
            }

            setCategoryPath(path);
        }
    }, [currentCategory, categories, viewMode, currentArtist]);

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
        setCurrentArtist(artist);
        setViewMode('artist');
    };

    const handleBackToGallery = () => {
        setViewMode('gallery');
        setCurrentArtist(null);
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

    const handleBreadcrumbNavigate = (item, index) => {
        if (item.type === 'artist') {
            // 点击画师名称，不做任何事（已经是最后一项且不可点击）
            return;
        }
        // 点击分类，切换到该分类并返回画廊视图
        setCurrentCategory(item.id);
        setViewMode('gallery');
        setCurrentArtist(null);
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
        if (!confirm(`确定要删除分类"${category.name}"吗？`)) return;

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

    // ============ 移动功能 ============

    const openMoveDialog = (item, type) => {
        setMoveItem(item);
        setMoveItemType(type);
        setShowMoveDialog(true);
    };

    const handleMove = async (item, target) => {
        try {
            let response;
            if (moveItemType === 'category') {
                response = await fetch(`/artist_gallery/categories/${item.id}/move`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ newParentId: target.id })
                });
            } else if (moveItemType === 'artist') {
                response = await fetch(`/artist_gallery/artists/${item.id}/move`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ newCategoryId: target.id })
                });
            } else if (moveItemType === 'image') {
                response = await fetch('/artist_gallery/image/move', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        imagePath: item.path,
                        fromArtistId: currentArtist.id,
                        toArtistId: target.id
                    })
                });
            }

            const data = await response.json();

            if (response.ok && data.success) {
                setShowMoveDialog(false);
                setMoveItem(null);
                setMoveItemType(null);

                // 重新加载数据
                await loadData();

                // 如果在画师详情视图，更新当前画师
                if (viewMode === 'artist' && currentArtist) {
                    const updatedData = await fetch(`/artist_gallery/data?category=${currentCategory}`);
                    const result = await updatedData.json();
                    const updatedArtist = result.artists?.find(a => a.id === currentArtist.id);
                    if (updatedArtist) {
                        setCurrentArtist(updatedArtist);
                    } else {
                        // 画师被移走了，返回画廊视图
                        setViewMode('gallery');
                        setCurrentArtist(null);
                    }
                }

                // 重新加载分类和所有画师
                const catResult = await fetchCategories();
                setCategories(catResult.categories || []);

                const artistsData = await fetchAllArtists();
                setAllArtists(artistsData.artists || []);
            } else {
                throw new Error(data.error || '移动失败');
            }
        } catch (error) {
            throw error;
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
     * 渲染画师详情视图
     */
    const renderArtistDetail = () => {
        if (!currentArtist) return null;

        const hasImages = currentArtist.images && currentArtist.images.length > 0;

        // 图片右键菜单处理
        const handleImageContextMenu = (e, image) => {
            e.preventDefault();
            e.stopPropagation();

            const menuItems = [
                {
                    icon: '🔍',
                    label: '查看大图',
                    action: () => handleImageClick(
                        filteredArtists.findIndex(a => a.id === currentArtist.id),
                        currentArtist.images.indexOf(image)
                    )
                },
                {
                    icon: '📦',
                    label: '移动图片',
                    action: () => {
                        setMoveItem(image);
                        setMoveItemType('image');
                        setShowMoveDialog(true);
                    }
                },
                {
                    icon: '🗑️',
                    label: '删除图片',
                    action: async () => {
                        if (!confirm(`确定要删除这张图片吗？`)) return;

                        try {
                            const response = await fetch(`/artist_gallery/image`, {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    imagePath: image.path,
                                    artistId: currentArtist.id
                                })
                            });

                            if (response.ok) {
                                await loadData();
                                // 更新当前画师数据
                                const updatedData = await fetch(`/artist_gallery/data?category=${currentCategory}`);
                                const result = await updatedData.json();
                                const updatedArtist = result.artists?.find(a => a.id === currentArtist.id);
                                if (updatedArtist) {
                                    setCurrentArtist(updatedArtist);
                                }
                            } else {
                                const error = await response.json();
                                alert(`删除失败: ${error.error || '未知错误'}`);
                            }
                        } catch (error) {
                            alert(`删除失败: ${error.message}`);
                        }
                    }
                }
            ];

            showContextMenu(e, menuItems);
        };

        return h('div', { class: 'artist-detail-view' }, [
            // 图片网格
            hasImages ? h('div', { class: 'artist-detail-grid' },
                currentArtist.images.map((img, index) =>
                    h('div', {
                        key: img.path,
                        class: 'artist-detail-image-item',
                        onClick: () => handleImageClick(
                            filteredArtists.findIndex(a => a.id === currentArtist.id),
                            index
                        ),
                        onContextMenu: (e) => handleImageContextMenu(e, img)
                    }, [
                        h('img', {
                            src: buildImageUrl(img.path),
                            alt: `${currentArtist.name} - ${index + 1}`,
                            loading: 'lazy'
                        })
                    ])
                )
            ) : h('div', { class: 'artist-detail-empty' }, '🎨 暂无图片')
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

        // 画师详情视图
        if (viewMode === 'artist' && currentArtist) {
            return h('div', { class: 'gallery-container' }, [
                // 面包屑导航
                h(Breadcrumb, {
                    path: categoryPath,
                    onNavigate: handleBreadcrumbNavigate
                }),
                renderArtistDetail()
            ]);
        }

        // 画廊视图
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
                onCategoryDelete: handleDeleteCategory,
                onMove: openMoveDialog
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
     * 渲染移动对话框
     */
    const renderMoveDialog = () => {
        return h(MoveDialog, {
            isOpen: showMoveDialog,
            itemType: moveItemType,
            item: moveItem,
            categories: categories,
            artists: allArtists,
            onClose: () => {
                setShowMoveDialog(false);
                setMoveItem(null);
                setMoveItemType(null);
            },
            onMove: handleMove
        });
    };

    /**
     * 渲染画师详情模态框（已弃用，改用内嵌视图）
     */
    const renderArtistDetailModal = () => {
        // 旧的独立弹窗实现，现在已改用内嵌视图
        return null;
        /*
        return h(ArtistDetailModal, {
            isOpen: showArtistDetail,
            artist: selectedArtist,
            categories: categories,
            allArtists: data?.artists || [],
            onClose: () => {
                setShowArtistDetail(false);
                setSelectedArtist(null);
            },
            onImageDelete: async () => {
                await loadData();
                // 重新加载后更新 selectedArtist
                if (selectedArtist) {
                    const updatedData = await fetch(`/artist_gallery/data?category=${currentCategory}`);
                    const result = await updatedData.json();
                    const updatedArtist = result.artists?.find(a => a.id === selectedArtist.id);
                    if (updatedArtist) {
                        setSelectedArtist(updatedArtist);
                    }
                }
            }
        });
        */
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
            // renderArtistDetailModal(), // 已弃用，改用内嵌视图
            renderMoveDialog(),
        ],
    );
}
