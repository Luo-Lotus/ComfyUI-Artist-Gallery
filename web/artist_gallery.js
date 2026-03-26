/**
 * Artist Gallery Extension
 * 使用 Preact 构建的悬浮可拖动图库按钮
 * 单文件版本，兼容 ComfyUI 扩展加载器
 */

import { app } from '../../scripts/app.js';

// ============ 加载 Preact 库和 Hooks ============
const preactBase = new URL('./lib/', import.meta.url).href;

// 动态导入 Preact 和 hooks
const { h, render, createElement } = await import(
    new URL('./lib/preact.mjs', import.meta.url).href
);
const { useState, useEffect, useCallback, useMemo, useRef } = await import(
    new URL('./lib/hooks.mjs', import.meta.url).href
);

// 将 hooks 挂载到全局以便组件使用
self.preactHooks = { useState, useEffect, useCallback, useMemo, useRef };
self.preactCore = { h, render, createElement };

// ============ 加载样式 ============
const styleLink = document.createElement('link');
styleLink.rel = 'stylesheet';
styleLink.href = new URL('./styles/gallery.css', import.meta.url);
document.head.appendChild(styleLink);

// ============ 工具函数 ============
const Storage = {
    getButtonPosition() {
        try {
            const saved = localStorage.getItem('artist-gallery-btn-pos');
            return saved ? JSON.parse(saved) : null;
        } catch (e) {
            console.error('Failed to load button position:', e);
            return null;
        }
    },
    saveButtonPosition(left, top) {
        localStorage.setItem(
            'artist-gallery-btn-pos',
            JSON.stringify({ left, top }),
        );
    },
    getFavorites() {
        try {
            const saved = localStorage.getItem('artist-favorites');
            return saved ? new Set(JSON.parse(saved)) : new Set();
        } catch {
            return new Set();
        }
    },
    saveFavorites(favorites) {
        localStorage.setItem(
            'artist-favorites',
            JSON.stringify([...favorites]),
        );
    },
    toggleFavorite(artistName, favorites) {
        if (favorites.has(artistName)) {
            favorites.delete(artistName);
        } else {
            favorites.add(artistName);
        }
        this.saveFavorites(favorites);
        return favorites;
    },
};

function buildImageUrl(path) {
    const parts = path.split(/[/\\]/);
    const filename = parts[parts.length - 1];
    const subfolder = parts.slice(0, -1).join('/');
    const params = new URLSearchParams({ filename });
    if (subfolder) {
        params.append('subfolder', subfolder);
    }
    return `/view?${params.toString()}`;
}

async function fetchGalleryData() {
    const response = await fetch('/artist_gallery/data');
    const data = await response.json();
    if (data.error) {
        throw new Error(data.error);
    }
    return data;
}

// ============ Preact 组件 ============
function GalleryHeader({
    totalCount,
    currentCount,
    searchQuery,
    sortBy,
    sortOrder,
    showFavoritesOnly,
    onSearchChange,
    onSortChange,
    onOrderChange,
    onFavoriteToggle,
}) {
    const { h } = self.preactCore;
    return h(
        'div',
        { class: 'gallery-header' },
        h(
            'div',
            { class: 'gallery-search' },
            h('input', {
                type: 'text',
                placeholder: '搜索画师...',
                value: searchQuery,
                onInput: (e) => onSearchChange(e.target.value),
            }),
        ),
        h(
            'button',
            {
                class: `gallery-btn ${showFavoritesOnly ? 'active' : ''}`,
                onClick: onFavoriteToggle,
            },
            showFavoritesOnly ? '⭐ 全部' : '☆ 收藏',
        ),
        h(
            'select',
            {
                class: 'gallery-select',
                value: sortBy,
                onChange: (e) => onSortChange(e.target.value),
            },
            h('option', { value: 'name' }, '名称'),
            h('option', { value: 'count' }, '数量'),
            h('option', { value: 'time' }, '时间'),
        ),
        h(
            'button',
            {
                class: 'gallery-btn',
                onClick: onOrderChange,
            },
            sortOrder === 'asc' ? '⬆️' : '⬇️',
        ),
        h(
            'div',
            { class: 'gallery-stats' },
            h('span', {}, currentCount),
            ' / ',
            h('span', {}, totalCount),
            ' 位',
        ),
    );
}

