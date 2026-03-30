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
    selectedArtistsCache,
    partitionData,
}) {
    const updateNodeValue = useCallback(() => {
        const artistMap = partitionData.artistPartitionMap || {};
        const categoryMap = partitionData.categoryPartitionMap || {};

        // 构建 v1 格式的 partitions（每个分区自带其 artistKeys 和 categoryIds）
        const partitions = partitionData.partitions.map((p) => ({
            id: p.id,
            name: p.name,
            isDefault: p.isDefault,
            enabled: p.enabled,
            config: p.config,
            artistKeys: Object.keys(artistMap).filter(
                (key) => artistMap[key] === p.id,
            ),
            categoryIds: Object.keys(categoryMap).filter(
                (catId) => categoryMap[catId] === p.id,
            ),
        }));

        const metadata = {
            version: 1,
            partitions,
            globalConfig: partitionData.globalConfig,
        };

        // selected_artists 字符串：仅用于显示（后端从 metadata 中解析）
        const selectedArtists = Array.from(selectedKeys)
            .map((key) => selectedArtistsCache[key])
            .filter(Boolean);
        const artistsString = selectedArtists
            .map((a) => a.name)
            .join(',');

        // 设置 widget 值
        if (selectedInput) {
            selectedInput.value = artistsString;
        }
        if (metadataInput) {
            metadataInput.value = JSON.stringify(metadata);
        }

        // 更新节点输入数据
        if (nodeInstance.inputs) {
            const si = nodeInstance.inputs.findIndex(
                (i) => i.name === 'selected_artists',
            );
            const mi = nodeInstance.inputs.findIndex(
                (i) => i.name === 'metadata',
            );
            if (si >= 0) nodeInstance.inputs[si].value = artistsString;
            if (mi >= 0) nodeInstance.inputs[mi].value = JSON.stringify(metadata);
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
        selectedArtistsCache,
        partitionData,
    ]);

    // 自动同步：当关键状态变化时更新节点值
    useEffect(() => {
        updateNodeValue();
    }, [updateNodeValue]);

    return { updateNodeValue };
}
