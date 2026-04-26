/**
 * Body 级 Preact 渲染 Hook
 * 在 document.body 上创建容器，用 Preact render 挂载组件
 * 不受父节点 CSS transform 影响
 *
 * 用法:
 *   const { renderToBody, clear } = useBodyRender();
 *   renderToBody(h(MyComponent, { ... }));
 *   clear();
 */
import { render } from '../../../lib/preact.mjs';
import { useState, useEffect, useCallback } from '../../../lib/hooks.mjs';

export function useBodyRender() {
    const [container] = useState(() => {
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:99999;';
        document.body.appendChild(el);
        return el;
    });

    useEffect(() => () => {
        render(null, container);
        if (container.parentNode) container.parentNode.removeChild(container);
    }, []);

    const renderToBody = useCallback((vnode) => {
        render(vnode, container);
    }, []);

    const clear = useCallback(() => {
        render(null, container);
    }, []);

    return { renderToBody, clear };
}