function GalleryCard({
    artist,
    artistIndex,
    favorites,
    onFavoriteToggle,
    onImageClick,
}) {
    const { h } = self.preactCore;
    const { useState } = self.preactHooks;
    const [copied, setCopied] = useState(false);
    const isFav = favorites.has(artist.name);

    const handleCopy = () => {
        navigator.clipboard.writeText(`@${artist.name}`).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };

    return h(
        'div',
        { class: 'gallery-card' },
        h(
            'div',
            { class: 'gallery-card-header' },
            h(
                'span',
                {
                    class: 'gallery-artist-name',
                    title: artist.name,
                },
                artist.displayName,
            ),
            h(
                'span',
                { class: 'gallery-artist-count' },
                `${artist.imageCount}张`,
            ),
            h(
                'div',
                { class: 'gallery-actions' },
                h(
                    'button',
                    {
                        class: `gallery-icon-btn ${copied ? 'copied' : ''}`,
                        onClick: handleCopy,
                    },
                    copied ? '✓' : '📋',
                ),
                h(
                    'button',
                    {
                        class: `gallery-icon-btn ${isFav ? 'fav-active' : ''}`,
                        onClick: () => onFavoriteToggle(artist.name),
                    },
                    isFav ? '⭐' : '☆',
                ),
            ),
        ),
        h(
            'div',
            { class: 'gallery-image-container' },
            h(
                'div',
                { class: 'gallery-image-main' },
                h(
                    'div',
                    {
                        class: 'gallery-image-item',
                        onClick: () => onImageClick(artistIndex, 0),
                    },
                    h('img', {
                        src: buildImageUrl(artist.images[0].path),
                        alt: artist.name,
                        loading: 'lazy',
                    }),
                ),
            ),
            artist.images.length > 1 &&
                h(
                    'div',
                    { class: 'gallery-image-thumbnails' },
                    artist.images.slice(1).map((img, imgIndex) =>
                        h(
                            'div',
                            {
                                key: `${artist.name}-${imgIndex + 1}`,
                                class: 'gallery-image-item',
                                onClick: () =>
                                    onImageClick(artistIndex, imgIndex + 1),
                            },
                            h('img', {
                                src: buildImageUrl(img.path),
                                alt: artist.name,
                                loading: 'lazy',
                            }),
                        ),
                    ),
                ),
        ),
    );
}

function GalleryGrid({ artists, favorites, onFavoriteToggle, onImageClick }) {
    const { h } = self.preactCore;
    if (artists.length === 0) {
        return h('div', { class: 'gallery-empty' }, '🔍 没有找到匹配的画师');
    }
    return h(
        'div',
        { class: 'gallery-grid' },
        artists.map((artist, index) =>
            h(GalleryCard, {
                key: artist.name,
                artist,
                artistIndex: index,
                favorites,
                onFavoriteToggle,
                onImageClick,
            }),
        ),
    );
}

function Lightbox({ isOpen, artist, imageIndex, onClose, onNavigate }) {
    const { h } = self.preactCore;
    const { useEffect } = self.preactHooks;

    if (!isOpen || !artist) return null;

    const img = artist.images[imageIndex];
    const handlePrev = () => onNavigate(-1);
    const handleNext = () => onNavigate(1);

    const handleKeyDown = (e) => {
        if (e.key === 'Escape') onClose();
        if (e.key === 'ArrowLeft') handlePrev();
        if (e.key === 'ArrowRight') handleNext();
    };

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [imageIndex]);

    return h(
        'div',
        {
            class: `gallery-lightbox ${isOpen ? 'open' : ''}`,
            onClick: (e) => {
                if (e.target.classList.contains('gallery-lightbox')) onClose();
            },
        },
        h(
            'div',
            { class: 'gallery-lightbox-content' },
            h(
                'button',
                {
                    class: 'gallery-lightbox-close',
                    onClick: onClose,
                },
                '×',
            ),
            h('img', {
                class: 'gallery-lightbox-img',
                src: buildImageUrl(img.path),
                alt: artist.name,
            }),
            h(
                'button',
                {
                    class: 'gallery-lightbox-nav gallery-lightbox-prev',
                    onClick: handlePrev,
                },
                '‹',
            ),
            h(
                'button',
                {
                    class: 'gallery-lightbox-nav gallery-lightbox-next',
                    onClick: handleNext,
                },
                '›',
            ),
            h(
                'div',
                { class: 'gallery-lightbox-info' },
                `${artist.displayName} · ${imageIndex + 1} / ${artist.images.length}`,
            ),
        ),
    );
}

