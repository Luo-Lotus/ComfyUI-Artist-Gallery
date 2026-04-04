/**
 * 全局配置对话框组件
 * 用于配置画师输出的全局设置
 */
import { h } from '../../lib/preact.mjs';
import { useState, useEffect } from '../../lib/hooks.mjs';
import { Dialog, DialogButton } from '../../components/Dialog.js';
import { Icon } from '../../lib/icons.mjs';
import { useFormatProcessor } from './hooks/useFormatProcessor.js';
import { showToast } from '../../components/Toast.js';

export function GlobalConfigDialog({ isOpen, onClose, onSave, currentConfig, sampleArtistName = 'artist_name' }) {
    const { previewFormat, validateFormat } = useFormatProcessor();

    // 本地状态
    const [format, setFormat] = useState(currentConfig?.format || '{content}');
    const [randomMode, setRandomMode] = useState(currentConfig?.randomMode || false);
    const [randomCount, setRandomCount] = useState(currentConfig?.randomCount || 3);
    const [cycleMode, setCycleMode] = useState(currentConfig?.cycleMode || false);
    const [preview, setPreview] = useState('');

    // 更新预览
    useEffect(() => {
        const previewText = previewFormat(format, sampleArtistName);
        setPreview(previewText);
    }, [format, sampleArtistName]);

    // 处理保存
    const handleSave = () => {
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
        onSave({
            format,
            randomMode,
            randomCount,
            cycleMode,
        });

        showToast('全局配置已保存', 'success');
        onClose();
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
                            id: 'random-disabled',
                            name: 'random-mode',
                            checked: !randomMode,
                            onChange: () => setRandomMode(false),
                        }),
                        h('label', {
                            for: 'random-disabled',
                            class: 'config-radio-label',
                        }, '禁用（使用所有已选画师）'),
                    ]),
                    h('div', { class: 'config-radio-item' }, [
                        h('input', {
                            type: 'radio',
                            id: 'random-enabled',
                            name: 'random-mode',
                            checked: randomMode,
                            onChange: () => setRandomMode(true),
                        }),
                        h('label', {
                            for: 'random-enabled',
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
                        }),
                        h('span', { style: { marginLeft: '4px' } }, '个画师'),
                    ]),
                ]),
            ]),
        ]);
    };

    // 渲染循环模式部分
    const renderCycleSection = () => {
        return h('div', { class: 'config-section' }, [
            h('div', { class: 'config-section-title' }, '循环模式'),
            h('div', { class: 'config-input-group' }, [
                h('div', { class: 'config-radio-group' }, [
                    h('div', { class: 'config-radio-item' }, [
                        h('input', {
                            type: 'radio',
                            id: 'cycle-disabled',
                            name: 'cycle-mode',
                            checked: !cycleMode,
                            onChange: () => setCycleMode(false),
                        }),
                        h('label', {
                            for: 'cycle-disabled',
                            class: 'config-radio-label',
                        }, '禁用'),
                    ]),
                    h('div', { class: 'config-radio-item' }, [
                        h('input', {
                            type: 'radio',
                            id: 'cycle-enabled',
                            name: 'cycle-mode',
                            checked: cycleMode,
                            onChange: () => setCycleMode(true),
                        }),
                        h('label', {
                            for: 'cycle-enabled',
                            class: 'config-radio-label',
                        }, '启用循环（每次输出一个画师，依次循环）'),
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
        title: '全局配置',
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
            renderFormatSection(),
            renderRandomSection(),
            renderCycleSection(),
        ]),
    ]);
}
