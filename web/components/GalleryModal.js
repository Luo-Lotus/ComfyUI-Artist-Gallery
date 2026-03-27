/**
 * 画廊模态框组件（重构版）
 * 主容器组件，包含所有子组件
 */
import { h } from '../lib/preact.mjs';
import { useState, useEffect, useMemo } from '../lib/hooks.mjs';
import { Storage } from '../utils.js';
import { GalleryHeader } from './GalleryHeader.js';
import { GalleryGrid } from './GalleryGrid.js';
import { Lightbox } from './Lightbox.js';
import { AddArtistDialog } from './AddArtistDialog.js';
import { DeleteConfirmDialog } from './DeleteConfirmDialog.js';
import { useGalleryData } from './hooks/useGalleryData.js';
import { useFilteredArtists } from './hooks/useFilteredArtists.js';

export function GalleryModal({ isOpen, onClose }) {
    // ============ 基础状态 ============
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('name');
    const [sortOrder, setSortOrder] = useState('desc');
    const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
    const [favorites, setFavorites] = useState(Storage.getFavorites());

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
    const { data, loading, error, loadData } = useGalleryData();

    // 自动加载数据
    useEffect(() => {
        if (isOpen && !data) {
            loadData();
        }
    }, [isOpen]);

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
                artists: filteredArtists,
                favorites,
                onFavoriteToggle: handleFavoriteToggle,
                onImageClick: handleImageClick,
                onEdit: openEditDialog,
                onDelete: openDeleteConfirm,
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
        ],
    );
}