function GalleryModal({ isOpen, onClose }) {
    const { h } = self.preactCore;
    const { useState, useEffect } = self.preactHooks;
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

    useEffect(() => {
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

    const getFilteredArtists = () => {
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
    };

    const handleFavoriteToggle = (artistName) => {
        const updated = Storage.toggleFavorite(artistName, favorites);
        setFavorites(new Set(updated));
    };

    const handleImageClick = (artistIndex, imageIndex) => {
        const filtered = getFilteredArtists();
        const artist = filtered[artistIndex];
        setLightbox({
            open: true,
            artist,
            imageIndex,
        });
    };

    const handleLightboxNavigate = (direction) => {
        const filtered = getFilteredArtists();
        const currentArtistIndex = filtered.findIndex(
            (a) => a.name === lightbox.artist.name,
        );
        const artist = filtered[currentArtistIndex];
        let newIndex = lightbox.imageIndex + direction;
        if (newIndex < 0) newIndex = artist.images.length - 1;
        if (newIndex >= artist.images.length) newIndex = 0;
        setLightbox((prev) => ({ ...prev, imageIndex: newIndex }));
    };

    if (!isOpen) return null;

    const filteredArtists = getFilteredArtists();

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
    );
}

// ============ 拖动功能 ============
class Draggable {
    constructor(element, onDragEnd = null) {
        this.element = element;
        this.onDragEnd = onDragEnd;
        this.isDragging = false;
        this.hasMoved = false;
        this.startX = 0;
        this.startY = 0;
        this.initialX = 0;
        this.initialY = 0;
        this.bindEvents();
    }

    bindEvents() {
        this.element.addEventListener(
            'mousedown',
            this.handleMouseDown.bind(this),
        );
        document.addEventListener('mousemove', this.handleMouseMove.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));
    }

    handleMouseDown(e) {
        this.isDragging = true;
        this.hasMoved = false;
        this.startX = e.clientX;
        this.startY = e.clientY;
        this.initialX = this.element.offsetLeft;
        this.initialY = this.element.offsetTop;
        this.element.style.cursor = 'grabbing';
        this.element.style.transition = 'none';
    }

    handleMouseMove(e) {
        if (!this.isDragging) return;
        const dx = e.clientX - this.startX;
        const dy = e.clientY - this.startY;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
            this.hasMoved = true;
        }
        const newX = this.initialX + dx;
        const newY = this.initialY + dy;
        const maxX = window.innerWidth - this.element.offsetWidth;
        const maxY = window.innerHeight - this.element.offsetHeight;
        this.element.style.left = Math.max(0, Math.min(newX, maxX)) + 'px';
        this.element.style.top = Math.max(0, Math.min(newY, maxY)) + 'px';
        this.element.style.right = 'auto';
        this.element.style.bottom = 'auto';
    }

    handleMouseUp(e) {
        if (!this.isDragging) return;
        this.isDragging = false;
        this.element.style.cursor = 'move';
        this.element.style.transition = 'box-shadow 0.2s, transform 0.1s';
        if (this.onDragEnd) {
            this.onDragEnd(this.hasMoved);
        }
    }
}

// ============ 注册扩展 ============
(function () {
    const { h, render } = self.preactCore;

    app.registerExtension({
        name: 'ArtistGallery.GalleryButton',

        async setup() {
            // 创建悬浮按钮
            const floatingButton = document.createElement('div');
            floatingButton.id = 'artist-gallery-floating-btn';
            floatingButton.innerHTML = '🎨';
            document.body.appendChild(floatingButton);

            // 加载保存的位置
            function loadButtonPosition() {
                const pos = Storage.getButtonPosition();
                if (pos) {
                    floatingButton.style.left = pos.left + 'px';
                    floatingButton.style.top = pos.top + 'px';
                    floatingButton.style.right = 'auto';
                    floatingButton.style.bottom = 'auto';
                }
            }
            loadButtonPosition();

            // 创建模态框容器
            const modalContainer = document.createElement('div');
            modalContainer.id = 'artist-gallery-modal-container';
            document.body.appendChild(modalContainer);

            // 应用状态
            let isModalOpen = false;

            // 渲染模态框
            function renderModal() {
                render(
                    h(GalleryModal, {
                        isOpen: isModalOpen,
                        onClose: () => {
                            isModalOpen = false;
                            renderModal();
                        },
                    }),
                    modalContainer,
                );
            }

            // 初始化渲染
            renderModal();

            // 创建拖动功能
            const draggable = new Draggable(floatingButton, (hasMoved) => {
                Storage.saveButtonPosition(
                    floatingButton.offsetLeft,
                    floatingButton.offsetTop,
                );
                if (!hasMoved) {
                    isModalOpen = true;
                    renderModal();
                }
            });

            // ESC 键关闭模态框
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && isModalOpen) {
                    isModalOpen = false;
                    renderModal();
                }
            });
        },
    });
})();
