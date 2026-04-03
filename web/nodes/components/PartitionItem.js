/**
 * 分区项组件
 * 显示单个分区及其内容
 */
import { h } from '../../lib/preact.mjs';
import { useState } from '../../lib/hooks.mjs';
import { PartitionHeader } from './PartitionHeader.js';

export function PartitionItem({
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
}) {
    const [isDragOver, setIsDragOver] = useState(false);

    const totalCount = artists.length + partitionCategories.length + (partitionCombinations || []).length;
    const partitionClass = `partition-item ${partition.isDefault ? 'is-default' : ''} ${!partition.enabled ? 'disabled' : ''} ${isDragOver ? 'drag-over' : ''}`;

    // 拖拽经过
    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragOver(true);
    };

    // 拖拽离开
    const handleDragLeave = () => {
        setIsDragOver(false);
    };

    // 放置
    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragOver(false);

        try {
            const data = e.dataTransfer.getData('text/plain');
            if (!data) return;

            const draggedData = JSON.parse(data);

            if (draggedData.type === 'artist') {
                onArtistMove && onArtistMove(draggedData.key, partition.id);
            } else if (draggedData.type === 'category') {
                onCategoryMove && onCategoryMove(draggedData.id, partition.id);
            } else if (draggedData.type === 'combination') {
                onCombinationMove && onCombinationMove(draggedData.key, partition.id);
            }
        } catch (error) {
            console.error('[PartitionItem] Failed to parse drop data:', error);
        }
    };

    // 渲染组合标签
    const renderCombinationTags = () => {
        if (!partitionCombinations || partitionCombinations.length === 0) return [];

        return partitionCombinations.map((combination) => {
            const combKey = `combination:${combination.id}`;
            return h('span', {
                key: combKey,
                class: 'artist-selector-tag combination-tag',
                draggable: true,
                onDragStart: (e) => {
                    e.dataTransfer.setData('text/plain', JSON.stringify({
                        type: 'combination',
                        key: combKey,
                    }));
                    e.dataTransfer.effectAllowed = 'move';
                },
            }, [
                h('span', { class: 'artist-selector-tag-icon' }, '🔗'),
                combination.name,
                h('button', {
                    class: 'artist-remove-btn',
                    onClick: (e) => {
                        e.stopPropagation();
                        onCombinationRemove && onCombinationRemove(combKey);
                    },
                }, '×'),
            ]);
        });
    };

    return h('div', { class: partitionClass }, [
        // 分区头部
        h(PartitionHeader, {
            partition,
            onAction: onPartitionAction,
        }),

        // 内容区域（启用状态才显示）
        partition.enabled && h('div', {
            class: 'partition-artists',
            onDragOver: handleDragOver,
            onDragLeave: handleDragLeave,
            onDrop: handleDrop,
        }, [
            // 渲染该分区的组合
            ...renderCombinationTags(),

            // 渲染该分区的分类
            ...(partitionCategories || []).map((category) => {
                return h('span', {
                    key: `cat-${category.id}`,
                    class: 'artist-selector-tag category-tag',
                    draggable: true,
                    onDragStart: (e) => {
                        e.dataTransfer.setData('text/plain', JSON.stringify({
                            type: 'category',
                            id: category.id,
                        }));
                        e.dataTransfer.effectAllowed = 'move';
                    },
                }, [
                    h('span', { class: 'artist-selector-tag-icon' }, '📁'),
                    category.name,
                    h('button', {
                        class: 'artist-remove-btn',
                        onClick: (e) => {
                            e.stopPropagation();
                            onCategoryRemove && onCategoryRemove(category.id);
                        },
                    }, '×'),
                ]);
            }),

            // 渲染该分区的画师（含孤立项）
            ...artists.map((artist) => {
                const key = artist._orphaned ? artist._orphanedKey : `${artist.categoryId}:${artist.name}`;
                return h('span', {
                    key: key,
                    class: `artist-selector-tag ${artist._orphaned ? 'orphaned' : ''}`,
                    draggable: !artist._orphaned,
                    onDragStart: artist._orphaned ? undefined : (e) => {
                        e.dataTransfer.setData('text/plain', JSON.stringify({
                            type: 'artist',
                            key: key,
                        }));
                        e.dataTransfer.effectAllowed = 'move';
                    },
                }, [
                    artist._orphaned && h('span', { class: 'artist-selector-tag-icon' }, '⚠️'),
                    h('span', { class: 'artist-name' }, (artist.displayName || artist.name) + (artist._orphaned ? ' (未找到)' : '')),
                    h('button', {
                        class: 'artist-remove-btn',
                        onClick: (e) => {
                            e.stopPropagation();
                            onArtistRemove && onArtistRemove(key);
                        },
                    }, '×'),
                ]);
            }),

            // 空状态提示
            totalCount === 0 &&
                h('div', { class: 'partition-empty' }, '拖拽画师或分类到此处'),
        ]),
    ]);
}
