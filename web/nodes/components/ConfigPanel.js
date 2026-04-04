/**
 * 节点风格的配置面板
 * 直接在节点内显示，不使用模态对话框
 */
import { h } from '../../lib/preact.mjs';
import { useState } from '../../lib/hooks.mjs';
import { Icon } from '../../lib/icons.mjs';

export function GlobalConfigPanel({ config, onChange, onClose }) {
    const [format, setFormat] = useState(config.format || '{content}');
    const [randomMode, setRandomMode] = useState(config.randomMode || false);
    const [randomCount, setRandomCount] = useState(config.randomCount || 3);
    const [cycleMode, setCycleMode] = useState(config.cycleMode || false);

    const handleSave = () => {
        onChange({
            format,
            randomMode,
            randomCount,
            cycleMode,
        });
        onClose();
    };

    return h('div', { class: 'node-config-panel' }, [
        h('div', { class: 'node-config-header' }, [
            h('span', { class: 'node-config-header-title' }, [h(Icon, { name: 'settings', size: 14 }), ' 全局配置']),
            h(
                'button',
                {
                    class: 'node-config-close',
                    onClick: onClose,
                },
                h(Icon, { name: 'x', size: 14 }),
            ),
        ]),
        h('div', { class: 'node-config-body' }, [
            h('div', { class: 'node-config-section' }, [
                h('label', null, '单画师格式'),
                h('input', {
                    type: 'text',
                    class: 'node-config-input',
                    value: format,
                    onInput: (e) => setFormat(e.target.value),
                    placeholder: '{content}',
                }),
                h(
                    'div',
                    { class: 'node-config-hint' },
                    '示例: ({content}:{random(1,1.5,0.1)})',
                ),
            ]),
            h('div', { class: 'node-config-section' }, [
                h('label', null, '多画师随机'),
                h('div', { class: 'node-config-radio-group' }, [
                    h('label', { class: 'node-config-radio' }, [
                        h('input', {
                            type: 'radio',
                            name: 'random-mode',
                            checked: !randomMode,
                            onChange: () => setRandomMode(false),
                        }),
                        h('span', null, '禁用（使用所有画师）'),
                    ]),
                    h('label', { class: 'node-config-radio' }, [
                        h('input', {
                            type: 'radio',
                            name: 'random-mode',
                            checked: randomMode,
                            onChange: () => setRandomMode(true),
                        }),
                        h('span', null, '启用随机'),
                        randomMode &&
                            h('input', {
                                type: 'number',
                                class: 'node-config-number',
                                min: 1,
                                value: randomCount,
                                onInput: (e) =>
                                    setRandomCount(
                                        parseInt(e.target.value) || 1,
                                    ),
                            }),
                        randomMode && h('span', null, '个'),
                    ]),
                ]),
            ]),
            h('div', { class: 'node-config-section' }, [
                h('label', null, '循环模式'),
                h('div', { class: 'node-config-radio-group' }, [
                    h('label', { class: 'node-config-radio' }, [
                        h('input', {
                            type: 'radio',
                            name: 'cycle-mode',
                            checked: !cycleMode,
                            onChange: () => setCycleMode(false),
                        }),
                        h('span', null, '禁用'),
                    ]),
                    h('label', { class: 'node-config-radio' }, [
                        h('input', {
                            type: 'radio',
                            name: 'cycle-mode',
                            checked: cycleMode,
                            onChange: () => setCycleMode(true),
                        }),
                        h('span', null, '启用（每次输出一个画师）'),
                    ]),
                ]),
            ]),
        ]),
        h('div', { class: 'node-config-footer' }, [
            h(
                'button',
                {
                    class: 'node-config-btn',
                    onClick: onClose,
                },
                '取消',
            ),
            h(
                'button',
                {
                    class: 'node-config-btn primary',
                    onClick: handleSave,
                },
                '保存',
            ),
        ]),
    ]);
}

export function CategoryConfigPanel({
    config,
    globalConfig,
    categoryName,
    onChange,
    onClose,
}) {
    const [enabled, setEnabled] = useState(config?.enabled || false);
    const [format, setFormat] = useState(
        config?.format || globalConfig?.format || '{content}',
    );
    const [randomMode, setRandomMode] = useState(
        (config?.randomMode ?? globalConfig?.randomMode) || false,
    );
    const [randomCount, setRandomCount] = useState(
        (config?.randomCount ?? globalConfig?.randomCount) || 3,
    );

    const handleSave = () => {
        if (!enabled) {
            onChange(null); // 删除配置
        } else {
            onChange({
                enabled: true,
                format,
                randomMode,
                randomCount,
            });
        }
        onClose();
    };

    return h('div', { class: 'node-config-panel' }, [
        h('div', { class: 'node-config-header' }, [
            h('span', { class: 'node-config-header-title' }, [h(Icon, { name: 'settings', size: 14 }), ` ${categoryName} - 配置`]),
            h(
                'button',
                {
                    class: 'node-config-close',
                    onClick: onClose,
                },
                h(Icon, { name: 'x', size: 14 }),
            ),
        ]),
        h('div', { class: 'node-config-body' }, [
            h('div', { class: 'node-config-section' }, [
                h('label', { class: 'node-config-checkbox' }, [
                    h('input', {
                        type: 'checkbox',
                        checked: enabled,
                        onChange: (e) => setEnabled(e.target.checked),
                    }),
                    h('span', null, '使用独立配置（覆盖全局配置）'),
                ]),
            ]),
            enabled
                ? [
                      h('div', { class: 'node-config-section' }, [
                          h('label', null, '单画师格式'),
                          h('input', {
                              type: 'text',
                              class: 'node-config-input',
                              value: format,
                              onInput: (e) => setFormat(e.target.value),
                              placeholder: '{content}',
                          }),
                      ]),
                      h('div', { class: 'node-config-section' }, [
                          h('label', null, '多画师随机'),
                          h('div', { class: 'node-config-radio-group' }, [
                              h('label', { class: 'node-config-radio' }, [
                                  h('input', {
                                      type: 'radio',
                                      name: 'cat-random-mode',
                                      checked: !randomMode,
                                      onChange: () => setRandomMode(false),
                                  }),
                                  h('span', null, '禁用'),
                              ]),
                              h('label', { class: 'node-config-radio' }, [
                                  h('input', {
                                      type: 'radio',
                                      name: 'cat-random-mode',
                                      checked: randomMode,
                                      onChange: () => setRandomMode(true),
                                  }),
                                  h('span', null, '启用随机'),
                                  randomMode &&
                                      h('input', {
                                          type: 'number',
                                          class: 'node-config-number',
                                          min: 1,
                                          value: randomCount,
                                          onInput: (e) =>
                                              setRandomCount(
                                                  parseInt(e.target.value) || 1,
                                              ),
                                      }),
                                  randomMode && h('span', null, '个'),
                              ]),
                          ]),
                      ]),
                  ]
                : [
                      h('div', { class: 'node-config-section disabled' }, [
                          h('div', { class: 'node-config-info' }, [
                              h('span', null, '当前使用全局配置：'),
                              h(
                                  'code',
                                  null,
                                  globalConfig?.format || '{content}',
                              ),
                          ]),
                      ]),
                  ],
        ]),
        h('div', { class: 'node-config-footer' }, [
            h(
                'button',
                {
                    class: 'node-config-btn',
                    onClick: onClose,
                },
                '取消',
            ),
            h(
                'button',
                {
                    class: 'node-config-btn primary',
                    onClick: handleSave,
                },
                '保存',
            ),
        ]),
    ]);
}
