/**
 * Toast 通知组件
 * 替代原生 alert()，提供更好的用户体验
 */

import { h } from '../lib/preact.mjs';
import { useState, useEffect } from '../lib/hooks.mjs';
import { Icon } from '../lib/icons.mjs';

let toastContainer = null;

/**
 * 显示 Toast 通知
 * @param {string} message - 消息内容
 * @param {string} type - 类型: 'success' | 'error' | 'info' | 'warning'
 * @param {number} duration - 显示时长（毫秒）
 */
export function showToast(message, type = 'info', duration = 3000) {
    // 确保容器存在
    if (!toastContainer) {
        const container = document.createElement('div');
        document.body.appendChild(container);
        toastContainer = container;
    }

    // 创建 Toast 对象
    const toast = {
        id: Date.now() + Math.random(),
        message,
        type,
    };

    // 触发更新（通过自定义事件）
    const event = new CustomEvent('toast-show', { detail: toast });
    document.dispatchEvent(event);

    // 自动移除
    if (duration > 0) {
        setTimeout(() => {
            const hideEvent = new CustomEvent('toast-hide', { detail: toast.id });
            document.dispatchEvent(hideEvent);
        }, duration);
    }

    return toast.id;
}

/**
 * Toast 容器组件
 */
export function ToastContainer() {
    const [toasts, setToasts] = useState([]);

    useEffect(() => {
        const handleShow = (e) => {
            setToasts((prev) => [...prev, e.detail]);
        };

        const handleHide = (id) => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        };

        document.addEventListener('toast-show', handleShow);
        document.addEventListener('toast-hide', (e) => handleHide(e.detail));

        return () => {
            document.removeEventListener('toast-show', handleShow);
            document.removeEventListener('toast-hide', handleHide);
        };
    }, []);

    const handleRemove = (id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    if (toasts.length === 0) return null;

    return h(
        'div',
        { class: 'toast-container' },
        toasts.map((toast) =>
            h(
                'div',
                {
                    key: toast.id,
                    class: `toast toast-${toast.type}`,
                    onClick: () => handleRemove(toast.id),
                },
                h('span', { class: 'toast-icon' }, getIcon(toast.type)),
                h('span', { class: 'toast-message' }, toast.message),
                h('button', {
                    class: 'toast-close',
                    onClick: (e) => {
                        e.stopPropagation();
                        handleRemove(toast.id);
                    },
                    'aria-label': '关闭',
                }, h(Icon, { name: 'x', size: 12 })),
            ),
        ),
    );
}

function getIcon(type) {
    const map = {
        success: 'check-circle',
        error: 'x-circle',
        info: 'info-circle',
        warning: 'alert-triangle',
    };
    return h(Icon, { name: map[type] || 'info-circle', size: 18 });
}
