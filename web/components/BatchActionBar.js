/**
 * 批量操作工具栏组件
 * 在多选模式下显示，提供全选、批量操作等功能
 */

import { h } from '../lib/preact.mjs';

export function BatchActionBar({
    selectedCount = 0,
    selectionType = 'empty', // 'category' | 'artist' | 'mixed' | 'empty'
    onMove,
    onCopy,
    onDelete,
    onSelectAll,
    onDeselectAll,
    onExit
}) {
    const handleSelectAll = () => {
        if (onSelectAll) onSelectAll();
    };

    const handleDeselectAll = () => {
        if (onDeselectAll) onDeselectAll();
    };

    const handleMove = () => {
        if (onMove) onMove();
    };

    const handleCopy = () => {
        if (onCopy) onCopy();
    };

    const handleDelete = () => {
        if (onDelete) onDelete();
    };

    const handleExit = () => {
        if (onExit) onExit();
    };

    const getSelectionTypeLabel = () => {
        switch(selectionType) {
            case 'category': return '分类';
            case 'artist': return '画师';
            case 'mixed': return '混合';
            default: return '项目';
        }
    };

    return h('div', { class: 'batch-action-bar' }, [
        // 左侧：已选信息
        h('div', { class: 'batch-info' }, [
            h('span', { class: 'batch-icon' }, '📋'),
            h('span', { class: 'batch-title' }, '批量操作'),
            h('span', { class: 'batch-count' }, `(${selectedCount}个${getSelectionTypeLabel()})`),
        ]),

        // 中间：操作按钮
        h('div', { class: 'batch-actions' }, [
            h('button', {
                class: 'batch-action-btn select-btn',
                onClick: handleSelectAll,
                title: '全选当前视图所有项目'
            }, '全选'),
            h('button', {
                class: 'batch-action-btn deselect-btn',
                onClick: handleDeselectAll,
                title: '取消选择'
            }, '取消选择'),
        ]),

        // 右侧：批量操作按钮
        h('div', { class: 'batch-operations' }, [
            h('button', {
                class: 'batch-op-btn delete-btn',
                onClick: handleDelete,
                title: '删除选中项目'
            }, '🗑️ 删除'),
            h('button', {
                class: 'batch-op-btn move-btn',
                onClick: handleMove,
                title: '移动选中项目'
            }, '📦 移动'),
            h('button', {
                class: 'batch-op-btn copy-btn',
                onClick: handleCopy,
                title: '复制选中项目'
            }, '📄 复制'),
            h('button', {
                class: 'batch-op-btn exit-btn',
                onClick: handleExit,
                title: '退出多选模式'
            }, '✕ 退出'),
        ]),
    ]);
}
