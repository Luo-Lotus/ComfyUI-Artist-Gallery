/**
 * 工具函数模块
 */

export const Storage = {
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

export function buildImageUrl(path) {
    const parts = path.split(/[/\\]/);
    const filename = parts[parts.length - 1];
    const subfolder = parts.slice(0, -1).join('/');
    const params = new URLSearchParams({ filename });
    if (subfolder) {
        params.append('subfolder', subfolder);
    }
    return `/view?${params.toString()}`;
}

export async function fetchGalleryData() {
    const response = await fetch('/artist_gallery/data');
    const data = await response.json();
    if (data.error) {
        throw new Error(data.error);
    }
    return data;
}
