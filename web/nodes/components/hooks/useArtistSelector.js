/**
 * 画师选择逻辑 Hook
 * 处理画师数据加载、选择状态管理、排序过滤等逻辑
 */
import {
    useState,
    useEffect,
    useMemo,
    useCallback,
} from '../../../lib/hooks.mjs';
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

    // 验证分区数据完整性
    const validatePartitionData = (data) => {
        // 确保至少有一个默认分区
        const hasDefault =
            data.partitions && data.partitions.some((p) => p.isDefault);
        if (!hasDefault) {
            console.warn(
                '[ArtistSelector] No default partition found, resetting...',
            );
            return null;
        }

        // 确保 partitions 数组存在
        if (!data.partitions || !Array.isArray(data.partitions)) {
            console.warn(
                '[ArtistSelector] Invalid partitions array, resetting...',
            );
            return null;
        }

        // 确保 artistPartitionMap 存在
        if (!data.artistPartitionMap) {
            data.artistPartitionMap = {};
        }

        // 确保 categoryPartitionMap 存在
        if (!data.categoryPartitionMap) {
            data.categoryPartitionMap = {};
        }

        // 确保 globalConfig 存在
        if (!data.globalConfig) {
            data.globalConfig = {
                format: '{content}',
                randomMode: false,
                randomCount: 3,
                cycleMode: false,
            };
        }

        return data;
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

    // 保存分区数据到 localStorage
    const savePartitionData = (data) => {
        // 确保 categoryPartitionMap 存在
        if (!data.categoryPartitionMap) {
            data = { ...data, categoryPartitionMap: {} };
        }
        localStorage.setItem(
            'artist_selector_partitions',
            JSON.stringify(data),
        );
    };

    // 创建默认分区数据
    const createDefaultPartitionData = () => {
        return {
            partitions: [
                {
                    id: 'partition-default',
                    name: '默认分区',
                    isDefault: true,
                    enabled: true,
                    config: {
                        format: '{content}',
                        randomMode: false,
                        randomCount: 3,
                        cycleMode: false,
                    },
                    order: 0,
                    createdAt: Date.now(),
                },
            ],
            artistPartitionMap: {},
            categoryPartitionMap: {},
            globalConfig: {
                format: '{content}',
                randomMode: false,
                randomCount: 3,
                cycleMode: false,
            },
        };
    };

    // 从分类中递归获取所有画师名称
    // 从分类中递归获取画师名称（添加循环检测）
    const getArtistNamesFromCategories = (categoryIds, visited = new Set()) => {
        const names = [];

        categoryIds.forEach((catId) => {
            // 循环检测
            if (visited.has(catId)) {
                console.warn(
                    `[ArtistSelector] Circular reference detected in category: ${catId}`,
                );
                return;
            }
            visited.add(catId);

            // 递归获取子分类
            const childCategories = categories.filter(
                (c) => c.parentId === catId,
            );
            const childCatIds = childCategories.map((c) => c.id);
            names.push(...getArtistNamesFromCategories(childCatIds, visited));

            // 获取当前分类下的画师（使用 allArtists 而不是 artists）
            const catArtists = allArtists.filter((a) => a.categoryId === catId);
            names.push(...catArtists.map((a) => a.name));
        });

        return names;
    };

    // 分区系统状态
    const [partitionData, setPartitionData] = useState(() => {
        // 尝试从 localStorage 加载
        try {
            const saved = localStorage.getItem('artist_selector_partitions');
            if (saved) {
                const data = JSON.parse(saved);
                // 验证数据完整性
                const validated = validatePartitionData(data);
                if (validated) {
                    return validated;
                }
            }
        } catch (error) {
            console.error(
                '[ArtistSelector] Failed to load partition data:',
                error,
            );
        }

        // 返回默认值
        return createDefaultPartitionData();
    });

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

    // 加载分区数据（从 localStorage）- 已移到 useState 初始化中

    // 加载画师列表（根据分类筛选）

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

                            // 找到默认分区
                            const defaultPartition =
                                partitionData.partitions.find(
                                    (p) => p.isDefault,
                                );
                            const defaultPartitionId = defaultPartition
                                ? defaultPartition.id
                                : 'partition-default';

                            // 为旧的画师选择创建分区映射
                            const newArtistMap = {
                                ...partitionData.artistPartitionMap,
                            };
                            savedKeys.forEach((key) => {
                                if (!newArtistMap[key]) {
                                    newArtistMap[key] = defaultPartitionId;
                                }
                            });

                            // 为旧的分类选择创建分区映射
                            const newCategoryMap = {
                                ...partitionData.categoryPartitionMap,
                            };
                            savedCats.forEach((catId) => {
                                if (!newCategoryMap[catId]) {
                                    newCategoryMap[catId] = defaultPartitionId;
                                }
                            });

                            // 更新分区数据
                            setPartitionData((prev) => ({
                                ...prev,
                                artistPartitionMap: newArtistMap,
                                categoryPartitionMap: newCategoryMap,
                            }));

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

    // 切换画师选择状态（使用函数式更新避免闭包陷阱）
    const toggleSelection = useCallback(
        (categoryId, name) => {
            const key = makeArtistKey(categoryId, name);

            // 使用函数式更新确保获取最新状态
            setSelectedKeys((prevSelectedKeys) => {
                const newSelected = new Set(prevSelectedKeys);
                const isAdding = !newSelected.has(key);

                if (isAdding) {
                    newSelected.add(key);
                } else {
                    newSelected.delete(key);
                }

                // 同时更新其他相关状态
                setSelectedArtistsCache((prevCache) => {
                    const newCache = { ...prevCache };
                    if (isAdding) {
                        // 从当前画师列表中找到完整的画师信息并缓存
                        const artist = artists.find(
                            (a) =>
                                a.categoryId === categoryId && a.name === name,
                        );
                        if (artist) {
                            newCache[key] = artist;
                        }
                    } else {
                        delete newCache[key];
                    }
                    return newCache;
                });

                // 更新分区映射
                setPartitionData((prevData) => {
                    const newMap = { ...prevData.artistPartitionMap };
                    if (isAdding) {
                        // 添加到默认分区
                        const defaultPartition = prevData.partitions.find(
                            (p) => p.isDefault,
                        );
                        if (defaultPartition) {
                            newMap[key] = defaultPartition.id;
                        }
                    } else {
                        delete newMap[key];
                    }

                    const newData = { ...prevData, artistPartitionMap: newMap };

                    // 保存到 localStorage
                    saveSelection(newSelected, selectedCategories);
                    savePartitionData(newData);

                    return newData;
                });

                return newSelected;
            });
        },
        [
            artists,
            selectedCategories,
            makeArtistKey,
            saveSelection,
            savePartitionData,
        ],
    );

    // 切换分类选择状态（使用函数式更新避免闭包陷阱）
    const toggleCategorySelection = useCallback(
        (categoryId) => {
            // 使用函数式更新确保获取最新状态
            setSelectedCategories((prevSelectedCats) => {
                const newSelectedCats = new Set(prevSelectedCats);
                const isAdding = !newSelectedCats.has(categoryId);

                if (isAdding) {
                    newSelectedCats.add(categoryId);
                } else {
                    newSelectedCats.delete(categoryId);
                }

                // 更新分区映射
                setPartitionData((prevData) => {
                    const newCategoryMap = { ...prevData.categoryPartitionMap };
                    if (isAdding) {
                        // 添加到默认分区
                        const defaultPartition = prevData.partitions.find(
                            (p) => p.isDefault,
                        );
                        if (defaultPartition) {
                            newCategoryMap[categoryId] = defaultPartition.id;
                        }
                    } else {
                        delete newCategoryMap[categoryId];
                    }

                    const newData = {
                        ...prevData,
                        categoryPartitionMap: newCategoryMap,
                    };

                    // 保存到 localStorage
                    saveSelection(selectedKeys, newSelectedCats);
                    savePartitionData(newData);

                    return newData;
                });

                return newSelectedCats;
            });
        },
        [selectedKeys, saveSelection, savePartitionData],
    );

    // 更新节点值（使用 useCallback 避免闭包陷阱）
    const updateNodeValue = useCallback(() => {
        // console.log('[ArtistSelector] updateNodeValue called with:', {
        //     selectedKeys: Array.from(selectedKeys),
        //     selectedCategories: Array.from(selectedCategories),
        //     partitionDataKeys: Object.keys(partitionData.artistPartitionMap || {}),
        // });

        // 直接使用当前状态值，不使用参数
        const selectedArtists = Array.from(selectedKeys)
            .map((key) => selectedArtistsCache[key])
            .filter(Boolean);

        // console.log('[ArtistSelector] Selected artists from cache:', selectedArtists.length);

        // 收集所有选中的画师名称（包括从分类中递归获取的）
        const allArtistNames = [
            ...new Set([
                ...selectedArtists.map((a) => a.name),
                ...getArtistNamesFromCategories(selectedCategories),
            ]),
        ];

        // 使用当前分区数据
        const currentPartitionData = partitionData;

        // 构建完整的分区配置（包含所有必要字段）
        const partitionConfigs = {};
        currentPartitionData.partitions.forEach((p) => {
            partitionConfigs[p.id] = {
                format: p.config.format,
                randomMode: p.config.randomMode,
                randomCount: p.config.randomCount,
                cycleMode: p.config.cycleMode,
                enabled: p.enabled,
                isDefault: p.isDefault,
                name: p.name,
            };
        });

        // 构建画师到分区的映射（简化版，只使用画师名称）
        const artistPartitionMap = {};
        Object.keys(currentPartitionData.artistPartitionMap).forEach((key) => {
            const artist = selectedArtistsCache[key];
            if (artist) {
                artistPartitionMap[artist.name] =
                    currentPartitionData.artistPartitionMap[key];
            }
        });

        // 为从分类中获取的画师分配到默认分区
        const defaultPartition = currentPartitionData.partitions.find(
            (p) => p.isDefault,
        );
        const defaultPartitionId = defaultPartition
            ? defaultPartition.id
            : 'partition-default';

        // 获取分类中的所有画师，并按分类所属分区分配
        selectedCategories.forEach((catId) => {
            const catArtists = allArtists.filter((a) => a.categoryId === catId);
            const categoryPartitionId = currentPartitionData.categoryPartitionMap[catId] || defaultPartitionId;

            // console.log(`[ArtistSelector] Category ${catId} has ${catArtists.length} artists, assigned to partition ${categoryPartitionId}`);

            // 将分类中的画师分配到分类所属的分区
            catArtists.forEach((artist) => {
                if (!artistPartitionMap[artist.name]) {
                    artistPartitionMap[artist.name] = categoryPartitionId;
                    // console.log(`[ArtistSelector] Assigned category artist ${artist.name} to partition ${categoryPartitionId}`);
                }
            });
        });

        if (allArtistNames.length > 0) {
            // 原样输出，后端会根据配置处理
            const artistsString = allArtistNames.join(',');

            // console.log('[ArtistSelector] Generated artists string:', artistsString);
            // console.log('[ArtistSelector] Artist partition map:', artistPartitionMap);
            // console.log('[ArtistSelector] Partition configs:', partitionConfigs);

            const metadata = {
                // 添加完整的分区配置信息
                globalConfig: currentPartitionData.globalConfig,
                partitionConfigs: partitionConfigs,
                artistPartitionMap: artistPartitionMap,
                categoryPartitionMap:
                    currentPartitionData.categoryPartitionMap || {},
                // 原有 metadata（保持兼容）
                artist_names: allArtistNames,
                display_names: selectedArtists.map(
                    (a) => a.displayName || a.name,
                ),
                selected_categories: [...selectedCategories],
                selected_artists: Array.from(selectedKeys).map((key) => {
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

            // console.log('[ArtistSelector] 更新节点值:', {
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

            // console.log('[ArtistSelector] 清空节点值');
        }

        // 触发节点更新和重新执行
        if (nodeInstance.graph) {
            nodeInstance.graph.change();
        }
        nodeInstance.setDirtyCanvas(true, true);
    }, [
        selectedKeys,
        selectedCategories,
        selectedArtistsCache,
        partitionData,
        allArtists,
        categories,
        getArtistNamesFromCategories,
        parseArtistKey,
        selectedInput,
        metadataInput,
        nodeInstance,
    ]);

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

    // ============ 分区操作函数 ============

    // 添加新分区
    const addPartition = useCallback((name) => {
        setPartitionData((prev) => {
            if (prev.partitions.length >= 10) {
                console.warn('[ArtistSelector] 最多只能创建10个分区');
                return prev;
            }

            const newPartition = {
                id: `partition-${Date.now()}`,
                name,
                isDefault: false,
                enabled: true,
                config: { ...prev.globalConfig },
                order: prev.partitions.length,
                createdAt: Date.now(),
            };

            const newData = {
                ...prev,
                partitions: [...prev.partitions, newPartition],
            };

            savePartitionData(newData);
            return newData;
        });
    }, []);

    // 删除分区
    const deletePartition = useCallback((partitionId) => {
        setPartitionData((prev) => {
            const partition = prev.partitions.find((p) => p.id === partitionId);
            if (!partition || partition.isDefault) {
                console.warn('[ArtistSelector] 不能删除默认分区');
                return prev;
            }

            // 将该分区的画师移动到默认分区
            const defaultPartition = prev.partitions.find((p) => p.isDefault);
            if (!defaultPartition) return prev;

            const newArtistPartitionMap = { ...prev.artistPartitionMap };
            Object.keys(newArtistPartitionMap).forEach((key) => {
                if (newArtistPartitionMap[key] === partitionId) {
                    newArtistPartitionMap[key] = defaultPartition.id;
                }
            });

            const newData = {
                ...prev,
                partitions: prev.partitions.filter((p) => p.id !== partitionId),
                artistPartitionMap: newArtistPartitionMap,
            };

            savePartitionData(newData);
            return newData;
        });
    }, []);

    // 更新分区配置
    const updatePartition = useCallback((partitionId, updates) => {
        setPartitionData((prev) => {
            const newData = {
                ...prev,
                partitions: prev.partitions.map((p) => {
                    if (p.id === partitionId) {
                        // 合并更新，但保留enabled等状态字段
                        return {
                            ...p,
                            ...updates,
                            // 确保enabled状态不会被覆盖
                            enabled: p.enabled,
                            isDefault: p.isDefault,
                            order: p.order,
                            createdAt: p.createdAt,
                        };
                    }
                    return p;
                }),
            };

            savePartitionData(newData);
            return newData;
        });
    }, []);

    // 移动画师到指定分区
    const moveArtistToPartition = useCallback((artistKey, partitionId) => {
        setPartitionData((prev) => {
            const newData = {
                ...prev,
                artistPartitionMap: {
                    ...prev.artistPartitionMap,
                    [artistKey]: partitionId,
                },
            };

            savePartitionData(newData);
            return newData;
        });
    }, []);

    // 切换分区启用状态
    const togglePartition = useCallback((partitionId) => {
        setPartitionData((prev) => {
            const newData = {
                ...prev,
                partitions: prev.partitions.map((p) =>
                    p.id === partitionId ? { ...p, enabled: !p.enabled } : p,
                ),
            };

            savePartitionData(newData);
            return newData;
        });
    }, []);

    // 设置默认分区
    const setAsDefaultPartition = useCallback((partitionId) => {
        setPartitionData((prev) => {
            const newData = {
                ...prev,
                partitions: prev.partitions.map((p) => ({
                    ...p,
                    isDefault: p.id === partitionId,
                })),
            };

            savePartitionData(newData);

            // 不需要手动调用 updateNodeValue，useEffect 会自动处理
            return newData;
        });
    }, []);

    // 移动分类到指定分区
    const moveCategoryToPartition = useCallback((categoryId, partitionId) => {
        setPartitionData((prev) => {
            const newData = {
                ...prev,
                categoryPartitionMap: {
                    ...prev.categoryPartitionMap,
                    [categoryId]: partitionId,
                },
            };

            savePartitionData(newData);
            return newData;
        });
    }, []);

    // 获取每个分区的画师列表
    const getArtistsByPartition = useMemo(() => {
        const result = {};
        partitionData.partitions.forEach((partition) => {
            result[partition.id] = Object.keys(partitionData.artistPartitionMap)
                .filter(
                    (key) =>
                        partitionData.artistPartitionMap[key] === partition.id,
                )
                .map((key) => selectedArtistsCache[key])
                .filter(Boolean);
        });
        return result;
    }, [partitionData, selectedArtistsCache]);

    // 获取每个分区的分类列表
    const getCategoriesByPartition = useMemo(() => {
        const result = {};
        partitionData.partitions.forEach((partition) => {
            result[partition.id] = Object.keys(
                partitionData.categoryPartitionMap,
            )
                .filter(
                    (catId) =>
                        partitionData.categoryPartitionMap[catId] ===
                        partition.id,
                )
                .map((catId) => categories.find((c) => c.id === catId))
                .filter(Boolean);
        });
        return result;
    }, [partitionData, categories]);

    // 统一的状态变化监听：自动更新节点值
    // 当关键状态变化时，自动调用 updateNodeValue
    useEffect(() => {
        updateNodeValue();
    }, [updateNodeValue]);

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

        // 分区系统状态和操作
        partitionData,
        getArtistsByPartition,
        getCategoriesByPartition,
        addPartition,
        deletePartition,
        updatePartition,
        moveArtistToPartition,
        moveCategoryToPartition,
        togglePartition,
        setAsDefaultPartition,

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
        updateNodeValue, // 导出 updateNodeValue 函数
    };
}
