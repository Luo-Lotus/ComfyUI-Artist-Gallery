/**
 * 图片灯箱组件
 * 全屏查看图片 + 右侧信息面板
 */
import { h } from '../lib/preact.mjs';
import { useState, useEffect, useCallback } from '../lib/hooks.mjs';
import { Icon } from '../lib/icons.mjs';
import { buildImageUrl } from '../utils.js';
import { showToast } from './Toast.js';

function CopyButton({ text, label }) {
    return h('button', {
        class: 'lightbox-info-copy-btn',
        onClick: (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(text).then(
                () => showToast(`${label || '内容'}已复制`, 'success'),
                () => showToast('复制失败', 'error'),
            );
        },
        title: '复制',
    }, h(Icon, { name: 'copy', size: 12 }));
}

function InfoBlock({ title, icon, children, copyText, copyLabel }) {
    return h('div', { class: 'lightbox-info-block' }, [
        h('div', { class: 'lightbox-info-block-title' }, [
            h(Icon, { name: icon, size: 14 }),
            h('span', {}, title),
            copyText && h(CopyButton, { text: copyText, label: copyLabel }),
        ]),
        h('div', { class: 'lightbox-info-block-content' }, children),
    ]);
}

function parseImageInfo(info, imagePath) {
    if (!info) return null;

    const mapping = info.mapping;
    const pnginfo = info.pnginfo || {};
    const fileInfo = info.fileInfo || {};

    let galleryData = {};
    try {
        if (pnginfo.artist_gallery) galleryData = JSON.parse(pnginfo.artist_gallery);
    } catch {}

    let promptText = '';
    try {
        if (pnginfo.prompt) {
            const parsed = JSON.parse(pnginfo.prompt);
            promptText = typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
        }
    } catch {
        promptText = pnginfo.prompt || '';
    }

    const metaPromptString = mapping?.metadata?.prompt_string || galleryData.prompt_string || '';
    const metaPrompt = mapping?.metadata?.prompt || '';
    const displayPrompt = promptText || metaPrompt;

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
    const artistJson = artistNames.length > 0 ? JSON.stringify(artistNames, null, 2) : '';

    return { fileInfo, artistNames, artistJson, metaPromptString, displayPrompt, workflowText, imagePath };
}

function InfoPanel({ info, loading, imagePath }) {
    if (loading) {
        return h('div', { class: 'lightbox-info-loading' }, h(Icon, { name: 'loader', size: 20, class: 'spin' }));
    }

    if (!info) {
        return h('div', { class: 'lightbox-info-empty' }, '暂无信息');
    }

    const { fileInfo, artistJson, artistNames, metaPromptString, displayPrompt, workflowText, imagePath: path } = info;

    return h('div', { class: 'lightbox-info-content' }, [
        // 文件信息
        h(InfoBlock, { title: '文件信息', icon: 'image' }, [
            h('div', { class: 'lightbox-info-grid' }, [
                h('div', { class: 'lightbox-info-row' }, [
                    h('span', { class: 'lightbox-info-label' }, '尺寸'),
                    h('span', { class: 'lightbox-info-value' },
                        fileInfo.width && fileInfo.height
                            ? `${fileInfo.width} x ${fileInfo.height}`
                            : '-'),
                ]),
                h('div', { class: 'lightbox-info-row' }, [
                    h('span', { class: 'lightbox-info-label' }, '大小'),
                    h('span', { class: 'lightbox-info-value' },
                        fileInfo.sizeFormatted || '-'),
                ]),
                h('div', { class: 'lightbox-info-row' }, [
                    h('span', { class: 'lightbox-info-label' }, '路径'),
                    h('span', { class: 'lightbox-info-value lightbox-info-path' }, path || '-'),
                ]),
            ]),
        ]),

        path && h('div', { class: 'lightbox-info-copy-row' }, [
            h(CopyButton, { text: path, label: '路径' }),
        ]),

        artistJson &&
            h(InfoBlock, {
                title: `画师 (${artistNames.length})`,
                icon: 'star',
                copyText: artistJson,
                copyLabel: '画师列表',
            }, [
                h('pre', { class: 'lightbox-info-pre' }, artistJson),
            ]),

        metaPromptString &&
            h(InfoBlock, {
                title: 'Prompt String',
                icon: 'edit',
                copyText: metaPromptString,
                copyLabel: 'Prompt String',
            }, [
                h('pre', { class: 'lightbox-info-pre' }, metaPromptString),
            ]),

        displayPrompt &&
            h(InfoBlock, {
                title: 'Prompt',
                icon: 'edit',
                copyText: displayPrompt,
                copyLabel: 'Prompt',
            }, [
                h('pre', { class: 'lightbox-info-pre' }, displayPrompt),
            ]),

        workflowText &&
            h(InfoBlock, {
                title: '工作流',
                icon: 'package',
                copyText: workflowText,
                copyLabel: '工作流',
            }, [
                h('pre', { class: 'lightbox-info-pre lightbox-info-workflow' }, workflowText),
            ]),

        !artistNames?.length &&
            !displayPrompt &&
            !metaPromptString &&
            !workflowText &&
            h('div', { class: 'lightbox-info-empty' }, '暂无额外信息'),
    ]);
}

