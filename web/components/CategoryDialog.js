/**
 * 分类编辑对话框
 */
import { h } from '../lib/preact.mjs';
import { useState, useEffect } from '../lib/hooks.mjs';
import { Dialog, DialogButton } from './Dialog.js';
import { Icon } from '../lib/icons.mjs';

export function CategoryDialog({ isOpen, mode, category, categories, currentCategoryId, onClose, onSave }) {
    const [name, setName] = useState('');
    const [parentId, setParentId] = useState(currentCategoryId || 'root');
    const [error, setError] = useState('');

    // 初始化表单
    useEffect(() => {
        if (isOpen && category && mode === 'edit') {
            setName(category.name);
            setParentId(category.parentId || 'root');
        } else if (isOpen && mode === 'add') {
            setName('');
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

        try {
            await onSave({
                name: name.trim(),
                parentId: currentCategoryId || 'root'
            });
        } catch (err) {
            setError(err.message);
        }
    };

    return h(Dialog, {
        isOpen,
        onClose,
        title: mode === 'add' ? '添加分类' : '编辑分类',
        titleIcon: h(Icon, { name: 'folder-plus', size: 18 }),
        maxWidth: '400px',
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
            h('label', {}, '分类名称'),
            h('input', {
                type: 'text',
                value: name,
                onInput: (e) => setName(e.target.value),
                placeholder: '例如: 风景、人物、写实'
            })
        ])
    ]));
}
