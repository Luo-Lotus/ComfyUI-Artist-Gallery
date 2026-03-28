/**
 * 分区系统管理 Hook
 * 封装所有分区状态和操作，确保原子性更新
 */
import { useState, useCallback, useEffect } from '../../../lib/hooks.mjs';

/**
 * 创建默认分区数据
 */
function createDefaultPartitionData() {
    const defaultPartition = {
        id: 'partition-default',
        name: '默认分区',
        isDefault: true,
        enabled: true,
        config: {
            format: '{content}',
            randomMode: false,
            randomCount: 1,
            cycleMode: false,
        },
        order: 0,
        createdAt: Date.now(),
    };

    return {
        partitions: [defaultPartition],
        artistPartitionMap: {},
        categoryPartitionMap: {},
        globalConfig: {
            format: '{content}',
            randomMode: false,
            randomCount: 1,
            cycleMode: false,
        },
    };
}

/**
 * 验证分区数据完整性
 */
function validatePartitionData(data) {
    // 确保至少有一个默认分区
    const hasDefault = data.partitions && data.partitions.some(p => p.isDefault);
    if (!hasDefault) {
        console.warn('No default partition found, resetting...');
        return createDefaultPartitionData();
    }

    // 确保 partitions 数组存在
    if (!data.partitions) {
        data.partitions = [];
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
        data.globalConfig = createDefaultPartitionData().globalConfig;
    }

    return data;
}

/**
 * 保存分区数据到 localStorage
 */
function savePartitionData(data) {
    try {
        localStorage.setItem('artist_selector_partition_data', JSON.stringify(data));
    } catch (e) {
        console.error('Failed to save partition data:', e);
    }
}

/**
 * 从 localStorage 加载分区数据
 */
function loadPartitionData() {
    try {
        const saved = localStorage.getItem('artist_selector_partition_data');
        if (saved) {
            const parsed = JSON.parse(saved);
            return validatePartitionData(parsed);
        }
    } catch (e) {
        console.error('Failed to load partition data:', e);
    }
    return createDefaultPartitionData();
}

/**
 * 分区系统管理 Hook
 */
export function usePartitionSystem(nodeInstance, selectedInput, metadataInput) {
    // 初始化分区数据
    const [partitionData, setPartitionData] = useState(() => loadPartitionData());

    /**
     * 更新节点值（当分区数据变化时调用）
     */
    const updateNodeValue = useCallback(() => {
        if (!metadataInput) return;

        // 构建完整的分区配置
        const partitionConfigs = {};
        partitionData.partitions.forEach(p => {
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

        const metadata = {
            globalConfig: partitionData.globalConfig,
            partitionConfigs,
            artistPartitionMap: partitionData.artistPartitionMap,
            categoryPartitionMap: partitionData.categoryPartitionMap,
        };

        metadataInput.value = JSON.stringify(metadata);
    }, [partitionData, metadataInput]);

    /**
     * 添加新分区
     */
    const addPartition = useCallback((name) => {
        setPartitionData(prev => {
            if (prev.partitions.length >= 10) {
                console.warn('Maximum 10 partitions allowed');
                return prev;
            }

            const newPartition = {
                id: `partition-${Date.now()}`,
                name: name || `分区 ${prev.partitions.length}`,
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

    /**
     * 删除分区
     */
    const deletePartition = useCallback((partitionId) => {
        setPartitionData(prev => {
            const partition = prev.partitions.find(p => p.id === partitionId);

            // 不允许删除默认分区
            if (partition && partition.isDefault) {
                console.warn('Cannot delete default partition');
                return prev;
            }

            // 只有最后一个分区时不允许删除
            if (prev.partitions.length <= 1) {
                console.warn('Must have at least one partition');
                return prev;
            }

            // 将该分区的画师移到默认分区
            const defaultPartition = prev.partitions.find(p => p.isDefault);
            const newArtistPartitionMap = { ...prev.artistPartitionMap };
            const newCategoryPartitionMap = { ...prev.categoryPartitionMap };

            Object.entries(newArtistPartitionMap).forEach(([key, pid]) => {
                if (pid === partitionId) {
                    newArtistPartitionMap[key] = defaultPartition.id;
                }
            });

            Object.entries(newCategoryPartitionMap).forEach(([catId, pid]) => {
                if (pid === partitionId) {
                    newCategoryPartitionMap[catId] = defaultPartition.id;
                }
            });

            const newData = {
                ...prev,
                partitions: prev.partitions.filter(p => p.id !== partitionId),
                artistPartitionMap: newArtistPartitionMap,
                categoryPartitionMap: newCategoryPartitionMap,
            };

            savePartitionData(newData);
            return newData;
        });
    }, []);

    /**
     * 更新分区配置
     */
    const updatePartition = useCallback((partitionId, updates) => {
        setPartitionData(prev => {
            const newData = {
                ...prev,
                partitions: prev.partitions.map(p =>
                    p.id === partitionId ? { ...p, ...updates } : p
                ),
            };

            savePartitionData(newData);
            return newData;
        });
    }, []);

    /**
     * 移动画师到分区
     */
    const moveArtistToPartition = useCallback((artistKey, partitionId) => {
        setPartitionData(prev => {
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

    /**
     * 移动分类到分区
     */
    const moveCategoryToPartition = useCallback((categoryId, partitionId) => {
        setPartitionData(prev => {
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

    /**
     * 切换分区启用状态
     */
    const togglePartition = useCallback((partitionId) => {
        setPartitionData(prev => {
            const newData = {
                ...prev,
                partitions: prev.partitions.map(p =>
                    p.id === partitionId ? { ...p, enabled: !p.enabled } : p
                ),
            };

            savePartitionData(newData);
            return newData;
        });
    }, []);

    /**
     * 设置为默认分区
     */
    const setAsDefaultPartition = useCallback((partitionId) => {
        setPartitionData(prev => {
            const newData = {
                ...prev,
                partitions: prev.partitions.map(p => ({
                    ...p,
                    isDefault: p.id === partitionId,
                })),
            };

            savePartitionData(newData);
            return newData;
        });
    }, []);

    /**
     * 获取分区中的画师列表
     */
    const getArtistsByPartition = useCallback((partitionId, selectedArtists) => {
        if (!selectedArtists) return [];

        return selectedArtists.filter(artist => {
            const key = `${artist.categoryId}:${artist.name}`;
            return partitionData.artistPartitionMap[key] === partitionId;
        });
    }, [partitionData.artistPartitionMap]);

    /**
     * 获取分区中的分类列表
     */
    const getCategoriesByPartition = useCallback((partitionId, selectedCategoriesList, categories) => {
        if (!selectedCategoriesList || !categories) return [];

        return selectedCategoriesList.filter(category => {
            return partitionData.categoryPartitionMap[category.id] === partitionId;
        });
    }, [partitionData.categoryPartitionMap]);

    // 当分区数据变化时，自动更新节点值
    useEffect(() => {
        updateNodeValue();
    }, [updateNodeValue]);

    return {
        partitionData,
        setPartitionData,
        addPartition,
        deletePartition,
        updatePartition,
        moveArtistToPartition,
        moveCategoryToPartition,
        togglePartition,
        setAsDefaultPartition,
        getArtistsByPartition,
        getCategoriesByPartition,
        updateNodeValue,
    };
}

// 导出工具函数供其他 hooks 使用
export { createDefaultPartitionData, validatePartitionData, savePartitionData, loadPartitionData };
