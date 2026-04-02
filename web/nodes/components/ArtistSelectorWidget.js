/**
 * Artist Selector Preact 组件
 * 画师选择器的 UI 渲染部分
 */
import { h } from '../../lib/preact.mjs';
import { useState, useMemo, useCallback } from '../../lib/hooks.mjs';
import { useArtistSelector } from './hooks/useArtistSelector.js';
import { useImagePreview } from './hooks/useImagePreview.js';
import { PartitionList } from './PartitionList.js';
import { PartitionConfigPanel } from './PartitionConfigPanel.js';
import { LazyList } from '../../components/LazyList.js';

export function ArtistSelectorWidget({
    nodeInstance,
    selectedInput,
    metadataInput,
}) {
    const {
        artists,
        categories,
        combinations,
        selectedKeys,
        selectedCategories,
        selectedCombinationKeys,
        loading,
        searchQuery,
        sortBy,
        sortOrder,
        currentCategory,
        filteredArtists,
        selectedArtistsList,
        selectedCategoriesList,
        refreshing,
        breadcrumbPath,
        partitionData,
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
        setSearchQuery,
        setSortBy,
        setSortOrder,
        toggleSelection,
        toggleCategorySelection,
        toggleCombinationSelection,
        handleCategoryChange,
        handleRefresh,
        makeArtistKey,
        parseArtistKey,
        updateNodeValue,
    } = useArtistSelector(nodeInstance, selectedInput, metadataInput);

    // 使用图片预览 hook
    const { showPreview, removePreview } = useImagePreview();

    // 分区配置面板状态
    const [showPartitionConfig, setShowPartitionConfig] = useState(false);
    const [editingPartitionId, setEditingPartitionId] = useState(null);

    // ============ 子组件渲染函数 ============

    /**
     * 渲染面包屑导航
     */
    const renderBreadcrumb = () => {
        if (breadcrumbPath.length === 0) return null;

        return h(
            'div',
            { class: 'artist-selector-breadcrumb' },
            h('div', { class: 'artist-selector-breadcrumb-list' }, [
                // 只显示子分类路径
                breadcrumbPath.map((cat, index) => [
                    index > 0 &&
                        h(
                            'span',
                            {
                                key: `sep-${index}`,
                                class: 'artist-selector-breadcrumb-separator',
                            },
                            '/',
                        ),
                    h(
                        'span',
                        {
                            key: cat.id,
                            class: `artist-selector-breadcrumb-item ${currentCategory === cat.id ? 'active' : ''}`,
                            onClick: () => handleCategoryChange(cat.id),
                        },
                        cat.name,
                    ),
                ]),
            ]),
        );
    };

    // 鼠标悬停处理
    const handleMouseEnter = (artist, event) => {
        showPreview(artist, event);
    };

    // 鼠标离开处理
    const handleMouseLeave = () => {
        removePreview();
    };

    /**
     * 渲染已选择的画师和分类标签列表
     */
    const renderSelectedArtists = () => {
        return h(PartitionList, {
            partitions: partitionData.partitions,
            artistsByPartition: getArtistsByPartition,
            categoriesByPartition: getCategoriesByPartition,
            combinationsByPartition: getCombinationsByPartition,
            selectedCategories: selectedCategoriesList,
            categories: categories,
            onPartitionAction: (action, data) => {
                if (action === 'add') {
                    addPartition(data);
                } else if (action === 'delete') {
                    deletePartition(data);
                } else if (action === 'config') {
                    setEditingPartitionId(data);
                    setShowPartitionConfig(true);
                } else if (action === 'toggle') {
                    togglePartition(data);
                } else if (action === 'setDefault') {
                    setAsDefaultPartition(data);
                }
            },
            onArtistMove: (artistKey, partitionId) => {
                moveArtistToPartition(artistKey, partitionId);
            },
            onArtistRemove: (artistKey) => {
                const { categoryId, name } = parseArtistKey(artistKey);
                toggleSelection(categoryId, name);
            },
            onCategoryMove: (categoryId, partitionId) => {
                moveCategoryToPartition(categoryId, partitionId);
            },
            onCategoryRemove: (categoryId) => {
                toggleCategorySelection(categoryId);
            },
            onCombinationMove: (combinationKey, partitionId) => {
                moveCombinationToPartition(combinationKey, partitionId);
            },
            onCombinationRemove: (combinationKey) => {
                // 从 key 提取 combination id
                const combId = combinationKey.replace('combination:', '');
                toggleCombinationSelection(combId);
            },
        });
    };

    /**
     * 渲染分类卡片
     */
    const renderCategoryCard = (cat) => {
        const isSelected = selectedCategories.has(cat.id);
        return h(
            'div',
            {
                key: cat.id,
                class: `artist-selector-category-card ${currentCategory === cat.id ? 'active' : ''} ${isSelected ? 'selected' : ''}`,
                onClick: (e) => {
                    // 点击分类卡片选择/取消选择分类
                    toggleCategorySelection(cat.id);
                },
                title: '点击选择分类，点击 > 进入分类',
            },
            [
                h('span', { class: 'artist-selector-category-icon' }, '📁'),
                h('span', { class: 'artist-selector-category-name' }, cat.name),
                h(
                    'span',
                    {
                        class: 'artist-selector-category-enter',
                        onClick: (e) => {
                            e.stopPropagation();
                            handleCategoryChange(cat.id);
                        },
                        title: '进入分类',
                    },
                    '>',
                ),
            ],
        );
    };

    /**
     * 渲染搜索和排序控件（同一行）
     */
    const renderControls = () => {
        return h('div', { class: 'artist-selector-controls-row' }, [
            h('input', {
                type: 'text',
                class: 'artist-selector-search',
                placeholder: '搜索画师...',
                value: searchQuery,
                onInput: (e) => setSearchQuery(e.target.value),
            }),
            h('div', { class: 'artist-selector-sort-controls' }, [
                h(
                    'select',
                    {
                        class: 'artist-selector-sort-select',
                        value: sortBy,
                        onChange: (e) => setSortBy(e.target.value),
                    },
                    [
                        h('option', { value: 'name' }, '名称'),
                        h('option', { value: 'created_at' }, '创建时间'),
                        h('option', { value: 'image_count' }, '图片数量'),
                    ],
                ),
                h(
                    'button',
                    {
                        class: 'artist-selector-sort-button',
                        onClick: () =>
                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'),
                    },
                    sortOrder === 'asc' ? '↑ 升序' : '↓ 降序',
                ),
                h(
                    'button',
                    {
                        class: 'artist-selector-refresh-button',
                        onClick: handleRefresh,
                        disabled: refreshing,
                        title: '刷新',
                    },
                    refreshing ? '⟳' : '🔄',
                ),
            ]),
        ]);
    };

    /**
     * 渲染单个画师项
     */
    const renderArtistItem = (artist) => {
        const key = makeArtistKey(artist.categoryId, artist.name);
        const isSelected = selectedKeys.has(key);
        return h(
            'div',
            {
                key: key,
                class: `artist-selector-item ${isSelected ? 'selected' : ''}`,
                onClick: () => toggleSelection(artist.categoryId, artist.name),
                onMouseEnter: (e) => handleMouseEnter(artist, e),
                onMouseLeave: () => handleMouseLeave(),
            },
            [
                h(
                    'span',
                    { class: 'artist-selector-item-name' },
                    artist.displayName || artist.name,
                ),
            ],
        );
    };

    /**
     * 渲染组合项
     */
    const renderCombinationItem = (combination) => {
        const key = `combination:${combination.id}`;
        const isSelected = selectedCombinationKeys.has(key);
        return h(
            'div',
            {
                key: key,
                class: `artist-selector-item combination-item ${isSelected ? 'selected' : ''}`,
                onClick: () => toggleCombinationSelection(combination.id),
                onMouseEnter: (e) => handleMouseEnter(combination, e),
                onMouseLeave: () => handleMouseLeave(),
            },
            [
                h('span', { class: 'artist-selector-item-icon' }, '🔗'),
                h(
                    'span',
                    { class: 'artist-selector-item-name' },
                    combination.name,
                ),
                h(
                    'span',
                    { class: 'artist-selector-combination-count' },
                    `${(combination.artistKeys || []).length}人`,
                ),
            ],
        );
    };

    /**
     * 渲染画师列表（包含分类和画师）- 使用 LazyList 懒加载
     */
    const renderArtistList = () => {
        if (loading) {
            return h(
                'div',
                { class: 'artist-selector-list' },
                h('div', { class: 'artist-selector-loading' }, '加载中...'),
            );
        }

        // 获取当前分类的子分类（从扁平列表中按 parentId 过滤）
        const childrenCategories = categories.filter(
            (c) => c.parentId === currentCategory,
        );

        // 合并为扁平数组
        const listItems = [
            ...childrenCategories.map(cat => ({ type: 'category', data: cat })),
            ...(combinations || []).map(comb => ({ type: 'combination', data: comb })),
            ...filteredArtists.map(artist => ({ type: 'artist', data: artist })),
        ];

        const renderListItem = (item, index) => {
            if (item.type === 'category') return renderCategoryCard(item.data);
            if (item.type === 'combination') return renderCombinationItem(item.data);
            return renderArtistItem(item.data);
        };

        return h(LazyList, {
            items: listItems,
            renderItem: renderListItem,
            layout: 'flex',
            className: 'artist-selector-list',
            scrollContainer: 'self',
            emptyMessage: h(
                'div',
                { class: 'artist-selector-empty-artists' },
                '没有找到画师',
            ),
        });
    };

    // ============ 主渲染 ============

    // 处理全局配置保存
    return h('div', { class: 'artist-selector-container' }, [
        // 分区配置面板（覆盖在内容之上）
        showPartitionConfig && h('div', { class: 'artist-selector-config-overlay' }, [
            h(PartitionConfigPanel, {
                partition: partitionData.partitions.find(p => p.id === editingPartitionId) || partitionData.partitions[0],
                globalConfig: partitionData.globalConfig,
                onChange: (updates) => updatePartition(editingPartitionId, updates),
                onClose: () => setShowPartitionConfig(false),
            }),
        ]),

        // 主内容
        !showPartitionConfig && [
            // 已选择区域（分区列表）
            h('div', { class: 'artist-selector-section' }, [
                renderSelectedArtists(),
            ]),

            // 浏览区域
            h('div', { class: 'artist-selector-section' }, [
                // 面包屑导航
                renderBreadcrumb(),

                // 搜索和排序控件（同一行）
                renderControls(),

                // 画师列表（包含分类和画师）
                renderArtistList(),
            ]),
        ],
    ]);
}
