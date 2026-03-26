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
    const {
        useState,
        useEffect: hookUseEffect,
        useMemo,
    } = self.preactHooks;

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
