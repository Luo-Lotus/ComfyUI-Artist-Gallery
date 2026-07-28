/**
 * 画廊模态框组件
 * 薄壳层：Provider 包裹 + 视图路由 + Dialog 渲染
 */
import { h } from '../lib/preact.mjs';
import { useState, useEffect } from '../lib/hooks.mjs';
import { GalleryProvider, useGallery } from './GalleryContext.js';
import { GalleryGrid } from './GalleryGrid.js';
import { Lightbox } from './Lightbox.js';
import { AddPromptDialog } from './AddPromptDialog.js';
import { DeleteConfirmDialog } from './DeleteConfirmDialog.js';
import { CategoryDialog } from './CategoryDialog.js';
import { MoveDialog } from './MoveDialog.js';
import { CopyDialog } from './CopyDialog.js';
import { ImportImagesDialog } from './ImportImagesDialog.js';
import { ImportZipDialog } from './ImportZipDialog.js';
import { ImportOutputDialog } from './ImportOutputDialog.js';
import { CustomFilterEditDialog } from './CustomFilterEditDialog.js';
import { ExportDialog } from './ExportDialog.js';
import { BatchActionBar } from './BatchActionBar.js';
import { BatchConfirmDialog } from './BatchConfirmDialog.js';
import { GalleryHeader } from './GalleryHeader.js';
import { GalleryFilterBar } from './GalleryFilterBar.js';
import { PromptDetailView } from './PromptDetailView.js';
import { HistoryView } from './HistoryView.js';
import { SettingsDialog } from './SettingsDialog.js';

import { Icon } from '../lib/icons.mjs';

export function GalleryModal({ isOpen, onClose, initialNavigation, selectionSession }) {
  return h(
    GalleryProvider,
    { isOpen, onClose, initialNavigation, selectionSession },
    h(GalleryModalContent),
  );
}

function GalleryModalContent() {
  const ctx = useGallery();
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (ctx.isSelectorMode) setShowSettings(false);
  }, [ctx.isSelectorMode]);

  return h(
    'div',
    {
      class: 'gallery-modal-overlay' + (ctx.isOpen ? ' open' : ''),
      onClick: (e) => {
        if (e.target.classList.contains('gallery-modal-overlay')) ctx.onClose();
      },
    },
    [
      h('div', { class: 'gallery-modal-content', 'data-theme': ctx.theme }, [
        h(GalleryHeader),
        h('div', { class: 'gallery-modal-body' }, h(GalleryBody)),
        !ctx.isSelectorMode &&
          h('button', {
            class: 'settings-floating-btn',
            onClick: () => setShowSettings(true),
            title: '设置',
          }, h(Icon, { name: 'settings', size: 16 })),
        !ctx.isSelectorMode && ctx.viewMode !== 'history' &&
          h('button', {
            class: 'history-floating-btn',
            onClick: () => ctx.navigateToHistory(),
            title: '查看历史图片',
          }, [
            h(Icon, { name: 'image', size: 14 }),
            ' 查看历史图片',
          ]),
      ]),

      // Dialog 层
      !ctx.isSelectorMode && h(DialogLayer),
      !ctx.isSelectorMode && h(SettingsDialog, {
        isOpen: showSettings,
        onClose: () => {
          setShowSettings(false);
          ctx.loadImageFields();
        },
      }),
    ],
  );
}

function GalleryBody() {
  const ctx = useGallery();

  if (ctx.loading) {
    return h('div', { class: 'gallery-container' }, [
      h(GalleryFilterBar),
      h('div', { class: 'gallery-loading' }, [
        h('div', { class: 'gallery-loading-spinner' }),
        h('div', {}, '正在加载图库...'),
      ]),
    ]);
  }

  if (ctx.error) {
    return h('div', { class: 'gallery-container' }, [
      h(GalleryFilterBar),
      h('div', { class: 'gallery-error' }, [
        h('div', { class: 'gallery-error-icon' }, h(Icon, { name: 'alert-triangle', size: 32 })),
        h('div', {}, '加载图库失败'),
        h('div', { class: 'gallery-error-message' }, ctx.error),
      ]),
    ]);
  }

  return h('div', { class: 'gallery-container' }, [
    h(GalleryFilterBar),
    !ctx.isSelectorMode && ctx.selectionMode && h(BatchActionBar),

    // 画廊视图
    h(
      'div',
      {
        key: 'gallery-view',
        class: 'view-stack-page',
        style: { display: ctx.viewMode === 'gallery' ? '' : 'none' },
      },
      [h(GalleryGrid)],
    ),

    // Prompt详情
    !ctx.isSelectorMode && ctx.currentPrompt &&
      h(
        'div',
        {
          key: `prompt-${ctx.currentPrompt.name}`,
          class: 'view-stack-page',
          style: { display: ctx.viewMode === 'prompt' ? '' : 'none', overflow: 'hidden', padding: 0 },
        },
        [h(PromptDetailView)],
      ),

    // 历史视图
    !ctx.isSelectorMode && ctx.viewMode === 'history' &&
      h(
        'div',
        {
          key: 'history-view',
          class: 'view-stack-page',
          style: { display: ctx.viewMode === 'history' ? '' : 'none', overflow: 'hidden', padding: 0 },
        },
        [h(HistoryView)],
      ),
  ]);
}

