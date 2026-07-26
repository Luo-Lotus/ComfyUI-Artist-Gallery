/**
 * ImageGroupView - 按分组展示图片的组件
 * 共享组件，供 PromptDetailView 和 HistoryView 使用
 *
 * 搜索栏在 GalleryFilterBar 中，搜索关键词通过 searchQuery prop 传入
 * 组件内部管理：分组侧边栏（可选字段分组 + 搜索筛选）、分组图片内容、滚动边缘加载
 */
import { h } from '../lib/preact.mjs';
import { useState, useEffect, useMemo, useRef, useCallback } from '../lib/hooks.mjs';
import { LazyList } from './LazyList.js';
import { buildImageUrl, fetchGroupedImages } from '../utils.js';
import { computeSizeVars } from './SizePresets.js';
import { showToast } from './Toast.js';

// 自适应模式下的图片项组件（检测实际宽高比）
function AdaptiveImageItem({ img, className, onClick, onContextMenu }) {
  const [ratio, setRatio] = useState(1);
  const imgRef = useRef(null);
  const handleLoad = useCallback(() => {
    const el = imgRef.current;
    if (el && el.naturalWidth > 0 && el.naturalHeight > 0) {
      setRatio(Math.max(0.5, Math.min(3.0, el.naturalWidth / el.naturalHeight)));
    }
  }, []);
  return h('div', {
    class: className,
    style: { '--card-aspect-ratio': ratio },
    onClick,
    onContextMenu,
  },
    h('img', {
      ref: imgRef,
      src: buildImageUrl(img.path, img.type),
      alt: img.path,
      loading: 'lazy',
      decoding: 'async',
      onLoad: handleLoad,
    }),
  );
}

// ============ GroupSidebar ============

function GroupSidebar({ groupList, groupCountMap, currentGroupIndex, onJumpToGroup, imageFields, groupByField, onGroupByChange }) {
  const [searchTerm, setSearchTerm] = useState('');

  // 过滤可分组字段
  const groupableFields = useMemo(() => {
    return (imageFields || []).filter(f => f.groupable);
  }, [imageFields]);

  // 按搜索词过滤分组列表
  const filteredList = useMemo(() => {
    if (!searchTerm.trim()) return groupList;
    const term = searchTerm.toLowerCase();
    return groupList.filter(g => g.toLowerCase().includes(term));
  }, [groupList, searchTerm]);

  if (!groupList || groupList.length === 0) return null;

  return h('div', { class: 'group-sidebar' },
    // 字段选择器
    groupableFields.length > 1 && h('div', { class: 'group-sidebar-selector' },
      h('select', {
        class: 'group-sidebar-select',
        value: groupByField || 'builtin_date',
        onChange: (e) => onGroupByChange(e.target.value),
      },
        groupableFields.map(f =>
          h('option', { key: f.id, value: f.id }, f.name)
        )
      ),
    ),

    // 搜索框
    h('div', { class: 'group-sidebar-search' },
      h('input', {
        class: 'group-sidebar-search-input',
        type: 'text',
        placeholder: '搜索分组...',
        value: searchTerm,
        onInput: (e) => setSearchTerm(e.target.value),
      }),
    ),

    // 分组列表
    h('div', { class: 'group-sidebar-list' },
      filteredList.map((groupKey) => {
        const originalIndex = groupList.indexOf(groupKey);
        const isCurrent = currentGroupIndex === originalIndex;
        const count = groupCountMap[groupKey] || 0;
        return h(
          'button',
          {
            key: groupKey,
            class: `group-sidebar-item ${isCurrent ? 'active' : ''}`,
            onClick: () => onJumpToGroup(originalIndex),
          },
          [
            h('span', { class: 'group-sidebar-label' }, groupKey),
            h('span', { class: 'group-sidebar-count' }, count),
          ],
        );
      }),
    ),
  );
}

// ============ ImageGroupView ============

