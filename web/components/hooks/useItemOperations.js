/**
 * 移动/复制操作 Hook
 * 管理移动和复制的对话框状态与业务逻辑（单条 + 批量）
 */
import { useState } from '../../lib/hooks.mjs';
import { fetchCategories, fetchAllArtists } from '../../utils.js';
import { showToast } from '../Toast.js';

export function useItemOperations({
    currentArtist,
    currentCategory,
    viewMode,
    loadData,
    refreshCategories,
    setCurrentArtist,
    setViewMode,
    getSelectedDetails,
    batchOperation,
    resetSelection,
}) {
    const [showMoveDialog, setShowMoveDialog] = useState(false);
    const [moveItem, setMoveItem] = useState(null);
    const [moveItemType, setMoveItemType] = useState(null);
    const [showCopyDialog, setShowCopyDialog] = useState(false);
    const [copyItem, setCopyItem] = useState(null);
    const [copyItemType, setCopyItemType] = useState(null);

    const openMoveDialog = (item, type) => {
        setMoveItem(item);
        setMoveItemType(type);
        setShowMoveDialog(true);
    };

    const openCopyDialog = (item, type) => {
        setCopyItem(item);
        setCopyItemType(type);
        setShowCopyDialog(true);
    };

    const closeMoveDialog = () => {
        setShowMoveDialog(false);
        setMoveItem(null);
        setMoveItemType(null);
    };

    const closeCopyDialog = () => {
        setShowCopyDialog(false);
        setCopyItem(null);
        setCopyItemType(null);
    };

    const handleCopy = async (item, target, newName) => {
        try {
            let response;
            // 批量复制
            if (batchOperation === 'copy') {
                const details = getSelectedDetails();
                const allItems = [
                    ...details.artists.map((a) => ({
                        type: 'artist',
                        item: a,
                    })),
                    ...details.images.map((i) => ({ type: 'image', item: i })),
                ];
                if (allItems.length === 0) return;

                let failCount = 0;
                for (const { type, item: it } of allItems) {
                    try {
                        let res;
                        if (type === 'artist') {
                            res = await fetch(
                                `/artist_gallery/artists/${encodeURIComponent(it.categoryId)}/${encodeURIComponent(it.name)}/copy`,
                                {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify({
                                        targetCategoryId: target.id,
                                        newName: undefined,
                                    }),
                                },
                            );
                        } else if (type === 'image') {
                            res = await fetch('/artist_gallery/image/copy', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    imagePath: it.path,
                                    toArtistName: target.name,
                                    toCategoryId: target.categoryId || 'root',
                                }),
                            });
                        }
                        const data = await res.json();
                        if (!res.ok || !data.success) failCount++;
                    } catch {
                        failCount++;
                    }
                }

                closeCopyDialog();
                resetSelection();
                await loadData();
                await refreshCategories();

                if (failCount > 0) {
                    showToast(
                        `${allItems.length - failCount}项复制成功，${failCount}项失败`,
                        'warning',
                    );
                } else {
                    showToast(`已复制 ${allItems.length} 项`, 'success');
                }
                return;
            }

            // 单条操作（右键菜单）
            if (copyItemType === 'artist') {
                response = await fetch(
                    `/artist_gallery/artists/${encodeURIComponent(item.categoryId)}/${encodeURIComponent(item.name)}/copy`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            targetCategoryId: target.id,
                            newName: newName || undefined,
                        }),
                    },
                );
            } else if (copyItemType === 'image') {
                response = await fetch('/artist_gallery/image/copy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        imagePath: item.path,
                        toArtistName: target.name,
                        toCategoryId: target.categoryId || 'root',
                    }),
                });
            } else if (copyItemType === 'combination') {
                response = await fetch('/artist_gallery/combinations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: newName || `${item.name} (副本)`,
                        categoryId: target.id,
                        artistKeys: item.artistKeys || [],
                        outputContent: item.outputContent || '',
                    }),
                });
            }

            const data = await response.json();

            if (response.ok && data.success) {
                closeCopyDialog();
                await loadData();
                await refreshCategories();
                return data;
            } else {
                throw new Error(data.error || '复制失败');
            }
        } catch (error) {
            throw error;
        }
    };

    const handleMove = async (item, target) => {
        try {
            let response;
            // 批量移动
            if (batchOperation === 'move') {
                const details = getSelectedDetails();
                const allItems = [
                    ...details.categories.map((c) => ({
                        type: 'category',
                        item: c,
                    })),
                    ...details.artists.map((a) => ({
                        type: 'artist',
                        item: a,
                    })),
                    ...details.images.map((i) => ({ type: 'image', item: i })),
                ];
                if (allItems.length === 0) return;

                let failCount = 0;
                for (const { type, item: it } of allItems) {
                    try {
                        let res;
                        if (type === 'category') {
                            res = await fetch(
                                `/artist_gallery/categories/${it.id}/move`,
                                {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify({
                                        newParentId: target.id,
                                    }),
                                },
                            );
                        } else if (type === 'artist') {
                            res = await fetch(
                                `/artist_gallery/artists/${encodeURIComponent(it.categoryId)}/${encodeURIComponent(it.name)}`,
                                {
                                    method: 'PUT',
                                    headers: {
                                        'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify({
                                        categoryId: target.id,
                                    }),
                                },
                            );
                        } else if (type === 'image') {
                            res = await fetch('/artist_gallery/image/move', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    imagePath: it.path,
                                    fromArtistName: currentArtist.name,
                                    toArtistName: target.name,
                                    toCategoryId: target.categoryId || 'root',
                                }),
                            });
                        }
                        const data = await res.json();
                        if (!res.ok || !data.success) failCount++;
                    } catch {
                        failCount++;
                    }
                }

                closeMoveDialog();
                resetSelection();
                await loadData();
                await refreshCategories();

                if (failCount > 0) {
                    showToast(
                        `${allItems.length - failCount}项移动成功，${failCount}项失败`,
                        'warning',
                    );
                } else {
                    showToast(`已移动 ${allItems.length} 项`, 'success');
                }
                if (currentArtist) {
                    const updatedData = await fetch(
                        `/artist_gallery/data?category=${currentCategory}`,
                    );
                    const result = await updatedData.json();
                    const updatedArtist = result.artists?.find(
                        (a) =>
                            a.categoryId === currentArtist.categoryId &&
                            a.name === currentArtist.name,
                    );
                    if (updatedArtist) setCurrentArtist(updatedArtist);
                }
                return;
            }

            // 单条操作（右键菜单）
            if (moveItemType === 'category') {
                response = await fetch(
                    `/artist_gallery/categories/${item.id}/move`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ newParentId: target.id }),
                    },
                );
            } else if (moveItemType === 'artist') {
                response = await fetch(
                    `/artist_gallery/artists/${encodeURIComponent(item.categoryId)}/${encodeURIComponent(item.name)}`,
                    {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ categoryId: target.id }),
                    },
                );
            } else if (moveItemType === 'image') {
                response = await fetch('/artist_gallery/image/move', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        imagePath: item.path,
                        fromArtistName: currentArtist.name,
                        toArtistName: target.name,
                        toCategoryId: target.categoryId || 'root',
                    }),
                });
            } else if (moveItemType === 'combination') {
                response = await fetch(
                    `/artist_gallery/combinations/${item.id}/move`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ targetCategoryId: target.id }),
                    },
                );
            }

            const data = await response.json();

            if (response.ok && data.success) {
                closeMoveDialog();

                await loadData();

                // 如果在画师详情视图，更新当前画师
                if (viewMode === 'artist' && currentArtist) {
                    const updatedData = await fetch(
                        `/artist_gallery/data?category=${currentCategory}`,
                    );
                    const result = await updatedData.json();
                    const updatedArtist = result.artists?.find(
                        (a) =>
                            a.categoryId === currentArtist.categoryId &&
                            a.name === currentArtist.name,
                    );
                    if (updatedArtist) {
                        setCurrentArtist(updatedArtist);
                    } else {
                        setViewMode('gallery');
                        setCurrentArtist(null);
                    }
                }

                await refreshCategories();
            } else {
                throw new Error(data.error || '移动失败');
            }
        } catch (error) {
            throw error;
        }
    };

    return {
        showMoveDialog,
        moveItem,
        moveItemType,
        showCopyDialog,
        copyItem,
        copyItemType,
        handleMove,
        handleCopy,
        openMoveDialog,
        openCopyDialog,
        closeMoveDialog,
        closeCopyDialog,
        setMoveItem,
        setMoveItemType,
        setCopyItem,
        setCopyItemType,
        setShowMoveDialog,
        setShowCopyDialog,
    };
}
