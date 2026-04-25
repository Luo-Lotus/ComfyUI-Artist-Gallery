/**
 * 画廊模态框组件
 * 薄壳层：Provider 包裹 + 视图路由 + Dialog 渲染
 */
import { h } from '../lib/preact.mjs';
import { GalleryProvider, useGallery } from './GalleryContext.js';
import { GalleryGrid } from './GalleryGrid.js';
import { Lightbox } from './Lightbox.js';
import { AddArtistDialog } from './AddArtistDialog.js';
import { DeleteConfirmDialog } from './DeleteConfirmDialog.js';
import { CategoryDialog } from './CategoryDialog.js';
import { MoveDialog } from './MoveDialog.js';
import { CopyDialog } from './CopyDialog.js';
import { ImportImagesDialog } from './ImportImagesDialog.js';
import { ExportDialog } from './ExportDialog.js';
import { CombinationDialog } from './CombinationDialog.js';
import { BatchActionBar } from './BatchActionBar.js';
import { BatchConfirmDialog } from './BatchConfirmDialog.js';
import { GalleryHeader } from './GalleryHeader.js';
import { GalleryFilterBar } from './GalleryFilterBar.js';
import { ArtistDetailView } from './ArtistDetailView.js';
import { CombinationDetailView } from './CombinationDetailView.js';

import { Icon } from '../lib/icons.mjs';

export function GalleryModal({ isOpen, onClose, initialNavigation }) {
    if (!isOpen) return null;

    return h(GalleryProvider, { onClose, initialNavigation },
        h(GalleryModalContent),
    );
}

function GalleryModalContent() {
    const ctx = useGallery();

    return h(
        'div',
        {
            class: 'gallery-modal-overlay open',
            onClick: (e) => {
                if (e.target.classList.contains('gallery-modal-overlay'))
                    ctx.onClose();
            },
        },
        [
            h('div', { class: 'gallery-modal-content' }, [
                h(GalleryHeader),
                h('div', { class: 'gallery-modal-body' },
                    h(GalleryBody),
                ),
            ]),

            // Dialog 层
            h(DialogLayer),
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
        ctx.selectionMode && h(BatchActionBar),

        // 画廊视图
        h('div', {
            key: 'gallery-view',
            class: 'view-stack-page',
            style: { display: ctx.viewMode === 'gallery' ? '' : 'none' },
        }, [
            h(GalleryGrid),
        ]),

        // 画师详情
        ctx.currentArtist && h('div', {
            key: `artist-${ctx.currentArtist.name}`,
            class: 'view-stack-page',
            style: { display: ctx.viewMode === 'artist' ? '' : 'none' },
        }, [
            h(ArtistDetailView),
        ]),

        // 组合详情
        ctx.viewModeCombination && h('div', {
            key: `combination-${ctx.viewModeCombination.id}`,
            class: 'view-stack-page',
            style: { display: ctx.viewMode === 'combination' ? '' : 'none' },
        }, [
            h(CombinationDetailView),
        ]),
    ]);
}

function DialogLayer() {
    const ctx = useGallery();
    const batchDetails = ctx.getSelectedDetails();

    return [
        h(Lightbox, {
            isOpen: ctx.lightbox.open,
            artist: ctx.lightbox.artist,
            imageIndex: ctx.lightbox.imageIndex,
            onClose: ctx.closeLightbox,
            onNavigate: ctx.handleLightboxNavigate,
        }),

        h(AddArtistDialog, {
            isOpen: ctx.showAddArtistDialog,
            mode: ctx.editModeArtist ? 'edit' : 'add',
            editModeArtist: ctx.editModeArtist,
            currentCategoryId: ctx.currentCategory,
            onClose: () => {
                ctx.setShowAddArtistDialog(false);
                ctx.setEditModeArtist(null);
                ctx.loadData();
            },
            onSave: () => {
                ctx.setShowAddArtistDialog(false);
                ctx.setEditModeArtist(null);
                ctx.loadData();
            },
        }),

        h(DeleteConfirmDialog, {
            isOpen: ctx.showDeleteConfirm,
            artist: ctx.artistToDelete,
            onConfirm: () => {
                ctx.setShowDeleteConfirm(false);
                ctx.setArtistToDelete(null);
                ctx.loadData();
            },
            onCancel: () => {
                ctx.setShowDeleteConfirm(false);
                ctx.setArtistToDelete(null);
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
            artists: ctx.allArtists,
            onClose: ctx.closeMoveDialog,
            onMove: ctx.handleMove,
        }),

        h(CopyDialog, {
            isOpen: ctx.showCopyDialog,
            itemType: ctx.copyItemType,
            item: ctx.copyItem,
            categories: ctx.categories,
            artists: ctx.allArtists,
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
            currentArtist: ctx.currentArtist,
            categories: ctx.categories,
            onClose: () => ctx.setShowImportDialog(false),
            onSuccess: async () => {
                await ctx.loadData();
                ctx.setShowImportDialog(false);
            },
        }),

        h(ExportDialog, {
            isOpen: ctx.showExportDialog,
            title: ctx.exportPayload?.type === 'category'
                ? `导出分类: ${ctx.exportPayload.category.name}`
                : ctx.exportPayload?.type === 'batch'
                    ? '批量导出画师'
                    : ctx.exportPayload?.type === 'artist'
                        ? `导出画师: ${ctx.exportPayload.artist.displayName || ctx.exportPayload.artist.name}`
                        : '导出',
            onClose: () => {
                ctx.setShowExportDialog(false);
                ctx.setExportPayload(null);
            },
            onConfirm: ctx.handleExportConfirm,
        }),

        h(CombinationDialog, {
            isOpen: ctx.showCombinationDialog,
            mode: ctx.combinationDialogMode,
            combination: ctx.editingCombination,
            currentCategoryId: ctx.currentCategory,
            artists: ctx.allArtists,
            onClose: () => {
                ctx.setShowCombinationDialog(false);
                ctx.setEditingCombination(null);
            },
            onSave: async () => {
                ctx.setShowCombinationDialog(false);
                ctx.setEditingCombination(null);
                await ctx.loadData();
            },
        }),
    ];
}
