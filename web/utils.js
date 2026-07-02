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
      const saved = localStorage.getItem('prompt-gallery-btn-pos');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      console.error('Failed to load button position:', e);
      return null;
    }
  },
  saveButtonPosition(left, top) {
    localStorage.setItem('prompt-gallery-btn-pos', JSON.stringify({ left, top }));
  },
  resetButtonPosition() {
    localStorage.removeItem('prompt-gallery-btn-pos');
    const btn = document.getElementById('prompt-gallery-floating-btn');
    if (!btn) return false;
    btn.style.left = 'auto';
    btn.style.top = 'auto';
    btn.style.right = '30px';
    btn.style.bottom = '100px';
    return true;
  },
  getFavorites() {
    try {
      const saved = localStorage.getItem('prompt-favorites');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  },
  saveFavorites(favorites) {
    localStorage.setItem('prompt-favorites', JSON.stringify([...favorites]));
  },
  toggleFavorite(promptName, favorites) {
    if (favorites.has(promptName)) {
      favorites.delete(promptName);
    } else {
      favorites.add(promptName);
    }
    this.saveFavorites(favorites);
    return favorites;
  },
  getCardSize() {
    try {
      const saved = localStorage.getItem('prompt-gallery-card-size');
      const val = parseFloat(saved);
      return isNaN(val) ? 1.0 : Math.min(1.5, Math.max(0.5, val));
    } catch {
      return 1.0;
    }
  },
  saveCardSize(scale) {
    localStorage.setItem('prompt-gallery-card-size', String(scale));
  },
  getCardLayoutMode() {
    try {
      return localStorage.getItem('prompt-gallery-card-layout') || 'fixed';
    } catch {
      return 'fixed';
    }
  },
  saveCardLayoutMode(mode) {
    localStorage.setItem('prompt-gallery-card-layout', mode);
  },
  getTheme() {
    try {
      return localStorage.getItem('prompt-gallery-theme') || 'dark';
    } catch {
      return 'dark';
    }
  },
  saveTheme(theme) {
    localStorage.setItem('prompt-gallery-theme', theme);
  },
  getNodeSearchShowPath() {
    try {
      return localStorage.getItem('prompt-gallery-node-search-show-path') !== '0';
    } catch {
      return true;
    }
  },
  saveNodeSearchShowPath(showPath) {
    localStorage.setItem('prompt-gallery-node-search-show-path', showPath ? '1' : '0');
  },
};

export function buildImageUrl(path, type) {
  if (type === 'remote' || (path && (path.startsWith('http://') || path.startsWith('https://')))) {
    return path;
  }
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
  const url = categoryId === 'root' ? '/prompt_gallery/data' : `/prompt_gallery/data?category=${categoryId}`;
  const response = await fetch(url);
  const data = await response.json();
  if (data.error) {
    throw new Error(data.error);
  }
  return data;
}

// ============ Category API ============

export async function fetchCategories() {
  const response = await fetch('/prompt_gallery/categories');
  if (!response.ok) {
    throw new Error('获取分类失败');
  }
  return await response.json();
}

