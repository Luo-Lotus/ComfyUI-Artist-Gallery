/**
 * 画廊模态框组件（重构版）
 * 主容器组件，包含所有子组件
 */
import { h } from '../lib/preact.mjs';
import { useState, useEffect, useMemo } from '../lib/hooks.mjs';
import {
    Storage,
    fetchCategories,
    fetchAllArtists,
    buildBreadcrumbPath,
    addCategory,
    updateCategory,
    deleteCategory,
    buildImageUrl,
} from '../utils.js';
import { GalleryGrid } from './GalleryGrid.js';
import { Lightbox } from './Lightbox.js';
import { AddArtistDialog } from './AddArtistDialog.js';
import { DeleteConfirmDialog } from './DeleteConfirmDialog.js';
import { CategoryDialog } from './CategoryDialog.js';
import { ArtistDetailModal } from './ArtistDetailModal.js';
import { Breadcrumb } from './Breadcrumb.js';
import { MoveDialog } from './MoveDialog.js';
import { CopyDialog } from './CopyDialog.js';
import { ImportImagesDialog } from './ImportImagesDialog.js';
import { BatchActionBar } from './BatchActionBar.js';
import { BatchConfirmDialog } from './BatchConfirmDialog.js';
import { useGalleryData } from './hooks/useGalleryData.js';
import { useFilteredArtists } from './hooks/useFilteredArtists.js';
import { useContextMenu } from './ContextMenu.js';
import { showToast } from './Toast.js';
import { computeSizeVars } from './SizePresets.js';

