/**
 * Prompt详情模态框
 * 显示Prompt的所有图片（平铺）
 */
import { h } from '../lib/preact.mjs';
import { useState } from '../lib/hooks.mjs';
import { buildImageUrl } from '../utils.js';
import { Lightbox } from './Lightbox.js';
import { useContextMenu } from './ContextMenu.js';
import { Icon } from '../lib/icons.mjs';
import { showToast } from './Toast.js';
import { deleteImage } from '../services/promptApi.js';

export function PromptDetailModal({ isOpen, prompt, onClose, onImageDelete, categories }) {
  const [lightbox, setLightbox] = useState({
    open: false,
    prompt: null,
    imageIndex: 0,
  });
  const { showContextMenu } = useContextMenu();

  const handleImageClick = (imageIndex) => {
    setLightbox({
      open: true,
      prompt: prompt,
      imageIndex,
    });
  };

  const handleDeleteImage = async (imagePath, index) => {
    try {
      await deleteImage(imagePath);
      showToast('图片已删除', 'success');
      if (onImageDelete) {
        onImageDelete();
      }
    } catch (error) {
      showToast('删除失败: ' + error.message, 'error');
    }
  };

  const handleImageContextMenu = (e, image) => {
    const menuItems = [
      {
        icon: 'search',
        label: '查看大图',
        action: () => handleImageClick(prompt.images.indexOf(image)),
      },
      {
        icon: 'trash-2',
        label: '删除图片',
        action: () => handleDeleteImage(image.path, prompt.images.indexOf(image)),
      },
    ];

    showContextMenu(e, menuItems);
  };

  const handleLightboxNavigate = (direction) => {
    let newIndex = lightbox.imageIndex + direction;
    if (newIndex < 0) newIndex = prompt.images.length - 1;
    if (newIndex >= prompt.images.length) newIndex = 0;
    setLightbox((prev) => ({ ...prev, imageIndex: newIndex }));
  };

  if (!isOpen || !prompt) return null;

  const hasImages = prompt.images && prompt.images.length > 0;

  const handleOverlayClick = (e) => {
    // 如果 lightbox 没有打开，点击遮罩才关闭
    if (!lightbox.open && e.target.classList.contains('prompt-detail-overlay')) {
      onClose();
    }
  };

  return h('div', { class: 'prompt-detail-overlay', onClick: handleOverlayClick }, [
    !lightbox.open &&
      h(
        'div',
        {
          class: 'prompt-detail-content',
          onClick: (e) => e.stopPropagation(),
        },
        [
          // 头部
          h('div', { class: 'prompt-detail-header' }, [
            h('h2', {}, prompt.name || prompt.value),
            h(
              'button',
              {
                class: 'close-btn',
                onClick: onClose,
                title: '关闭',
              },
              h(Icon, { name: 'x', size: 16 }),
            ),
          ]),

          // 图片网格
          hasImages
            ? h(
                'div',
                { class: 'prompt-detail-grid' },
                prompt.images.map((img, index) =>
                  h(
                    'div',
                    {
                      key: img.path,
                      class: 'prompt-detail-image-item',
                      onClick: () => handleImageClick(index),
                      onContextMenu: (e) => handleImageContextMenu(e, img),
                    },
                    [
                      h('img', {
                        src: buildImageUrl(img.path, img.type),
                        alt: `${prompt.name || prompt.value} - ${index + 1}`,
                        loading: 'lazy',
                      }),
                    ],
                  ),
                ),
              )
            : h('div', { class: 'prompt-detail-empty' }, '暂无图片'),
        ],
      ),

    // Lightbox
    lightbox.open &&
      h(Lightbox, {
        isOpen: lightbox.open,
        prompt: lightbox.prompt || { images: [] },
        imageIndex: lightbox.imageIndex,
        onClose: () =>
          setLightbox({
            open: false,
            prompt: null,
            imageIndex: 0,
          }),
        onNavigate: handleLightboxNavigate,
      }),
  ]);
}
