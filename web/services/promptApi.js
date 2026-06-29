/**
 * Prompt API 服务
 * 封装所有与Prompt相关的 API 调用
 */

async function requestJson(url, options = {}, fallbackMessage = '请求失败') {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || fallbackMessage);
  }
  return data;
}

/**
 * 添加单个Prompt
 */
export async function addPrompt(promptData) {
  return await requestJson('/prompt_gallery/prompts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(promptData),
  }, '添加Prompt失败');
}

/**
 * 更新Prompt（使用 ID，兼容旧版本）
 */
export async function updatePrompt(promptId, promptData) {
  return await requestJson(`/prompt_gallery/prompts/${promptId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(promptData),
  }, '更新Prompt失败');
}

/**
 * 更新Prompt（使用组合键）
 */
export async function updatePromptByKey(categoryId, value, promptData) {
  return await requestJson(
    `/prompt_gallery/prompts/${encodeURIComponent(categoryId)}/${encodeURIComponent(value)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(promptData),
    },
    '更新Prompt失败',
  );
}

/**
 * 批量添加Prompt
 */
export async function addPromptsBatch(promptsData, categoryId) {
  return await requestJson('/prompt_gallery/prompts/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompts: promptsData, categoryId }),
  }, '批量添加Prompt失败');
}

export async function fetchAllPrompts() {
  return await requestJson('/prompt_gallery/prompts', {}, '获取Prompt列表失败');
}

export async function searchPrompts(query, limit = 100) {
  return await requestJson(
    `/prompt_gallery/prompts?search=${encodeURIComponent(query)}&limit=${limit}`,
    {},
    '搜索Prompt失败',
  );
}

export async function fetchPrompt(categoryId, value) {
  return await requestJson(
    `/prompt_gallery/prompts/${encodeURIComponent(categoryId)}/${encodeURIComponent(value)}`,
    {},
    '获取Prompt失败',
  );
}

export async function fetchPromptImages(value) {
  return await requestJson(
    `/prompt_gallery/prompt_images?value=${encodeURIComponent(value)}`,
    {},
    '获取Prompt图片失败',
  );
}

export async function setPromptCover(categoryId, value, coverImagePath) {
  return await requestJson(
    `/prompt_gallery/prompts/${encodeURIComponent(categoryId)}/${encodeURIComponent(value)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coverImageId: coverImagePath }),
    },
    '设置封面失败',
  );
}

/**
 * 删除Prompt（清理组合成员，不删除图片）
 */
export async function deletePromptByKey(categoryId, value) {
  return await requestJson(
    `/prompt_gallery/prompts/${encodeURIComponent(categoryId)}/${encodeURIComponent(value)}`,
    {
      method: 'DELETE',
    },
    '删除Prompt失败',
  );
}

/**
 * 删除图片
 * @param {string} imagePath - 图片路径
 */
export async function deleteImage(imagePath) {
  const body = { imagePath };
  return await requestJson('/prompt_gallery/image', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, '删除图片失败');
}

/**
 * 删除分类（级联删除子分类、Prompt、组合）
 */
export async function deleteCategory(categoryId) {
  return await requestJson(`/prompt_gallery/categories/${encodeURIComponent(categoryId)}`, {
    method: 'DELETE',
  }, '删除分类失败');
}

/**
 * 删除组合
 */
export async function deleteCombination(id) {
  return await requestJson(`/prompt_gallery/combinations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }, '删除组合失败');
}

/**
 * 批量删除（分类、Prompt、组合、图片）
 */
export async function batchDelete({ categories = [], prompts = [], combinations = [], images = [] }) {
  return await requestJson('/prompt_gallery/batch/delete', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categories, prompts, combinations, images }),
  }, '批量删除失败');
}

/**
 * 复制Prompt到其他分类
 */
export async function copyPrompt(categoryId, value, targetCategoryId, newValue) {
  return await requestJson(
    `/prompt_gallery/prompts/${encodeURIComponent(categoryId)}/${encodeURIComponent(value)}/copy`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetCategoryId,
        newValue,
      }),
    },
    '复制Prompt失败',
  );
}

/**
 * 保存循环状态
 */
export async function saveCycleState(nodeId, cycleIndex) {
  const response = await fetch('/prompt_gallery/cycle-state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      node_id: nodeId,
      cycle_index: cycleIndex,
    }),
  });
  return await response.json();
}

/**
 * 获取循环状态
 */
export async function getCycleState(nodeId) {
  const response = await fetch(`/prompt_gallery/cycle-state?node_id=${encodeURIComponent(nodeId)}`);
  return await response.json();
}

/**
 * 重置循环状态
 */
export async function resetCycleState(nodeId) {
  const response = await fetch('/prompt_gallery/cycle-state/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      node_id: nodeId,
    }),
  });
  return await response.json();
}

/**
 * 导出Prompt（含图片）为 ZIP 文件
 */
export async function exportPrompts(prompts, options = {}) {
  const response = await fetch('/prompt_gallery/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompts,
      includeImages: options.includeImages !== false,
      maxImagesPerPrompt: options.maxImagesPerPrompt || 0,
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: '导出失败' }));
    throw new Error(err.error || '导出失败');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'prompts_export.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 导出分类（递归含子分类、Prompt、组合）为 ZIP 文件
 */
export async function exportCategory(categoryId, options = {}) {
  const response = await fetch('/prompt_gallery/export-category', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      categoryId,
      includeImages: options.includeImages !== false,
      maxImagesPerPrompt: options.maxImagesPerPrompt || 0,
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: '导出失败' }));
    throw new Error(err.error || '导出失败');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'category_export.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 导入（从 ZIP 文件，支持 v1 Prompt格式和 v2 分类格式）
 */
export async function importPrompts(file, categoryId, separateStorage = false) {
  const formData = new FormData();
  formData.append('file', file);
  const params = new URLSearchParams({ categoryId });
  if (separateStorage) params.set('separate', 'true');
  const response = await fetch(`/prompt_gallery/import?${params}`, {
    method: 'POST',
    body: formData,
  });
  return await response.json();
}

/**
 * 更新分类 metadata
 */
export async function updateCategoryMetadata(categoryId, metadata) {
  const response = await fetch(`/prompt_gallery/categories/${encodeURIComponent(categoryId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metadata }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '更新分类 metadata 失败');
  }
  return await response.json();
}

/**
 * 更新 Prompt metadata
 */
export async function updatePromptMetadata(categoryId, value, metadata) {
  const response = await fetch(
    `/prompt_gallery/prompts/${encodeURIComponent(categoryId)}/${encodeURIComponent(value)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metadata }),
    },
  );
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '更新 Prompt metadata 失败');
  }
  return await response.json();
}

/**
 * 更新组合 metadata
 */
export async function updateCombinationMetadata(id, metadata) {
  const response = await fetch(`/prompt_gallery/combinations/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metadata }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '更新组合 metadata 失败');
  }
  return await response.json();
}
