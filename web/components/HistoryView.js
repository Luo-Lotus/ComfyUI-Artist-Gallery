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
        action: async () => {
          try {
            await deleteImage(img.path);
            showToast('图片已删除', 'success');
            await onDeleteSuccess();
          } catch (error) {
            showToast('删除失败: ' + error.message, 'error');
          }
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
    onDataLoaded: ctx.setImageTotalCount,
    onGroupedData: ctx.setHistoryGroups,
    getContextMenuItems,
    showContextMenu,
    selectionMode: ctx.selectionMode,
    selectedItems: ctx.selectedItems,
    onSelectItem: ctx.handleHistorySelect,
    reloadSignal: ctx.historyReloadSignal,
    cardSize: ctx.cardSize,
    cardLayoutMode: ctx.cardLayoutMode,
    openLightbox: ctx.openLightbox,
    imageFields: ctx.imageFields,
    groupByField: ctx.groupByField,
    onGroupByChange: ctx.setGroupByField,
  });
}
