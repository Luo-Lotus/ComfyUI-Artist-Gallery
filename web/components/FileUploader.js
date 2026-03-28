/**
 * 文件上传组件
 * 支持拖拽上传和多文件选择
 */

import { h } from '../lib/preact.mjs';
import { useState, useRef } from '../lib/hooks.mjs';
import { showToast } from './Toast.js';

export function FileUploader({ files, onChange, onPreview }) {
    const [dragging, setDragging] = useState(false);
    const fileInputRef = useRef(null);

    const handleFileSelect = (newFiles) => {
        // 验证类型
        const validFiles = newFiles.filter(file => {
            if (!file.type.match(/image\/(png|jpeg|jpg|webp)/)) {
                showToast(`${file.name} 不是支持的图片格式`, 'warning');
                return false;
            }
            return true;
        });

        if (validFiles.length > 0) {
            onChange([...files, ...validFiles]);

            // 触发预览（如果提供了回调）
            if (onPreview) {
                // 延迟触发，确保状态已更新
                setTimeout(() => onPreview(validFiles), 100);
            }
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);

        const newFiles = Array.from(e.dataTransfer.files);
        handleFileSelect(newFiles);
    };

    const handleClick = () => {
        fileInputRef.current.click();
    };

    const handleInputChange = (e) => {
        const newFiles = Array.from(e.target.files);
        handleFileSelect(newFiles);
        // 清空input，允许重复选择同一文件
        e.target.value = '';
    };

    const removeFile = (index) => {
        const newFiles = files.filter((_, i) => i !== index);
        onChange(newFiles);
    };

    const formatFileSize = (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    return h('div', { class: 'import-file-uploader' }, [
        // 拖拽区域
        h('div', {
            class: `drag-drop-zone ${dragging ? 'dragging' : ''}`,
            onDragOver: handleDragOver,
            onDragLeave: handleDragLeave,
            onDrop: handleDrop,
            onClick: handleClick
        }, [
            h('div', { class: 'drag-drop-icon' }, '📁'),
            h('div', { class: 'drag-drop-text' }, '拖拽图片到此处或点击选择'),
            h('div', { class: 'drag-drop-hint' },
                '支持PNG、JPG、WEBP格式'
            )
        ]),

        // 隐藏的文件输入
        h('input', {
            type: 'file',
            ref: fileInputRef,
            style: { display: 'none' },
            multiple: true,
            accept: 'image/png,image/jpeg,image/webp',
            onChange: handleInputChange
        }),

        // 文件列表
        files.length > 0 && h('div', { class: 'file-list' },
            files.map((file, index) =>
                h('div', { class: 'file-item', key: index }, [
                    h('span', { class: 'file-name' }, file.name),
                    h('span', { class: 'file-size' }, formatFileSize(file.size)),
                    h('button', {
                        class: 'file-remove',
                        onClick: (e) => {
                            e.stopPropagation();
                            removeFile(index);
                        },
                        title: '移除'
                    }, '✕')
                ])
            )
        ),

        // 统计信息
        files.length > 0 && h('div', { class: 'file-stats' },
            `已选择 ${files.length} 个文件`
        )
    ]);
}
