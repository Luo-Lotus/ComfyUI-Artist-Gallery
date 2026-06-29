/**
 * 分区状态管理 Hook
 * 分区 CRUD、校验、计算分区视图
 * 使用 orderItems[] 统一管理分区内成员和排序
 * 持久化由 useNodeSync 通过 nodeInstance widget 完成（ComfyUI 自动保存）
 */
import { useState, useMemo, useCallback } from '../../../lib/hooks.mjs';

const DEFAULT_CONFIG = {
  format: '{content}',
  randomMode: false,
  randomCount: 3,
  cycleMode: false,
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
  orderItems: [],
};

const DEFAULT_PARTITION_DATA = {
  partitions: [DEFAULT_PARTITION],
  promptWeights: {},
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
  if (!data.promptWeights) data.promptWeights = {};
  if (!data.globalConfig) data.globalConfig = { ...DEFAULT_CONFIG };
  // 确保每个分区有 orderItems
  for (const p of data.partitions) {
    if (!p.orderItems) p.orderItems = [];
  }
  return data;
}

/**
 * 从 nodeInstance metadata widget 值解析分区数据
 * v1 格式: { version:1, partitions:[{id, orderItems[], ...}], globalConfig }
 * 向后兼容旧格式: promptKeys[], categoryIds[], combinationKeys[]
 */
function parseWidgetMetadata(widgetValue) {
  try {
    const data = JSON.parse(widgetValue);
    if (!data || data.version !== 1 || !Array.isArray(data.partitions)) {
      return null;
    }
    const partitions = data.partitions.map((p, i) => {
      let orderItems = p.orderItems || [];

      // 向后兼容：旧格式无 orderItems，从三个数组构建
      if (!p.orderItems && (p.promptKeys || p.categoryIds || p.combinationKeys)) {
        orderItems = [
          ...(p.combinationKeys || []).map((key) => ({ type: 'combination', key })),
          ...(p.categoryIds || []).map((key) => ({ type: 'category', key })),
          ...(p.promptKeys || []).map((key) => ({ type: 'prompt', key })),
        ];
      }

      return {
        id: p.id,
        name: p.name,
        isDefault: p.isDefault,
        enabled: p.enabled,
        config: p.config,
        order: i,
        createdAt: p.createdAt || Date.now(),
        orderItems,
      };
    });
    return validatePartitionData({
      partitions,
      promptWeights: data.promptWeights || {},
      globalConfig: data.globalConfig || { ...DEFAULT_CONFIG },
    });
  } catch {
    return null;
  }
}

