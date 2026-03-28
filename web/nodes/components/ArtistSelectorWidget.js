/**
 * Artist Selector Preact 组件
 * 画师选择器的 UI 渲染部分
 */
import { h } from '../../lib/preact.mjs';
import { useArtistSelector } from './hooks/useArtistSelector.js';

export function ArtistSelectorWidget({
    nodeInstance,
    selectedInput,
    metadataInput,
}) {
    const {
        artists,
        categories,
        selectedIds,
        loading,
        searchQuery,
        hoveredImage,
        hoverPosition,
        sortBy,
        sortOrder,
        currentCategory,
        filteredArtists,
        selectedArtistsList,
        refreshing,
        breadcrumbPath,
        setSearchQuery,
        setSortBy,
        setSortOrder,
        toggleSelection,
        handleMouseEnter,
        setHoveredImage,
        handleCategoryChange,
        handleRefresh,
    } = useArtistSelector(nodeInstance, selectedInput, metadataInput);

    // ============ 子组件渲染函数 ============

    /**
     * 渲染面包屑导航
     */
    const renderBreadcrumb = () => {
        if (breadcrumbPath.length === 0) return null;

        return h('div', { class: 'artist-selector-breadcrumb' },
            h('div', { class: 'artist-selector-breadcrumb-list' }, [
                // 只显示子分类路径
                breadcrumbPath.map((cat, index) => [
                    index > 0 && h('span', { key: `sep-${index}`, class: 'artist-selector-breadcrumb-separator' }, '/'),
                    h('span', {
                        key: cat.id,
                        class: `artist-selector-breadcrumb-item ${currentCategory === cat.id ? 'active' : ''}`,
                        onClick: () => handleCategoryChange(cat.id)
                    }, cat.name)
                ])
            ])
        );
    };

    /**
     * 渲染已选择的画师标签列表
     */
    const renderSelectedArtists = () => {
        return h('div', { class: 'artist-selector-selected-section' }, [
            h(
                'div',
                { class: 'artist-selector-label' },
                `已选择 (${selectedArtistsList.length})`,
            ),
            h(
                'div',
                { class: 'artist-selector-selected-list' },
                selectedArtistsList.length > 0
                    ? selectedArtistsList.map((artist) =>
                          h(
                              'span',
                              { key: artist.id, class: 'artist-selector-tag' },
                              [
                                  artist.displayName,
                                  h(
                                      'button',
                                      {
                                          onClick: (e) => {
                                              e.stopPropagation();
                                              toggleSelection(artist.id);
                                          },
                                      },
                                      '×',
                                  ),
                              ],
                          ),
                      )
                    : h('span', { class: 'artist-selector-empty' }, '未选择画师'),
            ),
        ]);
    };

    /**
     * 渲染分类卡片
     */
    const renderCategoryCard = (cat) => {
        return h('div', {
            key: cat.id,
            class: `artist-selector-category-card ${currentCategory === cat.id ? 'active' : ''}`,
            onClick: () => handleCategoryChange(cat.id)
        }, [
            h('span', { class: 'artist-selector-category-icon' }, '📁'),
            h('span', { class: 'artist-selector-category-name' }, cat.name)
        ]);
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
                        onClick: () => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'),
                    },
                    sortOrder === 'asc' ? '↑ 升序' : '↓ 降序',
                ),
                h(
                    'button',
                    {
                        class: 'artist-selector-refresh-button',
                        onClick: handleRefresh,
                        disabled: refreshing,
                        title: '刷新'
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
        const isSelected = selectedIds.has(artist.id);
        return h(
            'div',
            {
                key: artist.id,
                class: `artist-selector-item ${isSelected ? 'selected' : ''}`,
                onClick: () => toggleSelection(artist.id),
                onMouseEnter: (e) => handleMouseEnter(artist, e),
                onMouseLeave: () => setHoveredImage(null),
            },
            [
                h('span', { class: 'artist-selector-item-name' }, artist.displayName),
                isSelected && h('span', { class: 'artist-selector-item-check' }, '✓'),
            ],
        );
    };

    /**
     * 渲染画师列表（包含分类和画师）
     */
    const renderArtistList = () => {
        if (loading) {
            return h('div', { class: 'artist-selector-list' },
                h('div', { class: 'artist-selector-loading' }, '加载中...')
            );
        }

        // 获取当前分类的子分类
        const currentCatObj = categories.find(c => c.id === currentCategory);
        const childrenCategories = currentCatObj?.children || [];

        // 混合渲染：先显示分类，再显示画师
        const hasContent = childrenCategories.length > 0 || filteredArtists.length > 0;

        if (!hasContent) {
            return h('div', { class: 'artist-selector-list' },
                h('div', { class: 'artist-selector-empty-artists' }, '没有找到画师')
            );
        }

        return h('div', { class: 'artist-selector-list' }, [
            ...childrenCategories.map(cat => renderCategoryCard(cat)),
            ...filteredArtists.map((artist) => renderArtistItem(artist)),
        ]);
    };

    /**
     * 渲染图片预览悬浮窗
     */
    const renderHoverPreview = () => {
        if (!hoveredImage) return null;

        return h(
            'div',
            {
                class: 'artist-selector-hover-preview',
                style: {
                    left: `${hoverPosition.x}px`,
                    top: `${hoverPosition.y}px`,
                },
            },
            [h('img', { src: hoveredImage })],
        );
    };

    // ============ 主渲染 ============

    return h('div', { class: 'artist-selector-container' }, [
        // 已选择的画师
        renderSelectedArtists(),

        // 面包屑导航
        renderBreadcrumb(),

        // 搜索和排序控件（同一行）
        renderControls(),

        // 画师列表（包含分类和画师）
        renderArtistList(),

        // 图片预览悬浮窗
        renderHoverPreview(),
    ]);
}
