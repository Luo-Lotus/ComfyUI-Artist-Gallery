/**
 * 平铺选择器组件
 * 用于移动对话框中选择目标（分类或画师）
 */
import { h } from '../lib/preact.mjs';
import { useState, useMemo } from '../lib/hooks.mjs';

export function FlatSelector({
    type, // 'category' | 'artist'
    categories,
    artists,
    currentId,
    onSelect,
    excludeIds = [],
    placeholder = '选择目标...'
}) {
    const [searchQuery, setSearchQuery] = useState('');

    // 构建平铺的分类树（包含缩进）
    const flattenedCategories = useMemo(() => {
        if (!categories || categories.length === 0) return [];

        // 先扁平化分类树
        const flattenCategories = (tree, level = 0, parentIdMap = new Map()) => {
            const result = [];

            tree.forEach(cat => {
                // 跳过根分类"全部"
                if (cat.name === '全部') return;

                result.push({
                    ...cat,
                    level
                });

                // 如果有子分类，递归处理
                if (cat.children && cat.children.length > 0) {
                    result.push(...flattenCategories(cat.children, level + 1));
                }
            });

            return result;
        };

        return flattenCategories(categories);
    }, [categories]);

    // 过滤数据
    const filteredCategories = useMemo(() => {
        return flattenedCategories.filter(cat => {
            if (excludeIds.includes(cat.id)) return false;
            if (searchQuery) {
                return cat.name.toLowerCase().includes(searchQuery.toLowerCase());
            }
            return true;
        });
    }, [flattenedCategories, excludeIds, searchQuery]);

    // 获取画师的唯一标识（画师可能没有id字段，使用 name:categoryId 组合）
    const getArtistKey = (artist) => artist.id || `${artist.categoryId}:${artist.name}`;

    const filteredArtists = useMemo(() => {
        if (!artists || artists.length === 0) return [];
        return artists.filter(artist => {
            if (excludeIds.includes(getArtistKey(artist))) return false;
            if (searchQuery) {
                const name = (artist.displayName || artist.name).toLowerCase();
                return name.includes(searchQuery.toLowerCase());
            }
            return true;
        });
    }, [artists, excludeIds, searchQuery]);

    const handleSelect = (item) => {
        if (type === 'category') {
            onSelect({ type: 'category', ...item });
        } else {
            onSelect({ type: 'artist', ...item });
        }
    };

    return h('div', { class: 'flat-selector' }, [
        // 搜索框
        h('input', {
            class: 'flat-selector-search',
            type: 'text',
            placeholder: '搜索...',
            value: searchQuery,
            onInput: (e) => setSearchQuery(e.target.value)
        }),

        // 列表
        h('div', { class: 'flat-selector-list' },
            type === 'category'
                ? filteredCategories.map(cat =>
                    h('div', {
                        key: cat.id,
                        class: `flat-selector-item ${currentId === cat.id ? 'selected' : ''}`,
                        style: `padding-left: ${12 + cat.level * 20}px`,
                        onClick: () => handleSelect(cat)
                    }, [
                        h('span', { class: 'flat-selector-icon' }, '📁'),
                        h('span', { class: 'flat-selector-name' }, cat.name)
                    ])
                )
                : filteredArtists.map(artist =>
                    h('div', {
                        key: getArtistKey(artist),
                        class: `flat-selector-item ${currentId === getArtistKey(artist) ? 'selected' : ''}`,
                        onClick: () => handleSelect(artist)
                    }, [
                        h('span', { class: 'flat-selector-icon' }, '👤'),
                        h('span', { class: 'flat-selector-name' }, artist.displayName || artist.name),
                        h('span', { class: 'flat-selector-count' }, `${artist.imageCount}张`)
                    ])
                )
        )
    ]);
}
