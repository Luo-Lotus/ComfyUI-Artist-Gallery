/**
 * 多选状态管理 Hook
 * 管理多选模式、选中项、批量操作
 */
import { useState } from '../../lib/hooks.mjs';
import { exportArtists } from '../../utils.js';
import { showToast } from '../Toast.js';

export function useSelection({
    categories,
    filteredArtists,
    currentArtist,
    currentCategory,
    loadData,
    setCurrentArtist,
    refreshCategories,
}) {
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedItems, setSelectedItems] = useState(new Set());
    const [showBatchConfirm, setShowBatchConfirm] = useState(false);
    const [batchOperation, setBatchOperation] = useState(null); // 'delete' | 'move' | 'copy'
    const [lastSelectedItem, setLastSelectedItem] = useState(null);

    const handleToggleSelectionMode = () => {
        setSelectionMode((prev) => !prev);
        if (selectionMode) {
            setSelectedItems(new Set());
            setLastSelectedItem(null);
        }
    };

    const handleSelectItem = (itemOrKey, shiftKey = false, orderedKeys = null) => {
        const key = typeof itemOrKey === 'string' ? itemOrKey : itemOrKey.id;

        if (shiftKey && lastSelectedItem && orderedKeys) {
            // Shift 范围选择
            const startIdx = orderedKeys.indexOf(lastSelectedItem);
            const endIdx = orderedKeys.indexOf(key);
            if (startIdx >= 0 && endIdx >= 0) {
                const from = Math.min(startIdx, endIdx);
                const to = Math.max(startIdx, endIdx);
                setSelectedItems((prev) => {
                    const newSet = new Set(prev);
                    for (let i = from; i <= to; i++) {
                        newSet.add(orderedKeys[i]);
                    }
                    return newSet;
                });
                setLastSelectedItem(key);
                return;
            }
        }

        // 普通切换选择
        setSelectedItems((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(key)) {
                newSet.delete(key);
            } else {
                newSet.add(key);
            }
            return newSet;
        });
        setLastSelectedItem(key);
    };

    const handleSelectAll = () => {
        const newSet = new Set();
        categories.forEach((cat) => {
            newSet.add(`category:${cat.id}`);
        });
        filteredArtists.forEach((artist) => {
            newSet.add(`artist:${artist.categoryId}:${artist.name}`);
        });
        setSelectedItems(newSet);
    };

    const handleDeselectAll = () => {
        setSelectedItems(new Set());
    };

    const getSelectionType = () => {
        const items = Array.from(selectedItems);
        const types = new Set(items.map((key) => key.split(':')[0]));

        const typeCount = ['artist', 'category', 'image'].filter((t) =>
            types.has(t),
        ).length;
        if (typeCount > 1) return 'mixed';
        if (types.has('image')) return 'image';
        if (types.has('artist')) return 'artist';
        if (types.has('category')) return 'category';
        return 'empty';
    };

    const getSelectedDetails = () => {
        const items = Array.from(selectedItems);
        const result = {
            categories: [],
            artists: [],
            images: [],
        };

        items.forEach((key) => {
            const parts = key.split(':');
            const type = parts[0];
            const id = parts.slice(1).join(':');

            if (type === 'category') {
                const cat = categories.find((c) => c.id === id);
                if (cat) result.categories.push(cat);
            } else if (type === 'artist') {
                const artist = filteredArtists.find(
                    (a) => `${a.categoryId}:${a.name}` === id,
                );
                if (artist) {
                    result.artists.push(artist);
                }
            } else if (type === 'image') {
                if (currentArtist && currentArtist.images) {
                    const img = currentArtist.images.find((i) => i.path === id);
                    if (img) result.images.push(img);
                }
            }
        });

        return result;
    };

    const handleBatchDelete = () => {
        const details = getSelectedDetails();
        if (
            details.categories.length === 0 &&
            details.artists.length === 0 &&
            details.images.length === 0
        )
            return;

        setBatchOperation('delete');
        setShowBatchConfirm(true);
    };

    const handleBatchMove = ({ setMoveItem, setMoveItemType, setShowMoveDialog }) => {
        const details = getSelectedDetails();
        if (
            details.categories.length === 0 &&
            details.artists.length === 0 &&
            details.images.length === 0
        )
            return;

        setBatchOperation('move');
        if (details.images.length > 0) {
            setMoveItemType('image');
            setMoveItem(details.images[0]);
        } else if (details.categories.length > 0) {
            setMoveItemType('category');
            setMoveItem(details.categories[0]);
        } else {
            setMoveItemType('artist');
            setMoveItem(details.artists[0]);
        }
        setShowMoveDialog(true);
    };

    const handleBatchCopy = ({ setCopyItem, setCopyItemType, setShowCopyDialog }) => {
        const details = getSelectedDetails();
        if (details.artists.length === 0 && details.images.length === 0) return;

        setBatchOperation('copy');
        if (details.images.length > 0) {
            setCopyItemType('image');
            setCopyItem(details.images[0]);
        } else {
            setCopyItemType('artist');
            setCopyItem(details.artists[0]);
        }
        setShowCopyDialog(true);
    };

    const handleBatchExport = async () => {
        const details = getSelectedDetails();
        const artistKeys = details.artists.map((a) => ({
            categoryId: a.categoryId,
            name: a.name,
        }));
        if (artistKeys.length === 0) {
            showToast('请选择画师后导出', 'warning');
            return;
        }
        try {
            await exportArtists(artistKeys);
            showToast(`已导出 ${artistKeys.length} 个画师`, 'success');
        } catch (error) {
            showToast('导出失败: ' + error.message, 'error');
        }
    };

    const handleBatchConfirm = async () => {
        const details = getSelectedDetails();
        const operation = batchOperation;

        if (!operation) return;

        try {
            let response;

            if (operation === 'delete') {
                if (details.images.length > 0) {
                    for (const img of details.images) {
                        await fetch('/artist_gallery/image', {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ imagePath: img.path }),
                        });
                    }
                    showToast(
                        `成功删除 ${details.images.length} 张图片`,
                        'success',
                    );
                    setShowBatchConfirm(false);
                    setSelectionMode(false);
                    setSelectedItems(new Set());
                    await loadData();
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
                        if (updatedArtist) {
                            setCurrentArtist(updatedArtist);
                        }
                    }
                    return;
                }
                response = await fetch('/artist_gallery/batch/delete', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        categories: details.categories.map((c) => c.id),
                        artists: details.artists.map((a) => ({
                            categoryId: a.categoryId,
                            name: a.name,
                        })),
                    }),
                });
            } else if (operation === 'move') {
                console.log('批量移动:', details);
                setShowBatchConfirm(false);
                return;
            } else if (operation === 'copy') {
                console.log('批量复制:', details);
                setShowBatchConfirm(false);
                return;
            }

            const data = await response.json();

            if (data.success) {
                showToast(
                    `批量${operation === 'delete' ? '删除' : operation}成功`,
                    'success',
                );
                setShowBatchConfirm(false);
                setSelectionMode(false);
                setSelectedItems(new Set());
                await loadData();
            } else {
                showToast(`批量${operation}失败: ${data.error}`, 'error');
            }
        } catch (error) {
            console.error('批量操作失败:', error);
            showToast(`批量${operation}失败: ${error.message}`, 'error');
        }
    };

    const resetSelection = () => {
        setSelectionMode(false);
        setSelectedItems(new Set());
        setLastSelectedItem(null);
        setBatchOperation(null);
    };

    return {
        selectionMode,
        selectedItems,
        showBatchConfirm,
        batchOperation,
        handleToggleSelectionMode,
        handleSelectItem,
        handleSelectAll,
        handleDeselectAll,
        getSelectionType,
        getSelectedDetails,
        handleBatchDelete,
        handleBatchMove,
        handleBatchCopy,
        handleBatchExport,
        handleBatchConfirm,
        resetSelection,
        setBatchOperation,
        setSelectedItems,
    };
}
