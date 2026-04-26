/**
 * 分区项组件
 * 显示单个分区及其内容
 */
import { h } from '../../lib/preact.mjs';
import { useState, useEffect, useRef } from '../../lib/hooks.mjs';
import { Icon } from '../../lib/icons.mjs';
import { PartitionHeader } from './PartitionHeader.js';
import { useBodyRender } from './hooks/useBodyRender.js';

function getWeightColor(weight) {
    const w = Math.max(0, Math.min(2, weight));
    let h, s, l;
    if (w <= 1) {
        const t = w;
        h = 220 - 3 * t;
        s = 25 + 66 * t;
        l = 55 + 5 * t;
    } else {
        const t = w - 1;
        h = 217 + 33 * t;
        s = 91 - 6 * t;
        l = 60 - 35 * t;
    }
    return `hsl(${h}, ${s}%, ${l}%)`;
}

function WeightSliderPopup({ weight, style, onChange, onMouseEnter, onMouseLeave }) {
    const [value, setValue] = useState(weight);

    const handleInput = (e) => {
        const val = Math.round(parseFloat(e.target.value) * 10) / 10;
        setValue(val);
        onChange(val);
    };

    return h('div', {
        class: 'weight-slider-popup',
        style,
        onMouseEnter,
        onMouseLeave,
    }, [
        h('input', {
            type: 'range',
            class: 'weight-slider-input',
            min: 0,
            max: 2,
            step: 0.1,
            value,
            onInput: handleInput,
        }),
        h('span', { class: 'weight-slider-popup-value' }, value.toFixed(1)),
    ]);
}

export function PartitionItem({
    partition,
    artists,
    partitionCategories,
    partitionCombinations,
    artistWeights,
    onPartitionAction,
    onArtistMove,
    onCategoryMove,
    onArtistRemove,
    onCategoryRemove,
    onCombinationMove,
    onCombinationRemove,
    onArtistWeightChange,
}) {
    const [isDragOver, setIsDragOver] = useState(false);
    const [hoveredKey, setHoveredKey] = useState(null);
    const hideTimerRef = useRef(null);

    const weightsRef = useRef(artistWeights);
    weightsRef.current = artistWeights;
    const weightChangeRef = useRef(onArtistWeightChange);
    weightChangeRef.current = onArtistWeightChange;

    // body 级渲染（不受节点 transform 影响）
    const { renderToBody, clear: clearSlider } = useBodyRender();

    const totalCount = artists.length + partitionCategories.length + (partitionCombinations || []).length;
    const partitionClass = `partition-item ${partition.isDefault ? 'is-default' : ''} ${!partition.enabled ? 'disabled' : ''} ${isDragOver ? 'drag-over' : ''}`;

    const scheduleHide = () => {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => setHoveredKey(null), 200);
    };

    const cancelHide = () => {
        clearTimeout(hideTimerRef.current);
    };

    // 用 Preact render 挂载/卸载悬浮滑条到 portal
    useEffect(() => {
        if (!hoveredKey) {
            clearSlider();
            return;
        }

        const tagEl = document.querySelector(`[data-weight-key="${CSS.escape(hoveredKey)}"]`);
        if (!tagEl) return;
        const rect = tagEl.getBoundingClientRect();

        const weights = weightsRef.current;
        const weight = weights && weights[hoveredKey] != null ? weights[hoveredKey] : 1.0;

        renderToBody(
            h(WeightSliderPopup, {
                weight,
                style: {
                    position: 'fixed',
                    top: `${rect.top - 32}px`,
                    left: `${rect.left + rect.width / 2}px`,
                    transform: 'translateX(-50%)',
                    pointerEvents: 'auto',
                },
                onChange: (val) => {
                    weightChangeRef.current && weightChangeRef.current(hoveredKey, val);
                },
                onMouseEnter: cancelHide,
                onMouseLeave: scheduleHide,
            }),
        );

        return () => clearSlider();
    }, [hoveredKey]);

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
                h('span', { class: 'artist-selector-tag-icon' }, h(Icon, { name: 'link', size: 12 })),
                combination.name,
                h('button', {
                    class: 'artist-remove-btn',
                    onClick: (e) => {
                        e.stopPropagation();
                        onCombinationRemove && onCombinationRemove(combKey);
                    },
                }, h(Icon, { name: 'x', size: 12 })),
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
                    h('span', { class: 'artist-selector-tag-icon' }, h(Icon, { name: 'folder', size: 12 })),
                    category.name,
                    h('button', {
                        class: 'artist-remove-btn',
                        onClick: (e) => {
                            e.stopPropagation();
                            onCategoryRemove && onCategoryRemove(category.id);
                        },
                    }, h(Icon, { name: 'x', size: 12 })),
                ]);
            }),

            // 渲染该分区的画师（含孤立项）
            ...artists.map((artist) => {
                const key = artist._orphaned ? artist._orphanedKey : `${artist.categoryId}:${artist.name}`;
                const weight = artistWeights && artistWeights[key] != null ? artistWeights[key] : 1.0;
                const showWeight = !artist._orphaned && Math.abs(weight - 1.0) > 0.001;
                const tagStyle = artist._orphaned ? {} : { background: getWeightColor(weight) };
                return h('span', {
                    key: key,
                    'data-weight-key': key,
                    class: `artist-selector-tag ${artist._orphaned ? 'orphaned' : ''} ${hoveredKey === key ? 'weight-focused' : ''}`,
                    style: tagStyle,
                    draggable: !artist._orphaned,
                    onDragStart: artist._orphaned ? undefined : (e) => {
                        e.dataTransfer.setData('text/plain', JSON.stringify({
                            type: 'artist',
                            key: key,
                        }));
                        e.dataTransfer.effectAllowed = 'move';
                    },
                    onMouseEnter: artist._orphaned ? undefined : () => {
                        cancelHide();
                        setHoveredKey(key);
                    },
                    onMouseLeave: artist._orphaned ? undefined : () => {
                        scheduleHide();
                    },
                }, [
                    showWeight && h('span', { class: 'artist-weight-value' }, weight.toFixed(1)),
                    artist._orphaned && h('span', { class: 'artist-selector-tag-icon' }, h(Icon, { name: 'alert-triangle', size: 12 })),
                    h('span', { class: 'artist-name' }, (artist.displayName || artist.name) + (artist._orphaned ? ' (未找到)' : '')),
                    h('button', {
                        class: 'artist-remove-btn',
                        onClick: (e) => {
                            e.stopPropagation();
                            onArtistRemove && onArtistRemove(key);
                        },
                    }, h(Icon, { name: 'x', size: 12 })),
                ]);
            }),

            // 空状态提示
            totalCount === 0 &&
                h('div', { class: 'partition-empty' }, '拖拽画师或分类到此处'),
        ]),
    ]);
}
