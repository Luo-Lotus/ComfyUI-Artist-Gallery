/**
 * 画廊模态框组件
 * 主容器组件，包含所有子组件
 */
import { Storage, fetchGalleryData } from '../utils.js';
import { GalleryHeader } from './GalleryHeader.js';
import { GalleryGrid } from './GalleryGrid.js';
import { Lightbox } from './Lightbox.js';

export function GalleryModal({ isOpen, onClose }) {
    const { h, useEffect } = self.preactCore;
    const { useState, useEffect: hookUseEffect, useMemo } = self.preactHooks;

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('name');
    const [sortOrder, setSortOrder] = useState('desc');
    const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
    const [favorites, setFavorites] = useState(Storage.getFavorites());
    const [lightbox, setLightbox] = useState({
        open: false,
        artist: null,
        imageIndex: 0,
    });

    // 画师管理相关状态
    const [showAddArtistDialog, setShowAddArtistDialog] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [artistToDelete, setArtistToDelete] = useState(null);
    const [addArtistMode, setAddArtistMode] = useState('single'); // 'single' or 'batch'
    const [editModeArtist, setEditModeArtist] = useState(null); // 编辑模式时的画师对象
    const [newArtistName, setNewArtistName] = useState('');
    const [newArtistDisplayName, setNewArtistDisplayName] = useState('');
    const [batchArtistText, setBatchArtistText] = useState('');

    hookUseEffect(() => {
        if (isOpen && !data) {
            loadData();
        }
    }, [isOpen]);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await fetchGalleryData();
            setData(result);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const filteredArtists = useMemo(() => {
        if (!data) return [];
        let result = [...data.artists];
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter((a) => a.name.toLowerCase().includes(query));
        }
        if (showFavoritesOnly) {
            result = result.filter((a) => favorites.has(a.name));
        }
        result.sort((a, b) => {
            let comparison = 0;
            if (sortBy === 'name') {
                comparison = a.name.localeCompare(b.name, 'zh-CN');
            } else if (sortBy === 'count') {
                comparison = a.imageCount - b.imageCount;
            } else if (sortBy === 'time') {
                const aTime = Math.max(...a.images.map((img) => img.mtime));
                const bTime = Math.max(...b.images.map((img) => img.mtime));
                comparison = aTime - bTime;
            }
            return sortOrder === 'asc' ? comparison : -comparison;
        });
        return result;
    }, [data, searchQuery, sortBy, sortOrder, showFavoritesOnly, favorites]);

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

    // 添加画师
    const handleAddArtist = async () => {
        console.log('handleAddArtist 被调用', {
            addArtistMode,
            editModeArtist,
            newArtistName,
            newArtistDisplayName,
        });

        if (addArtistMode === 'single') {
            // 单个添加或编辑
            if (!newArtistName.trim()) {
                alert('请输入画师名称');
                return;
            }

            try {
                let response;
                if (editModeArtist) {
                    // 编辑模式
                    response = await fetch(`/artist_gallery/artists/${editModeArtist.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            name: newArtistName.trim(),
                            displayName: newArtistDisplayName.trim() || newArtistName.trim(),
                        }),
                    });
                } else {
                    // 添加模式
                    response = await fetch('/artist_gallery/artists', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            name: newArtistName.trim(),
                            displayName: newArtistDisplayName.trim() || newArtistName.trim(),
                        }),
                    });
                }

                const data = await response.json();

                if (data.success) {
                    await loadData();
                    setShowAddArtistDialog(false);
                    setEditModeArtist(null);
                    setNewArtistName('');
                    setNewArtistDisplayName('');
                } else {
                    alert(data.error || '操作失败');
                }
            } catch (error) {
                alert('操作失败: ' + error.message);
            }
        } else {
            // 批量添加
            if (!batchArtistText.trim()) {
                alert('请输入画师名称列表');
                return;
            }

            const lines = batchArtistText
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line);
            const artistsData = lines.map((line) => {
                // 支持格式: "name" 或 "name,displayName"
                const parts = line.split(',');
                return {
                    name: parts[0].trim(),
                    displayName: parts[1]?.trim() || parts[0].trim(),
                };
            });

            try {
                const response = await fetch('/artist_gallery/artists/batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ artists: artistsData }),
                });

                const data = await response.json();

                if (data.success) {
                    alert(
                        `成功添加 ${data.addedCount} 个画师${data.failedCount > 0 ? `，失败 ${data.failedCount} 个` : ''}`,
                    );
                    await loadData();
                    setShowAddArtistDialog(false);
                    setBatchArtistText('');
                } else {
                    alert(data.error || '添加失败');
                }
            } catch (error) {
                alert('添加失败: ' + error.message);
            }
        }
    };

    // 打开添加/编辑对话框
    const openAddDialog = (mode = 'add') => {
        if (mode === 'edit') {
            // 编辑模式
            setEditModeArtist(artistToEdit);
            setNewArtistName(artistToEdit.name);
            setNewArtistDisplayName(artistToEdit.displayName || '');
            setAddArtistMode('single');
        } else {
            // 添加模式
            setEditModeArtist(null);
            setNewArtistName('');
            setNewArtistDisplayName('');
        }
        setShowAddArtistDialog(true);
    };

    // 打开编辑对话框
    const openEditDialog = (artist) => {
        setEditModeArtist(artist);
        setNewArtistName(artist.name);
        setNewArtistDisplayName(artist.displayName || '');
        setAddArtistMode('single');
        setShowAddArtistDialog(true);
    };

    // 删除画师
    const handleDeleteArtist = async () => {
        if (!artistToDelete) return;

        try {
            const response = await fetch(
                `/artist_gallery/artists/${artistToDelete.id}`,
                {
                    method: 'DELETE',
                },
            );

            const data = await response.json();

            if (data.success) {
                alert(data.message || '删除成功');
                await loadData();
                setShowDeleteConfirm(false);
                setArtistToDelete(null);
            } else {
                alert(data.error || '删除失败');
            }
        } catch (error) {
            alert('删除失败: ' + error.message);
        }
    };

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
        h(
            'div',
            { class: 'gallery-modal-content' },
            h(
                'div',
                { class: 'gallery-modal-header' },
                h('div', { class: 'gallery-modal-title' }, '🎨 画师图库'),
                h(
                    'button',
                    {
                        class: 'gallery-modal-btn',
                        onClick: () => {
                            console.log('添加画师按钮被点击');
                            setShowAddArtistDialog(true);
                        },
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
            ),
            h(
                'div',
                { class: 'gallery-modal-body' },
                loading
                    ? h(
                          'div',
                          { class: 'gallery-loading' },
                          h('div', { class: 'gallery-loading-spinner' }),
                          h('div', {}, '正在加载图库...'),
                      )
                    : error
                      ? h(
                            'div',
                            { class: 'gallery-error' },
                            h('div', { class: 'gallery-error-icon' }, '⚠️'),
                            h('div', {}, '加载图库失败'),
                            h('div', { class: 'gallery-error-message' }, error),
                        )
                      : h(
                            'div',
                            { class: 'gallery-container' },
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
                                    setSortOrder((prev) =>
                                        prev === 'asc' ? 'desc' : 'asc',
                                    ),
                                onFavoriteToggle: () =>
                                    setShowFavoritesOnly((prev) => !prev),
                            }),
                            h(GalleryGrid, {
                                artists: filteredArtists,
                                favorites,
                                onFavoriteToggle: handleFavoriteToggle,
                                onImageClick: handleImageClick,
                                onEdit: openEditDialog,
                                onDelete: (artist) => {
                                    setArtistToDelete(artist);
                                    setShowDeleteConfirm(true);
                                },
                            }),
                        ),
            ),
        ),
        h(Lightbox, {
            isOpen: lightbox.open,
            artist: lightbox.artist,
            imageIndex: lightbox.imageIndex,
            onClose: () =>
                setLightbox({ open: false, artist: null, imageIndex: 0 }),
            onNavigate: handleLightboxNavigate,
        }),

        // 添加画师对话框
        showAddArtistDialog &&
            h(
                'div',
                {
                    class: 'gallery-modal-overlay open',
                    style: { zIndex: 20000 },
                    onClick: (e) => {
                        if (
                            e.target.classList.contains('gallery-modal-overlay')
                        ) {
                            setShowAddArtistDialog(false);
                        }
                    },
                },
                h(
                    'div',
                    {
                        class: 'gallery-modal-content',
                        style: {
                            maxWidth: '500px',
                            maxHeight: '80vh',
                            width: '100%',
                            overflow: 'auto',
                            display: 'flex',
                            flexDirection: 'column',
                        },
                        onClick: (e) => e.stopPropagation(),
                    },
                    h(
                        'div',
                        { class: 'gallery-modal-header' },
                        h(
                            'div',
                            { class: 'gallery-modal-title' },
                            editModeArtist ? '✏️ 编辑画师' : '➕ 添加画师',
                        ),
                        h(
                            'button',
                            {
                                class: 'gallery-modal-btn primary',
                                onClick: () => {
                                    setShowAddArtistDialog(false);
                                    setEditModeArtist(null);
                                },
                            },
                            '✕',
                        ),
                    ),
                    h(
                        'div',
                        { class: 'gallery-modal-body' },
                        // 模式切换（仅在添加模式显示）
                        !editModeArtist && h(
                            'div',
                            { class: 'gallery-dialog-tabs' },
                            h(
                                'button',
                                {
                                    class: `gallery-modal-btn ${addArtistMode === 'single' ? 'primary' : ''} gallery-dialog-tab`,
                                    onClick: () => setAddArtistMode('single'),
                                },
                                '单个添加',
                            ),
                            h(
                                'button',
                                {
                                    class: `gallery-modal-btn ${addArtistMode === 'batch' ? 'primary' : ''} gallery-dialog-tab`,
                                    onClick: () => setAddArtistMode('batch'),
                                },
                                '批量添加',
                            ),
                        ),

                        // 单个添加表单
                        addArtistMode === 'single'
                            ? h(
                                  'div',
                                  { class: 'gallery-form-group' },
                                  h(
                                      'div',
                                      { class: 'gallery-form-item' },
                                      h(
                                          'label',
                                          { class: 'gallery-form-label' },
                                          '画师名称（唯一标识）',
                                      ),
                                      h('input', {
                                          type: 'text',
                                          value: newArtistName,
                                          onInput: (e) =>
                                              setNewArtistName(e.target.value),
                                          placeholder: '如: artist1',
                                          class: 'gallery-form-input',
                                      }),
                                  ),
                                  h(
                                      'div',
                                      { class: 'gallery-form-item' },
                                      h(
                                          'label',
                                          { class: 'gallery-form-label' },
                                          '显示名称（可选）',
                                      ),
                                      h('input', {
                                          type: 'text',
                                          value: newArtistDisplayName,
                                          onInput: (e) =>
                                              setNewArtistDisplayName(
                                                  e.target.value,
                                              ),
                                          placeholder: '如: 艺术家一',
                                          class: 'gallery-form-input',
                                      }),
                                  ),
                              )
                            : h(
                                  'div',
                                  { class: 'gallery-form-item' },
                                  h(
                                      'label',
                                      { class: 'gallery-form-label' },
                                      '画师列表（每行一个，格式: 名称,显示名称 或仅名称）',
                                  ),
                                  h('textarea', {
                                      value: batchArtistText,
                                      onInput: (e) =>
                                          setBatchArtistText(e.target.value),
                                      placeholder:
                                          'artist1,艺术家一\nartist2,Artist Two\nartist3',
                                      rows: 10,
                                      class: 'gallery-form-textarea',
                                  }),
                              ),

                        // 按钮
                        h(
                            'div',
                            { class: 'gallery-dialog-actions' },
                            h(
                                'button',
                                {
                                    class: 'gallery-modal-btn',
                                    onClick: () =>
                                        setShowAddArtistDialog(false),
                                },
                                '取消',
                            ),
                            h(
                                'button',
                                {
                                    class: 'gallery-modal-btn primary',
                                    onClick: handleAddArtist,
                                },
                                editModeArtist ? '保存' : '确定',
                            ),
                        ),
                    ),
                ),
            ),

        // 删除确认对话框
        showDeleteConfirm &&
            artistToDelete &&
            h(
                'div',
                {
                    class: 'gallery-modal-overlay open',
                    style: { zIndex: 20001 },
                    onClick: (e) => {
                        if (
                            e.target.classList.contains('gallery-modal-overlay')
                        ) {
                            setShowDeleteConfirm(false);
                            setArtistToDelete(null);
                        }
                    },
                },
                h(
                    'div',
                    {
                        class: 'gallery-modal-content',
                        style: {
                            maxWidth: '400px',
                            width: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                        },
                        onClick: (e) => e.stopPropagation(),
                    },
                    h(
                        'div',
                        { class: 'gallery-modal-header' },
                        h(
                            'div',
                            { class: 'gallery-modal-title' },
                            '⚠️ 确认删除',
                        ),
                    ),
                    h(
                        'div',
                        { class: 'gallery-modal-body' },
                        h(
                            'p',
                            { class: 'gallery-delete-message' },
                            `确定要删除画师 "${artistToDelete.displayName}" 吗？`,
                        ),
                        h(
                            'p',
                            { class: 'gallery-delete-warning' },
                            `这将同时删除该画师关联的 ${artistToDelete.imageCount} 张图片。`,
                        ),
                        h(
                            'div',
                            { class: 'gallery-dialog-actions' },
                            h(
                                'button',
                                {
                                    class: 'gallery-modal-btn',
                                    onClick: () => {
                                        setShowDeleteConfirm(false);
                                        setArtistToDelete(null);
                                    },
                                },
                                '取消',
                            ),
                            h(
                                'button',
                                {
                                    class: 'gallery-modal-btn danger',
                                    onClick: handleDeleteArtist,
                                },
                                '确认删除',
                            ),
                        ),
                    ),
                ),
            ),
    );
}