export async function addCategory(data) {
  const response = await fetch('/prompt_gallery/categories', {
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
  const response = await fetch(`/prompt_gallery/categories/${categoryId}`, {
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

export async function fetchAllPrompts() {
  const { fetchAllPrompts: apiFetchAllPrompts } = await import('./services/promptApi.js');
  return await apiFetchAllPrompts();
}

export async function searchPrompts(query, limit = 100) {
  const { searchPrompts: apiSearchPrompts } = await import('./services/promptApi.js');
  return await apiSearchPrompts(query, limit);
}

export async function searchAll(query, limit = 50) {
  const response = await fetch(`/prompt_gallery/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  if (!response.ok) {
    throw new Error('搜索失败');
  }
  return await response.json();
}

export async function batchResolvePrompts(keys) {
  const response = await fetch('/prompt_gallery/prompts/batch_resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys }),
  });
  if (!response.ok) {
    throw new Error('批量解析Prompt失败');
  }
  return await response.json();
}

export async function fetchCovers(promptKeys = [], combinationIds = []) {
  const params = new URLSearchParams();
  if (promptKeys.length > 0) params.set('prompts', promptKeys.join(','));
  if (combinationIds.length > 0) params.set('combinations', combinationIds.join(','));
  const response = await fetch(`/prompt_gallery/covers?${params.toString()}`);
  if (!response.ok) {
    throw new Error('获取封面失败');
  }
  return await response.json();
}

export async function batchResolve({ prompts = [], categories = [], combinations = [] } = {}) {
  const response = await fetch('/prompt_gallery/batch_resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompts, categories, combinations }),
  });
  if (!response.ok) {
    throw new Error('批量解析失败');
  }
  return await response.json();
}

// ============ Prompt API (Composite Key) ============

export async function fetchPrompt(categoryId, value) {
  const { fetchPrompt: apiFetchPrompt } = await import('./services/promptApi.js');
  return await apiFetchPrompt(categoryId, value);
}

export async function copyPrompt(categoryId, value, targetCategoryId, newValue) {
  const { copyPrompt: apiCopyPrompt } = await import('./services/promptApi.js');
  return await apiCopyPrompt(categoryId, value, targetCategoryId, newValue);
}

export async function setPromptCover(categoryId, value, coverImagePath) {
  const { setPromptCover: apiSetPromptCover } = await import('./services/promptApi.js');
  return await apiSetPromptCover(categoryId, value, coverImagePath);
}

export async function fetchInitData() {
  const response = await fetch('/prompt_gallery/init');
  if (!response.ok) {
    throw new Error('初始化数据加载失败');
  }
  return await response.json();
}

// ============ Legacy Prompt API (ID-based, for compatibility) ============

export async function addPrompt(data) {
  const { addPrompt: apiAddPrompt } = await import('./services/promptApi.js');
  return await apiAddPrompt(data);
}

export async function addPromptsBatch(promptsData) {
  const { addPromptsBatch: apiAddPromptsBatch } = await import('./services/promptApi.js');
  return await apiAddPromptsBatch(promptsData);
}

export async function movePrompt(promptId, newCategoryId) {
  const response = await fetch(`/prompt_gallery/prompts/${promptId}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newCategoryId }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '移动Prompt失败');
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

// ============ Combination API ============

export async function fetchCombinations(categoryId = 'root') {
  const url =
    categoryId === 'root'
      ? '/prompt_gallery/combinations'
      : `/prompt_gallery/combinations?category=${encodeURIComponent(categoryId)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('获取组合列表失败');
  }
  return await response.json();
}

export async function fetchAllCombinations() {
  const response = await fetch('/prompt_gallery/combinations/all');
  if (!response.ok) {
    throw new Error('获取组合列表失败');
  }
  return await response.json();
}

export async function createCombination(data) {
  const response = await fetch('/prompt_gallery/combinations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '创建组合失败');
  }
  return await response.json();
}

export async function updateCombination(id, data) {
  const response = await fetch(`/prompt_gallery/combinations/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '更新组合失败');
  }
  return await response.json();
}

export async function duplicateCombination(id) {
  const response = await fetch(`/prompt_gallery/combinations/${encodeURIComponent(id)}/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '复制组合失败');
  }
  return await response.json();
}

export async function moveCombination(id, targetCategoryId) {
  const response = await fetch(`/prompt_gallery/combinations/${encodeURIComponent(id)}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetCategoryId }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '移动组合失败');
  }
  return await response.json();
}

// ============ Grouped Images ============

export async function fetchGroupedImages({ prompt, prompts, search, filters, includeComfyOutput, groupBy } = {}) {
  const params = new URLSearchParams();
  if (prompt) params.set('prompt', prompt);
  if (prompts && prompts.length > 0) params.set('prompts_json', JSON.stringify(prompts));
  if (search) params.set('search', search);
  if (filters && filters.length > 0) params.set('filters', JSON.stringify(filters));
  if (includeComfyOutput) params.set('include_comfy_output', '1');
  if (groupBy) params.set('group_by', groupBy);
  const qs = params.toString();
  const url = `/prompt_gallery/images_grouped${qs ? '?' + qs : ''}`;
  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: '获取分组图片失败' }));
    throw new Error(error.error || '获取分组图片失败');
  }
  return await response.json();
}

// ============ Export / Import ============

async function _downloadZip(response) {
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: '导出失败' }));
    throw new Error(err.error || '导出失败');
  }
  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') || '';
  const utf8Match = disposition.match(/filename\*=UTF-8''(.+)/);
  const asciiMatch = disposition.match(/filename="?(.+?)"?(?:;|$)/);
  const filename = utf8Match
    ? decodeURIComponent(utf8Match[1])
    : asciiMatch
      ? asciiMatch[1]
      : `export_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.zip`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportPrompts(prompts, options = {}) {
  await _downloadZip(
    await fetch('/prompt_gallery/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompts,
        includeImages: options.includeImages !== false,
        maxImagesPerPrompt: options.maxImagesPerPrompt || 0,
      }),
    }),
  );
}

export async function exportCategory(categoryId, options = {}) {
  await _downloadZip(
    await fetch('/prompt_gallery/export-category', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categoryId,
        includeImages: options.includeImages !== false,
        maxImagesPerPrompt: options.maxImagesPerPrompt || 0,
      }),
    }),
  );
}

export async function importPrompts(file, categoryId, separateStorage = false) {
  const formData = new FormData();
  formData.append('file', file);
  const params = new URLSearchParams({ categoryId });
  if (separateStorage) params.set('separate', 'true');
  const response = await fetch(`/prompt_gallery/import?${params}`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: '导入失败' }));
    throw new Error(err.error || '导入失败');
  }
  return await response.json();
}
