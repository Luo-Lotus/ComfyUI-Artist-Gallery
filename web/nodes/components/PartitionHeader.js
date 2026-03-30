/**
 * 分区头部组件
 * 显示分区名称和操作按钮
 */
import { h } from '../../lib/preact.mjs';

export function PartitionHeader({ partition, onAction }) {
    // 构建规则指示器
    const renderRuleIndicators = () => {
        const indicators = [];

        if (partition.config.randomMode) {
            indicators.push(h('span', {
                class: 'partition-rule-badge random',
                title: `随机模式：选择 ${partition.config.randomCount} 个画师`,
            }, '🎲'));
        }

        if (partition.config.cycleMode) {
            indicators.push(h('span', {
                class: 'partition-rule-badge cycle',
                title: '循环模式：每次执行只输出一个画师',
            }, '🔄'));
        }

        if (partition.config.saveToGallery === false) {
            indicators.push(h('span', {
                class: 'partition-rule-badge no-save',
                title: '不保存到画廊：图片不会关联到该分区画师',
            }, '🚫'));
        }

        return indicators;
    };

    return h('div', { class: 'partition-header' }, [
        h('div', {
            class: 'partition-info',
            onClick: () => onAction('setDefault', partition.id),
            title: '点击切换为默认分区',
        }, [
            h('span', { class: 'partition-name' }, [
                partition.name,
                !partition.enabled && h('span', { class: 'partition-disabled-badge' }, '(禁用)'),
            ]),
            // 规则指示器
            ...renderRuleIndicators(),
        ]),

        // 分区操作按钮
        h('div', { class: 'partition-actions' }, [
            // 启用/禁用切换
            h('button', {
                class: 'partition-btn toggle',
                onClick: () => onAction('toggle', partition.id),
                title: partition.enabled ? '禁用' : '启用',
            }, partition.enabled ? '🔘' : '⚫'),

            // 配置按钮
            h('button', {
                class: 'partition-btn config',
                onClick: () => onAction('config', partition.id),
                title: '配置分区',
            }, '⚙️'),

            // 删除按钮（默认分区不可删除）
            !partition.isDefault && h('button', {
                class: 'partition-btn delete',
                onClick: () => onAction('delete', partition.id),
                title: '删除分区',
            }, '🗑️'),
        ]),
    ]);
}
