/**
 * 面包屑导航组件
 */
import { h } from '../lib/preact.mjs';

export function Breadcrumb({ path, onNavigate }) {
    if (!path || path.length === 0) return null;

    return h('div', { class: 'breadcrumb' },
        path.map((item, index) => {
            const isLast = index === path.length - 1;

            return h('div', { key: item.id, class: 'breadcrumb-item' }, [
                h('button', {
                    class: 'breadcrumb-link',
                    onClick: () => onNavigate(item, index),
                    disabled: isLast
                }, item.displayName),
                !isLast && h('span', { class: 'breadcrumb-separator' }, ' / ')
            ]);
        })
    );
}
