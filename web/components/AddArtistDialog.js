/**
 * 添加/编辑画师对话框组件（使用通用Dialog重构）
 */
import { h } from '../lib/preact.mjs';
import { useState } from '../lib/hooks.mjs';
import { showToast } from './Toast.js';
import {
    addArtist,
    updateArtist,
    updateArtistByKey,
    addArtistsBatch,
} from '../services/artistApi.js';
import {
    Dialog,
    DialogButton,
    DialogFormGroup,
    DialogFormItem,
} from './Dialog.js';

export function AddArtistDialog({
    isOpen,
    mode,
    editModeArtist,
    categories,
    currentCategoryId,
    onClose,
    onSave,
}) {
    // ============ 表单状态 ============
    const [addArtistMode, setAddArtistMode] = useState('single');
    const [newArtistName, setNewArtistName] = useState('');
    const [newArtistDisplayName, setNewArtistDisplayName] = useState('');
    const [batchArtistText, setBatchArtistText] = useState('');
    const [selectedCategoryId, setSelectedCategoryId] = useState(
        currentCategoryId || 'root',
    );
    console.log(currentCategoryId);

    // ============ 工具函数 ============

    const resetForm = () => {
        setNewArtistName('');
        setNewArtistDisplayName('');
        setBatchArtistText('');
        setAddArtistMode('single');
    };

    const parseBatchText = (text) => {
        const lines = text
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line);
        return lines.map((line) => {
            const parts = line.split(',');
            return {
                name: parts[0].trim(),
                displayName: parts[1]?.trim() || parts[0].trim(),
            };
        });
    };

    const validateSingleForm = () => {
        if (!newArtistName.trim()) {
            showToast('请输入画师名称', 'warning');
            return false;
        }
        return true;
    };

    const validateBatchForm = () => {
        if (!batchArtistText.trim()) {
            showToast('请输入画师名称列表', 'warning');
            return false;
        }
        return true;
    };

    // ============ 保存处理 ============

    const handleSingleSave = async () => {
        if (!validateSingleForm()) return;

        const artistData = {
            name: newArtistName,
            displayName: newArtistDisplayName,
            categoryId: editModeArtist
                ? editModeArtist.categoryId
                : selectedCategoryId,
        };

        try {
            let data;
            if (editModeArtist) {
                // 使用组合键更新画师（后端会自动处理映射更新）
                data = await updateArtistByKey(
                    editModeArtist.categoryId,
                    editModeArtist.name,
                    artistData
                );
            } else {
                // 添加新画师
                data = await addArtist(artistData);
            }

            if (data.success) {
                showToast(
                    editModeArtist ? '画师更新成功' : '画师添加成功',
                    'success',
                );
                resetForm();
                onSave();
            } else {
                showToast(data.error || '操作失败', 'error');
            }
        } catch (error) {
            showToast('操作失败: ' + error.message, 'error');
        }
    };

    const handleBatchSave = async () => {
        if (!validateBatchForm()) return;

        const artistsData = parseBatchText(batchArtistText);

        try {
            const data = await addArtistsBatch(artistsData);

            if (data.success) {
                showToast(
                    `成功添加 ${data.addedCount} 个画师${data.failedCount > 0 ? `，失败 ${data.failedCount} 个` : ''}`,
                    data.failedCount > 0 ? 'warning' : 'success',
                );
                resetForm();
                onSave();
            } else {
                showToast(data.error || '添加失败', 'error');
            }
        } catch (error) {
            showToast('添加失败: ' + error.message, 'error');
        }
    };

    const handleSave = () => {
        if (addArtistMode === 'single') {
            handleSingleSave();
        } else {
            handleBatchSave();
        }
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    // ============ 编辑模式处理 ============
    if (editModeArtist && mode === 'edit' && !newArtistName) {
        setNewArtistName(editModeArtist.name);
        setNewArtistDisplayName(editModeArtist.displayName || '');
        setSelectedCategoryId(editModeArtist.categoryId || 'root');
        setAddArtistMode('single');
    } else if (isOpen && mode === 'add') {
        // 添加模式时，使用当前分类
        setSelectedCategoryId(currentCategoryId || 'root');
    }

    // ============ 渲染函数 ============

    /**
     * 渲染模式切换标签
     */
    const renderTabs = () => {
        if (editModeArtist) return null;

        return h('div', { class: 'gallery-dialog-tabs' }, [
            h(
                'button',
                {
                    class: `gallery-modal-btn ${addArtistMode === 'single' ? 'primary' : ''} gallery-dialog-tab`,
                    onClick: () => setAddArtistMode('single'),
                },
                '单个添加',
            ),
            h(
                'button',
                {
                    class: `gallery-modal-btn ${addArtistMode === 'batch' ? 'primary' : ''} gallery-dialog-tab`,
                    onClick: () => setAddArtistMode('batch'),
                },
                '批量添加',
            ),
        ]);
    };

    /**
     * 渲染单个添加表单
     */
    const renderSingleForm = () => {
        return h(DialogFormGroup, {}, [
            h(
                DialogFormItem,
                {
                    label: '画师名称（唯一标识）',
                },
                h('input', {
                    type: 'text',
                    value: newArtistName,
                    onInput: (e) => setNewArtistName(e.target.value),
                    placeholder: '如: artist1',
                    class: 'gallery-form-input',
                }),
            ),
            h(
                DialogFormItem,
                {
                    label: '显示名称（可选）',
                },
                h('input', {
                    type: 'text',
                    value: newArtistDisplayName,
                    onInput: (e) => setNewArtistDisplayName(e.target.value),
                    placeholder: '如: 艺术家一',
                    class: 'gallery-form-input',
                }),
            ),
            categories &&
                categories.length > 0 &&
                h(
                    DialogFormItem,
                    {
                        label: '所属分类',
                    },
                    h(
                        'select',
                        {
                            value: selectedCategoryId,
                            onInput: (e) =>
                                setSelectedCategoryId(e.target.value),
                            class: 'gallery-form-input',
                        },
                        categories.map((cat) =>
                            h(
                                'option',
                                { value: cat.id, key: cat.id },
                                cat.name,
                            ),
                        ),
                    ),
                ),
        ]);
    };

    /**
     * 渲染批量添加表单
     */
    const renderBatchForm = () => {
        return h(
            DialogFormItem,
            {
                label: '画师列表（每行一个，格式: 名称,显示名称 或仅名称）',
            },
            h('textarea', {
                value: batchArtistText,
                onInput: (e) => setBatchArtistText(e.target.value),
                placeholder: 'artist1,艺术家一\nartist2,Artist Two\nartist3',
                rows: 10,
                class: 'gallery-form-textarea',
            }),
        );
    };

    /**
     * 渲染表单内容
     */
    const renderForm = () => {
        return addArtistMode === 'single'
            ? renderSingleForm()
            : renderBatchForm();
    };

    /**
     * 渲染操作按钮
     */
    const renderFooter = () => {
        return [
            h(
                DialogButton,
                {
                    onClick: handleClose,
                },
                '取消',
            ),
            h(
                DialogButton,
                {
                    variant: 'primary',
                    onClick: handleSave,
                },
                editModeArtist ? '保存' : '确定',
            ),
        ];
    };

    // ============ 主渲染 ============

    return h(
        Dialog,
        {
            isOpen,
            onClose: handleClose,
            title: editModeArtist ? '编辑画师' : '添加画师',
            titleIcon: editModeArtist ? '✏️' : '➕',
            maxWidth: '500px',
            footer: renderFooter(),
        },
        [renderTabs(), renderForm()],
    );
}
