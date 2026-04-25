/**
 * 画师详情视图组件
 * 显示画师的图片网格，支持搜索过滤、右键菜单、多选
 */
import { h } from '../lib/preact.mjs';
import { useEffect } from '../lib/hooks.mjs';
import { useContextMenu } from './ContextMenu.js';
import { LazyList } from './LazyList.js';
import { buildImageUrl, setArtistCover } from '../utils.js';
import { showToast } from './Toast.js';
import { useGallery } from './GalleryContext.js';
import { applySizeStyles } from './SizePresets.js';

export function ArtistDetailView() {
    const ctx = useGallery();
    const { showContextMenu } = useContextMenu();

    useEffect(() => {
        const gridEl = document.querySelector('.artist-detail-grid');
        if (gridEl) applySizeStyles(gridEl, ctx.cardSize);
    }, [ctx.cardSize, ctx.filteredArtistImages]);

    const artist = ctx.currentArtist;
    const images = ctx.filteredArtistImages;

    const handleImageContextMenu = (e, image) => {
        e.preventDefault();
        e.stopPropagation();

        const menuItems = [
            {
                icon: 'search',
                label: '查看大图',
                action: () => ctx.openLightbox({ ...artist, images }, images.indexOf(image)),
            },
            {
                icon: 'image',
                label: '设为封面',
                action: async () => {
                    try {
                        await setArtistCover(artist.categoryId, artist.name, image.path);
                        showToast('已设为封面', 'success');
                        ctx.handleArtistSetCoverSuccess(image.path);
                    } catch (err) {
                        showToast('设置封面失败: ' + err.message, 'error');
                    }
                },
            },
            {
                icon: 'move',
                label: '移动图片',
                action: () => ctx.openMoveDialog(image, 'image'),
            },
            {
                icon: 'copy',
                label: '复制图片',
                action: () => ctx.openCopyDialog(image, 'image'),
            },
            {
                icon: 'trash-2',
                label: '删除图片',
                action: async () => {
                    if (!confirm('确定要删除这张图片吗？')) return;
                    try {
                        const response = await fetch('/artist_gallery/image', {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ imagePath: image.path, artistId: artist.id }),
                        });
                        if (response.ok) {
                            await ctx.handleArtistDeleteImageSuccess();
                        } else {
                            const error = await response.json();
                            alert(`删除失败: ${error.error || '未知错误'}`);
                        }
                    } catch (error) {
                        alert(`删除失败: ${error.message}`);
                    }
                },
            },
        ];

        showContextMenu(e, menuItems);
    };

    return h('div', { class: 'artist-detail-view' }, [
        images.length > 0
            ? h(LazyList, {
                items: images,
                renderItem: (img, index) => {
                    const imgKey = `image:${img.path}`;
                    const isSelected = ctx.selectedItems.has(imgKey);
                    return h('div', {
                        key: img.path,
                        class: `artist-detail-image-item ${ctx.selectionMode ? 'selection-mode' : ''} ${isSelected ? 'selected' : ''}`,
                        onClick: (e) => {
                            if (ctx.selectionMode) {
                                ctx.handleArtistSelect(imgKey, e.shiftKey);
                            } else {
                                ctx.openLightbox({ ...artist, images }, index);
                            }
                        },
                        onContextMenu: (e) => handleImageContextMenu(e, img),
                    }, [
                        h('img', {
                            src: buildImageUrl(img.path),
                            alt: `${artist.name} - ${index + 1}`,
                            loading: 'lazy',
                        }),
                    ]);
                },
                layout: 'grid',
                className: 'artist-detail-grid',
            })
            : h('div', { class: 'artist-detail-empty' }, '暂无图片'),
    ]);
}
