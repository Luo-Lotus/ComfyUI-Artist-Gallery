/**
 * 画师选择逻辑 Hook
 * 处理画师数据加载、选择状态管理、排序过滤等逻辑
 */
import { useState, useEffect, useMemo } from '../../../lib/hooks.mjs';
import { useImagePreview } from './useImagePreview.js';

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

export function useArtistSelector(nodeInstance, selectedInput, metadataInput) {
    // 使用图片预览 hook
    const { showPreview, removePreview } = useImagePreview();

    // 状态管理
    const [artists, setArtists] = useState([]); // 当前分类的画师
    const [allArtists, setAllArtists] = useState([]); // 所有画师（用于分类选择）
    const [categories, setCategories] = useState([]);
    const [selectedKeys, setSelectedKeys] = useState(new Set()); // 使用组合键 "categoryId:name"
    const [selectedArtistsCache, setSelectedArtistsCache] = useState({}); // 缓存所有已选择的画师信息
    const [selectedCategories, setSelectedCategories] = useState(new Set()); // 已选择的分类
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('name');
    const [sortOrder, setSortOrder] = useState('asc');
    const [currentCategory, setCurrentCategory] = useState('root');
    const [refreshing, setRefreshing] = useState(false);

    // 计算面包屑路径
    const breadcrumbPath = useMemo(() => {
        return buildBreadcrumbPath(currentCategory, categories);
    }, [currentCategory, categories]);

    // 计算已选择的画师列表（从缓存中获取）
    const selectedArtistsList = useMemo(() => {
        return Array.from(selectedKeys)
            .map((key) => selectedArtistsCache[key])
            .filter(Boolean);
    }, [selectedKeys, selectedArtistsCache]);

    // 计算已选择的分类列表
    const selectedCategoriesList = useMemo(() => {
        return Array.from(selectedCategories)
            .map((catId) => {
                return categories.find((c) => c.id === catId);
            })
            .filter(Boolean);
    }, [selectedCategories, categories]);

    // 辅助函数：生成组合键
    const makeArtistKey = (categoryId, name) => `${categoryId}:${name}`;

    // 辅助函数：解析组合键
    const parseArtistKey = (key) => {
        const [categoryId, name] = key.split(':');
        return { categoryId, name };
    };

    // 加载分类列表
    useEffect(() => {
        const loadCategories = async () => {
            try {
                const response = await fetch('/artist_gallery/categories');
                const data = await response.json();
                setCategories(flattenCategories(data.categories || []));
            } catch (error) {
                console.error(
                    '[ArtistSelector] Failed to load categories:',
                    error,
                );
            }
        };
        loadCategories();
    }, []);

    // 加载所有画师（用于分类选择）
    useEffect(() => {
        const loadAllArtists = async () => {
            try {
                const response = await fetch('/artist_gallery/artists');
                const data = await response.json();
                setAllArtists(data.artists || []);
            } catch (error) {
                console.error(
                    '[ArtistSelector] Failed to load all artists:',
                    error,
                );
            }
        };
        loadAllArtists();
    }, []);

    // 加载画师列表（根据分类筛选）
    useEffect(() => {
        const loadArtists = async () => {
            setLoading(true);
            try {
                // 加载当前分类的画师
                const url =
                    currentCategory === 'root'
                        ? '/artist_gallery/data?category=root'
                        : `/artist_gallery/data?category=${currentCategory}`;
                const response = await fetch(url);
                const data = await response.json();

                // 从响应中提取画师数据
                const artistsList = data.artists || [];
                setArtists(artistsList);

                // 画师列表加载后，恢复之前的选择
                const savedSelection = localStorage.getItem(
                    'artist_selector_selection',
                );
                if (savedSelection) {
                    try {
                        const savedData = JSON.parse(savedSelection);
                        const savedKeys = savedData.keys || [];
                        const savedCats = savedData.categories || [];

                        if (savedKeys.length > 0 || savedCats.length > 0) {
                            const newKeysSet = new Set(savedKeys);
                            const newCatsSet = new Set(savedCats);
                            setSelectedKeys(newKeysSet);
                            setSelectedCategories(newCatsSet);

                            // 更新缓存：添加当前分类中的已选画师
                            setSelectedArtistsCache((prev) => {
                                const newCache = { ...prev };
                                savedKeys.forEach((key) => {
                                    const { categoryId, name } =
                                        parseArtistKey(key);
                                    const artist = artistsList.find(
                                        (a) =>
                                            a.categoryId === categoryId &&
                                            a.name === name,
                                    );
                                    if (artist && !newCache[key]) {
                                        newCache[key] = artist;
                                    }
                                });
                                return newCache;
                            });
                        }
                    } catch (e) {
                        console.error(
                            '[ArtistSelector] Failed to load saved selection:',
                            e,
                        );
                    }
                }
            } catch (error) {
                console.error(
                    '[ArtistSelector] Failed to load artists:',
                    error,
                );
            } finally {
                setLoading(false);
            }
        };
        loadArtists();
    }, [currentCategory]);

    // 过滤和排序
    const filteredArtists = useMemo(() => {
        if (!artists || artists.length === 0) return [];
        let result = [...artists];

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter(
                (a) =>
                    a.name.toLowerCase().includes(query) ||
                    a.displayName.toLowerCase().includes(query),
            );
        }

        result.sort((a, b) => {
            let comparison = 0;
            if (sortBy === 'name') {
                comparison = a.name.localeCompare(b.name, 'zh-CN');
            } else if (sortBy === 'created_at') {
                comparison = a.createdAt - b.createdAt;
            } else if (sortBy === 'image_count') {
                comparison = (a.imageCount || 0) - (b.imageCount || 0);
            }
            return sortOrder === 'asc' ? comparison : -comparison;
        });

        return result;
    }, [artists, searchQuery, sortBy, sortOrder]);

    // 切换画师选择状态
    const toggleSelection = (categoryId, name) => {
        const key = makeArtistKey(categoryId, name);
        const newSelected = new Set(selectedKeys);
        const newCache = { ...selectedArtistsCache };

        if (newSelected.has(key)) {
            newSelected.delete(key);
            delete newCache[key];
        } else {
            newSelected.add(key);
            // 从当前画师列表中找到完整的画师信息并缓存
            const artist = artists.find(
                (a) => a.categoryId === categoryId && a.name === name,
            );
            if (artist) {
                newCache[key] = artist;
            }
        }

        setSelectedKeys(newSelected);
        setSelectedArtistsCache(newCache);

        // 保存到 localStorage
        saveSelection(newSelected, selectedCategories);

        // 更新节点值
        updateNodeValue(newSelected, selectedCategories, newCache);
    };

    // 切换分类选择状态
    const toggleCategorySelection = (categoryId) => {
        const newSelectedCats = new Set(selectedCategories);

        if (newSelectedCats.has(categoryId)) {
            newSelectedCats.delete(categoryId);
        } else {
            newSelectedCats.add(categoryId);
        }

        setSelectedCategories(newSelectedCats);

        // 保存到 localStorage
        saveSelection(selectedKeys, newSelectedCats);

        // 更新节点值
        updateNodeValue(selectedKeys, newSelectedCats, selectedArtistsCache);
    };

    // 保存选择到 localStorage
    const saveSelection = (keys, cats) => {
        localStorage.setItem(
            'artist_selector_selection',
            JSON.stringify({
                keys: [...keys],
                categories: [...cats],
            }),
        );
    };

    // 更新节点值
    const updateNodeValue = (keys, cats, cache = selectedArtistsCache) => {
        const selectedArtists = Array.from(keys)
            .map((key) => cache[key])
            .filter(Boolean);

        // 收集所有选中的画师名称（包括从分类中递归获取的）
        const allArtistNames = [
            ...new Set([
                ...selectedArtists.map((a) => a.name),
                ...getArtistNamesFromCategories(cats),
            ]),
        ];

        if (allArtistNames.length > 0) {
            // 原样输出，不添加或删除任何符号
            const artistsString = allArtistNames.join(',');
            const metadata = {
                // 移除 artist_ids（新架构没有 id 字段）
                artist_names: allArtistNames,
                display_names: selectedArtists.map(
                    (a) => a.displayName || a.name,
                ),
                selected_categories: [...cats],
                selected_artists: Array.from(keys).map((key) => {
                    const { categoryId, name } = parseArtistKey(key);
                    return { categoryId, name };
                }),
            };

            // 直接设置 widget 的值
            if (selectedInput) {
                selectedInput.value = artistsString;
            }
            if (metadataInput) {
                metadataInput.value = JSON.stringify(metadata);
            }

            // 更新节点的输入数据（这是关键！）
            if (nodeInstance.inputs) {
                const selectedInputIdx = nodeInstance.inputs.findIndex(
                    (i) => i.name === 'selected_artists',
                );
                const metadataInputIdx = nodeInstance.inputs.findIndex(
                    (i) => i.name === 'metadata',
                );

                if (selectedInputIdx >= 0) {
                    nodeInstance.inputs[selectedInputIdx].value = artistsString;
                }
                if (metadataInputIdx >= 0) {
                    nodeInstance.inputs[metadataInputIdx].value =
                        JSON.stringify(metadata);
                }
            }

            console.log('[ArtistSelector] 更新节点值:', {
                artistsString,
                metadata,
                selectedInputValue: selectedInput?.value,
                metadataInputValue: metadataInput?.value,
            });
        } else {
            if (selectedInput) {
                selectedInput.value = '';
            }
            if (metadataInput) {
                metadataInput.value = '{}';
            }

            // 更新节点的输入数据
            if (nodeInstance.inputs) {
                const selectedInputIdx = nodeInstance.inputs.findIndex(
                    (i) => i.name === 'selected_artists',
                );
                const metadataInputIdx = nodeInstance.inputs.findIndex(
                    (i) => i.name === 'metadata',
                );

                if (selectedInputIdx >= 0) {
                    nodeInstance.inputs[selectedInputIdx].value = '';
                }
                if (metadataInputIdx >= 0) {
                    nodeInstance.inputs[metadataInputIdx].value = '{}';
                }
            }

            console.log('[ArtistSelector] 清空节点值');
        }

        // 触发节点更新和重新执行
        if (nodeInstance.graph) {
            nodeInstance.graph.change();
        }
        nodeInstance.setDirtyCanvas(true, true);
    };

    // 从分类中递归获取所有画师名称
    const getArtistNamesFromCategories = (categoryIds) => {
        const names = [];

        categoryIds.forEach((catId) => {
            // 递归获取子分类
            const childCategories = categories.filter(
                (c) => c.parentId === catId,
            );
            const childCatIds = childCategories.map((c) => c.id);
            names.push(...getArtistNamesFromCategories(childCatIds));

            // 获取当前分类下的画师（使用 allArtists 而不是 artists）
            const catArtists = allArtists.filter((a) => a.categoryId === catId);
            names.push(...catArtists.map((a) => a.name));
        });

        return names;
    };

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
            // 刷新当前分类的画师
            const url =
                currentCategory === 'root'
                    ? '/artist_gallery/data?category=root'
                    : `/artist_gallery/data?category=${currentCategory}`;
            const response = await fetch(url);
            const data = await response.json();
            const artistsList = data.artists || [];
            setArtists(artistsList);

            // 同时刷新所有画师
            const allResponse = await fetch('/artist_gallery/artists');
            const allData = await allResponse.json();
            setAllArtists(allData.artists || []);
        } catch (error) {
            console.error('[ArtistSelector] Failed to refresh:', error);
        } finally {
            setRefreshing(false);
        }
    };

    return {
        // 状态
        artists,
        categories,
        selectedKeys,
        selectedCategories,
        loading,
        searchQuery,

        sortBy,
        sortOrder,
        currentCategory,
        filteredArtists,
        selectedArtistsList,
        selectedCategoriesList,
        refreshing,
        breadcrumbPath,
        // 操作
        setSearchQuery,
        setSortBy,
        setSortOrder,
        toggleSelection,
        toggleCategorySelection,
        handleCategoryChange,
        handleRefresh,
        makeArtistKey,
        parseArtistKey,
    };
}
