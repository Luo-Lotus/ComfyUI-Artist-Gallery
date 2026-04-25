/**
 * 画廊模态框顶部工具栏
 * 根据视图模式显示不同的操作按钮
 */
import { h } from '../lib/preact.mjs';
import { Icon } from '../lib/icons.mjs';
import { useGallery } from './GalleryContext.js';

export function GalleryHeader() {
    const ctx = useGallery();
    const isGallery = ctx.viewMode === 'gallery';
    const isArtist = ctx.viewMode === 'artist';

    const buttons = [];

    // 标题
    buttons.push(h('div', { class: 'gallery-modal-title' }, '🎨 画师图库'));

    // 画廊视图才显示的管理按钮
    if (isGallery) {
        buttons.push(
            h('button', { class: 'gallery-modal-btn', onClick: ctx.handleAddCategory }, [h(Icon, { name: 'folder-plus', size: 14 }), ' 新建分类']),
            h('button', { class: 'gallery-modal-btn', onClick: ctx.openAddDialog }, [h(Icon, { name: 'plus', size: 14 }), ' 添加画师']),
            h('button', { class: 'gallery-modal-btn', onClick: () => ctx.openCombinationDialog('add') }, [h(Icon, { name: 'link', size: 14 }), ' 新建组合']),
            h('button', { class: 'gallery-modal-btn', onClick: () => ctx.setShowImportDialog(true) }, [h(Icon, { name: 'download', size: 14 }), ' 导入图片']),
            h('button', {
                class: 'gallery-modal-btn',
                onClick: () => {
                    const input = document.getElementById('artist-import-file-input');
                    if (input) input.click();
                },
            }, [h(Icon, { name: 'upload', size: 14 }), ' 导入']),
        );
    }

    // 画师详情视图：只显示导入图片
    if (isArtist) {
        buttons.push(
            h('button', { class: 'gallery-modal-btn', onClick: () => ctx.setShowImportDialog(true) }, [h(Icon, { name: 'download', size: 14 }), ' 导入图片']),
        );
    }

    // 通用按钮：刷新
    buttons.push(
        h('button', { class: 'gallery-modal-btn', onClick: ctx.loadData }, [h(Icon, { name: 'refresh-cw', size: 14 }), ' 刷新']),
    );

    // 批量操作按钮
    buttons.push(
        h('button', {
            class: 'gallery-modal-btn',
            onClick: ctx.handleToggleSelectionMode,
            title: ctx.selectionMode ? '退出多选模式' : '批量操作',
        }, [h(Icon, { name: 'clipboard-list', size: 14 }), ctx.selectionMode ? ' 已选' : ' 批量操作']),
    );

    // 隐藏的文件选择 input
    buttons.push(
        h('input', {
            id: 'artist-import-file-input',
            type: 'file',
            accept: '.zip',
            style: { display: 'none' },
            onChange: ctx.handleImportArtists,
        }),
    );

    buttons.push(
        h('button', { class: 'gallery-modal-btn primary', onClick: ctx.onClose }, [h(Icon, { name: 'x', size: 14 }), ' 关闭']),
    );

    return h('div', { class: 'gallery-modal-header' }, buttons);
}