export function Lightbox({ isOpen, artist, imageIndex, onClose, onNavigate }) {
    const [showInfo, setShowInfo] = useState(true);
    const [info, setInfo] = useState(null);
    const [loading, setLoading] = useState(false);

    if (!isOpen || !artist) return null;

    const img = artist.images[imageIndex];

    // 获取图片信息
    useEffect(() => {
        if (isOpen && img?.path) {
            setLoading(true);
            setInfo(null);
            fetch(`/artist_gallery/image/info?path=${encodeURIComponent(img.path)}`)
                .then((res) => res.json())
                .then((data) => {
                    if (data.success) {
                        setInfo(parseImageInfo(data.info, img.path));
                    } else {
                        showToast('获取图片信息失败: ' + (data.error || ''), 'error');
                    }
                })
                .catch((err) => showToast('请求失败: ' + err.message, 'error'))
                .finally(() => setLoading(false));
        }
    }, [isOpen, img?.path]);

    const handlePrev = () => onNavigate(-1);
    const handleNext = () => onNavigate(1);

    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Escape') onClose();
        if (e.key === 'ArrowLeft') onNavigate(-1);
        if (e.key === 'ArrowRight') onNavigate(1);
    }, [onClose, onNavigate]);

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    return h(
        'div',
        {
            class: `gallery-lightbox ${isOpen ? 'open' : ''}`,
            onClick: (e) => {
                if (e.target.classList.contains('gallery-lightbox') || e.target.classList.contains('gallery-lightbox-image-section')) onClose();
            },
        },
        [
            // 左侧图片区域
            h('div', { class: 'gallery-lightbox-image-section' }, [
                h('img', {
                    class: 'gallery-lightbox-img',
                    src: buildImageUrl(img.path),
                    alt: artist.name,
                }),

                h('button', {
                    class: 'gallery-lightbox-nav gallery-lightbox-prev',
                    onClick: handlePrev,
                }, h(Icon, { name: 'chevron-left', size: 24 })),

                h('button', {
                    class: 'gallery-lightbox-nav gallery-lightbox-next',
                    onClick: handleNext,
                }, h(Icon, { name: 'chevron-right', size: 24 })),

                h('div', { class: 'gallery-lightbox-info' }, [
                    h('span', {}, `${artist.displayName || artist.name} · ${imageIndex + 1} / ${artist.images.length}`),
                    h('button', {
                        class: `gallery-lightbox-info-toggle ${showInfo ? 'active' : ''}`,
                        onClick: () => setShowInfo(prev => !prev),
                        title: showInfo ? '隐藏信息' : '显示信息',
                    }, h(Icon, { name: 'info-circle', size: 14 })),
                ]),
            ]),

            // 右侧信息面板
            showInfo && h('div', { class: 'gallery-lightbox-info-panel' }, [
                h('div', { class: 'lightbox-info-header' }, [
                    h(Icon, { name: 'info-circle', size: 16 }),
                    h('span', {}, '图片信息'),
                ]),
                h(InfoPanel, { info, loading, imagePath: img?.path }),
            ]),
        ],
    );
}
