/**
 * 分类管理 Hook
 * 管理分类数据、导航、CRUD 操作
 */
import { useState, useEffect, useMemo } from '../../lib/hooks.mjs';
import {
    fetchCategories,
    fetchAllArtists,
    buildBreadcrumbPath,
    addCategory,
    updateCategory,
    deleteCategory,
} from '../../utils.js';

export function useCategoryManager({ viewMode, currentArtist, viewModeCombination, onNavigateToGallery }) {
    const [categories, setCategories] = useState([]);
    const [allArtists, setAllArtists] = useState([]);
    const [currentCategory, setCurrentCategory] = useState('root');
    const [categoryPath, setCategoryPath] = useState([]);
    const [showCategoryDialog, setShowCategoryDialog] = useState(false);
    const [categoryDialogMode, setCategoryDialogMode] = useState('add');
    const [editingCategory, setEditingCategory] = useState(null);

    // 加载分类数据和所有画师
    useEffect(() => {
        const init = async () => {
            try {
                const result = await fetchCategories();
                setCategories(result.categories || []);
                const artistsData = await fetchAllArtists();
                setAllArtists(artistsData.artists || []);
            } catch (err) {
                console.error('加载数据失败:', err);
            }
        };
        init();
    }, []);

    // 更新面包屑路径
    useEffect(() => {
        if (categories.length > 0) {
            let path = buildBreadcrumbPath(currentCategory, categories);

            if (viewMode === 'artist' && currentArtist) {
                path = [
                    ...path,
                    {
                        id: currentArtist.id,
                        name: currentArtist.displayName || currentArtist.name,
                        type: 'artist',
                    },
                ];
            }

            if (viewMode === 'combination' && viewModeCombination) {
                path = [
                    ...path,
                    {
                        id: viewModeCombination.id,
                        name: viewModeCombination.name,
                        type: 'combination',
                    },
                ];
            }

            setCategoryPath(path);
        }
    }, [currentCategory, categories, viewMode, currentArtist, viewModeCombination]);

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
        const artistsData = await fetchAllArtists();
        setAllArtists(artistsData.artists || []);
    };

    const handleCategorySelect = (category) => {
        setCurrentCategory(category.id);
    };

    const handleBreadcrumbNavigate = (item) => {
        if (item.type === 'artist' || item.type === 'combination') {
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

    const handleDeleteCategory = async (category) => {
        if (!confirm(`确定要删除分类"${category.name}"吗？`)) return;
        try {
            await deleteCategory(category.id);
            const result = await fetchCategories();
            setCategories(result.categories || []);
        } catch (err) {
            alert(`删除失败: ${err.message}`);
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
        allArtists,
        currentCategory,
        categoryPath,
        showCategoryDialog,
        categoryDialogMode,
        editingCategory,
        currentCategoryChildren,
        setCurrentCategory,
        setCategories,
        setAllArtists,
        refreshCategories,
        handleCategorySelect,
        handleBreadcrumbNavigate,
        handleAddCategory,
        handleEditCategory,
        handleDeleteCategory,
        handleCategoryDialogSave,
        setShowCategoryDialog,
    };
}
