/**
 * 工具函数模块
 */

/**
 * 扁平化分类树（将嵌套 children 展开为一维数组）
 */
export function flattenCategories(tree) {
    const result = [];
    function traverse(node) {
        result.push(node);
        if (node.children) {
            node.children.forEach(traverse);
        }
    }
    tree.forEach(traverse);
    return result;
}

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
    getCardSize() {
        try {
            const saved = localStorage.getItem('artist-gallery-card-size');
            const val = parseFloat(saved);
            return isNaN(val) ? 1.0 : Math.min(1.5, Math.max(0.5, val));
        } catch {
            return 1.0;
        }
    },
    saveCardSize(scale) {
        localStorage.setItem('artist-gallery-card-size', String(scale));
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

export async function fetchGalleryData(categoryId = 'root') {
    const url =
        categoryId === 'root'
            ? '/artist_gallery/data'
            : `/artist_gallery/data?category=${categoryId}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.error) {
        throw new Error(data.error);
    }
    return data;
}

// ============ Category API ============

export async function fetchCategories() {
    const response = await fetch('/artist_gallery/categories');
    if (!response.ok) {
        throw new Error('获取分类失败');
    }
    return await response.json();
}

export async function addCategory(data) {
    const response = await fetch('/artist_gallery/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '添加分类失败');
    }
    return await response.json();
}

export async function updateCategory(categoryId, data) {
    const response = await fetch(`/artist_gallery/categories/${categoryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '更新分类失败');
    }
    return await response.json();
}

export async function deleteCategory(categoryId) {
    const response = await fetch(`/artist_gallery/categories/${categoryId}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '删除分类失败');
    }
    return await response.json();
}

export async function fetchAllArtists() {
    const response = await fetch('/artist_gallery/artists');
    if (!response.ok) {
        throw new Error('获取画师列表失败');
    }
    return await response.json();
}

// ============ Artist API (Composite Key) ============

export async function fetchArtist(categoryId, name) {
    const response = await fetch(
        `/artist_gallery/artists/${encodeURIComponent(categoryId)}/${encodeURIComponent(name)}`,
    );
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '获取画师失败');
    }
    return await response.json();
}

export async function deleteArtist(categoryId, name) {
    const response = await fetch(
        `/artist_gallery/artists/${encodeURIComponent(categoryId)}/${encodeURIComponent(name)}`,
        {
            method: 'DELETE',
        },
    );
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '删除画师失败');
    }
    return await response.json();
}

export async function copyArtist(categoryId, name, targetCategoryId, newName) {
    const response = await fetch(
        `/artist_gallery/artists/${encodeURIComponent(categoryId)}/${encodeURIComponent(name)}/copy`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                targetCategoryId,
                newName,
            }),
        },
    );
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '复制画师失败');
    }
    return await response.json();
}

export async function copyImage(imagePath, toArtistId) {
    const response = await fetch('/artist_gallery/image/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            imagePath,
            toArtistId,
        }),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '复制图片失败');
    }
    return await response.json();
}

// ============ Legacy Artist API (ID-based, for compatibility) ============

export async function addArtist(data) {
    const response = await fetch('/artist_gallery/artists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '添加画师失败');
    }
    return await response.json();
}

export async function addArtistsBatch(artistsData) {
    const response = await fetch('/artist_gallery/artists/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artists: artistsData }),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '批量添加画师失败');
    }
    return await response.json();
}

export async function moveArtist(artistId, newCategoryId) {
    const response = await fetch(`/artist_gallery/artists/${artistId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newCategoryId }),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '移动画师失败');
    }
    return await response.json();
}

// ============ Breadcrumb Helper ============

export function buildBreadcrumbPath(categoryId, categories) {
    // 扁平化分类树
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
    const path = [];
    let current = flatCategories.find((c) => c.id === categoryId);

    while (current) {
        path.unshift(current);
        current = flatCategories.find((c) => c.id === current.parentId);
    }

    return path;
}

// ============ Export / Import ============

export async function exportArtists(artists) {
    const response = await fetch('/artist_gallery/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artists }),
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({ error: '导出失败' }));
        throw new Error(err.error || '导出失败');
    }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="?(.+?)"?(?:;|$)/);
    const filename = match ? match[1] : `artists_export_${new Date().toISOString().slice(0,10).replace(/-/g,'')}.zip`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export async function importArtists(file, categoryId) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(
        `/artist_gallery/import-artists?categoryId=${encodeURIComponent(categoryId)}`,
        { method: 'POST', body: formData },
    );
    if (!response.ok) {
        const err = await response.json().catch(() => ({ error: '导入失败' }));
        throw new Error(err.error || '导入失败');
    }
    return await response.json();
}
