/**
 * 分区状态管理 Hook
 * 分区 CRUD、校验、计算分区视图
 * 持久化由 useNodeSync 通过 nodeInstance widget 完成（ComfyUI 自动保存）
 */
import { useState, useMemo, useCallback } from '../../../lib/hooks.mjs';

const DEFAULT_CONFIG = {
    format: '{content}',
    randomMode: false,
    randomCount: 3,
    cycleMode: false,
    saveToGallery: true,
    autoCreateCombination: false,
};

const DEFAULT_PARTITION = {
    id: 'partition-default',
    name: '默认分区',
    isDefault: true,
    enabled: true,
    config: { ...DEFAULT_CONFIG },
    order: 0,
    createdAt: Date.now(),
};

const DEFAULT_PARTITION_DATA = {
    partitions: [DEFAULT_PARTITION],
    artistPartitionMap: {},
    categoryPartitionMap: {},
    combinationPartitionMap: {},
    globalConfig: { ...DEFAULT_CONFIG },
};

function validatePartitionData(data) {
    if (!data.partitions || !Array.isArray(data.partitions)) {
        console.warn('[PartitionState] Invalid partitions array');
        return null;
    }
    if (!data.partitions.some((p) => p.isDefault)) {
        console.warn('[PartitionState] No default partition found');
        return null;
    }
    if (!data.artistPartitionMap) data.artistPartitionMap = {};
    if (!data.categoryPartitionMap) data.categoryPartitionMap = {};
    if (!data.combinationPartitionMap) data.combinationPartitionMap = {};
    if (!data.globalConfig) data.globalConfig = { ...DEFAULT_CONFIG };
    return data;
}

/**
 * 从 nodeInstance metadata widget 值解析分区数据
 * v1 格式: { version:1, partitions:[{id, artistKeys[], categoryIds[], ...}], globalConfig }
 * 内部格式: { partitions, artistPartitionMap, categoryPartitionMap, globalConfig }
 */
function parseWidgetMetadata(widgetValue) {
    try {
        const data = JSON.parse(widgetValue);
        if (!data || data.version !== 1 || !Array.isArray(data.partitions)) {
            return null;
        }
        const artistPartitionMap = {};
        const categoryPartitionMap = {};
        const combinationPartitionMap = {};
        const partitions = data.partitions.map((p, i) => {
            for (const key of (p.artistKeys || [])) {
                artistPartitionMap[key] = p.id;
            }
            for (const catId of (p.categoryIds || [])) {
                categoryPartitionMap[catId] = p.id;
            }
            for (const combKey of (p.combinationKeys || [])) {
                combinationPartitionMap[combKey] = p.id;
            }
            return {
                id: p.id,
                name: p.name,
                isDefault: p.isDefault,
                enabled: p.enabled,
                config: p.config,
                order: i,
                createdAt: p.createdAt || Date.now(),
            };
        });
        return validatePartitionData({
            partitions,
            artistPartitionMap,
            categoryPartitionMap,
            combinationPartitionMap,
            globalConfig: data.globalConfig || { ...DEFAULT_CONFIG },
        });
    } catch {
        return null;
    }
}

