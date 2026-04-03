/**
 * 通用对话框组件
 * 可复用的模态框组件，支持自定义内容
 */
import { h } from '../lib/preact.mjs';

export function Dialog({
    isOpen,
    onClose,
    title,
    titleIcon,
    children,
    footer,
    maxWidth = '500px',
    maxHeight = '500px',
    showCloseButton = true,    closeOnOverlayClick = true,
    className = '',
}) {
    // ============ 渲染函数 ============

    /**
     * 渲染对话框头部
     */
    const renderHeader = () => {
        return h('div', { class: 'gallery-modal-header' }, [
            h('div', { class: 'gallery-modal-title' }, [
                titleIcon && h('span', {}, titleIcon),
                h('span', {}, title),
            ]),
            showCloseButton &&
                h(
                    'button',
                    {
                        class: 'gallery-modal-btn primary',
                        onClick: onClose,
                    },
                    '✕',
                ),
        ]);
    };

    /**
     * 渲染对话框主体
     */
    const renderBody = () => {
        return h('div', { class: 'gallery-modal-body' }, children);
    };

    /**
     * 渲染底部操作区
     */
    const renderFooter = () => {
        if (!footer) return null;
        return h('div', { class: 'gallery-dialog-actions' }, footer);
    };

    // ============ 主渲染 ============

    if (!isOpen) return null;

    return h(
        'div',
        {
            class: `gallery-modal-overlay open ${className}`,
            style: { zIndex: 20000 },
            onClick: (e) => {
                if (closeOnOverlayClick && e.target.classList.contains('gallery-modal-overlay')) {
                    onClose();
                }
            },
        },
        h(
            'div',
            {
                class: 'gallery-modal-content gallery-dialog-content',
                style: { maxWidth, maxHeight },
                onClick: (e) => e.stopPropagation(),
            },
            [renderHeader(), renderBody(), renderFooter()],
        ),
    );
}

/**
 * 对话框操作按钮组件
 */
export function DialogButton({ children, onClick, variant = 'default', className = '' }) {
    const variantClass = variant === 'primary' ? 'primary' : variant === 'danger' ? 'danger' : '';

    return h(
        'button',
        {
            class: `gallery-modal-btn ${variantClass} ${className}`.trim(),
            onClick,
        },
        children,
    );
}

/**
 * 对话框表单组组件
 */
export function DialogFormGroup({ children, style }) {
    return h('div', { class: 'gallery-form-group', style }, children);
}

/**
 * 对话框表单项组件
 */
export function DialogFormItem({ children, label }) {
    return h('div', { class: 'gallery-form-item' }, [
        label && h('label', { class: 'gallery-form-label' }, label),
        children,
    ]);
}
