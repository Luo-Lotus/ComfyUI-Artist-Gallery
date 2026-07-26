/**
 * 移动对话框组件
 * 用于移动分类或 Prompt 到其他分类
 */
import { h } from '../lib/preact.mjs';
import { useState, useMemo, useEffect } from '../lib/hooks.mjs';
import { Dialog, DialogButton } from './Dialog.js';
import { FlatSelector } from './FlatSelector.js';
import { showToast } from './Toast.js';
import { Icon } from '../lib/icons.mjs';

export function MoveDialog({
  isOpen,
  itemType, // 'category' | 'prompt'
  item,
  categories,
  onClose,
  onMove,
}) {
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [moving, setMoving] = useState(false);

  // 打开时重置状态（对话框常驻挂载，状态会跨次打开残留）
  useEffect(() => {
    if (isOpen) {
      setSelectedTarget(null);
      setMoving(false);
    }
  }, [isOpen]);

  // 计算需要排除的ID列表
  const excludeIds = useMemo(() => {
    const ids = [];

    if (itemType === 'category') {
      // 排除当前分类及其所有子分类
      ids.push(item?.id);
      const collectChildren = (catId) => {
        const children = categories?.filter((c) => c.parentId === catId) || [];
        children.forEach((child) => {
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
      prompt: `移动Prompt "${item?.name || item?.value}"`,
    };
    return titles[itemType] || '移动';
  };

  if (!isOpen || !item) return null;

  return h(
    Dialog,
    {
      isOpen,
      onClose,
      title: getTitle(),
      titleIcon: h(Icon, { name: 'move', size: 18 }),
      maxWidth: '500px',
      footer: [
        h(DialogButton, { onClick: onClose }, '取消'),
        h(
          DialogButton,
          {
            variant: 'primary',
            onClick: handleMove,
            disabled: !selectedTarget || moving,
          },
          moving ? '移动中...' : '确认移动',
        ),
      ],
    },
    h('div', { class: 'move-dialog-content' }, [
      selectedTarget &&
        h('div', { class: 'move-target-info' }, [
          h('span', {}, '已选择：'),
          h(
            'span',
            { class: 'target-name' },
            selectedTarget.type === 'category'
              ? [h(Icon, { name: 'folder', size: 14 }), ' ', selectedTarget.name]
              : [h(Icon, { name: 'user', size: 14 }), ' ', selectedTarget.name || selectedTarget.value],
          ),
        ]),
      h(FlatSelector, {
        type: 'category',
        categories,
        currentId: selectedTarget?.id,
        onSelect: setSelectedTarget,
        excludeIds,
        placeholder: '选择目标位置...',
      }),
    ]),
  );
}
