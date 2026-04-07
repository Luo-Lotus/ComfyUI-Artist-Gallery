/**
 * 组合详情视图组件
 * 显示组合成员画师的图片交集，支持搜索过滤、右键菜单、多选
 */
import { h } from '../lib/preact.mjs';
import { useContextMenu } from './ContextMenu.js';
import { LazyList } from './LazyList.js';
import { buildImageUrl, updateCombination as updateCombinationApi } from '../utils.js';
import { showToast } from './Toast.js';
import { useGallery } from './GalleryContext.js';

export function CombinationDetailView() {
    const ctx = useGallery();
    const { showContextMenu } = useContextMenu();
    const comb = ctx.viewModeCombination;
    const combImages = ctx.filteredCombinationImages;

    const handleCombImageContextMenu = (e, image) => {
        e.preventDefault();
        e.stopPropagation();

        const menuItems = [
            {
                icon: 'search',
                label: '查看大图',
                action: () => {
                    const imgIndex = combImages.indexOf(image);
                    ctx.openLightbox(
                        { ...comb, name: comb.name, images: combImages },
                        imgIndex >= 0 ? imgIndex : 0,
                    );
                },
            },
            {
                icon: 'image',
                label: '设为封面',
                action: async () => {
                    try {
                        await updateCombinationApi(comb.id, { coverImageId: image.path });
                        showToast('已设为封面', 'success');
                        ctx.handleCombinationSetCoverSuccess(image.path);
                        await ctx.loadData();
                    } catch (err) {
                        showToast('设置封面失败: ' + err.message, 'error');
                    }
                },
            },
            {
                icon: 'trash-2',
                label: '删除图片',
                action: async () => {
                    if (!confirm('确定要删除这张图片吗？删除将从组合中所有成员画师移除。')) return;
                    try {
                        for (const artistName of comb.artistKeys || []) {
                            await fetch('/artist_gallery/image', {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ imagePath: image.path }),
                            });
                        }
                        showToast('图片已删除', 'success');
                        await ctx.handleCombinationDeleteImageSuccess();
                        await ctx.loadData();
                    } catch (err) {
                        showToast('删除失败: ' + err.message, 'error');
                    }
                },
            },
            {
                icon: 'info-circle',
                label: '图片信息',
                action: () => {
                    ctx.setImageInfoImage(image);
                    ctx.setShowImageInfoDialog(true);
                },
            },
        ];

        showContextMenu(e, menuItems);
    };

    return h('div', { class: 'combination-detail-view' }, [
        combImages.length > 0
            ? h(LazyList, {
                items: combImages,
                renderItem: (img, index) => {
                    const imgKey = `image:${img.path}`;
                    const isSelected = ctx.selectedItems.has(imgKey);
                    return h('div', {
                        key: img.path,
                        class: `artist-detail-image-item ${ctx.selectionMode ? 'selection-mode' : ''} ${isSelected ? 'selected' : ''}`,
                        onClick: (e) => {
                            if (ctx.selectionMode) {
                                ctx.handleCombinationSelect(imgKey, e.shiftKey);
                            } else {
                                ctx.openLightbox(
                                    { ...comb, name: comb.name, images: combImages },
                                    index,
                                );
                            }
                        },
                        onContextMenu: (e) => handleCombImageContextMenu(e, img),
                    }, [
                        h('img', {
                            src: buildImageUrl(img.path),
                            alt: `${comb.name} - ${index + 1}`,
                            loading: 'lazy',
                        }),
                    ]);
                },
                layout: 'grid',
                className: 'artist-detail-grid',
            })
            : h('div', { class: 'artist-detail-empty' }, '暂无交集图片'),
    ]);
}
