/**
 * 图片信息对话框组件
 * 显示图片的详细元数据（画师、prompt、工作流、文件信息）
 */
import { h } from '../lib/preact.mjs';
import { useState, useEffect } from '../lib/hooks.mjs';
import { Dialog } from './Dialog.js';
import { showToast } from './Toast.js';

function CopyButton({ text, label }) {
    const handleCopy = () => {
        navigator.clipboard.writeText(text).then(
            () => showToast(`${label || '内容'}已复制`, 'success'),
            () => showToast('复制失败', 'error'),
        );
    };

    return h('button', {
        class: 'image-info-copy-btn',
        onClick: handleCopy,
        title: '复制',
    }, '\u{1F4CB}');
}

function InfoBlock({ title, icon, children, copyText, copyLabel }) {
    return h('div', { class: 'image-info-block' }, [
        h('div', { class: 'image-info-block-title' }, [
            icon && h('span', { class: 'image-info-block-icon' }, icon),
            h('span', {}, title),
            copyText && h(CopyButton, { text: copyText, label: copyLabel }),
        ]),
        h('div', { class: 'image-info-block-content' }, children),
    ]);
}

export function ImageInfoDialog({ isOpen, image, onClose }) {
    const [info, setInfo] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && image?.path) {
            setLoading(true);
            fetch(
                `/artist_gallery/image/info?path=${encodeURIComponent(image.path)}`,
            )
                .then((res) => res.json())
                .then((data) => {
                    if (data.success) {
                        setInfo(data.info);
                    } else {
                        showToast('获取图片信息失败: ' + (data.error || ''), 'error');
                    }
                })
                .catch((err) => showToast('请求失败: ' + err.message, 'error'))
                .finally(() => setLoading(false));
        }
    }, [isOpen, image?.path]);

    if (!isOpen) return null;

    const mapping = info?.mapping;
    const pnginfo = info?.pnginfo || {};
    const fileInfo = info?.fileInfo || {};

    // 解析 artist_gallery PNG 数据
    let galleryData = {};
    try {
        if (pnginfo.artist_gallery) {
            galleryData = JSON.parse(pnginfo.artist_gallery);
        }
    } catch {}

    // 解析 prompt (PNG 自带的)
    let promptText = '';
    try {
        if (pnginfo.prompt) {
            const parsed = JSON.parse(pnginfo.prompt);
            promptText = typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
        }
    } catch {
        promptText = pnginfo.prompt || '';
    }

    // mapping metadata 中的 prompt_string
    const metaPromptString = mapping?.metadata?.prompt_string || galleryData.prompt_string || '';

    // 从 mapping metadata 中获取 prompt (旧字段兼容)
    const metaPrompt = mapping?.metadata?.prompt || '';

    const displayPrompt = promptText || metaPrompt;

    // 解析 workflow
    let workflowText = '';
    try {
        if (pnginfo.workflow) {
            const wf = JSON.parse(pnginfo.workflow);
            workflowText = JSON.stringify(wf, null, 2);
        }
    } catch {
        workflowText = pnginfo.workflow || '';
    }

    const artistNames = mapping?.artistNames || galleryData.artist_names || [];

    // 画师信息 JSON
    const artistJson = artistNames.length > 0 ? JSON.stringify(artistNames, null, 2) : '';

    return h(
        Dialog,
        {
            isOpen,
            onClose,
            title: '图片信息',
            titleIcon: '\u2139\uFE0F',
            maxWidth: '550px',
            maxHeight: '80vh',
            footer: [
                h(
                    'button',
                    { class: 'gallery-modal-btn primary', onClick: onClose },
                    '关闭',
                ),
            ],
        },
        h('div', { class: 'image-info-dialog' }, [
            loading && h('div', { class: 'image-info-loading' }, '加载中...'),

            !loading && info && [
                // 文件信息
                h(InfoBlock, { title: '文件信息', icon: '\uD83D\uDDBC\uFE0F' }, [
                    h('div', { class: 'image-info-grid' }, [
                        h('div', { class: 'image-info-row' }, [
                            h('span', { class: 'image-info-label' }, '尺寸'),
                            h('span', { class: 'image-info-value' },
                                fileInfo.width && fileInfo.height
                                    ? `${fileInfo.width} x ${fileInfo.height}`
                                    : '-'),
                        ]),
                        h('div', { class: 'image-info-row' }, [
                            h('span', { class: 'image-info-label' }, '大小'),
                            h('span', { class: 'image-info-value' },
                                fileInfo.sizeFormatted || '-'),
                        ]),
                        h('div', { class: 'image-info-row' }, [
                            h('span', { class: 'image-info-label' }, '路径'),
                            h('span', { class: 'image-info-value image-info-path' },
                                image?.path || '-'),
                        ]),
                    ]),
                ]),

                // 路径复制（单独行，更方便点击）
                image?.path && h('div', { class: 'image-info-copy-row' }, [
                    h(CopyButton, { text: image.path, label: '路径' }),
                ]),

                // 画师信息（JSON 格式）
                artistJson &&
                    h(InfoBlock, {
                        title: `画师 (${artistNames.length})`,
                        icon: '\uD83D\uDC64',
                        copyText: artistJson,
                        copyLabel: '画师列表',
                    }, [
                        h('pre', { class: 'image-info-pre' }, artistJson),
                    ]),

                // Prompt String (SaveToGallery 节点传入的)
                metaPromptString &&
                    h(InfoBlock, {
                        title: 'Prompt String',
                        icon: '\uD83D\uDCDD',
                        copyText: metaPromptString,
                        copyLabel: 'Prompt String',
                    }, [
                        h('pre', { class: 'image-info-pre' }, metaPromptString),
                    ]),

                // Prompt (PNG 自带)
                displayPrompt &&
                    h(InfoBlock, {
                        title: 'Prompt',
                        icon: '\uD83D\uDCDD',
                        copyText: displayPrompt,
                        copyLabel: 'Prompt',
                    }, [
                        h('pre', { class: 'image-info-pre' }, displayPrompt),
                    ]),

                // 工作流
                workflowText &&
                    h(InfoBlock, {
                        title: '工作流',
                        icon: '\uD83D\uDD27',
                        copyText: workflowText,
                        copyLabel: '工作流',
                    }, [
                        h('pre', { class: 'image-info-pre image-info-workflow' }, workflowText),
                    ]),

                // 无信息
                !artistNames.length &&
                    !displayPrompt &&
                    !metaPromptString &&
                    !workflowText &&
                    h('div', { class: 'image-info-empty' }, '暂无额外信息'),
            ],
        ]),
    );
}
