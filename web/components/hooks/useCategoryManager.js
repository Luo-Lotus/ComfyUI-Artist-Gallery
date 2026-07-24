/**
 * 分类管理 Hook
 * 管理分类数据、导航、CRUD 操作
 */
import { useState, useEffect, useMemo } from '../../lib/hooks.mjs';
import {
  fetchCategories,
  buildBreadcrumbPath,
  addCategory,
  updateCategory,
} from '../../utils.js';
import { deleteCategory } from '../../services/promptApi.js';
import { showToast } from '../Toast.js';

export function useCategoryManager({ viewMode, currentPrompt, onNavigateToGallery }) {
  const [categories, setCategories] = useState([]);
  const [currentCategory, setCurrentCategory] = useState('root');
  const [categoryPath, setCategoryPath] = useState([]);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [categoryDialogMode, setCategoryDialogMode] = useState('add');
  const [editingCategory, setEditingCategory] = useState(null);
  const [showCategoryDeleteConfirm, setShowCategoryDeleteConfirm] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState(null);

  // 加载分类数据
  useEffect(() => {
    const init = async () => {
      try {
        const result = await fetchCategories();
        setCategories(result.categories || []);
      } catch (err) {
        console.error('加载分类数据失败:', err);
      }
    };
    init();
  }, []);

  // 更新面包屑路径
  useEffect(() => {
    if (categories.length > 0) {
      let path = buildBreadcrumbPath(currentCategory, categories);

      if (viewMode === 'prompt' && currentPrompt) {
        path = [
          ...path,
          {
            id: currentPrompt.id,
            name: currentPrompt.name || currentPrompt.value,
            type: 'prompt',
          },
        ];
      }

      setCategoryPath(path);
    }
  }, [currentCategory, categories, viewMode, currentPrompt]);

  // 获取当前分类的子分类
  const currentCategoryChildren = useMemo(() => {
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
    const currentCat = flatCategories.find((c) => c.id === currentCategory);
    return currentCat?.children || [];
  }, [categories, currentCategory]);

  const refreshCategories = async () => {
    const result = await fetchCategories();
    setCategories(result.categories || []);
  };

  const handleCategorySelect = (category) => {
    setCurrentCategory(category.id);
  };

  const handleBreadcrumbNavigate = (item) => {
    if (item.type === 'prompt') {
      return;
    }
    setCurrentCategory(item.id);
    // 退出详情视图回到画廊
    if (onNavigateToGallery) onNavigateToGallery();
  };

  const handleAddCategory = () => {
    setCategoryDialogMode('add');
    setEditingCategory(null);
    setShowCategoryDialog(true);
  };

  const handleEditCategory = (category) => {
    setCategoryDialogMode('edit');
    setEditingCategory(category);
    setShowCategoryDialog(true);
  };

  const openCategoryDeleteConfirm = (category) => {
    setCategoryToDelete(category);
    setShowCategoryDeleteConfirm(true);
  };

  const confirmDeleteCategory = async () => {
    if (!categoryToDelete) return;
    try {
      await deleteCategory(categoryToDelete.id);
      showToast('已删除分类', 'success');
      setShowCategoryDeleteConfirm(false);
      setCategoryToDelete(null);
      const result = await fetchCategories();
      setCategories(result.categories || []);
    } catch (err) {
      showToast('删除分类失败: ' + err.message, 'error');
      throw err;
    }
  };

  const handleCategoryDialogSave = async (data) => {
    try {
      if (categoryDialogMode === 'add') {
        await addCategory(data);
      } else {
        await updateCategory(editingCategory.id, data);
      }
      setShowCategoryDialog(false);
      const result = await fetchCategories();
      setCategories(result.categories || []);
    } catch (err) {
      throw err;
    }
  };

  return {
    categories,
    currentCategory,
    categoryPath,
    showCategoryDialog,
    categoryDialogMode,
    editingCategory,
    currentCategoryChildren,
    showCategoryDeleteConfirm,
    categoryToDelete,
    setCurrentCategory,
    setCategories,
    setShowCategoryDeleteConfirm,
    setCategoryToDelete,
    refreshCategories,
    handleCategorySelect,
    handleBreadcrumbNavigate,
    handleAddCategory,
    handleEditCategory,
    openCategoryDeleteConfirm,
    confirmDeleteCategory,
    handleCategoryDialogSave,
    setShowCategoryDialog,
  };
}
