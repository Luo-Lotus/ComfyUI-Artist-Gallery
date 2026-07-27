/**
 * 通用对话框组件
 * 可复用的模态框组件，支持自定义内容
 */
import { h } from '../lib/preact.mjs';
import { useEffect, useRef } from '../lib/hooks.mjs';
import { Icon } from '../lib/icons.mjs';
import { pushEscapeHandler } from '../utils/escapeStack.js';

export function Dialog({
  isOpen,
  onClose,
  title,
  titleIcon,
  children,
  footer,
  maxWidth = '500px',
  maxHeight = '500px',
  height,
  showCloseButton = true,
  closeOnOverlayClick = true,
  className = '',
}) {
  const contentRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // 打开时注册 Esc 层级栈：一次 Esc 只关最顶层
  useEffect(() => {
    if (!isOpen) return;
    const pop = pushEscapeHandler(() => {
      if (onCloseRef.current) onCloseRef.current();
    });
    return pop;
  }, [isOpen]);

  // 打开时聚焦第一个输入框，否则聚焦对话框容器
  useEffect(() => {
    if (!isOpen) return;
    const el = contentRef.current;
    if (!el) return;
    const focusable = el.querySelector('input:not([type="hidden"]), textarea');
    (focusable || el).focus();
  }, [isOpen]);

  // 键盘支持：Escape 关闭（兜底），Enter 触发主按钮
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key === 'Enter') {
      const tag = e.target.tagName;
      if (tag === 'TEXTAREA' || tag === 'SELECT') return;
      const el = contentRef.current;
      if (!el) return;
      const primaryBtn = el.querySelector(
        '.gallery-dialog-actions .gallery-modal-btn.primary, .gallery-dialog-actions .gallery-modal-btn.danger',
      );
      if (!primaryBtn || primaryBtn.disabled || primaryBtn.classList.contains('loading')) return;
      e.preventDefault();
      e.stopPropagation();
      primaryBtn.click();
    }
  };

  // ============ 渲染函数 ============

  /**
   * 渲染对话框头部
   */
  const renderHeader = () => {
    return h('div', { class: 'gallery-modal-header' }, [
      h('div', { class: 'gallery-modal-title' }, [titleIcon && h('span', {}, titleIcon), h('span', {}, title)]),
      showCloseButton &&
        h(
          'button',
          {
            class: 'gallery-modal-btn primary',
            onClick: onClose,
          },
          h(Icon, { name: 'x', size: 14 }),
        ),
    ]);
  };

  /**
   * 渲染对话框主体
   */
  const renderBody = () => {
    return h('div', { class: 'gallery-modal-body' }, children);
  };

  /**
   * 渲染底部操作区
   */
  const renderFooter = () => {
    if (!footer) return null;
    return h('div', { class: 'gallery-dialog-actions' }, footer);
  };

  // ============ 主渲染 ============

  if (!isOpen) return null;

  return h(
    'div',
    {
      class: `gallery-modal-overlay open ${className}`,
      style: { zIndex: 20000 },
      onClick: (e) => {
        // 阻止冒泡到父级（画廊）遮罩：弹窗遮罩复用了 gallery-modal-overlay 类，
        // 否则点击弹窗背景会同时触发画廊遮罩的关闭逻辑，导致画廊被一起关闭。
        e.stopPropagation();
        if (closeOnOverlayClick && e.target.classList.contains('gallery-modal-overlay')) {
          onClose();
        }
      },
      onKeyDown: handleKeyDown,
    },
    h(
      'div',
      {
        class: 'gallery-modal-content gallery-dialog-content',
        style: { maxWidth, maxHeight, height },
        role: 'dialog',
        'aria-modal': 'true',
        tabindex: '-1',
        ref: contentRef,
        onClick: (e) => e.stopPropagation(),
      },
      [renderHeader(), renderBody(), renderFooter()],
    ),
  );
}

/**
 * 对话框操作按钮组件
 */
export function DialogButton({ children, onClick, variant = 'default', className = '', disabled = false, loading = false }) {
  const variantClass = variant === 'primary' ? 'primary' : variant === 'danger' ? 'danger' : '';

  return h(
    'button',
    {
      class: `gallery-modal-btn ${variantClass} ${className} ${loading ? 'loading' : ''} ${disabled && !loading ? 'disabled' : ''}`.trim(),
      onClick: loading ? undefined : onClick,
      disabled: disabled || loading,
    },
    children,
  );
}

/**
 * 对话框表单组组件
 */
export function DialogFormGroup({ children, style }) {
  return h('div', { class: 'gallery-form-group', style }, children);
}

/**
 * 对话框表单项组件
 */
export function DialogFormItem({ children, label }) {
  return h('div', { class: 'gallery-form-item' }, [
    label && h('label', { class: 'gallery-form-label' }, label),
    children,
  ]);
}
