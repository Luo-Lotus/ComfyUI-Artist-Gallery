/**
 * 多选状态管理 Hook
 * 管理多选模式、选中项、批量操作
 */
import { useState, useMemo } from '../../lib/hooks.mjs';
import { showToast } from '../Toast.js';
import { batchDelete } from '../../services/promptApi.js';

export function useSelection({
  categories,
  filteredPrompts,
  currentCombinations,
  currentPrompt,
  currentCategory,
  loadData,
  setCurrentPrompt,
  refreshCategories,
  openBatchExportDialog,
}) {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  const [batchOperation, setBatchOperation] = useState(null); // 'delete' | 'move'
  const [lastSelectedItem, setLastSelectedItem] = useState(null);

  // 将树形分类扁平化，以便按 id 查找任意深度的分类
  const flatCategories = useMemo(() => {
    const result = [];
    function traverse(nodes) {
      if (!nodes) return;
      nodes.forEach((node) => {
        result.push(node);
        if (node.children) traverse(node.children);
      });
    }
    traverse(categories);
    return result;
  }, [categories]);

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
    flatCategories.forEach((cat) => {
      newSet.add(`category:${cat.id}`);
    });
    currentCombinations.forEach((comb) => {
      newSet.add(`combination:${comb.id}`);
    });
    filteredPrompts.forEach((prompt) => {
      newSet.add(`prompt:${prompt.categoryId}:${prompt.value}`);
    });
    setSelectedItems(newSet);
  };

  const handleDeselectAll = () => {
    setSelectedItems(new Set());
  };

  const getSelectionType = () => {
    const items = Array.from(selectedItems);
    const types = new Set(items.map((key) => key.split(':')[0]));

    const typeCount = ['prompt', 'category', 'combination', 'image'].filter((t) => types.has(t)).length;
    if (typeCount > 1) return 'mixed';
    if (types.has('image')) return 'image';
    if (types.has('prompt')) return 'prompt';
    if (types.has('combination')) return 'combination';
    if (types.has('category')) return 'category';
    return 'empty';
  };

  const getSelectedDetails = () => {
    const items = Array.from(selectedItems);
    const result = {
      categories: [],
      prompts: [],
      combinations: [],
      images: [],
    };

    items.forEach((key) => {
      const parts = key.split(':');
      const type = parts[0];
      const id = parts.slice(1).join(':');

      if (type === 'category') {
        const cat = flatCategories.find((c) => c.id === id);
        if (cat) result.categories.push(cat);
      } else if (type === 'prompt') {
        const prompt = filteredPrompts.find((a) => `${a.categoryId}:${a.value}` === id);
        if (prompt) {
          result.prompts.push(prompt);
        }
      } else if (type === 'combination') {
        const comb = currentCombinations.find((c) => c.id === id);
        if (comb) result.combinations.push(comb);
      } else if (type === 'image') {
        if (currentPrompt && currentPrompt.images) {
          const img = currentPrompt.images.find((i) => i.path === id);
          if (img) result.images.push(img);
        }
      }
    });

    return result;
  };

  const handleBatchDelete = () => {
    const details = getSelectedDetails();
    const totalSelected = details.categories.length + details.prompts.length + details.combinations.length + details.images.length;
    if (totalSelected === 0) return;

    setBatchOperation('delete');
    setShowBatchConfirm(true);
  };

  const handleBatchMove = ({ setMoveItem, setMoveItemType, setShowMoveDialog }) => {
    const details = getSelectedDetails();
    const totalSelected = details.categories.length + details.prompts.length + details.combinations.length + details.images.length;
    if (totalSelected === 0) return;

    setBatchOperation('move');
    if (details.categories.length > 0) {
      setMoveItemType('category');
      setMoveItem(details.categories[0]);
    } else if (details.prompts.length > 0) {
      setMoveItemType('prompt');
      setMoveItem(details.prompts[0]);
    } else if (details.combinations.length > 0) {
      setMoveItemType('combination');
      setMoveItem(details.combinations[0]);
    } else {
      setMoveItemType('image');
      setMoveItem(details.images[0]);
    }
    setShowMoveDialog(true);
  };

  const handleBatchCopy = ({ setCopyItem, setCopyItemType, setShowCopyDialog }) => {
    const details = getSelectedDetails();
    const totalCopyable = details.prompts.length + details.combinations.length + details.images.length;
    if (totalCopyable === 0) {
      showToast('请选择Prompt或组合后复制', 'warning');
      return;
    }

    setBatchOperation('copy');
    if (details.prompts.length > 0) {
      setCopyItemType('prompt');
      setCopyItem(details.prompts[0]);
    } else if (details.combinations.length > 0) {
      setCopyItemType('combination');
      setCopyItem(details.combinations[0]);
    } else {
      setCopyItemType('image');
      setCopyItem(details.images[0]);
    }
    setShowCopyDialog(true);
  };

  const handleBatchExport = () => {
    const details = getSelectedDetails();
    if (details.prompts.length === 0) {
      showToast('请选择Prompt后导出', 'warning');
      return;
    }
    openBatchExportDialog();
  };

  const handleBatchConfirm = async () => {
    const details = getSelectedDetails();
    const operation = batchOperation;

    if (!operation) return;

    try {
      if (operation === 'delete') {
        await batchDelete({
          categories: details.categories.map((c) => c.id),
          prompts: details.prompts.map((a) => ({
            categoryId: a.categoryId,
            value: a.value,
          })),
          combinations: details.combinations.map((c) => c.id),
          images: details.images.map((img) => ({ path: img.path })),
        });
        showToast('批量删除成功', 'success');
        setShowBatchConfirm(false);
        setSelectionMode(false);
        setSelectedItems(new Set());
        await loadData();
        await refreshCategories();
        if (currentPrompt) {
          const updatedData = await fetch(`/prompt_gallery/data?category=${currentCategory}`);
          const result = await updatedData.json();
          const updatedPrompt = result.prompts?.find(
            (a) => a.categoryId === currentPrompt.categoryId && a.value === currentPrompt.value,
          );
          if (updatedPrompt) {
            setCurrentPrompt(updatedPrompt);
          }
        }
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
