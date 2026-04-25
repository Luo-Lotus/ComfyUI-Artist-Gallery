/**
 * 通用导出对话框
 * 选择导出方式：含图片 / 仅结构，含图片时可设置单画师最大图片数
 */
import { h } from '../lib/preact.mjs';
import { useState } from '../lib/hooks.mjs';
import { Dialog, DialogButton } from './Dialog.js';
import { Icon } from '../lib/icons.mjs';

export function ExportDialog({ isOpen, title, onClose, onConfirm }) {
    const [includeImages, setIncludeImages] = useState(true);
    const [maxImages, setMaxImages] = useState(99);

    const handleConfirm = () => {
        onConfirm(includeImages, includeImages ? maxImages : 0);
        onClose();
    };

    if (!isOpen) return null;

    return h(Dialog, {
        isOpen,
        onClose,
        title: title || '导出',
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
                    h('div', { class: 'export-dialog-option-desc' }, '导出数据及关联的图片文件'),
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
                    h('div', { class: 'export-dialog-option-desc' }, '仅导出数据信息，不包含图片文件'),
                ]),
            ]),
        ]),

        includeImages && h('div', { class: 'export-dialog-max-images' }, [
            h('label', { class: 'export-dialog-max-images-label' }, [
                '单个画师最大导出图片数',
            ]),
            h('input', {
                type: 'number',
                class: 'export-dialog-max-images-input',
                min: '1',
                max: '9999',
                value: maxImages,
                onInput: (e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v > 0) setMaxImages(v);
                },
            }),
        ]),
    ]));
}
