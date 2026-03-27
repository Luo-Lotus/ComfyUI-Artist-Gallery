/**
 * 画师选择逻辑 Hook
 * 处理画师数据加载、选择状态管理、排序过滤等逻辑
 */
import { useState, useEffect, useMemo } from '../../../lib/hooks.mjs';

export function useArtistSelector(nodeInstance, selectedInput, metadataInput) {
    // 状态管理
    const [artists, setArtists] = useState([]);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [hoveredImage, setHoveredImage] = useState(null);
    const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });
    const [sortBy, setSortBy] = useState('name');
    const [sortOrder, setSortOrder] = useState('asc');

    // 加载画师列表
    useEffect(() => {
        const loadArtists = async () => {
            try {
                const response = await fetch('/artist_gallery/artists');
                const data = await response.json();
                setArtists(data.artists || []);

                // 画师列表加载后，恢复之前的选择
                const savedSelection = localStorage.getItem(
                    'artist_selector_selection',
                );
                if (savedSelection) {
                    try {
                        const savedIds = JSON.parse(savedSelection);
                        if (Array.isArray(savedIds) && savedIds.length > 0) {
                            setSelectedIds(new Set(savedIds));
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
    }, []);

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
                comparison = a.imageCount - b.imageCount;
            }
            return sortOrder === 'asc' ? comparison : -comparison;
        });

        return result;
    }, [artists, searchQuery, sortBy, sortOrder]);

    // 切换选择状态
    const toggleSelection = (artistId) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(artistId)) {
            newSelected.delete(artistId);
        } else {
            newSelected.add(artistId);
        }
        setSelectedIds(newSelected);

        // 保存到 localStorage
        localStorage.setItem(
            'artist_selector_selection',
            JSON.stringify([...newSelected]),
        );

        // 更新节点值
        updateNodeValue(newSelected);
    };

    // 更新节点值
    const updateNodeValue = (selectedSet) => {
        const selectedArtists = artists.filter((a) => selectedSet.has(a.id));

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

    const selectedArtistsList = artists.filter((a) => selectedIds.has(a.id));

    return {
        // 状态
        artists,
        selectedIds,
        loading,
        searchQuery,
        hoveredImage,
        hoverPosition,
        sortBy,
        sortOrder,
        filteredArtists,
        selectedArtistsList,
        // 操作
        setSearchQuery,
        setSortBy,
        setSortOrder,
        toggleSelection,
        handleMouseEnter,
        setHoveredImage,
    };
}
