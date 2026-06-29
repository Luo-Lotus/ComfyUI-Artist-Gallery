/**
 * 通用删除确认对话框
 * 支持 Prompt、分类、组合、图片的删除确认，展示详细影响说明
 */
import { h } from '../lib/preact.mjs';
import { useState } from '../lib/hooks.mjs';
import { Dialog, DialogButton } from './Dialog.js';
import { Icon } from '../lib/icons.mjs';

/**
 * 获取删除类型的配置
 */
function getDeleteConfig(type, target, context) {
  const configs = {
    prompt: {
      icon: 'trash-2',
      title: '确认删除 Prompt',
      getMessage: () => {
        const name = target?.name || target?.value || '';
        const lines = [`确定要删除 Prompt "${name}" 吗？`];
        lines.push('将从所有组合中移除此 Prompt，图片文件和图片索引不会被删除。');
        return lines;
      },
    },
    category: {
      icon: 'folder',
      title: '确认删除分类',
      getMessage: () => {
        const name = target?.name || '';
        return [
          `确定要删除分类 "${name}" 吗？`,
          '将递归删除所有子分类、Prompt 和组合，图片文件和图片索引不会被删除。',
          '此操作不可撤销。',
        ];
      },
    },
    combination: {
      icon: 'link',
      title: '确认删除组合',
      getMessage: () => {
        const name = target?.name || '';
        return [
          `确定要删除组合 "${name}" 吗？`,
          '不会影响成员 Prompt 和匹配到的图片。',
        ];
      },
    },
    image: {
      icon: 'image',
      title: '确认删除图片',
      getMessage: () => {
        const imagePath = target?.path || target?.imagePath || '';
        const fileName = imagePath.split('/').pop();
        return [`确定要删除图片 "${fileName}" 吗？`, '图片文件将被永久删除。'];
      },
    },
    batch: {
      icon: 'clipboard-list',
      title: '确认批量删除',
      getMessage: () => {
        const lines = ['将批量删除以下内容：'];
        if (target?.categories?.length > 0) {
          lines.push(`- ${target.categories.length} 个分类（含子分类、Prompt 和组合）`);
        }
        if (target?.prompts?.length > 0) {
          lines.push(`- ${target.prompts.length} 个 Prompt`);
        }
        if (target?.combinations?.length > 0) {
          lines.push(`- ${target.combinations.length} 个组合`);
        }
        if (target?.images?.length > 0) {
          lines.push(`- ${target.images.length} 张图片`);
        }
        lines.push('此操作不可撤销。');
        return lines;
      },
    },
  };

  return configs[type] || configs.prompt;
}

export function DeleteConfirmDialog({ isOpen, type = 'prompt', target, context, onConfirm, onCancel }) {
  const [deleting, setDeleting] = useState(false);

  const config = getDeleteConfig(type, target, context);

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      await onConfirm();
    } finally {
      setDeleting(false);
    }
  };

  const renderContent = () => {
    const messages = config.getMessage();
    return messages.map((msg, i) =>
      h('p', {
        key: i,
        class: i === messages.length - 1 ? 'gallery-delete-warning' : 'gallery-delete-message',
      }, msg),
    );
  };

  if (!isOpen) return null;

  return h(
    Dialog,
    {
      isOpen,
      onClose: onCancel,
      title: config.title,
      titleIcon: h(Icon, { name: config.icon, size: 18 }),
      maxWidth: '450px',
      footer: [
        h(DialogButton, { onClick: onCancel }, '取消'),
        h(
          DialogButton,
          { variant: 'danger', onClick: handleConfirm, loading: deleting },
          deleting ? '删除中...' : '确认删除',
        ),
      ],
    },
    renderContent(),
  );
}
