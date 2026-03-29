/**
 * 画师节点同步 Hook
 * 负责节点值同步、元数据构建、刷新逻辑
 */
import { useCallback, useEffect } from '../../../lib/hooks.mjs';

// 从分类中递归获取画师名称（添加循环检测）
const getArtistNamesFromCategories = (categoryIds, categories, allArtists, visited = new Set()) => {
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
        names.push(...getArtistNamesFromCategories(childCatIds, categories, allArtists, visited));

        // 获取当前分类下的画师（使用 allArtists 而不是 artists）
        const catArtists = allArtists.filter((a) => a.categoryId === catId);
        names.push(...catArtists.map((a) => a.name));
    });

    return names;
};

export function useArtistSync(
    nodeInstance,
    selectedInput,
    metadataInput,
    selectedKeys,
    selectedCategories,
    selectedArtistsCache,
    partitionData,
    allArtists,
    categories,
    makeArtistKey,
    parseArtistKey,
) {
    // 保存选择到 localStorage
    const saveSelection = useCallback((keys, cats) => {
        localStorage.setItem(
            'artist_selector_selection',
            JSON.stringify({
                keys: [...keys],
                categories: [...cats],
            }),
        );
    }, []);

    // 更新节点值（使用 useCallback 避免闭包陷阱）
    const updateNodeValue = useCallback(() => {
        // 直接使用当前状态值，不使用参数
        const selectedArtists = Array.from(selectedKeys)
            .map((key) => selectedArtistsCache[key])
            .filter(Boolean);

        // 收集所有选中的画师名称（包括从分类中递归获取的）
        const allArtistNames = [
            ...new Set([
                ...selectedArtists.map((a) => a.name),
                ...getArtistNamesFromCategories(selectedCategories, categories, allArtists),
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

        // 为从分类中获取的画师分配到它们所属分类的分区
        selectedCategories.forEach((catId) => {
            const catArtists = allArtists.filter((a) => a.categoryId === catId);
            const categoryPartitionId = currentPartitionData.categoryPartitionMap[catId];

            // 如果分类有分配到分区，将该分类的画师分配到该分区
            if (categoryPartitionId) {
                catArtists.forEach((artist) => {
                    if (!artistPartitionMap[artist.name]) {
                        artistPartitionMap[artist.name] = categoryPartitionId;
                    }
                });
            }
        });

        if (allArtistNames.length > 0) {
            // 原样输出，后端会根据配置处理
            const artistsString = allArtistNames.join(',');
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
        }

        // 触发节点更新和重新执行
        if (nodeInstance.graph) {
            nodeInstance.graph.change();
        }
        nodeInstance.setDirtyCanvas(true, true);
    }, [
        nodeInstance,
        selectedInput,
        metadataInput,
        selectedKeys,
        selectedCategories,
        selectedArtistsCache,
        partitionData,
        allArtists,
        categories,
        parseArtistKey,
    ]);

    // 统一的状态变化监听：自动更新节点值
    // 当关键状态变化时，自动调用 updateNodeValue
    useEffect(() => {
        updateNodeValue();
    }, [updateNodeValue]);

    return {
        updateNodeValue,
        saveSelection,
        getArtistNamesFromCategories: (categoryIds) =>
            getArtistNamesFromCategories(categoryIds, categories, allArtists),
    };
}
