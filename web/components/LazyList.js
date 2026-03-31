/**
 * LazyList - 通用懒加载列表组件
 * 支持 CSS Grid 和 flex-wrap 布局，每行元素数量不固定
 * 自适应阈值：items <= threshold 时直接渲染全部
 */
import { h } from '../lib/preact.mjs';
import { useState, useEffect, useRef, useCallback } from '../lib/hooks.mjs';

export function LazyList({
    items,
    renderItem,
    layout = 'grid',
    className = '',
    scrollContainer = null,   // null=viewport, 'self'=组件自身
    threshold = 200,          // 超过此数量才启用懒加载
    initialCount = 50,
    batchSize = 30,
    rootMargin = '200px',
    emptyMessage = null,
}) {
    const [visibleCount, setVisibleCount] = useState(() =>
        items.length > threshold ? initialCount : items.length
    );
    const wrapperRef = useRef(null);
    const sentinelRef = useRef(null);
    const observerRef = useRef(null);

    // items 变化时重置
    useEffect(() => {
        setVisibleCount(items.length > threshold ? initialCount : items.length);
    }, [items, threshold, initialCount]);

    // IntersectionObserver
    useEffect(() => {
        // 不需要懒加载时跳过
        if (items.length <= threshold) return;
        if (visibleCount >= items.length) {
            // 全部已加载，清理 observer
            if (observerRef.current) {
                observerRef.current.disconnect();
                observerRef.current = null;
            }
            return;
        }

        const sentinelEl = sentinelRef.current;
        if (!sentinelEl) return;

        // 确定 observer root
        let root = null;
        if (scrollContainer === 'self' && wrapperRef.current) {
            root = wrapperRef.current;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setVisibleCount((prev) =>
                        Math.min(prev + batchSize, items.length)
                    );
                }
            },
            { root, rootMargin, threshold: 0 }
        );

        observer.observe(sentinelEl);
        observerRef.current = observer;

        return () => {
            observer.disconnect();
            observerRef.current = null;
        };
    }, [items.length, visibleCount, threshold, batchSize, rootMargin, scrollContainer]);

    // 空状态
    if (!items || items.length === 0) {
        return emptyMessage || null;
    }

    // 不需要懒加载：直接渲染全部
    if (items.length <= threshold) {
        return h('div', { class: className, ref: wrapperRef },
            items.map((item, i) => renderItem(item, i))
        );
    }

    // 懒加载模式
    const visibleItems = items.slice(0, visibleCount);
    const hasMore = visibleCount < items.length;

    return h('div', { class: className, ref: wrapperRef }, [
        ...visibleItems.map((item, i) => renderItem(item, i)),
        hasMore && h('div', {
            ref: sentinelRef,
            class: `lazy-list-sentinel--${layout}`,
        }),
    ]);
}
