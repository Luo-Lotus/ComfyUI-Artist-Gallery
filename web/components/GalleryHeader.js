/**
 * 画廊头部组件
 * 包含搜索、排序、筛选等功能
 */
export function GalleryHeader({
    totalCount,
    currentCount,
    searchQuery,
    sortBy,
    sortOrder,
    showFavoritesOnly,
    onSearchChange,
    onSortChange,
    onOrderChange,
    onFavoriteToggle,
}) {
    const { h } = self.preactCore;
    return h(
        'div',
        { class: 'gallery-header' },
        h(
            'div',
            { class: 'gallery-search' },
            h('input', {
                type: 'text',
                placeholder: '搜索画师...',
                value: searchQuery,
                onInput: (e) => onSearchChange(e.target.value),
            }),
        ),
        h(
            'button',
            {
                class: `gallery-btn ${showFavoritesOnly ? 'active' : ''}`,
                onClick: onFavoriteToggle,
            },
            showFavoritesOnly ? '⭐ 全部' : '☆ 收藏',
        ),
        h(
            'select',
            {
                class: 'gallery-select',
                value: sortBy,
                onChange: (e) => onSortChange(e.target.value),
            },
            h('option', { value: 'name' }, '名称'),
            h('option', { value: 'count' }, '数量'),
            h('option', { value: 'time' }, '时间'),
        ),
        h(
            'button',
            {
                class: 'gallery-btn',
                onClick: onOrderChange,
            },
            sortOrder === 'asc' ? '⬆️' : '⬇️',
        ),
        h(
            'div',
            { class: 'gallery-stats' },
            h('span', {}, currentCount),
            ' / ',
            h('span', {}, totalCount),
            ' 位',
        ),
    );
}
