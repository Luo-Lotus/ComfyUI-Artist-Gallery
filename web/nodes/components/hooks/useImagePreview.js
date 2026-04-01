/**
 * 图片预览 Hook
 * 直接操作 DOM，将预览窗口渲染到 body 上
 * 使用画师封面图（不再发请求获取全部图片）
 */
import { buildImageUrl } from '../../../utils.js';

let previewElement = null;

export function useImagePreview() {
    /**
     * 显示图片预览（使用封面图）
     */
    const showPreview = (artist, event) => {
        // 使用 coverImagePath 直接展示封面
        const coverPath = artist.coverImagePath;
        if (!coverPath) return;

        // 移除旧的预览窗口
        removePreview();

        const imageUrl = buildImageUrl(coverPath);

        // 创建预览窗口
        previewElement = document.createElement('div');
        previewElement.className = 'artist-selector-hover-preview';
        previewElement.id = 'artist-hover-preview';

        // 创建图片元素
        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = artist.displayName || artist.name;
        previewElement.appendChild(img);

        // 计算位置（使用鼠标位置）
        const x = event.clientX + 15;
        const y = event.clientY + 15;

        // 设置样式
        previewElement.style.position = 'fixed';
        previewElement.style.left = `${x}px`;
        previewElement.style.top = `${y}px`;
        previewElement.style.zIndex = '999999';

        // 添加到 body
        document.body.appendChild(previewElement);
    };

    /**
     * 移除图片预览
     */
    const removePreview = () => {
        if (previewElement) {
            previewElement.remove();
            previewElement = null;
        }
    };

    return {
        showPreview,
        removePreview,
    };
}
