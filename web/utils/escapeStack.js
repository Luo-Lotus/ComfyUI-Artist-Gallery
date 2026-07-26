/**
 * Escape 层级栈
 * 管理多层浮层（对话框 > 灯箱 > 画廊）的 Esc 关闭顺序：
 * 一次 Esc 只关闭最顶层的浮层。
 *
 * 用法:
 *   const pop = pushEscapeHandler(() => close());
 *   // 关闭/卸载时调用 pop()
 */

const stack = [];
let listenerInstalled = false;

function ensureListener() {
  if (listenerInstalled) return;
  listenerInstalled = true;
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape') return;
      if (stack.length === 0) return;
      // 只让最顶层的浮层响应，并阻止事件继续传播（避免画廊同时关闭）
      e.stopPropagation();
      e.preventDefault();
      const top = stack[stack.length - 1];
      top();
    },
    true,
  );
}

/**
 * 注册一个 Esc 处理器（新浮层打开时调用）
 * @param {Function} handler - Esc 按下时调用（仅当此层是最顶层）
 * @returns {Function} pop - 注销函数（浮层关闭时调用）
 */
export function pushEscapeHandler(handler) {
  ensureListener();
  stack.push(handler);
  return () => {
    const idx = stack.indexOf(handler);
    if (idx >= 0) stack.splice(idx, 1);
  };
}

/**
 * 是否有浮层注册在栈中（供全局 Esc 处理判断）
 */
export function hasEscapeLayers() {
  return stack.length > 0;
}
