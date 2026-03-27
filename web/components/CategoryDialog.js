/**
 * 分类编辑对话框
 */
import { h } from '../lib/preact.mjs';
import { useState, useEffect } from '../lib/hooks.mjs';
import { Dialog, DialogButton } from './Dialog.js';

export function CategoryDialog({ isOpen, mode, category, categories, currentCategoryId, onClose, onSave }) {
    const [name, setName] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [parentId, setParentId] = useState(currentCategoryId || 'root');
    const [error, setError] = useState('');

    // 初始化表单
    useEffect(() => {
        if (isOpen && category && mode === 'edit') {
            setName(category.name);
            setDisplayName(category.displayName);
            setParentId(category.parentId || 'root');
        } else if (isOpen && mode === 'add') {
            setName('');
            setDisplayName('');
            setParentId(currentCategoryId || 'root');
        }
        setError('');
    }, [isOpen, category, mode, currentCategoryId]);

    const handleSubmit = async () => {
        setError('');

        if (!name.trim()) {
            setError('分类名称不能为空');
            return;
        }

        if (!displayName.trim()) {
            setError('显示名称不能为空');
            return;
        }

        try {
            await onSave({
                name: name.trim(),
                displayName: displayName.trim(),
                parentId: mode === 'add' ? parentId : category.parentId
            });
        } catch (err) {
            setError(err.message);
        }
    };

    // 扁平化分类树用于选择父分类
    const flattenCategories = (tree) => {
        const result = [];
        function traverse(node) {
            result.push(node);
            if (node.children) {
                node.children.forEach(traverse);
            }
        }
        tree.forEach(traverse);
        return result;
    };

    const flatCategories = categories ? flattenCategories(categories) : [];

    return h(Dialog, {
        isOpen,
        onClose,
        title: mode === 'add' ? '添加分类' : '编辑分类',
        titleIcon: '📁',
        maxWidth: '450px',
        footer: [
            h(DialogButton, { onClick: onClose }, '取消'),
            h(DialogButton, {
                variant: 'primary',
                onClick: handleSubmit
            }, '保存')
        ]
    }, h('div', { class: 'category-dialog-content' }, [
        error && h('div', { class: 'dialog-error' }, error),

        h('div', { class: 'form-group' }, [
            h('label', {}, '英文名称（唯一标识）'),
            h('input', {
                type: 'text',
                value: name,
                onInput: (e) => setName(e.target.value),
                placeholder: '例如: landscape',
                disabled: mode === 'edit'
            })
        ]),

        h('div', { class: 'form-group' }, [
            h('label', {}, '显示名称'),
            h('input', {
                type: 'text',
                value: displayName,
                onInput: (e) => setDisplayName(e.target.value),
                placeholder: '例如: 风景'
            })
        ]),

        mode === 'add' && h('div', { class: 'form-group' }, [
            h('label', {}, '父分类'),
            h('select', {
                value: parentId,
                onChange: (e) => setParentId(e.target.value)
            },
                flatCategories.map(cat =>
                    h('option', { value: cat.id, key: cat.id }, cat.displayName)
                )
            )
        ])
    ]));
}
