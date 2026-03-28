/**
 * 画师 API 服务
 * 封装所有与画师相关的 API 调用
 */

/**
 * 添加单个画师
 */
export async function addArtist(artistData) {
    const response = await fetch('/artist_gallery/artists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(artistData),
    });
    return await response.json();
}

/**
 * 更新画师（使用 ID，兼容旧版本）
 */
export async function updateArtist(artistId, artistData) {
    const response = await fetch(`/artist_gallery/artists/${artistId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(artistData),
    });
    return await response.json();
}

/**
 * 更新画师（使用组合键）
 */
export async function updateArtistByKey(categoryId, name, artistData) {
    const response = await fetch(
        `/artist_gallery/artists/${encodeURIComponent(categoryId)}/${encodeURIComponent(name)}`,
        {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(artistData),
        }
    );
    return await response.json();
}

/**
 * 批量添加画师
 */
export async function addArtistsBatch(artistsData) {
    const response = await fetch('/artist_gallery/artists/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artists: artistsData }),
    });
    return await response.json();
}

/**
 * 删除画师（使用 ID，兼容旧版本）
 */
export async function deleteArtist(artistId) {
    const response = await fetch(`/artist_gallery/artists/${artistId}`, {
        method: 'DELETE',
    });
    return await response.json();
}

/**
 * 删除画师（使用组合键）
 */
export async function deleteArtistByKey(categoryId, name) {
    const response = await fetch(
        `/artist_gallery/artists/${encodeURIComponent(categoryId)}/${encodeURIComponent(name)}`,
        {
            method: 'DELETE',
        }
    );
    return await response.json();
}

/**
 * 复制画师到其他分类
 */
export async function copyArtist(categoryId, name, targetCategoryId, newName) {
    const response = await fetch(
        `/artist_gallery/artists/${encodeURIComponent(categoryId)}/${encodeURIComponent(name)}/copy`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                targetCategoryId,
                newName
            }),
        }
    );
    return await response.json();
}

/**
 * 复制图片到其他画师
 */
export async function copyImage(imagePath, toArtistId) {
    const response = await fetch('/artist_gallery/image/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            imagePath,
            toArtistId
        }),
    });
    return await response.json();
}
