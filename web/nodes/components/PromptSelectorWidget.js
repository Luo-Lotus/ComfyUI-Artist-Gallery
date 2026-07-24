/**
 * Prompt Selector Preact 组件
 * Prompt选择器的 UI 渲染部分
 */
import { h } from '../../lib/preact.mjs';
import { useState, useMemo, useCallback, useRef, useEffect } from '../../lib/hooks.mjs';
import { Icon } from '../../lib/icons.mjs';
import { usePromptSelector } from './hooks/usePromptSelector.js';
import { useImagePreview } from './hooks/useImagePreview.js';
import { useContextMenu } from '../../components/ContextMenu.js';
import { PartitionList } from './PartitionList.js';
import { PartitionConfigPanel } from './PartitionConfigPanel.js';
import { LazyList } from '../../components/LazyList.js';
import { showToast } from '../../components/Toast.js';
import { useBodyRender } from './hooks/useBodyRender.js';
import { AddPromptDialog } from '../../components/AddPromptDialog.js';
import { CategoryDialog } from '../../components/CategoryDialog.js';
import { addCategory, batchResolve, searchAll, Storage } from '../../utils.js';
import { updateCategoryMetadata, updateCombinationMetadata, updatePromptMetadata } from '../../services/promptApi.js';

// 辅助函数：构建面包屑路径
function buildBreadcrumbPath(categoryId, categories) {
  const path = [];
  function findPath(id) {
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;
    path.unshift(cat);
    if (cat.parentId) findPath(cat.parentId);
  }
  if (categoryId && categoryId !== 'root') findPath(categoryId);
  return path;
}

// 辅助函数：获取分类的完整路径名
function getCategoryPathName(categoryId, categories) {
  const path = buildBreadcrumbPath(categoryId, categories);
  return path.map((c) => c.name).join(' / ');
}

function isPinned(item) {
  return !!item?.metadata?.pinned;
}

function comparePinned(a, b) {
  return Number(isPinned(b)) - Number(isPinned(a));
}

