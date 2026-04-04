/**
 * 分类配置对话框组件
 * 用于配置单个分类的画师输出设置（可覆盖全局配置）
 */
import { h } from '../../lib/preact.mjs';
import { useState, useEffect } from '../../lib/hooks.mjs';
import { Dialog, DialogButton } from '../../components/Dialog.js';
import { Icon } from '../../lib/icons.mjs';
import { useFormatProcessor } from './hooks/useFormatProcessor.js';
import { showToast } from '../../components/Toast.js';

export function CategoryConfigDialog({
    isOpen,
    onClose,
    onSave,
    categoryId,
    categoryName,
    currentConfig, // null 表示使用全局配置
    globalConfig,
    sampleArtistName = 'artist_name'
}) {
    const { previewFormat, validateFormat } = useFormatProcessor();

    // 本地状态
    const [enabled, setEnabled] = useState(currentConfig?.enabled || false);
    const [format, setFormat] = useState(currentConfig?.format || globalConfig?.format || '{content}');
    const [randomMode, setRandomMode] = useState(currentConfig?.randomMode !== undefined ? currentConfig.randomMode : globalConfig?.randomMode || false);
    const [randomCount, setRandomCount] = useState(currentConfig?.randomCount !== undefined ? currentConfig.randomCount : globalConfig?.randomCount || 3);
    const [preview, setPreview] = useState('');

    // 更新预览
    useEffect(() => {
        const previewText = previewFormat(format, sampleArtistName);
        setPreview(previewText);
    }, [format, sampleArtistName]);

    // 处理保存
    const handleSave = () => {
        if (!enabled) {
            // 禁用独立配置，传 null 表示删除配置
            onSave(categoryId, null);
            showToast(`已恢复分类"${categoryName}"使用全局配置`, 'info');
            onClose();
            return;
        }

        // 验证格式
        const validation = validateFormat(format);
        if (!validation.valid) {
            showToast(validation.error, 'error');
            return;
        }

        // 验证随机数量
        if (randomMode && randomCount < 1) {
            showToast('随机选择数量必须大于0', 'error');
            return;
        }

        // 保存配置
        onSave(categoryId, {
            enabled: true,
            format,
            randomMode,
            randomCount,
        });

        showToast(`分类"${categoryName}"配置已保存`, 'success');
        onClose();
    };

    // 渲染全局配置预览（当未启用独立配置时）
    const renderGlobalConfigPreview = () => {
        return h('div', { class: 'config-input-group', style: { opacity: '0.6' } }, [
            h('div', { class: 'config-preview' }, [
                h('div', { style: { marginBottom: '8px', fontWeight: '600' } }, '当前全局配置：'),
                h('div', null, `格式：${globalConfig?.format || '{content}'}`),
                globalConfig?.randomMode && h('div', null, `随机：启用，选择 ${globalConfig.randomCount} 个画师`),
                !globalConfig?.randomMode && h('div', null, `随机：禁用（使用所有画师）`),
            ]),
        ]);
    };

    // 渲染格式配置部分
    const renderFormatSection = () => {
        return h('div', { class: 'config-section' }, [
            h('div', { class: 'config-section-title' }, '单画师格式'),
            h('div', { class: 'config-input-group' }, [
                h('label', { class: 'config-label' }, '输入格式：'),
                h('input', {
                    class: 'config-input',
                    type: 'text',
                    value: format,
                    onInput: (e) => setFormat(e.target.value),
                    placeholder: '{content}',
                    disabled: !enabled,
                }),
                h('div', { class: 'config-preview' }, [
                    h('span', { style: { color: '#888', marginRight: '8px' } }, '预览：'),
                    h('span', { style: { color: '#4CAF50', fontWeight: '600' } }, preview || '-'),
                ]),
                h('div', { class: 'config-hint' }, [
                    h('div', { class: 'config-hint-title' }, [h(Icon, { name: 'lightbulb', size: 14 }), ' 提示：']),
                    h('ul', { style: { margin: '4px 0', paddingLeft: '20px' } }, [
                        h('li', null, '{content} - 画师名称'),
                        h('li', null, '{random(min,max,step)} - 随机数'),
                        h('li', null, '示例：({content}:{random(1,1.5,0.1)})'),
                    ]),
                ]),
            ]),
        ]);
    };

    // 渲染多画师随机规则部分
    const renderRandomSection = () => {
        return h('div', { class: 'config-section' }, [
            h('div', { class: 'config-section-title' }, '多画师随机规则'),
            h('div', { class: 'config-input-group' }, [
                h('div', { class: 'config-radio-group' }, [
                    h('div', { class: 'config-radio-item' }, [
                        h('input', {
                            type: 'radio',
                            id: 'cat-random-disabled',
                            name: 'cat-random-mode',
                            checked: !randomMode,
                            onChange: () => setRandomMode(false),
                            disabled: !enabled,
                        }),
                        h('label', {
                            for: 'cat-random-disabled',
                            class: 'config-radio-label',
                        }, '禁用（使用所有已选画师）'),
                    ]),
                    h('div', { class: 'config-radio-item' }, [
                        h('input', {
                            type: 'radio',
                            id: 'cat-random-enabled',
                            name: 'cat-random-mode',
                            checked: randomMode,
                            onChange: () => setRandomMode(true),
                            disabled: !enabled,
                        }),
                        h('label', {
                            for: 'cat-random-enabled',
                            class: 'config-radio-label',
                        }, '启用随机选择'),
                    ]),
                    randomMode && h('div', {
                        class: 'config-radio-item',
                        style: { marginLeft: '24px' },
                    }, [
                        h('label', { class: 'config-radio-label' }, '随机选择数量：'),
                        h('input', {
                            class: 'config-number-input',
                            type: 'number',
                            min: 1,
                            value: randomCount,
                            onInput: (e) => setRandomCount(parseInt(e.target.value) || 1),
                            disabled: !enabled,
                        }),
                        h('span', { style: { marginLeft: '4px' } }, '个画师'),
                    ]),
                ]),
            ]),
        ]);
    };

    // 主渲染
    return h(Dialog, {
        isOpen,
        onClose,
        titleIcon: h(Icon, { name: 'settings', size: 18 }),
        title: `${categoryName} - 分类配置`,
        maxWidth: '600px',
        footer: [
            h(DialogButton, {
                onClick: onClose,
            }, '取消'),
            h(DialogButton, {
                variant: 'primary',
                onClick: handleSave,
            }, '保存'),
        ],
    }, [
        h('div', { class: 'config-dialog-content' }, [
            // 使用独立配置复选框
            h('div', { class: 'config-section' }, [
                h('div', { class: 'config-checkbox-item' }, [
                    h('input', {
                        type: 'checkbox',
                        id: 'use-custom-config',
                        checked: enabled,
                        onChange: (e) => setEnabled(e.target.checked),
                    }),
                    h('label', {
                        for: 'use-custom-config',
                        class: 'config-checkbox-label',
                    }, '使用独立配置（覆盖全局配置）'),
                ]),
            ]),

            // 如果未启用独立配置，显示全局配置预览
            !enabled && renderGlobalConfigPreview(),

            // 如果启用独立配置，显示配置选项
            enabled && [
                renderFormatSection(),
                renderRandomSection(),
            ],
        ]),
    ]);
}