export function GalleryModal({ isOpen, onClose }) {
    // 获取右键菜单 hook
    const { showContextMenu } = useContextMenu();
    // ============ 基础状态 ============
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('name');
    const [sortOrder, setSortOrder] = useState('desc');
    const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
    const [favorites, setFavorites] = useState(Storage.getFavorites());
    const [cardSize, setCardSize] = useState(() => Storage.getCardSize());

    // 计算卡片大小 CSS 变量（通过 Preact style 绑定，避免 DOM 重建后丢失）
    const cardSizeVars = computeSizeVars(cardSize);

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
    const [showCopyDialog, setShowCopyDialog] = useState(false);
    const [copyItem, setCopyItem] = useState(null);
    const [copyItemType, setCopyItemType] = useState(null);
    const [showImportDialog, setShowImportDialog] = useState(false);

    // ============ 多选状态 ============
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedItems, setSelectedItems] = useState(new Set());
    const [showBatchConfirm, setShowBatchConfirm] = useState(false);
    const [batchOperation, setBatchOperation] = useState(null); // 'delete' | 'move' | 'copy'

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
                        type: 'artist',
                    },
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
        // 使用组合键查找画师（categoryId + name）
        const currentArtistIndex = filteredArtists.findIndex(
            (a) =>
                a.categoryId === lightbox.artist.categoryId &&
                a.name === lightbox.artist.name,
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

    // ============ 复制功能 ============

    const openCopyDialog = (item, type) => {
        setCopyItem(item);
        setCopyItemType(type);
        setShowCopyDialog(true);
    };

    const handleCopy = async (item, target, newName) => {
        try {
            let response;
            // 批量复制
            if (batchOperation === 'copy') {
                const details = getSelectedDetails();
                const allItems = [
                    ...details.artists.map(a => ({ type: 'artist', item: a })),
                    ...details.images.map(i => ({ type: 'image', item: i })),
                ];
                if (allItems.length === 0) return;

                let failCount = 0;
                for (const { type, item: it } of allItems) {
                    try {
                        let res;
                        if (type === 'artist') {
                            res = await fetch(
                                `/artist_gallery/artists/${encodeURIComponent(it.categoryId)}/${encodeURIComponent(it.name)}/copy`,
                                {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        targetCategoryId: target.id,
                                        newName: undefined,
                                    }),
                                },
                            );
                        } else if (type === 'image') {
                            res = await fetch('/artist_gallery/image/copy', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    imagePath: it.path,
                                    toArtistName: target.name,
                                    toCategoryId: target.categoryId || 'root',
                                }),
                            });
                        }
                        const data = await res.json();
                        if (!res.ok || !data.success) failCount++;
                    } catch { failCount++; }
                }

                setShowCopyDialog(false);
                setCopyItem(null);
                setCopyItemType(null);
                setBatchOperation(null);
                setSelectionMode(false);
                setSelectedItems(new Set());
                await loadData();

                const catResult = await fetchCategories();
                setCategories(catResult.categories || []);
                const artistsData = await fetchAllArtists();
                setAllArtists(artistsData.artists || []);

                if (failCount > 0) {
                    showToast(`${allItems.length - failCount}项复制成功，${failCount}项失败`, 'warning');
                } else {
                    showToast(`已复制 ${allItems.length} 项`, 'success');
                }
                return;
            }

            // 单条操作（右键菜单）
            if (copyItemType === 'artist') {
                response = await fetch(
                    `/artist_gallery/artists/${encodeURIComponent(item.categoryId)}/${encodeURIComponent(item.name)}/copy`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            targetCategoryId: target.id,
                            newName: newName || undefined,
                        }),
                    },
                );
            } else if (copyItemType === 'image') {
                response = await fetch('/artist_gallery/image/copy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        imagePath: item.path,
                        toArtistName: target.name,
                        toCategoryId: target.categoryId || 'root',
                    }),
                });
            }

            const data = await response.json();

            if (response.ok && data.success) {
                setShowCopyDialog(false);
                setCopyItem(null);
                setCopyItemType(null);

                // 重新加载数据
                await loadData();

                // 重新加载分类和所有画师
                const catResult = await fetchCategories();
                setCategories(catResult.categories || []);

                const artistsData = await fetchAllArtists();
                setAllArtists(artistsData.artists || []);

                return data;
            } else {
                throw new Error(data.error || '复制失败');
            }
        } catch (error) {
            throw error;
        }
    };

    const handleMove = async (item, target) => {
        try {
            let response;
            // 批量移动
            if (batchOperation === 'move') {
                const details = getSelectedDetails();
                const allItems = [
                    ...details.categories.map(c => ({ type: 'category', item: c })),
                    ...details.artists.map(a => ({ type: 'artist', item: a })),
                    ...details.images.map(i => ({ type: 'image', item: i })),
                ];
                if (allItems.length === 0) return;

                let failCount = 0;
                for (const { type, item: it } of allItems) {
                    try {
                        let res;
                        if (type === 'category') {
                            res = await fetch(
                                `/artist_gallery/categories/${it.id}/move`,
                                {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ newParentId: target.id }),
                                },
                            );
                        } else if (type === 'artist') {
                            res = await fetch(
                                `/artist_gallery/artists/${encodeURIComponent(it.categoryId)}/${encodeURIComponent(it.name)}`,
                                {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ categoryId: target.id }),
                                },
                            );
                        } else if (type === 'image') {
                            res = await fetch('/artist_gallery/image/move', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    imagePath: it.path,
                                    fromArtistName: currentArtist.name,
                                    toArtistName: target.name,
                                    toCategoryId: target.categoryId || 'root',
                                }),
                            });
                        }
                        const data = await res.json();
                        if (!res.ok || !data.success) failCount++;
                    } catch { failCount++; }
                }

                setShowMoveDialog(false);
                setMoveItem(null);
                setMoveItemType(null);
                setBatchOperation(null);
                setSelectionMode(false);
                setSelectedItems(new Set());
                await loadData();

                const catResult = await fetchCategories();
                setCategories(catResult.categories || []);
                const artistsData = await fetchAllArtists();
                setAllArtists(artistsData.artists || []);

                if (failCount > 0) {
                    showToast(`${allItems.length - failCount}项移动成功，${failCount}项失败`, 'warning');
                } else {
                    showToast(`已移动 ${allItems.length} 项`, 'success');
                }
                if (currentArtist) {
                    const updatedData = await fetch(`/artist_gallery/data?category=${currentCategory}`);
                    const result = await updatedData.json();
                    const updatedArtist = result.artists?.find(
                        a => a.categoryId === currentArtist.categoryId && a.name === currentArtist.name
                    );
                    if (updatedArtist) setCurrentArtist(updatedArtist);
                }
                return;
            }

            // 单条操作（右键菜单）
            if (moveItemType === 'category') {
                response = await fetch(
                    `/artist_gallery/categories/${item.id}/move`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ newParentId: target.id }),
                    },
                );
            } else if (moveItemType === 'artist') {
                // 使用组合键移动画师（需要更新 categoryId）
                response = await fetch(
                    `/artist_gallery/artists/${encodeURIComponent(item.categoryId)}/${encodeURIComponent(item.name)}`,
                    {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ categoryId: target.id }),
                    },
                );
            } else if (moveItemType === 'image') {
                // 单张图片移动（右键菜单）
                response = await fetch('/artist_gallery/image/move', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        imagePath: item.path,
                        fromArtistName: currentArtist.name,
                        toArtistName: target.name,
                        toCategoryId: target.categoryId || 'root',
                    }),
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
                    const updatedData = await fetch(
                        `/artist_gallery/data?category=${currentCategory}`,
                    );
                    const result = await updatedData.json();
                    // 使用组合键查找画师
                    const updatedArtist = result.artists?.find(
                        (a) =>
                            a.categoryId === currentArtist.categoryId &&
                            a.name === currentArtist.name,
                    );
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
        const currentCat = flatCategories.find((c) => c.id === currentCategory);
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

    // ============ 多选功能处理 ============

    const handleToggleSelectionMode = () => {
        setSelectionMode(prev => !prev);
        if (selectionMode) {
            // 退出多选模式时清空选择
            setSelectedItems(new Set());
        }
    };

    const handleSelectItem = (itemOrKey) => {
        // 支持两种格式：字符串键 或 { id, type, data } 对象
        const key = typeof itemOrKey === 'string' ? itemOrKey : itemOrKey.id;
        setSelectedItems(prev => {
            const newSet = new Set(prev);
            if (newSet.has(key)) {
                newSet.delete(key);
            } else {
                newSet.add(key);
            }
            return newSet;
        });
    };

    const handleSelectAll = () => {
        const newSet = new Set();
        // 添加当前视图的所有分类和画师
        categories.forEach(cat => {
            newSet.add(`category:${cat.id}`);
        });
        filteredArtists.forEach(artist => {
            newSet.add(`artist:${artist.categoryId}:${artist.name}`);
        });
        setSelectedItems(newSet);
    };

    const handleDeselectAll = () => {
        setSelectedItems(new Set());
    };

    const getSelectionType = () => {
        const items = Array.from(selectedItems);
        const types = new Set(items.map(key => key.split(':')[0]));

        const typeCount = ['artist', 'category', 'image'].filter(t => types.has(t)).length;
        if (typeCount > 1) return 'mixed';
        if (types.has('image')) return 'image';
        if (types.has('artist')) return 'artist';
        if (types.has('category')) return 'category';
        return 'empty';
    };

    const getSelectedDetails = () => {
        const items = Array.from(selectedItems);
        const result = {
            categories: [],
            artists: [],
            images: [], // 改为数组，存储选中的图片对象
        };

        items.forEach(key => {
            const parts = key.split(':');
            const type = parts[0];
            const id = parts.slice(1).join(':'); // 处理artist:categoryId:name的情况

            if (type === 'category') {
                const cat = categories.find(c => c.id === id);
                if (cat) result.categories.push(cat);
            } else if (type === 'artist') {
                const artist = filteredArtists.find(a => `${a.categoryId}:${a.name}` === id);
                if (artist) {
                    result.artists.push(artist);
                }
            } else if (type === 'image') {
                // id 就是图片路径
                if (currentArtist && currentArtist.images) {
                    const img = currentArtist.images.find(i => i.path === id);
                    if (img) result.images.push(img);
                }
            }
        });

        return result;
    };

    const handleBatchDelete = () => {
        const details = getSelectedDetails();
        if (details.categories.length === 0 && details.artists.length === 0 && details.images.length === 0) return;

        setBatchOperation('delete');
        setShowBatchConfirm(true);
    };

    const handleBatchMove = () => {
        const details = getSelectedDetails();
        if (details.categories.length === 0 && details.artists.length === 0 && details.images.length === 0) return;

        setBatchOperation('move');
        if (details.images.length > 0) {
            setMoveItemType('image');
            setMoveItem(details.images[0]);
        } else if (details.categories.length > 0) {
            setMoveItemType('category');
            setMoveItem(details.categories[0]);
        } else {
            setMoveItemType('artist');
            setMoveItem(details.artists[0]);
        }
        setShowMoveDialog(true);
    };

    const handleBatchCopy = () => {
        const details = getSelectedDetails();
        if (details.artists.length === 0 && details.images.length === 0) return;

        setBatchOperation('copy');
        if (details.images.length > 0) {
            setCopyItemType('image');
            setCopyItem(details.images[0]);
        } else {
            setCopyItemType('artist');
            setCopyItem(details.artists[0]);
        }
        setShowCopyDialog(true);
    };

    const handleBatchConfirm = async () => {
        const details = getSelectedDetails();
        const operation = batchOperation;

        if (!operation) return;

        try {
            let response;

            if (operation === 'delete') {
                // 批量删除图片
                if (details.images.length > 0) {
                    // 逐个删除图片
                    for (const img of details.images) {
                        await fetch('/artist_gallery/image', {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                imagePath: img.path,
                            }),
                        });
                    }
                    showToast(`成功删除 ${details.images.length} 张图片`, 'success');
                    setShowBatchConfirm(false);
                    setSelectionMode(false);
                    setSelectedItems(new Set());
                    await loadData();
                    // 更新当前画师数据
                    if (currentArtist) {
                        const updatedData = await fetch(`/artist_gallery/data?category=${currentCategory}`);
                        const result = await updatedData.json();
                        const updatedArtist = result.artists?.find(
                            a => a.categoryId === currentArtist.categoryId && a.name === currentArtist.name
                        );
                        if (updatedArtist) {
                            setCurrentArtist(updatedArtist);
                        }
                    }
                    return;
                }
                // 批量删除分类和画师
                response = await fetch('/artist_gallery/batch/delete', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        categories: details.categories.map(c => c.id),
                        artists: details.artists.map(a => ({
                            categoryId: a.categoryId,
                            name: a.name
                        }))
                    })
                });
            } else if (operation === 'move') {
                // 批量移动（暂时使用现有的单次移动，循环调用）
                // TODO: 实现真正的批量API
                console.log('批量移动:', details);
                setShowBatchConfirm(false);
                return;
            } else if (operation === 'copy') {
                // 批量复制（暂时使用现有的单次复制，循环调用）
                // TODO: 实现真正的批量API
                console.log('批量复制:', details);
                setShowBatchConfirm(false);
                return;
            }

            const data = await response.json();

            if (data.success) {
                showToast(`批量${operation === 'delete' ? '删除' : operation}成功`, 'success');
                setShowBatchConfirm(false);
                setSelectionMode(false);
                setSelectedItems(new Set());
                await loadData();
            } else {
                showToast(`批量${operation}失败: ${data.error}`, 'error');
            }
        } catch (error) {
            console.error('批量操作失败:', error);
            showToast(`批量${operation}失败: ${error.message}`, 'error');
        }
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
            // 导入按钮（在分类视图或画师详情视图都显示）
            h(
                'button',
                {
                    class: 'gallery-modal-btn',
                    onClick: () => setShowImportDialog(true),
                },
                '📥 导入图片',
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
                    class: 'gallery-modal-btn',
                    onClick: handleToggleSelectionMode,
                    title: selectionMode ? '退出多选模式' : '批量操作',
                },
                selectionMode ? '📋 已选' : '📋 批量操作',
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

        const hasImages =
            currentArtist.images && currentArtist.images.length > 0;

        // 图片右键菜单处理
        const handleImageContextMenu = (e, image) => {
            e.preventDefault();
            e.stopPropagation();

            const menuItems = [
                {
                    icon: '🔍',
                    label: '查看大图',
                    action: () =>
                        handleImageClick(
                            filteredArtists.findIndex(
                                (a) =>
                                    a.categoryId === currentArtist.categoryId &&
                                    a.name === currentArtist.name,
                            ),
                            currentArtist.images.indexOf(image),
                        ),
                },
                {
                    icon: '📦',
                    label: '移动图片',
                    action: () => {
                        setMoveItem(image);
                        setMoveItemType('image');
                        setShowMoveDialog(true);
                    },
                },
                {
                    icon: '📄',
                    label: '复制图片',
                    action: () => {
                        setMoveItem(image);
                        setMoveItemType('image');
                        setShowMoveDialog(true);
                    },
                },
                {
                    icon: '🗑️',
                    label: '删除图片',
                    action: async () => {
                        if (!confirm(`确定要删除这张图片吗？`)) return;

                        try {
                            // 删除图片 API 仍使用 artistId（需要更新后端 API）
                            const response = await fetch(
                                `/artist_gallery/image`,
                                {
                                    method: 'DELETE',
                                    headers: {
                                        'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify({
                                        imagePath: image.path,
                                        artistId: currentArtist.id, // 注意：迁移后需要改用 name
                                    }),
                                },
                            );

                            if (response.ok) {
                                await loadData();
                                // 更新当前画师数据
                                const updatedData = await fetch(
                                    `/artist_gallery/data?category=${currentCategory}`,
                                );
                                const result = await updatedData.json();
                                const updatedArtist = result.artists?.find(
                                    (a) =>
                                        a.categoryId ===
                                            currentArtist.categoryId &&
                                        a.name === currentArtist.name,
                                );
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
                    },
                },
            ];

            showContextMenu(e, menuItems);
        };

        return h('div', { class: 'artist-detail-view' }, [
            // 多选模式下的批量操作工具栏
            selectionMode && h(BatchActionBar, {
                selectedCount: selectedItems.size,
                selectionType: getSelectionType(),
                onSelectAll: () => {
                    const newSet = new Set();
                    currentArtist.images.forEach(img => {
                        newSet.add(`image:${img.path}`);
                    });
                    setSelectedItems(newSet);
                },
                onDeselectAll: handleDeselectAll,
                onMove: handleBatchMove,
                onCopy: handleBatchCopy,
                onDelete: handleBatchDelete,
                onExit: handleToggleSelectionMode,
            }),

            // 图片网格
            hasImages
                ? h(
                      'div',
                      { class: 'artist-detail-grid' },
                      currentArtist.images.map((img, index) => {
                          const imgKey = `image:${img.path}`;
                          const isSelected = selectedItems.has(imgKey);
                          return h(
                              'div',
                              {
                                  key: img.path,
                                  class: `artist-detail-image-item ${selectionMode ? 'selection-mode' : ''} ${isSelected ? 'selected' : ''}`,
                                  onClick: () => {
                                      if (selectionMode) {
                                          // 多选模式：切换选中状态
                                          setSelectedItems(prev => {
                                              const newSet = new Set(prev);
                                              if (newSet.has(imgKey)) {
                                                  newSet.delete(imgKey);
                                              } else {
                                                  newSet.add(imgKey);
                                              }
                                              return newSet;
                                          });
                                      } else {
                                          // 普通模式：打开灯箱
                                          handleImageClick(
                                              filteredArtists.findIndex(
                                                  (a) =>
                                                      a.categoryId ===
                                                          currentArtist.categoryId &&
                                                      a.name === currentArtist.name,
                                              ),
                                              index,
                                          );
                                      }
                                  },
                                  onContextMenu: (e) =>
                                      handleImageContextMenu(e, img),
                              },
                              [
                                  h('img', {
                                      src: buildImageUrl(img.path),
                                      alt: `${currentArtist.name} - ${index + 1}`,
                                      loading: 'lazy',
                                  }),
                              ],
                          );
                      }),
                  )
                : h('div', { class: 'artist-detail-empty' }, '🎨 暂无图片'),
        ]);
    };

    /**
     * 渲染主要内容区
     */
    const renderBody = () => {
        // 加载中 — 只替换内容区，头部保持可见
        if (loading) {
            return h('div', { class: 'gallery-container' }, [
                renderMergedHeader(),
                renderLoading(),
            ]);
        }

        if (error) {
            return h('div', { class: 'gallery-container' }, [
                renderMergedHeader(),
                renderError(),
            ]);
        }

        // 画师详情视图
        if (viewMode === 'artist' && currentArtist) {
            return h('div', { class: 'gallery-container' }, [
                renderMergedHeader(),
                renderArtistDetail(),
            ]);
        }

        // 画廊视图
        return h('div', { class: 'gallery-container' }, [
            renderMergedHeader(),

            // 批量操作工具栏（多选模式下显示）
            selectionMode && h(BatchActionBar, {
                selectedCount: selectedItems.size,
                selectionType: getSelectionType(),
                onSelectAll: handleSelectAll,
                onDeselectAll: handleDeselectAll,
                onMove: handleBatchMove,
                onCopy: handleBatchCopy,
                onDelete: handleBatchDelete,
                onExit: handleToggleSelectionMode,
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
                onMove: openMoveDialog,
                onCopy: openCopyDialog,
                // 多选相关props
                selectionMode,
                selectedItems,
                onSelect: handleSelectItem,
            }),
        ]);
    };

    /**
     * 渲染合并的面包屑和筛选栏
     */
    const renderMergedHeader = () => {
        return h('div', { class: 'gallery-merged-header' }, [
            // 左侧：面包屑导航
            h('div', { class: 'gallery-breadcrumb-section' }, [
                h(Breadcrumb, {
                    path: categoryPath,
                    onNavigate: handleBreadcrumbNavigate,
                }),
            ]),

            // 右侧：筛选和排序控件
            h('div', { class: 'gallery-filter-section' }, [
                // 搜索框
                h('input', {
                    class: 'gallery-search-input',
                    type: 'text',
                    placeholder: '搜索画师...',
                    value: searchQuery,
                    onInput: (e) => setSearchQuery(e.target.value),
                }),

                // 收藏筛选按钮
                h(
                    'button',
                    {
                        class: `gallery-filter-btn ${showFavoritesOnly ? 'active' : ''}`,
                        onClick: () => setShowFavoritesOnly((prev) => !prev),
                        title: '只显示收藏',
                    },
                    '⭐',
                ),

                // 排序选择
                h(
                    'select',
                    {
                        class: 'gallery-filter-select',
                        value: sortBy,
                        onChange: (e) => setSortBy(e.target.value),
                    },
                    [
                        h('option', { value: 'name' }, '名称'),
                        h('option', { value: 'created_at' }, '创建时间'),
                        h('option', { value: 'image_count' }, '图片数量'),
                    ],
                ),

                // 排序顺序按钮
                h(
                    'button',
                    {
                        class: 'gallery-filter-btn',
                        onClick: () =>
                            setSortOrder((prev) =>
                                prev === 'asc' ? 'desc' : 'asc',
                            ),
                        title: sortOrder === 'asc' ? '升序' : '降序',
                    },
                    sortOrder === 'asc' ? '↑' : '↓',
                ),

                // 计数显示
                h(
                    'span',
                    { class: 'gallery-count-badge' },
                    `${filteredArtists.length}/${data?.totalCount || 0}`,
                ),

                // 卡片大小滑块
                h('div', { class: 'gallery-size-slider' }, [
                    h('span', { class: 'gallery-size-label' }, '◡'),
                    h('input', {
                        type: 'range',
                        min: '0.5',
                        max: '1.5',
                        step: '0.05',
                        value: cardSize,
                        onInput: (e) => {
                            const val = parseFloat(e.target.value);
                            setCardSize(val);
                            Storage.saveCardSize(val);
                        },
                        title: '调节卡片大小',
                    }),
                    h('span', { class: 'gallery-size-label' }, '◠'),
                ]),
            ]),
        ]);
    };
    const renderModal = () => {
        return h('div', { class: 'gallery-modal-content', style: cardSizeVars }, [
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
            onSave: handleCategoryDialogSave,
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
            onMove: handleMove,
        });
    };

    const renderCopyDialog = () => {
        return h(CopyDialog, {
            isOpen: showCopyDialog,
            itemType: copyItemType,
            item: copyItem,
            categories: categories,
            artists: allArtists,
            onClose: () => {
                setShowCopyDialog(false);
                setCopyItem(null);
                setCopyItemType(null);
            },
            onCopy: handleCopy,
        });
    };

    /**
     * 渲染导入图片对话框
     */
    const renderImportDialog = () => {
        return h(ImportImagesDialog, {
            isOpen: showImportDialog,
            viewMode: viewMode,
            currentCategory: currentCategory,
            currentArtist: currentArtist,
            categories: categories,
            onClose: () => setShowImportDialog(false),
            onSuccess: async () => {
                await loadData();
                setShowImportDialog(false);
            },
        });
    };

    /**
     * 渲染批量操作确认对话框
     */
    const renderBatchConfirmDialog = () => {
        const details = getSelectedDetails();
        return h(BatchConfirmDialog, {
            isOpen: showBatchConfirm,
            onClose: () => setShowBatchConfirm(false),
            operation: batchOperation,
            items: details,
            onConfirm: handleBatchConfirm,
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
                if (e.target.classList.contains('gallery-modal-overlay'))
                    onClose();
            },
        },
        [
            renderModal(),
            renderLightbox(),
            renderAddDialog(),
            renderDeleteDialog(),
            renderCategoryDialog(),
            // renderArtistDetailModal(), // 已弃用，改用内嵌视图
            renderImportDialog(),
            renderMoveDialog(),
            renderCopyDialog(),
            renderBatchConfirmDialog(),
        ],
    );
}
