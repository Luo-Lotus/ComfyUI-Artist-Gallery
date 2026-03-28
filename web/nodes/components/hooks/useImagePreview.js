/**
 * 图片预览 Hook
 * 直接操作 DOM，将预览窗口渲染到 body 上
 */
import { buildImageUrl } from '../../../utils.js';

let previewElement = null;

export function useImagePreview() {
    /**
     * 显示图片预览
     */
    const showPreview = (artist, event) => {
        if (artist.imageCount === 0) return;

        // 使用画师名称获取图片（因为图片映射使用名称）
        fetch(`/artist_gallery/artist/${artist.name}/images`)
            .then((res) => res.json())
            .then((data) => {
                if (data.images && data.images.length > 0) {
                    const imagePath = data.images[data.images.length - 1].path;
                    const imageUrl = buildImageUrl(imagePath);

                    // 移除旧的预览窗口
                    removePreview();

                    // 创建预览窗口
                    previewElement = document.createElement('div');
                    previewElement.className = 'artist-selector-hover-preview';
                    previewElement.id = 'artist-hover-preview';

                    // 创建图片元素
                    const img = document.createElement('img');
                    img.src = imageUrl;
                    img.alt = artist.name;
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
                }
            });
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
