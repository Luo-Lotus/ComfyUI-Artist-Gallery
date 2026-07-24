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
 * 更新 Prompt（使用复合键）
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

/** 删除 Prompt 记录。 */
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
 * 删除分类（级联删除子分类和 Prompt）
 */
export async function deleteCategory(categoryId) {
  return await requestJson(`/prompt_gallery/categories/${encodeURIComponent(categoryId)}`, {
    method: 'DELETE',
  }, '删除分类失败');
}

/**
 * 批量删除（分类、Prompt、图片）
 */
export async function batchDelete({ categories = [], prompts = [], images = [] }) {
  return await requestJson('/prompt_gallery/batch/delete', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categories, prompts, images }),
  }, '批量删除失败');
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
