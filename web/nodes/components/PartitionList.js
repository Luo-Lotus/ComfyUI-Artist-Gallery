/**
 * 分区列表组件
 * 显示所有分区及其包含的画师
 */
import { h } from '../../lib/preact.mjs';
import { useState } from '../../lib/hooks.mjs';
import { PartitionItem } from './PartitionItem.js';
import { AddPartitionForm } from './AddPartitionForm.js';

export function PartitionList({
    partitions,
    artistsByPartition,
    categoriesByPartition,
    combinationsByPartition,
    onPartitionAction,
    onArtistMove,
    onArtistRemove,
    onCategoryMove,
    onCategoryRemove,
    onCombinationMove,
    onCombinationRemove,
}) {
    const [showAddPartition, setShowAddPartition] = useState(false);

    // 渲染添加分区表单
    const renderAddPartitionForm = () => {
        if (!showAddPartition) return null;

        return h(AddPartitionForm, {
            onConfirm: (name) => {
                onPartitionAction('add', name);
                setShowAddPartition(false);
            },
            onCancel: () => {
                setShowAddPartition(false);
            },
            maxPartitions: 10,
            currentPartitionCount: partitions.length,
        });
    };

    // 渲染添加分区按钮
    const renderAddButton = () => {
        if (showAddPartition) return null;

        return h('button', {
            class: 'add-partition-btn',
            onClick: () => setShowAddPartition(true),
            disabled: partitions.length >= 10,
        }, '+ 添加分区');
    };

    // 计算总画师数
    const totalArtists = Object.values(artistsByPartition || {}).reduce((sum, artists) => sum + artists.length, 0);
    const totalCombinations = Object.values(combinationsByPartition || {}).reduce((sum, combs) => sum + combs.length, 0);

    return h('div', { class: 'partition-list' }, [
        // 头部
        h('div', { class: 'partition-list-header' }, [
            h('span', { class: 'partition-list-title' }, `已选择 (${totalArtists + totalCombinations})`),
            renderAddButton(),
        ]),

        // 添加分区表单
        renderAddPartitionForm(),

        // 分区列表
        h('div', { class: 'partition-list-content' },
            partitions
                .sort((a, b) => a.order - b.order)
                .map((partition) => {
                    const artists = (artistsByPartition || {})[partition.id] || [];
                    const partitionCategories = (categoriesByPartition || {})[partition.id] || [];
                    const partitionCombinations = (combinationsByPartition || {})[partition.id] || [];

                    return h(PartitionItem, {
                        key: partition.id,
                        partition,
                        artists,
                        partitionCategories,
                        partitionCombinations,
                        onPartitionAction,
                        onArtistMove,
                        onCategoryMove,
                        onArtistRemove,
                        onCategoryRemove,
                        onCombinationMove,
                        onCombinationRemove,
                    });
                })
        ),
    ]);
}
