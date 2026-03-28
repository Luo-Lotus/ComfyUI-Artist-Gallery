/**
 * 分区配置面板组件
 * 用于配置分区的输出格式、随机模式等
 */
import { h } from '../../lib/preact.mjs';
import { useState } from '../../lib/hooks.mjs';

export function PartitionConfigPanel({
    partition,
    globalConfig,
    onChange,
    onClose,
}) {
    const [name, setName] = useState(partition.name);
    const [format, setFormat] = useState(partition.config.format);
    const [randomMode, setRandomMode] = useState(partition.config.randomMode);
    const [randomCount, setRandomCount] = useState(partition.config.randomCount);
    const [cycleMode, setCycleMode] = useState(partition.config.cycleMode);

    // 预览格式效果
    const previewFormat = format.replace('{content}', 'artist_name').replace(/\{random\([^)]+\)\}/g, '1.3');

    const handleSave = () => {
        onChange({
            name,
            config: {
                format,
                randomMode,
                randomCount,
                cycleMode,
            },
        });
        onClose();
    };

    // 渲染格式提示
    const renderFormatHint = () => {
        return h('div', { class: 'config-hint' }, [
            h('div', null, '💡 提示：'),
            h('ul', {}, [
                h('li', null, '{content} - 画师名称'),
                h('li', null, '{random(min,max,step)} - 随机数'),
                h('li', null, '示例: ({content}:{random(1,1.5,0.1)}) → (artist_name:1.3)'),
            ]),
        ]);
    };

    return h('div', { class: 'node-config-panel' }, [
        // 头部
        h('div', { class: 'node-config-header' }, [
            h('span', null, `⚙️ ${partition.isDefault ? '默认分区' : partition.name} - 配置`),
            h('button', {
                class: 'node-config-close',
                onClick: onClose,
            }, '✕'),
        ]),

        // 内容
        h('div', { class: 'node-config-body' }, [
            // 分区名称（非默认分区可编辑）
            !partition.isDefault && h('div', { class: 'node-config-section' }, [
                h('label', { class: 'node-config-label' }, '分区名称'),
                h('input', {
                    type: 'text',
                    class: 'node-config-input',
                    value: name,
                    onInput: (e) => setName(e.target.value),
                }),
            ]),

            // 单画师格式
            h('div', { class: 'node-config-section' }, [
                h('label', { class: 'node-config-label' }, '单画师格式'),
                h('input', {
                    type: 'text',
                    class: 'node-config-input',
                    value: format,
                    onInput: (e) => setFormat(e.target.value),
                    placeholder: globalConfig?.format || '{content}',
                }),
                h('div', { class: 'config-preview' }, `预览: ${previewFormat}`),
                renderFormatHint(),
            ]),

            // 多画师随机规则
            h('div', { class: 'node-config-section' }, [
                h('label', { class: 'node-config-label' }, '多画师随机规则'),
                h('div', { class: 'config-radio-group' }, [
                    h('label', { class: 'config-radio-item' }, [
                        h('input', {
                            type: 'radio',
                            name: `random-mode-${partition.id}`,
                            checked: !randomMode,
                            onChange: () => setRandomMode(false),
                        }),
                        h('span', null, '禁用（使用所有已选画师）'),
                    ]),
                    h('label', { class: 'config-radio-item' }, [
                        h('input', {
                            type: 'radio',
                            name: `random-mode-${partition.id}`,
                            checked: randomMode,
                            onChange: () => setRandomMode(true),
                        }),
                        h('span', null, '启用随机选择'),
                    ]),
                ]),
                randomMode && h('div', { class: 'config-number-input-group' }, [
                    h('label', null, '随机选择数量：'),
                    h('input', {
                        type: 'number',
                        class: 'config-number-input',
                        min: 1,
                        value: randomCount,
                        onInput: (e) => setRandomCount(parseInt(e.target.value) || 1),
                    }),
                    h('span', null, '个画师'),
                ]),
            ]),

            // 循环模式
            h('div', { class: 'node-config-section' }, [
                h('label', { class: 'node-config-label' }, '循环模式'),
                h('div', { class: 'config-radio-group' }, [
                    h('label', { class: 'config-radio-item' }, [
                        h('input', {
                            type: 'radio',
                            name: `cycle-mode-${partition.id}`,
                            checked: !cycleMode,
                            onChange: () => setCycleMode(false),
                        }),
                        h('span', null, '禁用'),
                    ]),
                    h('label', { class: 'config-radio-item' }, [
                        h('input', {
                            type: 'radio',
                            name: `cycle-mode-${partition.id}`,
                            checked: cycleMode,
                            onChange: () => setCycleMode(true),
                        }),
                        h('span', null, '启用循环（每次执行只输出一个画师）'),
                    ]),
                ]),
            ]),
        ]),

        // 底部按钮
        h('div', { class: 'node-config-footer' }, [
            h('button', {
                class: 'node-config-btn',
                onClick: onClose,
            }, '取消'),
            h('button', {
                class: 'node-config-btn primary',
                onClick: handleSave,
            }, '保存'),
        ]),
    ]);
}
