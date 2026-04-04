/**
 * 平铺选择器组件
 * 用于移动对话框中选择目标（分类或画师）
 * 支持单选和多选模式
 */
import { h } from '../lib/preact.mjs';
import { useState, useMemo } from '../lib/hooks.mjs';
import { LazyList } from './LazyList.js';
import { Icon } from '../lib/icons.mjs';

export function FlatSelector({
    type, // 'category' | 'artist'
    categories,
    artists,
    currentId,
    onSelect,
    excludeIds = [],
    placeholder = '选择目标...',
    // 多选模式
    multiSelect = false,
    selectedIds = new Set(),
    onToggleItem,
}) {
    const [searchQuery, setSearchQuery] = useState('');

    // 构建平铺的分类树（包含缩进）
    const flattenedCategories = useMemo(() => {
        if (!categories || categories.length === 0) return [];

        const flattenCategories = (tree, level = 0) => {
            const result = [];
            tree.forEach(cat => {
                if (cat.name === '全部') return;
                result.push({ ...cat, level });
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

    const items = type === 'category' ? filteredCategories : filteredArtists;

    const handleClick = (item) => {
        if (multiSelect) {
            const key = type === 'category' ? item.id : getArtistKey(item);
            onToggleItem && onToggleItem(key, item);
        } else {
            if (type === 'category') {
                onSelect({ type: 'category', ...item });
            } else {
                onSelect({ type: 'artist', ...item });
            }
        }
    };

    const isSelected = (item) => {
        if (multiSelect) {
            const key = type === 'category' ? item.id : getArtistKey(item);
            return selectedIds.has(key);
        }
        if (type === 'category') {
            return currentId === item.id;
        }
        return currentId === getArtistKey(item);
    };

    const renderItem = (item) => {
        const selected = isSelected(item);
        const key = type === 'category' ? item.id : getArtistKey(item);

        const children = [];
        if (multiSelect) {
            children.push(h('span', {
                class: `flat-selector-check ${selected ? 'checked' : ''}`,
            }, selected ? '☑' : '☐'));
        }
        children.push(h('span', { class: 'flat-selector-icon' },
            h(Icon, { name: type === 'category' ? 'folder' : 'user', size: 14 })));
        children.push(h('span', { class: 'flat-selector-name' },
            type === 'category' ? item.name : (item.displayName || item.name)));

        if (type === 'artist') {
            children.push(h('span', { class: 'flat-selector-count' },
                `${item.imageCount || 0}张`));
        }

        return h('div', {
            key,
            class: `flat-selector-item ${selected ? 'selected' : ''}`,
            style: type === 'category' ? `padding-left: ${12 + item.level * 20}px` : undefined,
            onClick: () => handleClick(item),
        }, children);
    };

    return h('div', { class: 'flat-selector' }, [
        h('input', {
            class: 'flat-selector-search',
            type: 'text',
            placeholder: placeholder,
            value: searchQuery,
            onInput: (e) => setSearchQuery(e.target.value)
        }),

        h(LazyList, {
            items,
            renderItem,
            layout: 'list',
            className: 'flat-selector-list',
            scrollContainer: 'self',
            threshold: 200,
            initialCount: 50,
        }),

        multiSelect && selectedIds.size > 0 &&
            h('div', { class: 'flat-selector-footer' },
                `已选择 ${selectedIds.size} 项`),
    ]);
}
