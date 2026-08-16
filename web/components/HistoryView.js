/**
 * 历史图片视图
 * 薄壳层：无 promptFilter，简化右键菜单
 */
import { h } from '../lib/preact.mjs';
import { useCallback } from '../lib/hooks.mjs';
import { useContextMenu } from './ContextMenu.js';
import { ImageGroupView } from './ImageGroupView.js';
import { showToast } from './Toast.js';
import { useGallery } from './GalleryContext.js';
import { deleteImage } from '../services/promptApi.js';

export function HistoryView() {
  const ctx = useGallery();
  const { showContextMenu } = useContextMenu();

  // 必须稳定（useCallback），否则每次渲染产生新引用，
  // 会导致 ImageGroupView 的 loadGroupedData 重新创建并反复请求
  const handleDataLoaded = useCallback(
    (total) => {
      ctx.setImageTotalCount(total);
      ctx.clearHistoryRemovedPaths();
    },
    [ctx.setImageTotalCount, ctx.clearHistoryRemovedPaths],
  );

  const getContextMenuItems = useCallback(
    (img, { flatIndex, allVisibleImages, onDeleteSuccess }) => [
      {
        icon: 'search',
        label: '查看大图',
        action: () => ctx.openLightbox({ name: '历史图片', images: allVisibleImages }, flatIndex),
      },
      {
        icon: 'trash-2',
        label: '删除图片',
        action: () => {
          // 乐观删除：本地立即移除，接口失败仅提示不回退
          ctx.handleHistoryImagesRemoved([img.path]);
          deleteImage(img.path).catch((error) => {
            showToast('删除失败: ' + error.message, 'error');
          });
        },
      },
    ],
    [ctx.openLightbox],
  );

  return h(ImageGroupView, {
    lightboxName: '历史图片',
    searchQuery: ctx.imageSearchQuery,
    customFilters: ctx.activeCustomFilters.length > 0 ? ctx.activeCustomFilters : null,
    includeComfyOutput: ctx.includeComfyOutput,
    onDataLoaded: handleDataLoaded,
    onGroupedData: ctx.setHistoryGroups,
    getContextMenuItems,
    showContextMenu,
    selectionMode: ctx.selectionMode,
    selectedItems: ctx.selectedItems,
    onSelectItem: ctx.handleHistorySelect,
    removedPaths: ctx.historyRemovedPaths,
    cardSize: ctx.cardSize,
    cardLayoutMode: ctx.cardLayoutMode,
    openLightbox: ctx.openLightbox,
    imageFields: ctx.imageFields,
    groupByField: ctx.groupByField,
    onGroupByChange: ctx.setGroupByField,
  });
}
