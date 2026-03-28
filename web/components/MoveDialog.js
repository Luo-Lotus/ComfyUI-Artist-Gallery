/**
 * 移动对话框组件
 * 用于移动分类/画师/图片到其他位置
 */
import { h } from '../lib/preact.mjs';
import { useState, useMemo } from '../lib/hooks.mjs';
import { Dialog, DialogButton } from './Dialog.js';
import { FlatSelector } from './FlatSelector.js';
import { showToast } from './Toast.js';

export function MoveDialog({
    isOpen,
    itemType, // 'category' | 'artist' | 'image'
    item,
    categories,
    artists,
    onClose,
    onMove
}) {
    const [selectedTarget, setSelectedTarget] = useState(null);
    const [moving, setMoving] = useState(false);

    // 计算需要排除的ID列表
    const excludeIds = useMemo(() => {
        const ids = [item?.id];

        if (itemType === 'category') {
            // 排除当前分类及其所有子分类
            const collectChildren = (catId) => {
                const children = categories?.filter(c => c.parentId === catId) || [];
                children.forEach(child => {
                    ids.push(child.id);
                    collectChildren(child.id);
                });
            };
            collectChildren(item?.id);
        }

        return ids;
    }, [item, itemType, categories]);

    const handleMove = async () => {
        if (!selectedTarget) {
            showToast('请选择目标位置', 'warning');
            return;
        }

        setMoving(true);
        try {
            await onMove(item, selectedTarget);
            onClose();
        } catch (error) {
            showToast(`移动失败: ${error.message}`, 'error');
        } finally {
            setMoving(false);
        }
    };

    const getTitle = () => {
        const titles = {
            category: `移动分类 "${item?.name}"`,
            artist: `移动画师 "${item?.displayName || item?.name}"`,
            image: '移动图片'
        };
        return titles[itemType] || '移动';
    };

    const getSelectorType = () => {
        if (itemType === 'image') return 'artist';
        return 'category';
    };

    if (!isOpen || !item) return null;

    return h(Dialog, {
        isOpen,
        onClose,
        title: getTitle(),
        titleIcon: '📦',
        maxWidth: '500px',
        footer: [
            h(DialogButton, { onClick: onClose }, '取消'),
            h(DialogButton, {
                variant: 'primary',
                onClick: handleMove,
                disabled: !selectedTarget || moving
            }, moving ? '移动中...' : '确认移动')
        ]
    }, h('div', { class: 'move-dialog-content' }, [
        selectedTarget && h('div', { class: 'move-target-info' }, [
            h('span', {}, '已选择：'),
            h('span', { class: 'target-name' },
                selectedTarget.type === 'category'
                    ? `📁 ${selectedTarget.name}`
                    : `👤 ${selectedTarget.displayName || selectedTarget.name}`
            )
        ]),
        h(FlatSelector, {
            type: getSelectorType(),
            categories,
            artists,
            currentId: selectedTarget?.id,
            onSelect: setSelectedTarget,
            excludeIds,
            placeholder: '选择目标位置...'
        })
    ]));
}
