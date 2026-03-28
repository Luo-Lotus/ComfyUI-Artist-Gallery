/**
 * 画师选择逻辑 Hook
 * 处理画师数据加载、选择状态管理、排序过滤等逻辑
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
        const cat = categories.find(c => c.id === id);
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
    // 状态管理
    const [artists, setArtists] = useState([]);
    const [categories, setCategories] = useState([]);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [selectedArtistsCache, setSelectedArtistsCache] = useState({}); // 缓存所有已选择的画师信息
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [hoveredImage, setHoveredImage] = useState(null);
    const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });
    const [sortBy, setSortBy] = useState('name');
    const [sortOrder, setSortOrder] = useState('asc');
    const [currentCategory, setCurrentCategory] = useState('root');
    const [refreshing, setRefreshing] = useState(false);

    // 计算面包屑路径
    const breadcrumbPath = useMemo(() => {
        return buildBreadcrumbPath(currentCategory, categories);
    }, [currentCategory, categories]);

    // 计算已选择的画师列表（从缓存中获取，不在当前分类的也显示）
    const selectedArtistsList = useMemo(() => {
        return Array.from(selectedIds).map(id => selectedArtistsCache[id]).filter(Boolean);
    }, [selectedIds, selectedArtistsCache]);

    // 加载分类列表
    useEffect(() => {
        const loadCategories = async () => {
            try {
                const response = await fetch('/artist_gallery/categories');
                const data = await response.json();
                setCategories(flattenCategories(data.categories || []));
            } catch (error) {
                console.error('[ArtistSelector] Failed to load categories:', error);
            }
        };
        loadCategories();
    }, []);

    // 加载画师列表（根据分类筛选）
    useEffect(() => {
        const loadArtists = async () => {
            setLoading(true);
            try {
                const url = currentCategory === 'root'
                    ? '/artist_gallery/artists'
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
                        const savedIds = JSON.parse(savedSelection);
                        if (Array.isArray(savedIds) && savedIds.length > 0) {
                            const newSet = new Set(savedIds);
                            setSelectedIds(newSet);
                            // 更新缓存：添加当前分类中的已选画师
                            setSelectedArtistsCache(prev => {
                                const newCache = { ...prev };
                                savedIds.forEach(id => {
                                    const artist = artistsList.find(a => a.id === id);
                                    if (artist && !newCache[id]) {
                                        newCache[id] = artist;
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

    // 切换选择状态
    const toggleSelection = (artistId) => {
        const newSelected = new Set(selectedIds);
        const newCache = { ...selectedArtistsCache };

        if (newSelected.has(artistId)) {
            newSelected.delete(artistId);
            delete newCache[artistId];
        } else {
            newSelected.add(artistId);
            // 从当前画师列表中找到完整的画师信息并缓存
            const artist = artists.find(a => a.id === artistId);
            if (artist) {
                newCache[artistId] = artist;
            }
        }

        setSelectedIds(newSelected);
        setSelectedArtistsCache(newCache);

        // 保存到 localStorage
        localStorage.setItem(
            'artist_selector_selection',
            JSON.stringify([...newSelected]),
        );

        // 更新节点值
        updateNodeValue(newSelected, newCache);
    };

    // 更新节点值
    const updateNodeValue = (selectedSet, cache = selectedArtistsCache) => {
        const selectedArtists = Array.from(selectedSet).map(id => cache[id]).filter(Boolean);

        if (selectedArtists.length > 0) {
            // 原样输出，不添加或删除任何符号
            const artistsString = selectedArtists.map((a) => a.name).join(',');
            const metadata = {
                artist_ids: selectedArtists.map((a) => a.id),
                artist_names: selectedArtists.map((a) => a.name),
                display_names: selectedArtists.map((a) => a.displayName),
            };

            // 更新隐藏的 inputs
            if (selectedInput) selectedInput.value = artistsString;
            if (metadataInput) metadataInput.value = JSON.stringify(metadata);
        } else {
            if (selectedInput) selectedInput.value = '';
            if (metadataInput) metadataInput.value = '{}';
        }

        // 触发节点更新和重新执行
        if (nodeInstance.graph) {
            nodeInstance.graph.change();
        }
        nodeInstance.setDirtyCanvas(true, true);
    };

    // 鼠标悬停处理
    const handleMouseEnter = (artist, event) => {
        if (artist.imageCount > 0) {
            fetch(`/artist_gallery/artist/${artist.id}/images`)
                .then((res) => res.json())
                .then((data) => {
                    if (data.images && data.images.length > 0) {
                        const imagePath = data.images[0].path;
                        const imageUrl = `/view?filename=${imagePath}`;
                        setHoveredImage(imageUrl);
                        setHoverPosition({
                            x: event.clientX + 15,
                            y: event.clientY + 15,
                        });
                    }
                });
        }
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
            const url = currentCategory === 'root'
                ? '/artist_gallery/artists'
                : `/artist_gallery/data?category=${currentCategory}`;
            const response = await fetch(url);
            const data = await response.json();
            const artistsList = data.artists || [];
            setArtists(artistsList);
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
        selectedIds,
        loading,
        searchQuery,
        hoveredImage,
        hoverPosition,
        sortBy,
        sortOrder,
        currentCategory,
        filteredArtists,
        selectedArtistsList,
        refreshing,
        breadcrumbPath,
        // 操作
        setSearchQuery,
        setSortBy,
        setSortOrder,
        toggleSelection,
        handleMouseEnter,
        setHoveredImage,
        handleCategoryChange,
        handleRefresh,
    };
}