function DialogLayer() {
  const ctx = useGallery();
  // 仅在批量确认对话框打开时计算选中详情，避免每次渲染都遍历选择集
  const batchDetails = ctx.showBatchConfirm
    ? ctx.getSelectedDetails()
    : { categories: [], prompts: [], images: [] };

  return [
    h(Lightbox, {
      isOpen: ctx.lightbox.open,
      prompt: ctx.lightbox.prompt,
      imageIndex: ctx.lightbox.imageIndex,
      onClose: ctx.closeLightbox,
      onNavigate: ctx.handleLightboxNavigate,
      imageFields: ctx.imageFields,
    }),

    h(AddPromptDialog, {
      isOpen: ctx.showAddPromptDialog,
      mode: ctx.editModePrompt ? 'edit' : 'add',
      editModePrompt: ctx.editModePrompt,
      currentCategoryId: ctx.currentCategory,
      onClose: () => {
        ctx.setShowAddPromptDialog(false);
        ctx.setEditModePrompt(null);
        ctx.loadData();
      },
      onSave: () => {
        ctx.setShowAddPromptDialog(false);
        ctx.setEditModePrompt(null);
        ctx.loadData();
      },
    }),

    h(DeleteConfirmDialog, {
      isOpen: ctx.showDeleteConfirm,
      type: 'prompt',
      target: ctx.promptToDelete,
      onConfirm: ctx.confirmDeletePrompt,
      onCancel: () => {
        ctx.setShowDeleteConfirm(false);
        ctx.setPromptToDelete(null);
      },
    }),

    h(DeleteConfirmDialog, {
      isOpen: ctx.showCategoryDeleteConfirm,
      type: 'category',
      target: ctx.categoryToDelete,
      onConfirm: async () => {
        await ctx.confirmDeleteCategory();
        ctx.loadData();
      },
      onCancel: () => {
        ctx.setShowCategoryDeleteConfirm(false);
        ctx.setCategoryToDelete(null);
      },
    }),

    h(CategoryDialog, {
      isOpen: ctx.showCategoryDialog,
      mode: ctx.categoryDialogMode,
      category: ctx.editingCategory,
      categories: ctx.categories,
      currentCategoryId: ctx.currentCategory,
      onClose: () => ctx.setShowCategoryDialog(false),
      onSave: async (data) => {
        await ctx.handleCategoryDialogSave(data);
        ctx.loadData();
      },
    }),

    h(MoveDialog, {
      isOpen: ctx.showMoveDialog,
      itemType: ctx.moveItemType,
      item: ctx.moveItem,
      categories: ctx.categories,
      onClose: ctx.closeMoveDialog,
      onMove: ctx.handleMove,
    }),

    h(CopyDialog, {
      isOpen: ctx.showCopyDialog,
      itemType: ctx.copyItemType,
      item: ctx.copyItem,
      categories: ctx.categories,
      onClose: ctx.closeCopyDialog,
      onCopy: ctx.handleCopy,
    }),

    h(BatchConfirmDialog, {
      isOpen: ctx.showBatchConfirm,
      onClose: () => ctx.setShowBatchConfirm(false),
      operation: ctx.batchOperation,
      items: batchDetails,
      onConfirm: ctx.handleBatchConfirm,
    }),

    h(ImportImagesDialog, {
      isOpen: ctx.showImportDialog,
      viewMode: ctx.viewMode,
      currentCategory: ctx.currentCategory,
      currentPrompt: ctx.currentPrompt,
      categories: ctx.categories,
      onClose: () => ctx.setShowImportDialog(false),
      onSuccess: async () => {
        await ctx.loadData();
        ctx.setShowImportDialog(false);
      },
    }),

    h(ImportZipDialog, {
      isOpen: ctx.showImportZipDialog,
      currentCategory: ctx.currentCategory,
      onClose: () => ctx.setShowImportZipDialog(false),
      onSuccess: async () => {
        await ctx.refreshCategories();
        await ctx.loadData();
        ctx.setShowImportZipDialog(false);
      },
    }),

    h(ImportOutputDialog, {
      isOpen: ctx.showImportOutputDialog,
      onClose: () => ctx.setShowImportOutputDialog(false),
      onSuccess: async () => {
        await ctx.loadData();
        ctx.setShowImportOutputDialog(false);
      },
    }),

    h(ExportDialog, {
      isOpen: ctx.showExportDialog,
      title:
        ctx.exportPayload?.type === 'category'
          ? `导出分类: ${ctx.exportPayload.category.name}`
          : ctx.exportPayload?.type === 'batch'
            ? '批量导出Prompt'
            : ctx.exportPayload?.type === 'prompt'
              ? `导出Prompt: ${ctx.exportPayload.prompt.name || ctx.exportPayload.prompt.value}`
              : '导出',
      onClose: () => {
        ctx.setShowExportDialog(false);
        ctx.setExportPayload(null);
      },
      onConfirm: ctx.handleExportConfirm,
    }),

    h(CustomFilterEditDialog, {
      isOpen: ctx.showCustomFilterEditDialog,
      editItem: ctx.editingCustomFilter,
      onClose: () => {
        ctx.setShowCustomFilterEditDialog(false);
        ctx.setEditingCustomFilter(null);
      },
      onSave: ctx.handleCustomFilterSaved,
    }),
  ];
}
