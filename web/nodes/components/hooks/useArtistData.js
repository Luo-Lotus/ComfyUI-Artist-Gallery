/**
 * 画师数据管理 Hook
 * 负责数据加载、搜索过滤、分类导航
 */
import { useState, useEffect, useMemo } from '../../../lib/hooks.mjs';

// 辅助函数：扁平化分类树
function flattenCategories(tree) {
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

// 辅助函数：构建面包屑路径
function buildBreadcrumbPath(categoryId, categories) {
    const path = [];

    function findPath(id) {
        const cat = categories.find((c) => c.id === id);
        if (!cat) return;

        path.unshift(cat);

        if (cat.parentId) {
            findPath(cat.parentId);
        }
    }

    if (categoryId && categoryId !== 'root') {
        findPath(categoryId);
    }

    return path;
}

export function useArtistData(nodeInstance) {
    // 状态管理
    const [artists, setArtists] = useState([]); // 当前分类的画师
    const [allArtists, setAllArtists] = useState([]); // 所有画师（用于分类选择）
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('name');
    const [sortOrder, setSortOrder] = useState('asc');
    const [currentCategory, setCurrentCategory] = useState('root');
    const [refreshing, setRefreshing] = useState(false);

    // 加载数据
    useEffect(() => {
        let isMounted = true;

        const fetchData = async () => {
            setLoading(true);
            try {
                const response = await fetch('/artist_gallery/data');
                const data = await response.json();

                if (!isMounted) return;

                // 扁平化分类树
                const flatCategories = flattenCategories(data.categories || []);
                setCategories(flatCategories);

                // 设置画师数据
                setAllArtists(data.artists || []);

                // 根据当前分类过滤画师
                if (currentCategory === 'root') {
                    setArtists(data.artists || []);
                } else {
                    const categoryArtists = (data.artists || []).filter(
                        (a) => a.categoryId === currentCategory,
                    );
                    setArtists(categoryArtists);
                }
            } catch (error) {
                console.error('[ArtistSelector] Failed to fetch data:', error);
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        fetchData();

        return () => {
            isMounted = false;
        };
    }, [nodeInstance, currentCategory]);

    // 计算面包屑路径
    const breadcrumbPath = useMemo(() => {
        return buildBreadcrumbPath(currentCategory, categories);
    }, [currentCategory, categories]);

    // 过滤和排序画师
    const filteredArtists = useMemo(() => {
        let result = [...artists];

        // 搜索过滤
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter(
                (artist) =>
                    artist.name.toLowerCase().includes(query) ||
                    (artist.displayName && artist.displayName.toLowerCase().includes(query)),
            );
        }

        // 排序
        result.sort((a, b) => {
            let comparison = 0;

            switch (sortBy) {
                case 'name':
                    comparison = (a.displayName || a.name).localeCompare(b.displayName || b.name);
                    break;
                case 'created_at':
                    comparison = (a.createdAt || 0) - (b.createdAt || 0);
                    break;
                case 'image_count':
                    comparison = (a.imageCount || 0) - (b.imageCount || 0);
                    break;
                default:
                    comparison = 0;
            }

            // 升序/降序
            return sortOrder === 'asc' ? comparison : -comparison;
        });

        return result;
    }, [artists, searchQuery, sortBy, sortOrder]);

    // 分类切换处理
    const handleCategoryChange = (categoryId) => {
        setCurrentCategory(categoryId);
        // 切换分类时清空搜索
        setSearchQuery('');
    };

    // 刷新数据
    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            const response = await fetch('/artist_gallery/data');
            const data = await response.json();

            const flatCategories = flattenCategories(data.categories || []);
            setCategories(flatCategories);
            setAllArtists(data.artists || []);

            if (currentCategory === 'root') {
                setArtists(data.artists || []);
            } else {
                const categoryArtists = (data.artists || []).filter(
                    (a) => a.categoryId === currentCategory,
                );
                setArtists(categoryArtists);
            }
        } catch (error) {
            console.error('[ArtistSelector] Failed to refresh data:', error);
        } finally {
            setRefreshing(false);
        }
    };

    return {
        // 数据
        artists,
        allArtists,
        categories,
        filteredArtists,
        loading,
        searchQuery,
        sortBy,
        sortOrder,
        currentCategory,
        breadcrumbPath,
        refreshing,

        // 操作
        setSearchQuery,
        setSortBy,
        setSortOrder,
        handleCategoryChange,
        handleRefresh,
    };
}
