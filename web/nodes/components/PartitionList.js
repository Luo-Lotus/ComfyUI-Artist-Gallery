/**
 * 分区列表组件
 * 显示所有分区及其包含的画师
 */
import { h } from '../../lib/preact.mjs';
import { useState } from '../../lib/hooks.mjs';

export function PartitionList({
    partitions,
    artistsByPartition,
    categoriesByPartition,
    selectedCategories,
    categories,
    onPartitionAction,
    onArtistMove,
    onArtistRemove,
    onCategoryMove,
    onCategoryRemove,
}) {
    const [showAddPartition, setShowAddPartition] = useState(false);
    const [newPartitionName, setNewPartitionName] = useState('');
    const [draggedArtist, setDraggedArtist] = useState(null);
    const [draggedCategory, setDraggedCategory] = useState(null);
    const [dragOverPartition, setDragOverPartition] = useState(null);

    // 添加新分区
    const handleAddPartition = () => {
        if (newPartitionName.trim()) {
            onPartitionAction('add', newPartitionName.trim());
            setNewPartitionName('');
            setShowAddPartition(false);
        }
    };

    // 渲染添加分区表单
    const renderAddPartitionForm = () => {
        if (!showAddPartition) return null;

        return h('div', { class: 'add-partition-form' }, [
            h('input', {
                type: 'text',
                class: 'add-partition-input',
                placeholder: '分区名称',
                value: newPartitionName,
                onInput: (e) => setNewPartitionName(e.target.value),
                onKeyPress: (e) => e.key === 'Enter' && handleAddPartition(),
            }),
            h('button', {
                class: 'add-partition-confirm',
                onClick: handleAddPartition,
            }, '确认'),
            h('button', {
                class: 'add-partition-cancel',
                onClick: () => {
                    setShowAddPartition(false);
                    setNewPartitionName('');
                },
            }, '取消'),
        ]);
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

    // 渲染单个分区
    const renderPartition = (partition) => {
        const artists = artistsByPartition[partition.id] || [];
        const partitionCategories = categoriesByPartition ? categoriesByPartition[partition.id] || [] : [];
        const totalCount = artists.length + partitionCategories.length;
        const partitionClass = `partition-item ${partition.isDefault ? 'is-default' : ''} ${!partition.enabled ? 'disabled' : ''}`;
        const isDragOver = dragOverPartition === partition.id;

        return h('div', {
            key: partition.id,
            class: `${partitionClass} ${isDragOver ? 'drag-over' : ''}`,
            onDragOver: (e) => {
                e.preventDefault();
                if (draggedArtist || draggedCategory) {
                    setDragOverPartition(partition.id);
                }
            },
            onDragLeave: () => {
                setDragOverPartition(null);
            },
            onDrop: (e) => {
                e.preventDefault();
                if (draggedArtist) {
                    onArtistMove(draggedArtist, partition.id);
                    setDraggedArtist(null);
                } else if (draggedCategory) {
                    onCategoryMove(draggedCategory, partition.id);
                    setDraggedCategory(null);
                }
                setDragOverPartition(null);
            },
        }, [
            // 分区头部
            h('div', { class: 'partition-header' }, [
                h('div', { class: 'partition-info' }, [
                    h('span', { class: 'partition-name' }, [
                        partition.name,
                        !partition.enabled && h('span', { class: 'partition-disabled-badge' }, '(禁用)'),
                    ]),
                    h('span', { class: 'partition-count' }, `(${totalCount})`),
                ]),

                // 分区操作按钮
                h('div', { class: 'partition-actions' }, [
                    // 启用/禁用切换
                    h('button', {
                        class: 'partition-btn toggle',
                        onClick: () => onPartitionAction('toggle', partition.id),
                        title: partition.enabled ? '禁用' : '启用',
                    }, partition.enabled ? '🔘' : '⚫'),

                    // 配置按钮
                    h('button', {
                        class: 'partition-btn config',
                        onClick: () => onPartitionAction('config', partition.id),
                        title: '配置分区',
                    }, '⚙️'),

                    // 设为默认按钮（非默认分区显示）
                    !partition.isDefault && h('button', {
                        class: 'partition-btn set-default',
                        onClick: () => onPartitionAction('setDefault', partition.id),
                        title: '设为默认分区',
                    }, '⭐'),

                    // 删除按钮（默认分区不可删除）
                    !partition.isDefault && h('button', {
                        class: 'partition-btn delete',
                        onClick: () => onPartitionAction('delete', partition.id),
                        title: '删除分区',
                    }, '🗑️'),
                ]),
            ]),

            // 画师列表（启用状态才显示）
            partition.enabled && h('div', { class: 'partition-artists' }, [
                // 渲染该分区的分类
                ...partitionCategories.map(cat => renderCategoryTag(cat, partition.id)),

                // 渲染该分区的画师
                artists.length > 0 || partitionCategories.length > 0
                    ? artists.map(artist => renderArtistTag(artist, partition.id))
                    : h('div', { class: 'partition-empty' }, '拖拽画师或分类到此处'),
            ]),
        ]);
    };

    // 渲染分类标签
    const renderCategoryTag = (category, partitionId) => {
        return h('span', {
            key: `cat-${category.id}`,
            class: 'artist-selector-tag category-tag',
            draggable: true,
            onDragStart: (e) => {
                setDraggedCategory(category.id);
                e.dataTransfer.effectAllowed = 'move';
            },
            onDragEnd: () => {
                setDraggedCategory(null);
                setDragOverPartition(null);
            },
        }, [
            h('span', { class: 'artist-selector-tag-icon' }, '📁'),
            category.name,
            h('button', {
                class: 'artist-remove-btn',
                onClick: (e) => {
                    e.stopPropagation();
                    onCategoryRemove(category.id);
                },
            }, '×'),
        ]);
    };

    // 渲染画师标签
    const renderArtistTag = (artist, partitionId) => {
        const key = `${artist.categoryId}:${artist.name}`;

        return h('span', {
            key: key,
            class: 'artist-selector-tag',
            draggable: true,
            onDragStart: (e) => {
                setDraggedArtist(key);
                e.dataTransfer.effectAllowed = 'move';
            },
            onDragEnd: () => {
                setDraggedArtist(null);
                setDragOverPartition(null);
            },
        }, [
            h('span', { class: 'artist-name' }, artist.displayName || artist.name),
            h('button', {
                class: 'artist-remove-btn',
                onClick: (e) => {
                    e.stopPropagation();
                    onArtistRemove(key);
                },
            }, '×'),
        ]);
    };

    // 计算总画师数
    const totalArtists = Object.values(artistsByPartition).reduce((sum, artists) => sum + artists.length, 0);

    return h('div', { class: 'partition-list' }, [
        // 头部
        h('div', { class: 'partition-list-header' }, [
            h('span', { class: 'partition-list-title' }, `已选择 (${totalArtists})`),
            renderAddButton(),
        ]),

        // 添加分区表单
        renderAddPartitionForm(),

        // 分区列表
        h('div', { class: 'partition-list-content' },
            partitions
                .sort((a, b) => a.order - b.order)
                .map(renderPartition)
        ),
    ]);
}