export function usePartitionState({ selectedPromptsCache, categories, combinations, metadataInput }) {
  const [partitionData, setPartitionData] = useState(() => {
    if (metadataInput?.value) {
      const parsed = parseWidgetMetadata(metadataInput.value);
      if (parsed) return parsed;
    }
    return { ...DEFAULT_PARTITION_DATA };
  });

  // 合并计算每个分区的扁平 items 列表（单次遍历）
  const partitionViews = useMemo(() => {
    const itemsByPartition = {};

    partitionData.partitions.forEach((partition) => {
      const items = [];
      for (const orderItem of partition.orderItems) {
        const { type, key } = orderItem;
        let data = null;
        let orphaned = false;

        if (type === 'prompt') {
          data = selectedPromptsCache[key];
          if (!data) {
            const colonIdx = key.indexOf(':');
            data = {
              categoryId: key.substring(0, colonIdx),
              name: key.substring(colonIdx + 1),
              value: key.substring(colonIdx + 1),
            };
            orphaned = true;
          }
        } else if (type === 'category') {
          data = categories.find((c) => c.id === key);
          if (!data) {
            data = { id: key, name: key };
            orphaned = true;
          }
        } else if (type === 'combination') {
          const combId = key.replace('combination:', '');
          data = (combinations || []).find((c) => c.id === combId);
          if (!data) {
            data = { id: combId, name: key };
            orphaned = true;
          }
        }

        items.push({ type, key, data, orphaned });
      }
      itemsByPartition[partition.id] = items;
    });

    return { itemsByPartition };
  }, [partitionData, selectedPromptsCache, categories, combinations]);

  const { itemsByPartition } = partitionViews;

  // 添加项到分区末尾
  const addItemToPartition = useCallback((type, key, partitionId) => {
    setPartitionData((prev) => {
      return {
        ...prev,
        partitions: prev.partitions.map((p) => {
          if (p.id !== partitionId) return p;
          // 检查是否已存在
          if (p.orderItems.some((item) => item.type === type && item.key === key)) return p;
          return { ...p, orderItems: [...p.orderItems, { type, key }] };
        }),
      };
    });
  }, []);

  // 从分区移除项
  const removeItemFromPartition = useCallback((type, key, partitionId) => {
    setPartitionData((prev) => {
      const newPromptWeights = { ...prev.promptWeights };
      // 如果是 prompt，同时移除权重
      if (type === 'prompt') {
        delete newPromptWeights[key];
      }
      return {
        ...prev,
        promptWeights: newPromptWeights,
        partitions: prev.partitions.map((p) => {
          if (p.id !== partitionId) return p;
          return {
            ...p,
            orderItems: p.orderItems.filter((item) => !(item.type === type && item.key === key)),
          };
        }),
      };
    });
  }, []);

  // 从任意分区移除项（不指定分区）
  const removeItemGlobally = useCallback((type, key) => {
    setPartitionData((prev) => {
      const newPromptWeights = { ...prev.promptWeights };
      if (type === 'prompt') {
        delete newPromptWeights[key];
      }
      return {
        ...prev,
        promptWeights: newPromptWeights,
        partitions: prev.partitions.map((p) => ({
          ...p,
          orderItems: p.orderItems.filter((item) => !(item.type === type && item.key === key)),
        })),
      };
    });
  }, []);

  // 分区内拖拽排序
  const reorderPartitionItems = useCallback((partitionId, fromIndex, toIndex) => {
    setPartitionData((prev) => {
      return {
        ...prev,
        partitions: prev.partitions.map((p) => {
          if (p.id !== partitionId) return p;
          const items = [...p.orderItems];
          const [moved] = items.splice(fromIndex, 1);
          items.splice(toIndex, 0, moved);
          return { ...p, orderItems: items };
        }),
      };
    });
  }, []);

  // 设置画师权重
  const setPromptWeight = useCallback((promptKey, weight) => {
    setPartitionData((prev) => {
      const newWeights = { ...prev.promptWeights };
      if (weight === 1.0 || weight == null) {
        delete newWeights[promptKey];
      } else {
        newWeights[promptKey] = Math.round(weight * 10) / 10;
      }
      return { ...prev, promptWeights: newWeights };
    });
  }, []);

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
        orderItems: [],
      };
      return {
        ...prev,
        partitions: [...prev.partitions, newPartition],
      };
    });
  }, []);

  // 删除分区（orderItems 转移到默认分区）
  const deletePartition = useCallback((partitionId) => {
    setPartitionData((prev) => {
      const partition = prev.partitions.find((p) => p.id === partitionId);
      if (!partition || partition.isDefault) {
        console.warn('[PartitionState] 不能删除默认分区');
        return prev;
      }
      const defaultPartition = prev.partitions.find((p) => p.isDefault);
      if (!defaultPartition) return prev;

      return {
        ...prev,
        partitions: prev.partitions
          .filter((p) => p.id !== partitionId)
          .map((p) => {
            if (p.id !== defaultPartition.id) return p;
            // 将被删分区的 orderItems 合并到默认分区（去重）
            const existingKeys = new Set(p.orderItems.map((item) => `${item.type}:${item.key}`));
            const newItems = partition.orderItems.filter(
              (item) => !existingKeys.has(`${item.type}:${item.key}`),
            );
            return { ...p, orderItems: [...p.orderItems, ...newItems] };
          }),
      };
    });
  }, []);

  // 更新分区配置
  const updatePartition = useCallback((partitionId, updates) => {
    setPartitionData((prev) => {
      return {
        ...prev,
        partitions: prev.partitions.map((p) => {
          if (p.id !== partitionId) return p;
          return {
            ...p,
            ...updates,
            enabled: p.enabled,
            isDefault: p.isDefault,
            order: p.order,
            createdAt: p.createdAt,
            orderItems: p.orderItems,
          };
        }),
      };
    });
  }, []);

  // 切换分区启用状态
  const togglePartition = useCallback((partitionId) => {
    setPartitionData((prev) => {
      return {
        ...prev,
        partitions: prev.partitions.map((p) => (p.id === partitionId ? { ...p, enabled: !p.enabled } : p)),
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

  // 重排分区顺序
  const reorderPartitions = useCallback((fromIndex, toIndex) => {
    setPartitionData((prev) => {
      const sorted = [...prev.partitions].sort((a, b) => a.order - b.order);
      const [moved] = sorted.splice(fromIndex, 1);
      sorted.splice(toIndex, 0, moved);
      return {
        ...prev,
        partitions: sorted.map((p, i) => ({ ...p, order: i })),
      };
    });
  }, []);

  // 辅助：检查某项是否在任意分区中
  const isItemSelected = useCallback(
    (type, key) => {
      return partitionData.partitions.some((p) =>
        p.orderItems.some((item) => item.type === type && item.key === key),
      );
    },
    [partitionData],
  );

  return {
    partitionData,
    setPartitionData,
    itemsByPartition,
    addItemToPartition,
    removeItemFromPartition,
    removeItemGlobally,
    reorderPartitionItems,
    setPromptWeight,
    addPartition,
    deletePartition,
    updatePartition,
    togglePartition,
    setAsDefaultPartition,
    reorderPartitions,
    isItemSelected,
  };
}
