/**
 * 批量操作确认对话框
 * 显示将要操作的详细信息和危险警告
 */

import { h } from '../lib/preact.mjs';
import { Dialog, DialogButton } from './Dialog.js';

export function BatchConfirmDialog({
    isOpen,
    onClose,
    operation, // 'delete' | 'move' | 'copy'
    items, // { categories, artists, images }
    onConfirm
}) {
    // 计算统计信息
    const getSummary = () => {
        const counts = {
            categories: items.categories?.length || 0,
            artists: items.artists?.length || 0,
            images: items.images || 0
        };

        const summary = [];

        if (counts.categories > 0) {
            summary.push(`${counts.categories} 个分类`);
        }

        if (counts.artists > 0) {
            summary.push(`${counts.artists} 个画师`);
        }

        if (counts.images > 0) {
            summary.push(`共 ${counts.images} 张图片`);
        }

        return summary.join('，');
    };

    const getOperationLabel = () => {
        switch(operation) {
            case 'delete': return '删除';
            case 'move': return '移动';
            case 'copy': return '复制';
            default: return '操作';
        }
    };

    const getOperationIcon = () => {
        switch(operation) {
            case 'delete': return '🗑️';
            case 'move': return '📦';
            case 'copy': return '📄';
            default: return '⚠️';
        }
    };

    const getConfirmationLevel = () => {
        const totalItems = (items.categories?.length || 0) + (items.artists?.length || 0);

        if (totalItems <= 5) return 'low';
        if (totalItems <= 20) return 'medium';
        return 'high';
    };

    const renderWarning = () => {
        const level = getConfirmationLevel();
        const totalItems = (items.categories?.length || 0) + (items.artists?.length || 0);

        if (level === 'low') {
            return null; // 少量项目，无需特殊警告
        }

        if (level === 'medium') {
            return h('div', { class: 'batch-confirm-warning-medium' }, [
                h('span', { class: 'warning-icon' }, '⚠️'),
                h('span', {}, `您即将${getOperationLabel()} ${totalItems} 个项目`)
            ]);
        }

        // high level - 需要二次确认
        return h('div', { class: 'batch-confirm-warning-high' }, [
            h('div', { class: 'warning-icon' }, '⚠️'),
            h('div', { class: 'warning-content' }, [
                h('p', {}, `危险操作：即将${getOperationLabel()} ${totalItems} 个项目`),
                items.images > 0 && h('p', {}, `包含 ${items.images} 张图片`),
                h('p', { class: 'critical-warning' }, '此操作不可撤销！')
            ])
        ]);
    };

    const renderFooter = () => {
        const level = getConfirmationLevel();

        return [
            h(DialogButton, { onClick: onClose }, '取消'),
            h(DialogButton, {
                variant: 'danger',
                onClick: onConfirm
            }, `确认${getOperationLabel()}`)
        ];
    };

    return h(Dialog, {
        isOpen,
        onClose,
        title: `${getOperationIcon()} 确认批量${getOperationLabel()}`,
        titleIcon: '',
        maxWidth: '500px',
        footer: renderFooter(),
        closeOnOverlayClick: false // 防止误操作
    }, [
        h('div', { class: 'batch-confirm-content' }, [
            h('div', { class: 'batch-confirm-summary' }, [
                h('p', {}, `将${getOperationLabel()}以下内容：`),
                h('ul', {},
                    items.categories?.length > 0 && h('li', {},
                        `• ${items.categories.length} 个分类`
                    ),
                    items.artists?.length > 0 && h('li', {},
                        `• ${items.artists.length} 个画师`
                    ),
                    items.images > 0 && h('li', {},
                        `• 共 ${items.images} 张图片`
                    )
                )
            ]),

            renderWarning()
        ])
    ]);
}
