/**
 * 分区预览 Hook
 * 点击预览图标弹出浮窗，展示分区内所有 Prompt 的封面图
 * 弹窗立即显示 loading 状态，数据加载完成后替换为内容
 * 点击外部区域或关闭按钮可关闭浮窗
 */
import { h } from '../../../lib/preact.mjs';
import { useRef, useEffect, useCallback } from '../../../lib/hooks.mjs';
import { Icon } from '../../../lib/icons.mjs';
import { buildImageUrl, fetchCovers } from '../../../utils.js';
import { useBodyRender } from './useBodyRender.js';

function PartitionPreviewPopup({ items, style, loading, onClose }) {
  return h(
    'div',
    { class: 'partition-preview-popup', style, onClick: (e) => e.stopPropagation() },
    [
      h('div', { class: 'partition-preview-header' }, [
        h('span', { class: 'partition-preview-title' }, '分区预览'),
        h(
          'button',
          { class: 'partition-preview-close', onClick: onClose },
          h(Icon, { name: 'x', size: 14 }),
        ),
      ]),
      loading
        ? h('div', { class: 'partition-preview-loading' }, [
            h(Icon, { name: 'loader', size: 20, class: 'spin' }),
            h('span', null, '加载中...'),
          ])
        : items && items.length > 0
          ? h(
              'div',
              { class: 'partition-preview-grid' },
              items.map((item, i) =>
                h('div', { key: i, class: 'partition-preview-item' }, [
                  item.coverImagePath
                    ? h('img', {
                        class: 'partition-preview-img',
                        src: buildImageUrl(item.coverImagePath),
                        alt: item.name,
                        loading: 'lazy',
                      })
                    : h('div', { class: 'partition-preview-placeholder' }, '无封面'),
                  h('div', { class: 'partition-preview-overlay' }, [
                    h('span', { class: 'partition-preview-name', title: item.name }, item.name),
                  ]),
                ]),
              ),
            )
          : h('div', { class: 'partition-preview-empty' }, '无预览内容'),
    ],
  );
}

export function usePartitionPreview() {
  const { renderToBody, clear } = useBodyRender();
  const isOpenRef = useRef(false);
  const versionRef = useRef(0);

  // 清理
  useEffect(
    () => () => {
      clear();
    },
    [],
  );

  // 渲染浮窗（可重复调用以更新内容）
  const renderPreview = useCallback(
    (rect, loading, items) => {
      const popupWidth = 640;
      let left = rect.left;
      if (left + popupWidth > window.innerWidth) {
        left = window.innerWidth - popupWidth - 8;
      }
      if (left < 8) left = 8;

      renderToBody(
        h('div', {
          class: 'partition-preview-backdrop',
          style: {
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            pointerEvents: 'auto',
            zIndex: 99998,
          },
          onClick: () => {
            isOpenRef.current = false;
            clear();
          },
        }, [
          h(PartitionPreviewPopup, {
            items: items || null,
            loading,
            style: {
              position: 'fixed',
              top: `${rect.bottom + 4}px`,
              left: `${left}px`,
              pointerEvents: 'auto',
              zIndex: 99999,
            },
            onClose: () => {
              isOpenRef.current = false;
              clear();
            },
          }),
        ]),
      );
    },
    [renderToBody, clear],
  );

  // 点击切换预览浮窗
  const onPreviewToggle = useCallback(
    async (event, partition, prompts, partitionCategories, coversCache) => {
      // 如果已打开则关闭
      if (isOpenRef.current) {
        isOpenRef.current = false;
        clear();
        return;
      }

      // 同步捕获 rect（event.currentTarget 在 async 后会被清空）
      const rect = event.currentTarget.getBoundingClientRect();
      isOpenRef.current = true;
      const currentVersion = ++versionRef.current;

      // 立即显示 loading 状态
      renderPreview(rect, true);

      // 异步加载数据
      const items = await buildPreviewItemsWithFetch(
        partition, prompts, partitionCategories, coversCache,
      );

      // 检查是否已关闭或被新的打开覆盖
      if (!isOpenRef.current || versionRef.current !== currentVersion) return;

      // 更新为实际内容
      renderPreview(rect, false, items);
    },
    [renderPreview, clear],
  );

  return { onPreviewToggle };
}

// 构建预览项（含按需获取封面和分类展开）
async function buildPreviewItemsWithFetch(
  partition, prompts, partitionCategories, coversCache,
) {
  const items = [];
  const coverKeysToFetch = [];

  // 直接 prompt
  for (const prompt of prompts) {
    if (prompt._orphaned) continue;
    const coverPath = prompt.coverImagePath;
    if (!coverPath) {
      coverKeysToFetch.push(`${prompt.categoryId || 'root'}:${prompt.value}`);
    }
    items.push({
      type: 'prompt',
      name: prompt.name || prompt.value,
      coverImagePath: coverPath || null,
      _key: `${prompt.categoryId || 'root'}:${prompt.value}`,
    });
  }

  // 分类展开：通过 /data?category= 获取该分类下的 prompt
  if (partitionCategories) {
    for (const cat of partitionCategories) {
      try {
        const response = await fetch(`/prompt_gallery/data?category=${cat.id}`);
        const data = await response.json();
        for (const prompt of (data.prompts || [])) {
          const coverPath = prompt.coverImagePath;
          if (!coverPath) {
            coverKeysToFetch.push(`${cat.id}:${prompt.value}`);
          }
          items.push({
            type: 'prompt',
            name: `${cat.name} / ${prompt.name || prompt.value}`,
            coverImagePath: coverPath || null,
            _key: `${cat.id}:${prompt.value}`,
          });
        }
      } catch (err) {
        console.error('[PartitionPreview] Failed to load category prompts:', err);
      }
    }
  }

  // 批量获取缺失的封面
  if (coverKeysToFetch.length > 0) {
    try {
      const result = await fetchCovers(coverKeysToFetch);
      const covers = result.covers || {};
      for (const item of items) {
        if (!item.coverImagePath && item._key) {
          item.coverImagePath = covers[item._key] || null;
        }
      }
    } catch (err) {
      console.error('[PartitionPreview] Failed to fetch covers:', err);
    }
  }

  // 清理临时 _key 字段
  return items.map(({ _key, ...rest }) => rest);
}
