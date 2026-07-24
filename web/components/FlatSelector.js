/**
 * 平铺选择器组件
 * 用于移动对话框中选择目标（分类或Prompt）
 * 支持单选和多选模式，支持搜索模式
 */
import { h } from '../lib/preact.mjs';
import { useState, useMemo, useCallback, useRef } from '../lib/hooks.mjs';
import { LazyList } from './LazyList.js';
import { Icon } from '../lib/icons.mjs';

export function FlatSelector({
  type, // 'category' | 'prompt'
  categories,
  prompts,
  currentId,
  onSelect,
  excludeIds = [],
  placeholder = '选择目标...',
  // 多选模式
  multiSelect = false,
  selectedIds = new Set(),
  onToggleItem,
  // 搜索模式
  searchMode = false,
  onSearch,
  searchLoading = false,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const searchTimerRef = useRef(null);

  // 构建平铺的分类树（包含缩进）
  const flattenedCategories = useMemo(() => {
    if (!categories || categories.length === 0) return [];

    const flattenCategories = (tree, level = 0) => {
      const result = [];
      tree.forEach((cat) => {
        if (cat.id === 'root') {
          if (cat.children && cat.children.length > 0) {
            result.push(...flattenCategories(cat.children, level));
          }
          return;
        }
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
    return flattenedCategories.filter((cat) => {
      if (excludeIds.includes(cat.id)) return false;
      if (searchQuery) {
        return cat.name.toLowerCase().includes(searchQuery.toLowerCase());
      }
      return true;
    });
  }, [flattenedCategories, excludeIds, searchQuery]);

  const getPromptKey = (prompt) => prompt.id || `${prompt.categoryId}:${prompt.value}`;

  const filteredPrompts = useMemo(() => {
    if (!prompts || prompts.length === 0) return [];
    return prompts.filter((prompt) => {
      if (excludeIds.includes(getPromptKey(prompt))) return false;
      if (searchQuery && !searchMode) {
        const name = (prompt.name || prompt.value).toLowerCase();
        return name.includes(searchQuery.toLowerCase());
      }
      return true;
    });
  }, [prompts, excludeIds, searchQuery, searchMode]);

  const items = type === 'category' ? filteredCategories : filteredPrompts;

  const handleClick = (item) => {
    if (multiSelect) {
      const key = type === 'category' ? item.id : getPromptKey(item);
      onToggleItem && onToggleItem(key, item);
    } else {
      if (type === 'category') {
        onSelect({ type: 'category', ...item });
      } else {
        onSelect({ type: 'prompt', ...item });
      }
    }
  };

  const isSelected = (item) => {
    if (multiSelect) {
      const key = type === 'category' ? item.id : getPromptKey(item);
      return selectedIds.has(key);
    }
    if (type === 'category') {
      return currentId === item.id;
    }
    return currentId === getPromptKey(item);
  };

  const handleSearchInput = useCallback(
    (e) => {
      const value = e.target.value;
      setSearchQuery(value);

      if (searchMode && onSearch) {
        clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(() => {
          onSearch(value);
        }, 200);
      }
    },
    [searchMode, onSearch],
  );

  const renderItem = (item) => {
    const selected = isSelected(item);
    const key = type === 'category' ? item.id : getPromptKey(item);

    const children = [];
    if (multiSelect) {
      children.push(
        h(
          'span',
          {
            class: `flat-selector-check ${selected ? 'checked' : ''}`,
          },
          selected ? '☑' : '☐',
        ),
      );
    }
    children.push(
      h(
        'span',
        { class: 'flat-selector-icon' },
        h(Icon, {
          name: type === 'category' ? 'folder' : 'user',
          size: 14,
        }),
      ),
    );
    children.push(
      h('span', { class: 'flat-selector-name' }, type === 'category' ? item.name : item.name || item.value),
    );

    return h(
      'div',
      {
        key,
        class: `flat-selector-item ${selected ? 'selected' : ''}`,
        style: type === 'category' ? `padding-left: ${12 + item.level * 20}px` : undefined,
        onClick: () => handleClick(item),
      },
      children,
    );
  };

  return h('div', { class: 'flat-selector' }, [
    h('input', {
      class: 'flat-selector-search',
      type: 'text',
      placeholder: searchMode ? '输入关键词搜索...' : placeholder,
      value: searchQuery,
      onInput: handleSearchInput,
    }),

    searchLoading && h('div', { class: 'flat-selector-loading' }, '搜索中...'),

    h(LazyList, {
      items,
      renderItem,
      layout: 'list',
      className: 'flat-selector-list',
      scrollContainer: 'self',
      threshold: 200,
      initialCount: 50,
    }),

    multiSelect && selectedIds.size > 0 && h('div', { class: 'flat-selector-footer' }, `已选择 ${selectedIds.size} 项`),
  ]);
}
