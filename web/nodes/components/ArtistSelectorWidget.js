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
        selectedIds,
        loading,
        searchQuery,
        hoveredImage,
        hoverPosition,
        sortBy,
        sortOrder,
        filteredArtists,
        selectedArtistsList,
        setSearchQuery,
        setSortBy,
        setSortOrder,
        toggleSelection,
        handleMouseEnter,
        setHoveredImage,
    } = useArtistSelector(nodeInstance, selectedInput, metadataInput);

    // ============ 子组件渲染函数 ============

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
     * 渲染搜索框
     */
    const renderSearchBar = () => {
        return h('input', {
            type: 'text',
            class: 'artist-selector-search',
            placeholder: '搜索画师...',
            value: searchQuery,
            onInput: (e) => setSearchQuery(e.target.value),
        });
    };

    /**
     * 渲染排序控件
     */
    const renderSortControls = () => {
        return h('div', { class: 'artist-selector-sort-controls' }, [
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
                h('div', { class: 'artist-selector-item-info' }, [
                    h('span', { class: 'artist-selector-item-name' }, artist.displayName),
                    h('span', { class: 'artist-selector-item-count' }, `${artist.imageCount}张`),
                ]),
                isSelected && h('span', { class: 'artist-selector-item-check' }, '✓'),
            ],
        );
    };

    /**
     * 渲染画师列表
     */
    const renderArtistList = () => {
        return h('div', { class: 'artist-selector-list' }, [
            loading
                ? h('div', { class: 'artist-selector-loading' }, '加载中...')
                : filteredArtists.length === 0
                  ? h('div', { class: 'artist-selector-empty-artists' }, '没有找到画师')
                  : filteredArtists.map((artist) => renderArtistItem(artist)),
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

        // 搜索框
        renderSearchBar(),

        // 排序控件
        renderSortControls(),

        // 画师列表
        renderArtistList(),

        // 图片预览悬浮窗
        renderHoverPreview(),
    ]);
}