export function usePartitionState({ selectedArtistsCache, categories, combinations, metadataInput }) {
    const [partitionData, setPartitionData] = useState(() => {
        // 从 nodeInstance widget 恢复（ComfyUI 在 onNodeCreated 前已恢复 widget 值）
        if (metadataInput?.value) {
            const parsed = parseWidgetMetadata(metadataInput.value);
            if (parsed) return parsed;
        }
        return { ...DEFAULT_PARTITION_DATA };
    });

    // 获取每个分区的画师列表（含孤立项标记）
    const getArtistsByPartition = useMemo(() => {
        const result = {};
        partitionData.partitions.forEach((partition) => {
            result[partition.id] = Object.keys(partitionData.artistPartitionMap)
                .filter((key) => partitionData.artistPartitionMap[key] === partition.id)
                .map((key) => {
                    const cached = selectedArtistsCache[key];
                    if (cached) return cached;
                    // 孤立项：生成合成对象，UI 可展示警告
                    const colonIdx = key.indexOf(':');
                    return {
                        categoryId: key.substring(0, colonIdx),
                        name: key.substring(colonIdx + 1),
                        displayName: key.substring(colonIdx + 1),
                        _orphaned: true,
                        _orphanedKey: key,
                    };
                });
        });
        return result;
    }, [partitionData, selectedArtistsCache]);

    // 获取每个分区的分类列表
    const getCategoriesByPartition = useMemo(() => {
        const result = {};
        partitionData.partitions.forEach((partition) => {
            result[partition.id] = Object.keys(partitionData.categoryPartitionMap)
                .filter((catId) => partitionData.categoryPartitionMap[catId] === partition.id)
                .map((catId) => categories.find((c) => c.id === catId))
                .filter(Boolean);
        });
        return result;
    }, [partitionData, categories]);

    // 获取每个分区的组合列表
    const getCombinationsByPartition = useMemo(() => {
        const result = {};
        partitionData.partitions.forEach((partition) => {
            result[partition.id] = Object.keys(partitionData.combinationPartitionMap)
                .filter((combKey) => partitionData.combinationPartitionMap[combKey] === partition.id)
                .map((combKey) => {
                    // combKey format: combination:{id}
                    const combId = combKey.replace('combination:', '');
                    return (combinations || []).find((c) => c.id === combId);
                })
                .filter(Boolean);
        });
        return result;
    }, [partitionData, combinations]);

    // 添加新分区
    const addPartition = useCallback((name) => {
        setPartitionData((prev) => {
            if (prev.partitions.length >= 10) {
                console.warn('[PartitionState] 最多只能创建10个分区');
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
            return {
                ...prev,
                partitions: [...prev.partitions, newPartition],
            };
        });
    }, []);

    // 删除分区
    const deletePartition = useCallback((partitionId) => {
        setPartitionData((prev) => {
            const partition = prev.partitions.find((p) => p.id === partitionId);
            if (!partition || partition.isDefault) {
                console.warn('[PartitionState] 不能删除默认分区');
                return prev;
            }
            const defaultPartition = prev.partitions.find((p) => p.isDefault);
            if (!defaultPartition) return prev;
            const newArtistPartitionMap = { ...prev.artistPartitionMap };
            Object.keys(newArtistPartitionMap).forEach((key) => {
                if (newArtistPartitionMap[key] === partitionId) {
                    newArtistPartitionMap[key] = defaultPartition.id;
                }
            });
            const newCombinationPartitionMap = { ...prev.combinationPartitionMap };
            Object.keys(newCombinationPartitionMap).forEach((key) => {
                if (newCombinationPartitionMap[key] === partitionId) {
                    newCombinationPartitionMap[key] = defaultPartition.id;
                }
            });
            return {
                ...prev,
                partitions: prev.partitions.filter((p) => p.id !== partitionId),
                artistPartitionMap: newArtistPartitionMap,
                combinationPartitionMap: newCombinationPartitionMap,
            };
        });
    }, []);

    // 更新分区配置
    const updatePartition = useCallback((partitionId, updates) => {
        setPartitionData((prev) => {
            return {
                ...prev,
                partitions: prev.partitions.map((p) => {
                    if (p.id === partitionId) {
                        return {
                            ...p,
                            ...updates,
                            enabled: p.enabled,
                            isDefault: p.isDefault,
                            order: p.order,
                            createdAt: p.createdAt,
                        };
                    }
                    return p;
                }),
            };
        });
    }, []);

    // 移动画师到指定分区（partitionId 为 null 时移除）
    const moveArtistToPartition = useCallback((artistKey, partitionId) => {
        setPartitionData((prev) => {
            const newMap = { ...prev.artistPartitionMap };
            if (partitionId == null) {
                delete newMap[artistKey];
            } else {
                newMap[artistKey] = partitionId;
            }
            return {
                ...prev,
                artistPartitionMap: newMap,
            };
        });
    }, []);

    // 切换分区启用状态
    const togglePartition = useCallback((partitionId) => {
        setPartitionData((prev) => {
            return {
                ...prev,
                partitions: prev.partitions.map((p) =>
                    p.id === partitionId ? { ...p, enabled: !p.enabled } : p,
                ),
            };
        });
    }, []);

    // 设置默认分区
    const setAsDefaultPartition = useCallback((partitionId) => {
        setPartitionData((prev) => {
            return {
                ...prev,
                partitions: prev.partitions.map((p) => ({
                    ...p,
                    isDefault: p.id === partitionId,
                })),
            };
        });
    }, []);

    // 移动分类到指定分区（partitionId 为 null 时移除）
    const moveCategoryToPartition = useCallback((categoryId, partitionId) => {
        setPartitionData((prev) => {
            const newMap = { ...prev.categoryPartitionMap };
            if (partitionId == null) {
                delete newMap[categoryId];
            } else {
                newMap[categoryId] = partitionId;
            }
            return {
                ...prev,
                categoryPartitionMap: newMap,
            };
        });
    }, []);

    // 移动组合到指定分区（partitionId 为 null 时移除）
    const moveCombinationToPartition = useCallback((combinationKey, partitionId) => {
        setPartitionData((prev) => {
            const newMap = { ...prev.combinationPartitionMap };
            if (partitionId == null) {
                delete newMap[combinationKey];
            } else {
                newMap[combinationKey] = partitionId;
            }
            return { ...prev, combinationPartitionMap: newMap };
        });
    }, []);

    return {
        partitionData,
        setPartitionData,
        getArtistsByPartition,
        getCategoriesByPartition,
        getCombinationsByPartition,
        addPartition,
        deletePartition,
        updatePartition,
        moveArtistToPartition,
        moveCategoryToPartition,
        moveCombinationToPartition,
        togglePartition,
        setAsDefaultPartition,
    };
}
