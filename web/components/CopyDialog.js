/**
 * 复制对话框组件
 * 用于复制画师、分类或图片到其他位置
 */
import { h } from '../lib/preact.mjs';
import { useState, useMemo } from '../lib/hooks.mjs';
import { Dialog, DialogButton } from './Dialog.js';
import { FlatSelector } from './FlatSelector.js';
import { showToast } from './Toast.js';

export function CopyDialog({
    isOpen,
    itemType, // 'category' | 'artist' | 'image'
    item,
    categories,
    artists,
    onClose,
    onCopy,
}) {
    const [selectedTarget, setSelectedTarget] = useState(null);
    const [newName, setNewName] = useState('');
    const [showNameInput, setShowNameInput] = useState(false);

    // 过滤掉自己（不能复制到自己）
    const excludeIds = useMemo(() => {
        if (!item) return [];
        if (itemType === 'category') {
            // 排除自己和所有子分类
            const exclude = [item.id];
            const getChildren = (catId) => {
                const children = categories.filter(c => c.parentId === catId);
                children.forEach(child => {
                    exclude.push(child.id);
                    getChildren(child.id);
                });
            };
            getChildren(item.id);
            return exclude;
        } else if (itemType === 'artist') {
            return [item.id];
        } else {
            return [];
        }
    }, [item, itemType, categories]);

    const targetType = useMemo(() => {
        if (itemType === 'category') return 'category';
        if (itemType === 'artist') return 'category';
        if (itemType === 'image') return 'artist';
        return 'category';
    }, [itemType]);

    const handleCopy = async () => {
        if (!selectedTarget) {
            showToast('请选择目标位置', 'warning');
            return;
        }

        try {
            await onCopy(item, selectedTarget, newName);
            onClose();
        } catch (error) {
            showToast(`复制失败: ${error.message}`, 'error');
        }
    };

    const handleTargetSelect = (target) => {
        setSelectedTarget(target);

        // 如果是复制画师，可以修改名称
        if (itemType === 'artist') {
            setShowNameInput(true);
            setNewName(item.name);
        } else {
            setShowNameInput(false);
            setNewName('');
        }
    };

    // 标题和图标
    const getTitle = () => {
        if (itemType === 'category') return '复制分类';
        if (itemType === 'artist') return '复制画师';
        if (itemType === 'image') return '复制图片';
        return '复制';
    };

    const getTitleIcon = () => {
        if (itemType === 'category') return '📋';
        if (itemType === 'artist') return '👤';
        if (itemType === 'image') return '🖼️';
        return '📋';
    };

    const getItemName = () => {
        if (!item) return '';
        if (itemType === 'category') return item.name;
        if (itemType === 'artist') return item.displayName || item.name;
        if (itemType === 'image') return '图片';
        return '';
    };

    if (!isOpen) return null;

    return h(
        Dialog,
        {
            isOpen,
            onClose,
            title: getTitle(),
            titleIcon: getTitleIcon(),
            maxWidth: '600px',
            footer: [
                h(DialogButton, { onClick: onClose }, '取消'),
                h(
                    DialogButton,
                    {
                        variant: 'primary',
                        onClick: handleCopy,
                        disabled: !selectedTarget,
                    },
                    '复制',
                ),
            ],
        },
        [
            // 源项目信息
            h('div', { class: 'copy-dialog-source' }, [
                h('div', { class: 'copy-dialog-label' }, '源项目：'),
                h('div', { class: 'copy-dialog-source-name' }, getItemName()),
            ]),

            // 目标选择器
            h('div', { class: 'copy-dialog-target-section' }, [
                h('div', { class: 'copy-dialog-label' }, '选择目标：'),
                h(
                    'div',
                    { class: 'copy-dialog-selector-wrapper' },
                    h(FlatSelector, {
                        type: targetType,
                        categories,
                        artists,
                        excludeIds,
                        currentId: null,
                        onSelect: handleTargetSelect,
                        placeholder: '搜索目标...',
                    })
                ),
            ]),

            // 新名称输入（仅复制画师时显示）
            showNameInput &&
                h('div', { class: 'copy-dialog-name-section' }, [
                    h('div', { class: 'copy-dialog-label' }, '新名称（可选）：'),
                    h('input', {
                        class: 'gallery-form-input',
                        type: 'text',
                        value: newName,
                        onInput: (e) => setNewName(e.target.value),
                        placeholder: '留空则使用原名称',
                    }),
                ]),

            // 已选择提示
            selectedTarget &&
                h('div', { class: 'copy-dialog-selected' }, [
                    h('span', { class: 'copy-dialog-selected-label' }, '已选择：'),
                    h(
                        'span',
                        { class: 'copy-dialog-selected-value' },
                        selectedTarget.type === 'category'
                            ? `📁 ${selectedTarget.name}`
                            : `👤 ${selectedTarget.displayName || selectedTarget.name}`
                    ),
                ]),
        ]
    );
}
