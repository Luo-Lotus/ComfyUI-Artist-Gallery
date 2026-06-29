/**
 * 节点同步 Hook
 * 构建 v1 metadata 并写入 ComfyUI 节点 widget
 */
import { useCallback, useEffect } from '../../../lib/hooks.mjs';

export function useNodeSync({
  nodeInstance,
  selectedInput,
  metadataInput,
  selectedKeys,
  selectedPromptsCache,
  partitionData,
}) {
  const updateNodeValue = useCallback(() => {
    // 构建 v1 格式的 partitions（每个分区携带 orderItems）
    const partitions = partitionData.partitions.map((p) => ({
      id: p.id,
      name: p.name,
      isDefault: p.isDefault,
      enabled: p.enabled,
      config: p.config,
      orderItems: p.orderItems || [],
    }));

    const metadata = {
      version: 1,
      partitions,
      globalConfig: partitionData.globalConfig,
      promptWeights: partitionData.promptWeights || {},
    };

    // selected_prompts 字符串：仅用于显示（后端从 metadata 中解析）
    const selectedPrompts = Array.from(selectedKeys)
      .map((key) => selectedPromptsCache[key])
      .filter(Boolean);
    const promptsString = selectedPrompts.map((a) => a.name).join(',');

    // 设置 widget 值
    if (selectedInput) {
      selectedInput.value = promptsString;
    }
    if (metadataInput) {
      metadataInput.value = JSON.stringify(metadata);
    }

    // 更新节点输入数据
    if (nodeInstance.inputs) {
      const si = nodeInstance.inputs.findIndex((i) => i.name === 'selected_prompts');
      const mi = nodeInstance.inputs.findIndex((i) => i.name === 'metadata');
      if (si >= 0) nodeInstance.inputs[si].value = promptsString;
      if (mi >= 0) nodeInstance.inputs[mi].value = JSON.stringify(metadata);
    }

    // 触发节点更新和重新执行
    if (nodeInstance.graph) {
      nodeInstance.graph.change();
    }
    nodeInstance.setDirtyCanvas(true, true);
  }, [nodeInstance, selectedInput, metadataInput, selectedKeys, selectedPromptsCache, partitionData]);

  // 自动同步：当关键状态变化时更新节点值（使用 rAF 防抖，合并同一次事件循环中的多次状态更新）
  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      updateNodeValue();
    });
    return () => cancelAnimationFrame(rafId);
  }, [updateNodeValue]);
}
