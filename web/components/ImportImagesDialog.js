/**
 * 导入图片对话框
 * 支持两种视图模式：
 * - 画师详情视图：自动代入当前画师，直接导入
 * - 分类视图：自动代入当前分类，显示解析配置选项
 */

import { h } from '../lib/preact.mjs';
import { useState } from '../lib/hooks.mjs';
import { Dialog, DialogButton } from './Dialog.js';
import { FileUploader } from './FileUploader.js';
import { ImportPreview } from './ImportPreview.js';
import { showToast } from './Toast.js';

export function ImportImagesDialog({
    isOpen,
    onClose,
    viewMode, // 'gallery' | 'artist'
    currentCategory,
    currentArtist, // 仅在artist视图时传入
    categories,
    onSuccess,
}) {
    // ============ 状态管理 ============
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [preview, setPreview] = useState(null);
    const [importing, setImporting] = useState(false);

    // 自定义导入配置（仅分类视图）
    const [parseStrategy, setParseStrategy] = useState('auto_create');
    const [regexPattern, setRegexPattern] = useState('@([^,]+),');
    const [autoCreateArtist, setAutoCreateArtist] = useState(true);
    const [urlDecode, setUrlDecode] = useState(false);

    // ============ 工具函数 ============

    const buildConfig = () => {
        if (viewMode === 'artist') {
            // 画师详情视图：使用当前画师信息
            return {
                mode: 'single',
                categoryId: currentArtist.categoryId,
                artistName: currentArtist.name,
                displayName: currentArtist.displayName || currentArtist.name,
            };
        } else {
            // 分类视图：使用解析配置
            return {
                mode: 'custom',
                parseStrategy: parseStrategy,
                defaultCategoryId: currentCategory,
                regexPattern: regexPattern,
                autoCreateArtist: autoCreateArtist,
                urlDecode: urlDecode,
            };
        }
    };

    const buildRequestBody = () => {
        // 构建请求体，确保顶层mode和config里的mode一致
        if (viewMode === 'artist') {
            return {
                mode: 'single',
                images: null, // 稍后在handleImport中填充
                config: buildConfig()
            };
        } else {
            return {
                mode: 'custom',
                images: null, // 稍后在handleImport中填充
                config: buildConfig()
            };
        }
    };

    const loadPreview = async () => {
        if (selectedFiles.length === 0) {
            setPreview(null);
            return;
        }

        const filenames = selectedFiles.map((f) => f.name);

        try {
            const requestBody = {
                filenames,
                config: buildConfig()
            };

            console.log('[ImportImagesDialog] 发送预览请求:', requestBody);

            const response = await fetch('/artist_gallery/import/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            const data = await response.json();
            setPreview(data.preview);
        } catch (error) {
            console.error('预览加载失败:', error);
            showToast('预览加载失败', 'error');
        }
    };

    const handleImport = async () => {
        if (selectedFiles.length === 0) {
            showToast('请选择要导入的图片', 'warning');
            return;
        }

        setImporting(true);

        try {
            // 读取文件为base64
            const filePromises = selectedFiles.map(async (file) => {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () =>
                        resolve({
                            filename: file.name,
                            data: reader.result.split(',')[1],
                            size: file.size,
                        });
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
            });

            const images = await Promise.all(filePromises);

            // 调用导入API
            const requestBody = {
                mode: viewMode === 'artist' ? 'single' : 'custom',
                images: images,
                config: buildConfig()
            };

            console.log('[ImportImagesDialog] 发送导入请求:', requestBody);

            const response = await fetch('/artist_gallery/import/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            const result = await response.json();

            if (result.success) {
                const successMsg =
                    result.imported > 0
                        ? `导入成功: ${result.imported}张`
                        : '导入完成';

                const errorMsg =
                    result.failed > 0 ? `，失败: ${result.failed}张` : '';

                showToast(
                    successMsg + errorMsg,
                    result.failed > 0 ? 'warning' : 'success',
                );

                if (onSuccess) onSuccess();
                handleClose();
            } else {
                showToast('导入失败: ' + (result.error || '未知错误'), 'error');
            }
        } catch (error) {
            console.error('导入失败:', error);
            showToast('导入失败: ' + error.message, 'error');
        } finally {
            setImporting(false);
        }
    };

    const handleClose = () => {
        setSelectedFiles([]);
        setPreview(null);
        onClose();
    };

    const getDialogTitle = () => {
        if (viewMode === 'artist') {
            return `导入图片到 ${currentArtist.displayName || currentArtist.name}`;
        } else {
            const category = categories.find((c) => c.id === currentCategory);
            const categoryName = category ? category.name : currentCategory;
            return `导入图片到 ${categoryName}`;
        }
    };

    // ============ 渲染函数 ============

    const renderConfigOptions = () => {
        // 仅在分类视图显示配置选项
        if (viewMode === 'artist') return null;

        return h('div', { class: 'import-config' }, [
            h('div', { class: 'form-group' }, [
                h('label', {}, '解析策略:'),
                h(
                    'select',
                    {
                        value: parseStrategy,
                        onInput: (e) => setParseStrategy(e.target.value),
                    },
                    [
                        h('option', { value: 'regex' }, '正则提取'),
                        h('option', { value: 'auto_create' }, '直接使用文件名'),
                    ],
                ),
            ]),

            parseStrategy === 'regex' &&
                h('div', { class: 'form-group' }, [
                    h('label', {}, '正则模式:'),
                    h('input', {
                        type: 'text',
                        value: regexPattern,
                        placeholder: '例如: @([^,]+),',
                        onInput: (e) => setRegexPattern(e.target.value),
                    }),
                    h('div', { class: 'form-hint' },
                        '提示: 使用捕获组()提取画师名，例如 @([^,]+), 会从 @akakura,_1.png 提取 akakura'
                    ),
                ]),

            h('div', { class: 'form-checkbox' }, [
                h('input', {
                    type: 'checkbox',
                    checked: autoCreateArtist,
                    onInput: (e) => setAutoCreateArtist(e.target.checked),
                }),
                h('label', {}, '自动创建不存在的画师'),
            ]),

            h('div', { class: 'form-checkbox' }, [
                h('input', {
                    type: 'checkbox',
                    checked: urlDecode,
                    onInput: (e) => setUrlDecode(e.target.checked),
                }),
                h('label', {}, 'URL解码文件名'),
            ]),
        ]);
    };

    const renderFooter = () => {
        return [
            h(DialogButton, { onClick: handleClose }, '取消'),
            h(
                DialogButton,
                {
                    variant: 'primary',
                    onClick: handleImport,
                    disabled: importing || selectedFiles.length === 0,
                },
                importing ? '导入中...' : '导入',
            ),
        ];
    };

    // ============ 主渲染 ============

    return h(
        Dialog,
        {
            isOpen,
            onClose: handleClose,
            title: getDialogTitle(),
            titleIcon: '📥',
            maxWidth: '700px',
            footer: renderFooter(),
        },
        [
            h(FileUploader, {
                files: selectedFiles,
                onChange: setSelectedFiles,
                onPreview: loadPreview,
            }),

            renderConfigOptions(),

            // 画师详情视图的简单提示
            viewMode === 'artist' &&
                selectedFiles.length > 0 &&
                h(
                    'div',
                    {
                        class: 'import-single-artist-hint',
                    },
                    [
                        h(
                            'p',
                            {},
                            `所有图片将导入到: ${currentArtist.displayName || currentArtist.name}`,
                        ),
                    ],
                ),

            // 分类视图的预览
            viewMode === 'gallery' &&
                preview &&
                h(ImportPreview, {
                    preview,
                    categories,
                }),
        ],
    );
}