export function PromptSelectorWidget({ nodeInstance, selectedInput, metadataInput }) {
  const {
    prompts,
    categories,
    combinations,
    selectedKeys,
    selectedCategories,
    selectedCombinationKeys,
    selectedPromptsCache,
    setSelectedPromptsCache,
    loading,
    searchQuery,
    sortBy,
    sortOrder,
    currentCategory,
    filteredPrompts,
    filteredCategories,
    filteredCombinations,
    refreshing,
    breadcrumbPath,
    partitionData,
    itemsByPartition,
    addPartition,
    deletePartition,
    updatePartition,
    addItemToPartition,
    removeItemFromPartition,
    reorderPartitionItems,
    setPromptWeight,
    togglePartition,
    setAsDefaultPartition,
    reorderPartitions,
    isItemSelected,
    setSearchQuery,
    setSortBy,
    setSortOrder,
    toggleSelection,
    toggleCategorySelection,
    toggleCombinationSelection,
    handleCategoryChange,
    handleRefresh,
    makePromptKey,
    searchResults,
    coversCache,
    fetchCoversByIds,
  } = usePromptSelector(nodeInstance, selectedInput, metadataInput);

  // 使用图片预览 hook（支持按需获取封面）
  const { showPreview, removePreview } = useImagePreview(coversCache, fetchCoversByIds);

  // 使用右键菜单 hook
  const { showContextMenu } = useContextMenu();

  // 分区配置面板状态
  const [showPartitionConfig, setShowPartitionConfig] = useState(false);
  const [editingPartitionId, setEditingPartitionId] = useState(null);

  // 新建菜单和弹窗状态
  const { renderToBody, clear } = useBodyRender();
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [showPromptDialog, setShowPromptDialog] = useState(false);
  const hoverMenuTimerRef = useRef(null);
  const categoryClickTimerRef = useRef(null);

  // 拖拽分隔条状态
  const [splitPercent, setSplitPercent] = useState(35);
  const [isDragging, setIsDragging] = useState(false);
  const [showSearchPath, setShowSearchPath] = useState(() => Storage.getNodeSearchShowPath());
  const containerRef = useRef(null);
  const draggingRef = useRef(false);

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    draggingRef.current = true;
    setIsDragging(true);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const rawPercent = ((e.clientY - rect.top) / rect.height) * 100;
      setSplitPercent(Math.min(70, Math.max(15, rawPercent)));
    };
    const handleMouseUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (hoverMenuTimerRef.current) clearTimeout(hoverMenuTimerRef.current);
      if (categoryClickTimerRef.current) clearTimeout(categoryClickTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const handleNodeSettingsChange = (event) => {
      if (event.detail && typeof event.detail.showSearchPath === 'boolean') {
        setShowSearchPath(event.detail.showSearchPath);
      } else {
        setShowSearchPath(Storage.getNodeSearchShowPath());
      }
    };
    const handleStorageChange = (event) => {
      if (event.key === 'prompt-gallery-node-search-show-path') {
        setShowSearchPath(Storage.getNodeSearchShowPath());
      }
    };
    window.addEventListener('prompt-gallery-node-settings-change', handleNodeSettingsChange);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('prompt-gallery-node-settings-change', handleNodeSettingsChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // ============ 新建弹窗处理 ============

  const openCategoryDialog = () => {
    setShowCategoryDialog(true);
  };

  const openPromptDialog = () => {
    setShowPromptDialog(true);
  };

  // 渲染分区配置面板到 body
  useEffect(() => {
    if (showPartitionConfig) {
      renderToBody(
        h('div', { class: 'prompt-selector-config-overlay' }, [
          h(PartitionConfigPanel, {
            partition: partitionData.partitions.find((p) => p.id === editingPartitionId) || partitionData.partitions[0],
            globalConfig: partitionData.globalConfig,
            categories: categories,
            onChange: (updates) => updatePartition(editingPartitionId, updates),
            onClose: () => setShowPartitionConfig(false),
          }),
        ]),
      );
    }
  }, [showPartitionConfig, editingPartitionId, partitionData]);

  // 统一渲染弹窗到 body（避免多个 effect 互相 clear）
  useEffect(() => {
    if (showCategoryDialog) {
      renderToBody(
        h(CategoryDialog, {
          isOpen: true,
          mode: 'add',
          categories: categories,
          currentCategoryId: currentCategory,
          onClose: () => setShowCategoryDialog(false),
          onSave: async (data) => {
            await addCategory(data);
            setShowCategoryDialog(false);
            handleRefresh();
            showToast('分类创建成功', 'success');
          },
        }),
      );
    } else if (showPromptDialog) {
      renderToBody(
        h(AddPromptDialog, {
          isOpen: true,
          mode: 'add',
          currentCategoryId: currentCategory,
          onClose: () => setShowPromptDialog(false),
          onSave: () => {
            setShowPromptDialog(false);
            handleRefresh();
          },
        }),
      );
    } else if (!showPartitionConfig) {
      clear();
    }
  }, [showCategoryDialog, showPromptDialog, showPartitionConfig, categories, currentCategory]);

  // ============ 子组件渲染函数 ============

  /**
   * 渲染面包屑导航
   */
  const renderBreadcrumb = () => {
    if (breadcrumbPath.length === 0) return null;

    return h(
      'div',
      { class: 'prompt-selector-breadcrumb' },
      h('div', { class: 'prompt-selector-breadcrumb-list' }, [
        // 只显示子分类路径
        breadcrumbPath.map((cat, index) => [
          index > 0 &&
            h(
              'span',
              {
                key: `sep-${index}`,
                class: 'prompt-selector-breadcrumb-separator',
              },
              '/',
            ),
          h(
            'span',
            {
              key: cat.id,
              class: `prompt-selector-breadcrumb-item ${currentCategory === cat.id ? 'active' : ''}`,
              onClick: () => handleCategoryChange(cat.id),
            },
            cat.name,
          ),
        ]),
      ]),
    );
  };

  // 鼠标悬停处理
  const handleMouseEnter = (prompt, event) => {
    showPreview(prompt, event);
  };

  // 鼠标离开处理
  const handleMouseLeave = () => {
    removePreview();
  };

  const handleTogglePinned = async (type, item) => {
    const pinned = !item?.metadata?.pinned;
    try {
      if (type === 'category') {
        await updateCategoryMetadata(item.id, { pinned });
      } else if (type === 'prompt') {
        await updatePromptMetadata(item.categoryId, item.value, { pinned });
      } else if (type === 'combination') {
        await updateCombinationMetadata(item.id, { pinned });
      }
      showToast(pinned ? '已置顶' : '已取消置顶', 'success');
      handleRefresh();
    } catch (err) {
      showToast('置顶操作失败: ' + err.message, 'error');
    }
  };

  /**
   * 渲染已选择的Prompt和分类标签列表
   */
  const renderSelectedPrompts = () => {
    return h(PartitionList, {
      partitions: partitionData.partitions,
      itemsByPartition,
      promptWeights: partitionData.promptWeights,
      coversCache,
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
      onPartitionReorder: reorderPartitions,
      onItemMove: (type, key, fromPartitionId, toPartitionId) => {
        removeItemFromPartition(type, key, fromPartitionId);
        addItemToPartition(type, key, toPartitionId);
      },
      onItemRemove: (type, key, partitionId) => {
        removeItemFromPartition(type, key, partitionId);
      },
      onItemReorder: (partitionId, fromIndex, toIndex) => {
        reorderPartitionItems(partitionId, fromIndex, toIndex);
      },
      onPromptWeightChange: (promptKey, weight) => {
        setPromptWeight(promptKey, weight);
      },
    });
  };

  /**
   * 渲染分类卡片
   */
  const renderCategoryCard = (cat, showPath) => {
    const isSelected = selectedCategories.has(cat.id);
    // 搜索模式下显示父分类路径
    const parentPath =
      showPath && showSearchPath && cat.parentId
        ? buildBreadcrumbPath(cat.parentId, categories)
            .map((c) => c.name)
            .join(' / ')
        : '';

    const handleCategoryClick = (e) => {
      if (categoryClickTimerRef.current) clearTimeout(categoryClickTimerRef.current);
      const shiftKey = e.shiftKey;
      categoryClickTimerRef.current = setTimeout(() => {
        toggleCategorySelection(cat.id, shiftKey);
        categoryClickTimerRef.current = null;
      }, 220);
    };

    const handleCategoryDoubleClick = () => {
      if (categoryClickTimerRef.current) {
        clearTimeout(categoryClickTimerRef.current);
        categoryClickTimerRef.current = null;
      }
      handleCategoryChange(cat.id);
    };

    return h(
      'div',
      {
        key: cat.id,
        class: `prompt-selector-category-card ${currentCategory === cat.id ? 'active' : ''} ${isSelected ? 'selected' : ''}`,
        onClick: handleCategoryClick,
        onDblClick: handleCategoryDoubleClick,
        onContextMenu: (e) => {
          e.preventDefault();
          showContextMenu(e, [
            {
              icon: 'bookmark',
              label: cat.metadata?.pinned ? '取消置顶' : '置顶',
              action: () => handleTogglePinned('category', cat),
            },
            {
              icon: 'copy',
              label: '复制文本',
              action: () => {
                navigator.clipboard.writeText(cat.name);
                showToast('已复制', 'success');
              },
            },
            {
              icon: 'image',
              label: '在画廊中打开',
              action: () => {
                if (window.__openPromptGalleryTo) {
                  window.__openPromptGalleryTo({
                    type: 'category',
                    categoryId: cat.id,
                  });
                }
              },
            },
          ]);
        },
        title: '单击选择分类，双击进入分类',
      },
      [
        h('span', { class: 'prompt-selector-category-icon' }, h(Icon, { name: 'folder', size: 16 })),
        h('span', { class: 'prompt-selector-item-content' }, [
          h('span', { class: 'prompt-selector-category-name' }, [
            cat.name,
            cat.metadata?.pinned && h(Icon, { name: 'bookmark', size: 10 }),
          ]),
          parentPath && h('span', { class: 'prompt-selector-item-path' }, parentPath),
        ]),
        h(
          'span',
          {
            class: 'prompt-selector-category-enter',
            onClick: (e) => {
              e.stopPropagation();
              if (categoryClickTimerRef.current) {
                clearTimeout(categoryClickTimerRef.current);
                categoryClickTimerRef.current = null;
              }
              handleCategoryChange(cat.id);
            },
            title: '进入分类',
          },
          h(Icon, { name: 'chevron-right', size: 14 }),
        ),
      ],
    );
  };

  /**
   * 渲染搜索和排序控件（同一行）
   */
  const renderControls = () => {
    return h('div', { class: 'prompt-selector-controls-row' }, [
      h('input', {
        type: 'text',
        class: 'prompt-selector-search',
        placeholder: '搜索Prompt...',
        value: searchQuery,
        onInput: (e) => setSearchQuery(e.target.value),
      }),
      h('div', { class: 'prompt-selector-sort-controls' }, [
        h(
          'select',
          {
            class: 'prompt-selector-sort-select',
            value: sortBy,
            onChange: (e) => setSortBy(e.target.value),
          },
          [
            h('option', { value: 'name' }, '名称'),
            h('option', { value: 'created_at' }, '创建时间'),
          ],
        ),
        h(
          'button',
          {
            class: 'prompt-selector-sort-button',
            onClick: () => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'),
          },
          sortOrder === 'asc'
            ? [h(Icon, { name: 'arrow-up', size: 12 }), ' 升序']
            : [h(Icon, { name: 'arrow-down', size: 12 }), ' 降序'],
        ),
        h(
          'button',
          {
            class: 'prompt-selector-refresh-button',
            onClick: handleRefresh,
            disabled: refreshing,
            title: '刷新',
          },
          refreshing ? h(Icon, { name: 'loader', size: 14, class: 'spin' }) : h(Icon, { name: 'refresh-cw', size: 14 }),
        ),
        // 新建按钮（hover 展开菜单）
        h(
          'div',
          {
            class: 'prompt-selector-add-wrapper',
            onMouseEnter: () => {
              if (hoverMenuTimerRef.current) clearTimeout(hoverMenuTimerRef.current);
              setShowAddMenu(true);
            },
            onMouseLeave: () => {
              hoverMenuTimerRef.current = setTimeout(() => setShowAddMenu(false), 200);
            },
          },
          [
            h(
              'button',
              {
                class: 'prompt-selector-add-button',
                title: '新建',
              },
              h(Icon, { name: 'plus', size: 14 }),
            ),
            showAddMenu &&
              h('div', { class: 'prompt-selector-add-menu' }, [
                h(
                  'div',
                  {
                    class: 'prompt-selector-add-menu-item',
                    onClick: openCategoryDialog,
                  },
                  [h(Icon, { name: 'folder-plus', size: 14 }), '分类'],
                ),
                h(
                  'div',
                  {
                    class: 'prompt-selector-add-menu-item',
                    onClick: openPromptDialog,
                  },
                  [h(Icon, { name: 'plus', size: 14 }), 'Prompt'],
                ),
              ]),
          ],
        ),
      ]),
    ]);
  };

  /**
   * 渲染单个Prompt项
   */
  const renderPromptItem = (prompt, showCategoryPath) => {
    const key = makePromptKey(prompt.categoryId, prompt.value);
    const isSelected = selectedKeys.has(key);
    const categoryPath = showCategoryPath && showSearchPath ? getCategoryPathName(prompt.categoryId, categories) : '';
    return h(
      'div',
      {
        key: key,
        class: `prompt-selector-item ${isSelected ? 'selected' : ''}`,
        onClick: (e) => toggleSelection(prompt.categoryId, prompt.value, e.shiftKey),
        onMouseEnter: (e) => handleMouseEnter(prompt, e),
        onMouseLeave: () => handleMouseLeave(),
        onContextMenu: (e) => {
          e.preventDefault();
          const text = prompt.value;
          showContextMenu(e, [
            {
              icon: 'bookmark',
              label: prompt.metadata?.pinned ? '取消置顶' : '置顶',
              action: () => handleTogglePinned('prompt', prompt),
            },
            {
              icon: 'copy',
              label: '复制文本',
              action: () => {
                navigator.clipboard.writeText(text);
                showToast('已复制', 'success');
              },
            },
            {
              icon: 'image',
              label: '在画廊中打开',
              action: () => {
                if (window.__openPromptGalleryTo) {
                  window.__openPromptGalleryTo({
                    type: 'prompt',
                    categoryId: prompt.categoryId,
                    promptName: prompt.name,
                  });
                }
              },
            },
          ]);
        },
      },
      [
        h('span', { class: 'prompt-selector-item-content' }, [
          h('span', { class: 'prompt-selector-item-name' }, [
            prompt.metadata?.pinned && h(Icon, { name: 'bookmark', size: 10 }),
            prompt.name || prompt.value,
          ]),
          categoryPath && h('span', { class: 'prompt-selector-item-path' }, categoryPath),
        ]),
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
        class: `prompt-selector-item combination-item ${isSelected ? 'selected' : ''}`,
        onClick: (e) => toggleCombinationSelection(combination.id, e.shiftKey),
        onMouseEnter: (e) => handleMouseEnter(combination, e),
        onMouseLeave: () => handleMouseLeave(),
        onContextMenu: (e) => {
          e.preventDefault();
          showContextMenu(e, [
            {
              icon: 'bookmark',
              label: combination.metadata?.pinned ? '取消置顶' : '置顶',
              action: () => handleTogglePinned('combination', combination),
            },
            {
              icon: 'copy',
              label: '复制文本',
              action: async () => {
                let text = combination.outputContent;
                if (!text) {
                  // 按需获取 outputContent
                  try {
                    const result = await searchAll(combination.name, 1);
                    const found = (result.combinations || []).find((c) => c.id === combination.id);
                    text = found?.outputContent || (combination.prompts || []).join(',');
                  } catch {
                    text = (combination.prompts || []).join(',');
                  }
                }
                navigator.clipboard.writeText(text);
                showToast('已复制', 'success');
              },
            },
            {
              icon: 'image',
              label: '在画廊中打开',
              action: () => {
                if (window.__openPromptGalleryTo) {
                  window.__openPromptGalleryTo({
                    type: 'combination',
                    categoryId: combination.categoryId || currentCategory,
                    combinationId: combination.id,
                  });
                }
              },
            },
            {
              icon: 'unlink',
              label: '拆分选择',
              action: async () => {
                // 通过 batchResolve 获取各 prompt 的完整数据（含真实 categoryId）
                // 响应 key 格式为 "categoryId:value"
                let resolvedByValue = {};
                try {
                  const result = await batchResolve({ prompts: combination.prompts || [] });
                  for (const [key, prompt] of Object.entries(result.prompts || {})) {
                    resolvedByValue[prompt.value] = prompt;
                  }
                } catch {
                  // fallback: 使用 combination.categoryId
                }

                // 预填充 selectedPromptsCache，确保后续显示不丢失
                const cacheUpdates = {};
                (combination.prompts || []).forEach((promptValue) => {
                  const resolved = resolvedByValue[promptValue];
                  const categoryId = resolved ? resolved.categoryId : combination.categoryId || 'root';
                  const key = makePromptKey(categoryId, promptValue);
                  if (resolved) {
                    cacheUpdates[key] = resolved;
                  }
                });
                if (Object.keys(cacheUpdates).length > 0) {
                  setSelectedPromptsCache((prev) => ({ ...cacheUpdates, ...prev }));
                }

                (combination.prompts || []).forEach((promptValue) => {
                  const resolved = resolvedByValue[promptValue];
                  const categoryId = resolved ? resolved.categoryId : combination.categoryId || 'root';
                  const resolvedKey = makePromptKey(categoryId, promptValue);
                  if (!isItemSelected('prompt', resolvedKey)) {
                    toggleSelection(categoryId, promptValue);
                  }
                });
                if (isItemSelected('combination', `combination:${combination.id}`)) {
                  toggleCombinationSelection(combination.id);
                }
                showToast(`已拆分组合「${combination.name}」`, 'success');
              },
            },
          ]);
        },
      },
      [
        h('span', { class: 'prompt-selector-item-icon' }, h(Icon, { name: 'link', size: 14 })),
        h('span', { class: 'prompt-selector-item-name' }, [
          combination.metadata?.pinned && h(Icon, { name: 'bookmark', size: 10 }),
          combination.name,
        ]),
        h('span', { class: 'prompt-selector-combination-count' }, `${(combination.prompts || []).length}人`),
      ],
    );
  };

  /**
   * 渲染Prompt列表（包含分类和Prompt）- 使用 LazyList 懒加载
   */
  const renderPromptList = () => {
    if (loading) {
      return h('div', { class: 'prompt-selector-list' }, h('div', { class: 'prompt-selector-loading' }, '加载中...'));
    }

    const isSearching = !!searchQuery;

    // 合并为扁平数组（搜索时使用全局过滤结果）
    const listItems = [
      ...[...filteredCategories].sort(comparePinned).map((cat) => ({
        type: 'category',
        data: cat,
      })),
      ...[...filteredCombinations].sort(comparePinned).map((comb) => ({
        type: 'combination',
        data: comb,
      })),
      ...filteredPrompts.map((prompt) => ({
        type: 'prompt',
        data: prompt,
      })),
    ];

    const renderListItem = (item, index) => {
      if (item.type === 'category') return renderCategoryCard(item.data, isSearching);
      if (item.type === 'combination') return renderCombinationItem(item.data);
      return renderPromptItem(item.data, isSearching);
    };

    return h('div', { class: 'prompt-selector-list' }, [
      h(LazyList, {
        items: listItems,
        renderItem: renderListItem,
        layout: 'flex',
        className: 'prompt-selector-list-inner',
        emptyMessage: h(
          'div',
          { class: 'prompt-selector-empty-prompts' },
          isSearching ? '没有找到匹配结果' : '没有找到Prompt',
        ),
      }),
      h('div', { class: 'prompt-selector-hint' }, [
        '右键点击可复制文本、在画廊中打开',
        h('br'),
        'Shift+点击可快速选择范围内的标签',
        h('br'),
        '双击分类可以打开分类',
      ]),
    ]);
  };

  // ============ 主渲染 ============

  // 处理全局配置保存
  return h('div', { class: 'prompt-selector-container', ref: containerRef }, [
    // 已选择区域（分区列表）
    h(
      'div',
      {
        class: 'prompt-selector-section',
        style: { flex: `${splitPercent} 1 0%` },
      },
      [renderSelectedPrompts()],
    ),

    // 拖拽分隔条
    h('div', {
      class: `prompt-selector-resize-handle${isDragging ? ' active' : ''}`,
      onMouseDown: handleResizeStart,
    }),

    // 浏览区域
    h(
      'div',
      {
        class: 'prompt-selector-section',
        style: { flex: `${100 - splitPercent} 1 0%` },
      },
      [
        // 面包屑导航
        renderBreadcrumb(),

        // 搜索和排序控件（同一行）
        renderControls(),

        // Prompt列表（包含分类和Prompt）
        renderPromptList(),
      ],
    ),
  ]);
}
