/**
 * 图片预览 Hook
 * 用 Preact 组件渲染到 body，不受节点 transform 影响
 * 支持按需获取封面
 */
import { h } from '../../../lib/preact.mjs';
import { buildImageUrl } from '../../../utils.js';
import { useBodyRender } from './useBodyRender.js';

function ImagePreviewPopup({ imageUrl, alt, x, y }) {
  return h(
    'div',
    {
      class: 'prompt-selector-hover-preview',
      style: `position:fixed;left:${x}px;top:${y}px;pointer-events:none;`,
    },
    h('img', { src: imageUrl, alt }),
  );
}

export function useImagePreview(coversCache, fetchCoversByIds) {
  const { renderToBody, clear } = useBodyRender();

  const showPreview = async (prompt, event) => {
    let coverPath = prompt.coverImagePath;

    // 如果没有封面路径，尝试从缓存获取或按需加载
    if (!coverPath && coversCache && fetchCoversByIds) {
      const key = `${prompt.categoryId || 'root'}:${prompt.value}`;
      coverPath = coversCache[key];

      if (!coverPath) {
        // 按需获取
        await fetchCoversByIds([key]);
        coverPath = coversCache[key];
      }
    }

    if (!coverPath) return;

    renderToBody(
      h(ImagePreviewPopup, {
        imageUrl: buildImageUrl(coverPath),
        alt: prompt.name || prompt.value,
        x: event.clientX + 15,
        y: event.clientY + 15,
      }),
    );
  };

  const removePreview = () => {
    clear();
  };

  return { showPreview, removePreview };
}
