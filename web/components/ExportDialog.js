/**
 * 分类导出对话框
 * 选择导出方式：含图片 / 仅结构
 */
import { h } from '../lib/preact.mjs';
import { useState } from '../lib/hooks.mjs';
import { Dialog, DialogButton } from './Dialog.js';
import { Icon } from '../lib/icons.mjs';

export function ExportDialog({ isOpen, category, onClose, onConfirm }) {
    const [includeImages, setIncludeImages] = useState(true);

    const handleConfirm = () => {
        onConfirm(category, includeImages);
        onClose();
    };

    if (!isOpen || !category) return null;

    return h(Dialog, {
        isOpen,
        onClose,
        title: `导出分类: ${category.name}`,
        titleIcon: h(Icon, { name: 'upload', size: 18 }),
        maxWidth: '400px',
        footer: [
            h(DialogButton, { onClick: onClose }, '取消'),
            h(DialogButton, {
                variant: 'primary',
                onClick: handleConfirm,
            }, '导出'),
        ],
    }, h('div', { class: 'export-dialog-content' }, [
        h('div', { class: 'export-dialog-desc' }, '将递归导出该分类下所有子分类、画师和组合。'),

        h('div', { class: 'export-dialog-options' }, [
            h('label', {
                class: `export-dialog-option ${includeImages ? 'active' : ''}`,
                onClick: () => setIncludeImages(true),
            }, [
                h('input', {
                    type: 'radio',
                    name: 'exportMode',
                    checked: includeImages,
                    onChange: () => setIncludeImages(true),
                }),
                h('div', { class: 'export-dialog-option-text' }, [
                    h('div', { class: 'export-dialog-option-title' }, [
                        h(Icon, { name: 'image', size: 14 }),
                        ' 含图片',
                    ]),
                    h('div', { class: 'export-dialog-option-desc' }, '导出分类结构和所有关联图片'),
                ]),
            ]),

            h('label', {
                class: `export-dialog-option ${!includeImages ? 'active' : ''}`,
                onClick: () => setIncludeImages(false),
            }, [
                h('input', {
                    type: 'radio',
                    name: 'exportMode',
                    checked: !includeImages,
                    onChange: () => setIncludeImages(false),
                }),
                h('div', { class: 'export-dialog-option-text' }, [
                    h('div', { class: 'export-dialog-option-title' }, [
                        h(Icon, { name: 'folder', size: 14 }),
                        ' 仅结构',
                    ]),
                    h('div', { class: 'export-dialog-option-desc' }, '仅导出分类、画师和组合信息，不包含图片文件'),
                ]),
            ]),
        ]),
    ]));
}
