/**
 * 批量操作工具栏组件
 * 在多选模式下显示，提供全选、批量操作等功能
 */

import { h } from '../lib/preact.mjs';
import { Icon } from '../lib/icons.mjs';
import { useGallery } from './GalleryContext.js';

export function BatchActionBar() {
    const ctx = useGallery();
    const selectedCount = ctx.selectedItems.size;
    const selectionType = ctx.getSelectionType();

    const getSelectionTypeLabel = () => {
        switch (selectionType) {
            case 'category': return '分类';
            case 'artist': return '画师';
            case 'image': return '图片';
            case 'mixed': return '混合';
            default: return '项目';
        }
    };

    return h('div', { class: 'batch-action-bar' }, [
        // 左侧：已选信息
        h('div', { class: 'batch-info' }, [
            h('span', { class: 'batch-icon' }, h(Icon, { name: 'clipboard-list', size: 16 })),
            h('span', { class: 'batch-title' }, '批量操作'),
            h('span', { class: 'batch-count' }, `(${selectedCount}个${getSelectionTypeLabel()})`),
        ]),

        // 中间：操作按钮
        h('div', { class: 'batch-actions' }, [
            h('button', {
                class: 'batch-action-btn select-btn',
                onClick: ctx.handleSelectAllInView,
                title: '全选当前视图所有项目',
            }, '全选'),
            h('button', {
                class: 'batch-action-btn deselect-btn',
                onClick: ctx.handleDeselectAll,
                title: '取消选择',
            }, '取消选择'),
        ]),

        // 右侧：批量操作按钮
        h('div', { class: 'batch-operations' }, [
            h('button', {
                class: 'batch-op-btn export-btn',
                onClick: ctx.handleBatchExport,
                title: '导出选中画师',
            }, [h(Icon, { name: 'upload', size: 14 }), ' 导出']),
            h('button', {
                class: 'batch-op-btn delete-btn',
                onClick: ctx.handleBatchDelete,
                title: '删除选中项目',
            }, [h(Icon, { name: 'trash-2', size: 14 }), ' 删除']),
            h('button', {
                class: 'batch-op-btn move-btn',
                onClick: ctx.handleBatchMoveAction,
                title: '移动选中项目',
            }, [h(Icon, { name: 'move', size: 14 }), ' 移动']),
            h('button', {
                class: 'batch-op-btn copy-btn',
                onClick: ctx.handleBatchCopyAction,
                title: '复制选中项目',
            }, [h(Icon, { name: 'copy', size: 14 }), ' 复制']),
            h('button', {
                class: 'batch-op-btn exit-btn',
                onClick: ctx.handleToggleSelectionMode,
                title: '退出多选模式',
            }, [h(Icon, { name: 'x', size: 14 }), ' 退出']),
        ]),
    ]);
}