/**
 * @param {Object} props
 * @param {string} [props.promptFilter] - 按此 prompt value 过滤图片
 * @param {string[]} [props.promptFilters] - 按多个 prompt value 取交集过滤
 * @param {string} [props.lightboxName] - Lightbox 标题
 * @param {string} [props.searchQuery] - 外部搜索关键词（来自 GalleryFilterBar）
 * @param {Function} props.onDataLoaded - (totalImages) => void 数据加载后回调
 * @param {Function} props.getContextMenuItems - (img, ctx) => menuItem[]
 * @param {Function} props.showContextMenu - 从 useContextMenu() 获取
 * @param {boolean} [props.selectionMode]
 * @param {Set} [props.selectedItems]
 * @param {Function} [props.onSelectItem]
 * @param {Function} [props.onDeleteSuccess] - 删除后的额外回调
 * @param {number} props.cardSize
 * @param {boolean} [props.includeComfyOutput] - 是否包含 comfy_output 导入的图片
 * @param {Function} props.openLightbox
 * @param {Object[]} [props.imageFields] - 图片字段列表
 * @param {string} [props.groupByField] - 当前分组字段 ID
 * @param {Function} [props.onGroupByChange] - 分组字段变更回调
 */
export function ImageGroupView({
  promptFilter,
  promptFilters,
  lightboxName = '图片',
  searchQuery = '',
  customFilters = null,
  includeComfyOutput = false,
  onDataLoaded,
  onGroupedData,
  getContextMenuItems,
  showContextMenu,
  selectionMode = false,
  selectedItems = null,
  onSelectItem = null,
  onDeleteSuccess,
  cardSize,
  cardLayoutMode = 'fixed',
  openLightbox,
  imageFields = [],
  groupByField = 'builtin_date',
  onGroupByChange,
}) {
  const [groupData, setGroupData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 });
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0);
  const [loadingMore, setLoadingMore] = useState(null); // 'up' | 'down' | null

  const scrollContainerRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const prevScrollHeightRef = useRef(0);

  // 侧边栏宽度（可拖拽调整）
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try { return parseInt(localStorage.getItem('pg_sidebar_width')) || 160; } catch { return 160; }
  });
  const dragStateRef = useRef(null);

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    dragStateRef.current = { startX: e.clientX, startWidth: sidebarWidth };
    const onMove = (ev) => {
      if (!dragStateRef.current) return;
      const delta = ev.clientX - dragStateRef.current.startX;
      const newWidth = Math.max(100, Math.min(400, dragStateRef.current.startWidth + delta));
      setSidebarWidth(newWidth);
    };
    const onUp = () => {
      dragStateRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [sidebarWidth]);

  // 持久化宽度
  useEffect(() => {
    try { localStorage.setItem('pg_sidebar_width', String(sidebarWidth)); } catch {}
  }, [sidebarWidth]);

  const gridStyle = useMemo(() => computeSizeVars(cardSize), [cardSize]);

  // ============ 数据加载 ============
  const loadGroupedData = useCallback(
    async (search = '') => {
      setLoading(true);
      try {
        const result = await fetchGroupedImages({
          prompt: promptFilter || undefined,
          prompts: promptFilters || undefined,
          search: search || undefined,
          filters: customFilters || undefined,
          includeComfyOutput: includeComfyOutput || undefined,
          groupBy: groupByField || undefined,
        });
        if (result.success) {
          setGroupData(result);
          setVisibleRange({ start: 0, end: 0 });
          setCurrentGroupIndex(0);
          if (onDataLoaded) onDataLoaded(result.totalImages);
          if (onGroupedData) onGroupedData(result.groups || []);
        } else {
          if (onGroupedData) onGroupedData([]);
        }
      } catch (err) {
        showToast('加载图片失败: ' + err.message, 'error');
        if (onGroupedData) onGroupedData([]);
      } finally {
        setLoading(false);
      }
    },
    [promptFilter, promptFilters, customFilters, includeComfyOutput, groupByField, onDataLoaded, onGroupedData],
  );

  // 首次挂载、filter 变化或 searchQuery 变化时加载（search 增加 300ms debounce）
  useEffect(() => {
    const timer = setTimeout(() => {
      loadGroupedData(searchQuery);
    }, searchQuery ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadGroupedData, searchQuery]);

  // 删除后重新加载
  const reloadData = useCallback(() => {
    loadGroupedData(searchQuery);
  }, [loadGroupedData, searchQuery]);

  const handleDeleteAndReload = useCallback(async () => {
    if (onDeleteSuccess) await onDeleteSuccess();
    reloadData();
  }, [onDeleteSuccess, reloadData]);

  // ============ 可见分组 ============
  const groups = groupData?.groups || [];
  const groupList = groupData?.dateList || [];

  const visibleGroups = useMemo(() => {
    const { start, end } = visibleRange;
    return groups.slice(start, end + 1);
  }, [groups, visibleRange]);

  // 视口内全部图片（打平）+ 每组起始偏移，供 Lightbox 索引用；提到 useMemo 避免逐项重算
  const allVisibleImages = useMemo(
    () => visibleGroups.flatMap((g) => g.images || []),
    [visibleGroups],
  );
  const groupOffsets = useMemo(() => {
    const offsets = [0];
    for (const g of visibleGroups) offsets.push(offsets[offsets.length - 1] + (g.images?.length || 0));
    return offsets;
  }, [visibleGroups]);

  const groupCountMap = useMemo(() => {
    const map = {};
    for (const g of groups) map[g.date] = g.count;
    return map;
  }, [groups]);

  // ============ 滚动边缘检测 + debounce ============
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || groups.length === 0) return;

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(() => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const threshold = 100;

      if (scrollTop <= threshold && visibleRange.start > 0) {
        setLoadingMore('up');
        prevScrollHeightRef.current = scrollHeight;
        setVisibleRange((prev) => ({ start: prev.start - 1, end: prev.end }));
      } else if (scrollHeight - scrollTop - clientHeight <= threshold && visibleRange.end < groups.length - 1) {
        setLoadingMore('down');
        setVisibleRange((prev) => ({ start: prev.start, end: prev.end + 1 }));
      }
    }, 400);
  }, [groups.length, visibleRange]);

  useEffect(() => {
    if (prevScrollHeightRef.current > 0 && scrollContainerRef.current) {
      const diff = scrollContainerRef.current.scrollHeight - prevScrollHeightRef.current;
      if (diff > 0) scrollContainerRef.current.scrollTop += diff;
      prevScrollHeightRef.current = 0;
    }
    // 延迟清除 loadingMore，让动画有时间显示
    if (loadingMore) {
      const timer = setTimeout(() => setLoadingMore(null), 300);
      return () => clearTimeout(timer);
    }
  }, [visibleRange]);

  // 内容高度不足时自动加载更多组
  useEffect(() => {
    if (loading || groups.length === 0) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    const checkAndLoad = () => {
      const { scrollHeight, clientHeight } = container;
      if (scrollHeight <= clientHeight && visibleRange.end < groups.length - 1) {
        setLoadingMore('down');
        setVisibleRange((prev) => ({ start: prev.start, end: prev.end + 1 }));
      }
    };
    requestAnimationFrame(checkAndLoad);
  }, [visibleRange, groups.length, loading]);

  useEffect(() => {
    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); };
  }, []);

  const handleJumpToGroup = useCallback((groupIndex) => {
    setCurrentGroupIndex(groupIndex);
    setVisibleRange({ start: groupIndex, end: groupIndex });
    requestAnimationFrame(() => {
      if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
    });
  }, []);

  // ============ 图片渲染 ============
  const renderImageItem = useCallback(
    (img, imgIndex, groupIndex) => {
      const flatIndex = groupOffsets[groupIndex] + imgIndex;
      const imgKey = `image:${img.path}`;
      const isSelected = selectedItems && selectedItems.has(imgKey);

      const handleContextMenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!getContextMenuItems || !showContextMenu) return;
        showContextMenu(e, getContextMenuItems(img, {
          flatIndex,
          allVisibleImages,
          lightboxName,
          onDeleteSuccess: handleDeleteAndReload,
        }));
      };

      const itemClass = `prompt-detail-image-item ${selectionMode ? 'selection-mode' : ''} ${isSelected ? 'selected' : ''}`;
      const handleClick = (e) => {
        if (selectionMode && onSelectItem) {
          onSelectItem(imgKey, e.shiftKey);
        } else if (openLightbox) {
          openLightbox({ name: lightboxName, images: allVisibleImages }, flatIndex);
        }
      };

      if (cardLayoutMode === 'adaptive') {
        return h(AdaptiveImageItem, {
          key: img.path,
          img,
          className: itemClass,
          onClick: handleClick,
          onContextMenu: handleContextMenu,
        });
      }

      return h(
        'div',
        {
          key: img.path,
          class: itemClass,
          onClick: handleClick,
          onContextMenu: handleContextMenu,
        },
        h('img', {
          src: buildImageUrl(img.path, img.type),
          alt: `${lightboxName} - ${imgIndex + 1}`,
          loading: 'lazy',
          decoding: 'async',
        }),
      );
    },
    [allVisibleImages, groupOffsets, selectionMode, selectedItems, onSelectItem, openLightbox, lightboxName, getContextMenuItems, showContextMenu, handleDeleteAndReload, cardLayoutMode],
  );

  // ============ Loading / Empty ============
  if (loading) {
    return h('div', { class: 'image-group-view-loading' }, [
      h('div', { class: 'gallery-loading-spinner' }),
      h('div', {}, '正在加载图片...'),
    ]);
  }

  if (groups.length === 0) {
    return h('div', { class: 'image-group-view-empty' }, '暂无图片');
  }

  // ============ 渲染 ============
  return h('div', { class: 'image-group-view' }, [
    h('div', { class: 'image-group-body' }, [
      h('div', { class: 'group-sidebar-wrapper', style: { width: sidebarWidth + 'px', flexShrink: 0 } }, [
        h(GroupSidebar, {
          groupList,
          groupCountMap,
          currentGroupIndex,
          onJumpToGroup: handleJumpToGroup,
          imageFields,
          groupByField,
          onGroupByChange,
        }),
      ]),

      h('div', {
        class: 'group-sidebar-resize-handle',
        onMouseDown: handleResizeStart,
      }),

      h(
        'div',
        {
          class: 'image-group-content',
          ref: scrollContainerRef,
          onScroll: handleScroll,
        },
        [
          // 顶部加载状态
          loadingMore === 'up' && h('div', { class: 'image-group-loading-indicator' }, [
            h('div', { class: 'gallery-loading-spinner small' }),
            h('span', {}, '加载更多...'),
          ]),

          visibleRange.start > 0 && !loadingMore &&
            h('div', { class: 'image-group-load-hint' }, '↑ 继续上滑加载更多'),

          ...visibleGroups.map((group, groupIndex) =>
            h(
              'div',
              { key: group.date, class: 'date-group', 'data-date': group.date },
              [
                h('div', { class: 'date-group-header' }, [
                  h('span', { class: 'date-group-label' }, group.date),
                  h('span', { class: 'date-group-count' }, `${group.count} 张`),
                ]),

                group.images.length > 0
                  ? h(LazyList, {
                      items: group.images,
                      renderItem: (img, imgIndex) => renderImageItem(img, imgIndex, groupIndex),
                      layout: cardLayoutMode === 'adaptive' ? 'flex' : 'grid',
                      className: 'prompt-detail-grid' + (cardLayoutMode === 'adaptive' ? ' adaptive' : ''),
                      style: gridStyle,
                      scrollContainer: 'parent',
                    })
                  : h('div', { class: 'date-group-empty' }, '无图片'),
              ],
            ),
          ),

          // 底部加载状态
          loadingMore === 'down' && h('div', { class: 'image-group-loading-indicator' }, [
            h('div', { class: 'gallery-loading-spinner small' }),
            h('span', {}, '加载更多...'),
          ]),

          visibleRange.end < groups.length - 1 && !loadingMore &&
            h('div', { class: 'image-group-load-hint' }, '↓ 继续下滑加载更多'),
        ],
      ),
    ]),
  ]);
}
