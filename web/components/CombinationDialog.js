/**
 * 组合对话框组件
 * 用于创建和编辑组合
 */
import { h } from '../lib/preact.mjs';
import { useState, useEffect, useMemo } from '../lib/hooks.mjs';
import {
    Dialog,
    DialogButton,
    DialogFormGroup,
    DialogFormItem,
} from './Dialog.js';
import { FlatSelector } from './FlatSelector.js';
import { showToast } from './Toast.js';
import { createCombination, updateCombination } from '../utils.js';
import { Icon } from '../lib/icons.mjs';

export function CombinationDialog({
    isOpen,
    mode = 'add',
    combination = null,
    currentCategoryId = 'root',
    artists = [],
    onClose,
    onSave,
}) {
    const [name, setName] = useState('');
    const [selectedArtistNames, setSelectedArtistNames] = useState(new Set());
    const [outputContent, setOutputContent] = useState('');
    const [saving, setSaving] = useState(false);

    // 编辑模式时填充数据
    useEffect(() => {
        if (isOpen && mode === 'edit' && combination) {
            setName(combination.name || '');
            setSelectedArtistNames(new Set(combination.artistKeys || []));
            setOutputContent(combination.outputContent || '');
        } else if (isOpen && mode === 'add') {
            setName('');
            setSelectedArtistNames(new Set());
            setOutputContent('');
        }
    }, [isOpen, mode, combination]);

    // 自动生成的输出内容预览
    const autoOutput = useMemo(() => {
        return Array.from(selectedArtistNames).join(',');
    }, [selectedArtistNames]);

    const toggleArtist = (key, artist) => {
        const artistName = artist.name;
        setSelectedArtistNames((prev) => {
            const next = new Set(prev);
            if (next.has(artistName)) {
                next.delete(artistName);
            } else {
                next.add(artistName);
            }
            return next;
        });
    };

    const handleSubmit = async () => {
        if (!name.trim()) {
            showToast('请输入组合名称', 'warning');
            return;
        }
        if (selectedArtistNames.size === 0) {
            showToast('请至少选择一个画师', 'warning');
            return;
        }

        const artistKeys = Array.from(selectedArtistNames);
        const content = outputContent.trim() || autoOutput;

        setSaving(true);
        try {
            if (mode === 'add') {
                await createCombination({
                    name: name.trim(),
                    categoryId: currentCategoryId,
                    artistKeys,
                    outputContent: content,
                });
                showToast('组合创建成功', 'success');
            } else {
                await updateCombination(combination.id, {
                    name: name.trim(),
                    artistKeys,
                    outputContent: content,
                });
                showToast('组合更新成功', 'success');
            }
            onSave && onSave();
        } catch (err) {
            showToast('操作失败: ' + err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return h(
        Dialog,
        {
            isOpen,
            onClose,
            title: mode === 'add' ? '新建组合' : '编辑组合',
            titleIcon: h(Icon, { name: 'link', size: 18 }),
            maxWidth: '500px',
            footer: [
                h(DialogButton, { onClick: onClose }, '取消'),
                h(
                    DialogButton,
                    {
                        variant: 'primary',
                        onClick: handleSubmit,
                        disabled: saving,
                    },
                    saving ? '保存中...' : mode === 'add' ? '创建' : '保存',
                ),
            ],
        },
        h(DialogFormGroup, {}, [
            // 组合名称
            h(
                DialogFormItem,
                { label: '组合名称' },
                h('input', {
                    type: 'text',
                    class: 'gallery-form-input',
                    value: name,
                    onInput: (e) => setName(e.target.value),
                    placeholder: '输入组合名称',
                }),
            ),

            // 选择画师（使用 FlatSelector 多选模式）
            h(
                DialogFormItem,
                { label: `选择画师 (${selectedArtistNames.size})` },
                h(FlatSelector, {
                    type: 'artist',
                    artists: artists,
                    multiSelect: true,
                    selectedIds: selectedArtistNames,
                    onToggleItem: toggleArtist,
                    placeholder: '搜索画师...',
                }),
            ),

            // 输出内容
            h(
                DialogFormItem,
                { label: '输出内容' },
                h('input', {
                    type: 'text',
                    class: 'gallery-form-input',
                    value: outputContent,
                    onInput: (e) => setOutputContent(e.target.value),
                    placeholder: autoOutput || '逗号连接的画师名称',
                }),
            ),
            h(
                'div',
                { class: 'gallery-form-hint' },
                `预览: ${outputContent.trim() || autoOutput || '(未选择画师)'}`,
            ),
        ]),
    );
}
