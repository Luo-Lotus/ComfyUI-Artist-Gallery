/**
 * 列表选择器组件
 * 用于选择分类或画师，支持搜索
 */
import { h } from '../lib/preact.mjs';
import { useState, useMemo } from '../lib/hooks.mjs';
import { Icon } from '../lib/icons.mjs';

export function TreeSelector({
    type, // 'category' | 'artist'
    categories,
    artists,
    currentId,
    onSelect,
    excludeIds = [], // 排除的ID列表
    placeholder = '搜索...'
}) {
    const [searchQuery, setSearchQuery] = useState('');

    // 扁平化分类树
    const flattenCategories = (tree) => {
        const result = [];
        function traverse(node, level = 0) {
            result.push({
                ...node,
                level,
                type: 'category'
            });
            if (node.children) {
                node.children.forEach(child => traverse(child, level + 1));
            }
        }
        tree.forEach(traverse);
        return result;
    };

    // 构建列表数据
    const listData = useMemo(() => {
        const flatCategories = flattenCategories(categories || []);

        if (type === 'category') {
            return flatCategories;
        } else {
            // 类型为 artist，混合显示分类和画师
            const result = [];
            flatCategories.forEach(cat => {
                result.push({
                    ...cat,
                    type: 'category'
                });
                // 添加该分类下的画师
                const categoryArtists = (artists || []).filter(a => a.categoryId === cat.id);
                categoryArtists.forEach(artist => {
                    result.push({
                        ...artist,
                        level: cat.level + 1,
                        type: 'artist'
                    });
                });
            });
            return result;
        }
    }, [categories, artists, type]);

    // 过滤数据
    const filteredData = useMemo(() => {
        if (!searchQuery) {
            return listData.filter(item => !excludeIds.includes(item.id));
        }

        const query = searchQuery.toLowerCase();
        return listData.filter(item => {
            if (excludeIds.includes(item.id)) return false;
            const name = (item.name || item.displayName || '').toLowerCase();
            return name.includes(query);
        });
    }, [listData, searchQuery, excludeIds]);

    // 渲染列表项
    const renderListItem = (item) => {
        const isCategory = item.type === 'category';
        const isSelected = currentId === item.id;

        return h('div', {
            key: item.id,
            class: `tree-selector-item ${isSelected ? 'selected' : ''}`,
            style: {
                paddingLeft: `${item.level * 16 + 12}px`
            }
        }, [
            // 图标
            h('span', { class: 'tree-item-icon' },
                h(Icon, { name: isCategory ? 'folder' : 'user', size: 14 })
            ),

            // 名称
            h('span', { class: 'tree-item-label' },
                item.name || item.displayName
            ),

            // 选择按钮
            h('button', {
                class: 'tree-item-select-btn',
                onClick: () => onSelect(item)
            }, '选择')
        ]);
    };

    return h('div', { class: 'tree-selector' }, [
        // 搜索框
        h('input', {
            type: 'text',
            class: 'tree-search-input',
            placeholder,
            value: searchQuery,
            onInput: (e) => setSearchQuery(e.target.value)
        }),

        // 列表
        h('div', { class: 'tree-list' },
            filteredData.length > 0
                ? filteredData.map(item => renderListItem(item))
                : h('div', { class: 'tree-empty' }, '没有找到匹配项')
        )
    ]);
}
