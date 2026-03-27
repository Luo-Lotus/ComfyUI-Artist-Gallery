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

export async function fetchGalleryData(categoryId = 'root') {
    const url = categoryId === 'root'
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
        body: JSON.stringify(data)
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
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '更新分类失败');
    }
    return await response.json();
}

export async function deleteCategory(categoryId) {
    const response = await fetch(`/artist_gallery/categories/${categoryId}`, {
        method: 'DELETE'
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '删除分类失败');
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
    let current = flatCategories.find(c => c.id === categoryId);

    while (current) {
        path.unshift(current);
        current = flatCategories.find(c => c.id === current.parentId);
    }

    return path;
}
