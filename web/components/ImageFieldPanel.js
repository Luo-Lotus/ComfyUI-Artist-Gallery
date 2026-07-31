/**
 * 图片字段管理设置面板
 * 统一列表展示，支持拖拽排序
 */
import { h } from '../lib/preact.mjs';
import { useState, useEffect, useCallback, useRef } from '../lib/hooks.mjs';
import { Icon } from '../lib/icons.mjs';
import { showToast } from './Toast.js';
import { ImageFieldEditDialog } from './ImageFieldEditDialog.js';

export function ImageFieldPanel() {
    const [fields, setFields] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [editingField, setEditingField] = useState(null);
    const [extracting, setExtracting] = useState({});
    const [dragIndex, setDragIndex] = useState(null);
    const [overIndex, setOverIndex] = useState(null);
    const dragCounterRef = useRef(0);

    const loadFields = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/prompt_gallery/image_fields');
            const result = await res.json();
            if (result.success) setFields(result.fields);
        } catch {
            showToast('加载字段失败', 'error');
        }
        setLoading(false);
    }, []);

    useEffect(() => { loadFields(); }, [loadFields]);

    const handleCreate = useCallback(() => {
        setEditingField(null);
        setShowEditDialog(true);
    }, []);

    const handleEdit = useCallback((field) => {
        setEditingField(field);
        setShowEditDialog(true);
    }, []);

    const handleDelete = useCallback(async (field) => {
        if (!confirm(`确定要删除字段「${field.name}」吗？`)) return;
        try {
            const res = await fetch(`/prompt_gallery/image_fields/${field.id}`, { method: 'DELETE' });
            const result = await res.json();
            if (result.success) {
                showToast('已删除', 'success');
                loadFields();
            } else {
                showToast(result.error || '删除失败', 'error');
            }
        } catch (e) {
            showToast('删除失败: ' + e.message, 'error');
        }
    }, [loadFields]);

    const handleExtract = useCallback(async (field) => {
        setExtracting(prev => ({ ...prev, [field.id]: true }));
        try {
            const res = await fetch(`/prompt_gallery/image_fields/${field.id}/extract`, { method: 'POST' });
            const result = await res.json();
            if (result.success) {
                showToast(`提取完成: ${result.options.length} 个选项`, 'success');
                loadFields();
            } else {
                showToast('提取失败: ' + (result.error || ''), 'error');
            }
        } catch (e) {
            showToast('提取失败: ' + e.message, 'error');
        } finally {
            setExtracting(prev => ({ ...prev, [field.id]: false }));
        }
    }, [loadFields]);

    const handleSave = useCallback((savedField) => {
        setFields(prev => {
            const idx = prev.findIndex(f => f.id === savedField.id);
            if (idx >= 0) {
                const next = [...prev];
                next[idx] = savedField;
                return next;
            }
            return [...prev, savedField];
        });
    }, []);

    // ============ 拖拽排序 ============
    const persistOrder = useCallback(async (orderedFields) => {
        try {
            const fieldIds = orderedFields.map(f => f.id);
            const res = await fetch('/prompt_gallery/image_fields/reorder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fieldIds }),
            });
            const result = await res.json();
            if (!result.success) showToast('排序保存失败', 'error');
        } catch {
            showToast('排序保存失败', 'error');
        }
    }, []);

    const handleDragStart = useCallback((e, index) => {
        setDragIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(index));
    }, []);

    const handleDragOver = useCallback((e, index) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setOverIndex(index);
    }, []);

    const handleDragEnter = useCallback((e) => {
        e.preventDefault();
        dragCounterRef.current++;
    }, []);

    const handleDragLeave = useCallback(() => {
        dragCounterRef.current--;
        if (dragCounterRef.current === 0) setOverIndex(null);
    }, []);

    const handleDrop = useCallback((e, dropIndex) => {
        e.preventDefault();
        dragCounterRef.current = 0;
        setOverIndex(null);
        if (dragIndex === null || dragIndex === dropIndex) return;

        setFields(prev => {
            const next = [...prev];
            const [moved] = next.splice(dragIndex, 1);
            next.splice(dropIndex, 0, moved);
            persistOrder(next);
            return next;
        });
        setDragIndex(null);
    }, [dragIndex, persistOrder]);

    const handleDragEnd = useCallback(() => {
        setDragIndex(null);
        setOverIndex(null);
        dragCounterRef.current = 0;
    }, []);

    // ============ 渲染 ============
    if (loading) {
        return h('div', { class: 'settings-panel' }, [
            h('div', { class: 'settings-section-title' }, '图片字段'),
            h('div', { class: 'settings-placeholder' }, [
                h(Icon, { name: 'loader', size: 24, class: 'spin' }),
                h('span', {}, '加载中...'),
            ]),
        ]);
    }

    const renderRow = (field, index) => {
        const isDragging = dragIndex === index;
        const isOver = overIndex === index && dragIndex !== index;
        let rowClass = 'image-field-row';
        if (isDragging) rowClass += ' dragging';
        if (isOver) rowClass += ' drag-over';

        return h('div', {
            key: field.id,
            class: rowClass,
            draggable: true,
            onDragStart: (e) => handleDragStart(e, index),
            onDragOver: (e) => handleDragOver(e, index),
            onDragEnter: handleDragEnter,
            onDragLeave: handleDragLeave,
            onDrop: (e) => handleDrop(e, index),
            onDragEnd: handleDragEnd,
        }, [
            // 拖拽手柄
            h('div', { class: 'image-field-drag-handle', title: '拖拽排序' }),

            // 名称 + 标签
            h('div', { class: 'image-field-info' }, [
                h('span', { class: 'image-field-name' }, field.name),
                field.groupable && h('span', { class: 'image-field-badge groupable' }, '分组'),
                field.renderHtml && h('span', { class: 'image-field-badge html' }, 'HTML'),
                field.options?.length > 0 &&
                    h('span', { class: 'image-field-badge options' }, `${field.options.length} 选项`),
            ]),

            // 操作按钮
            h('div', { class: 'image-field-actions' }, [
                h('button', {
                    class: 'image-field-action-btn',
                    onClick: () => handleExtract(field),
                    disabled: extracting[field.id],
                    title: '提取选项值',
                }, h(Icon, { name: extracting[field.id] ? 'loader' : 'refresh-cw', size: 12, class: extracting[field.id] ? 'spin' : '' })),
                h('button', {
                    class: 'image-field-action-btn',
                    onClick: () => handleEdit(field),
                    title: field.builtin ? '编辑提取代码' : '编辑',
                }, h(Icon, { name: 'edit', size: 12 })),
                !field.builtin && h('button', {
                    class: 'image-field-action-btn danger',
                    onClick: () => handleDelete(field),
                    title: '删除',
                }, h(Icon, { name: 'trash-2', size: 12 })),
            ]),
        ]);
    };

    return h('div', { class: 'settings-panel' }, [
        // 顶部工具栏
        h('div', { class: 'image-field-toolbar' }, [
            h('span', { class: 'settings-section-title' }, '图片字段'),
            h('button', {
                class: 'image-field-add-btn',
                onClick: handleCreate,
            }, [
                h(Icon, { name: 'plus', size: 12 }),
                ' 新增',
            ]),
        ]),

        // 字段列表
        fields.length === 0
            ? h('div', { class: 'image-field-empty' }, '暂无字段，点击「新增」创建')
            : h('div', { class: 'image-field-list' },
                fields.map((f, i) => renderRow(f, i)),
              ),

        // 底部提示
        fields.length > 1 && h('div', { class: 'image-field-hint' }, [
            h(Icon, { name: 'info-circle', size: 12 }),
            ' 拖拽行可调整字段排序',
        ]),

        // 编辑弹窗
        h(ImageFieldEditDialog, {
            isOpen: showEditDialog,
            editItem: editingField,
            fields,
            onClose: () => {
                setShowEditDialog(false);
                setEditingField(null);
            },
            onSave: handleSave,
        }),
    ]);
}
