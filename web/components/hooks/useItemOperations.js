/**
 * 移动/复制操作 Hook
 * 管理移动和复制的对话框状态与业务逻辑（单条 + 批量）
 */
import { useState } from '../../lib/hooks.mjs';
import { showToast } from '../Toast.js';

export function useItemOperations({
  currentPrompt,
  currentCategory,
  viewMode,
  loadData,
  refreshCategories,
  setCurrentPrompt,
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
        const allItems = details.prompts;
        if (allItems.length === 0) return;

        let failCount = 0;
        for (const it of allItems) {
          try {
            const res = await fetch(
              `/prompt_gallery/prompts/${encodeURIComponent(it.categoryId)}/${encodeURIComponent(it.value)}/copy`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetCategoryId: target.id }),
              },
            );
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
          showToast(`${allItems.length - failCount}项复制成功，${failCount}项失败`, 'warning');
        } else {
          showToast(`已复制 ${allItems.length} 项`, 'success');
        }
        return;
      }

      // 单条操作（右键菜单）
      if (copyItemType === 'prompt') {
        response = await fetch(
          `/prompt_gallery/prompts/${encodeURIComponent(item.categoryId)}/${encodeURIComponent(item.value)}/copy`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              targetCategoryId: target.id,
              newName: newName || undefined,
            }),
          },
        );
      } else {
        // 后端暂无分类复制接口（batch/copy 仅支持 Prompt）
        showToast('暂不支持复制分类', 'error');
        closeCopyDialog();
        return;
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
        let successCount = 0;
        let failCount = 0;

        // 使用批量API移动分类和Prompt
        const batchPayload = {
          categories: details.categories.map((c) => ({ id: c.id, newParentId: target.id })),
          prompts: details.prompts.map((a) => ({
            categoryId: a.categoryId,
            value: a.value,
            newCategoryId: target.id,
          })),
        };

        if (
          batchPayload.categories.length > 0 ||
          batchPayload.prompts.length > 0
        ) {
          try {
            const res = await fetch('/prompt_gallery/batch/move', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(batchPayload),
            });
            const data = await res.json();
            if (res.ok && data.success) {
              successCount +=
                (data.movedCategories?.length || 0) +
                (data.movedPrompts?.length || 0);
              if (data.errors?.length > 0) failCount += data.errors.length;
            } else {
              failCount +=
                batchPayload.categories.length +
                batchPayload.prompts.length;
            }
          } catch {
            failCount +=
              batchPayload.categories.length +
              batchPayload.prompts.length;
          }
        }

        closeMoveDialog();
        resetSelection();
        await loadData();
        await refreshCategories();

        if (failCount > 0) {
          showToast(`${successCount}项移动成功，${failCount}项失败`, 'warning');
        } else {
          showToast(`已移动 ${successCount} 项`, 'success');
        }
        if (currentPrompt) {
          const updatedData = await fetch(`/prompt_gallery/data?category=${currentCategory}`);
          const result = await updatedData.json();
          const updatedPrompt = result.prompts?.find(
            (a) => a.categoryId === currentPrompt.categoryId && a.value === currentPrompt.value,
          );
          if (updatedPrompt) setCurrentPrompt(updatedPrompt);
        }
        return;
      }

      // 单条操作（右键菜单）
      if (moveItemType === 'category') {
        response = await fetch(`/prompt_gallery/categories/${item.id}/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newParentId: target.id }),
        });
      } else if (moveItemType === 'prompt') {
        response = await fetch(
          `/prompt_gallery/prompts/${encodeURIComponent(item.categoryId)}/${encodeURIComponent(item.value)}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ categoryId: target.id }),
          },
        );
      }

      const data = await response.json();

      if (response.ok && data.success) {
        closeMoveDialog();

        await loadData();

        // 如果在Prompt详情视图，更新当前Prompt
        if (viewMode === 'prompt' && currentPrompt) {
          const updatedData = await fetch(`/prompt_gallery/data?category=${currentCategory}`);
          const result = await updatedData.json();
          const updatedPrompt = result.prompts?.find(
            (a) => a.categoryId === currentPrompt.categoryId && a.value === currentPrompt.value,
          );
          if (updatedPrompt) {
            setCurrentPrompt(updatedPrompt);
          } else {
            setViewMode('gallery');
            setCurrentPrompt(null);
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
