/**
 * Prompt Gallery Extension
 * 主入口文件 - 使用 Preact 构建的悬浮可拖动图库按钮
 */

import { app } from '../../scripts/app.js';
import { Draggable } from './Draggable.js';
import { Storage } from './utils.js';
import { hasEscapeLayers } from './utils/escapeStack.js';

// ============ 加载 Preact 库（使用标准 ES6 import）============
import { h, render } from './lib/preact.mjs';
import { useState, useEffect, useCallback, useMemo, useRef } from './lib/hooks.mjs';

// 将 hooks 和核心函数挂载到全局以便兼容旧代码
self.preactHooks = { useState, useEffect, useCallback, useMemo, useRef };
self.preactCore = { h, render, createElement: h };

// ============ 加载样式 ============
const styleLink = document.createElement('link');
styleLink.rel = 'stylesheet';
styleLink.href = new URL('./styles/gallery.css', import.meta.url);
document.head.appendChild(styleLink);

// ============ 加载组件 ============
const { GalleryModal } = await import('./components/GalleryModal.js');
const { ToastContainer } = await import('./components/Toast.js');

const FLOATING_BUTTON_RIGHT = 0;
const FLOATING_BUTTON_DEFAULT_TOP = 160;

// ============ 注册扩展 ============
app.registerExtension({
  name: 'PromptGallery.GalleryButton',

  async setup() {
    // 创建悬浮按钮
    const floatingButton = document.createElement('div');
    floatingButton.id = 'prompt-gallery-floating-btn';
    floatingButton.innerHTML = '🎨';
    document.body.appendChild(floatingButton);

    function clampButtonTop(top) {
      const maxTop = Math.max(0, window.innerHeight - (floatingButton.offsetHeight || 46));
      return Math.max(0, Math.min(top, maxTop));
    }

    function dockButtonToRight(top = FLOATING_BUTTON_DEFAULT_TOP) {
      floatingButton.style.left = 'auto';
      floatingButton.style.right = `${FLOATING_BUTTON_RIGHT}px`;
      floatingButton.style.top = `${clampButtonTop(top)}px`;
      floatingButton.style.bottom = 'auto';
    }

    // 加载保存的位置。旧版本保存的 left 会被忽略，自动迁移为右侧吸附。
    const savedPosition = Storage.getButtonPosition();
    dockButtonToRight(savedPosition?.top ?? FLOATING_BUTTON_DEFAULT_TOP);

    window.addEventListener('resize', () => {
      const savedTop = Storage.getButtonPosition()?.top ?? floatingButton.offsetTop;
      dockButtonToRight(savedTop);
    });

    // 创建模态框容器
    const modalContainer = document.createElement('div');
    modalContainer.id = 'prompt-gallery-modal-container';
    document.body.appendChild(modalContainer);

    // 创建 Toast 容器
    const toastContainer = document.createElement('div');
    toastContainer.id = 'prompt-gallery-toast-container';
    document.body.appendChild(toastContainer);

    // 应用状态
    let isModalOpen = false;
    let pendingNavigation = null;
    let selectionSession = null;
    let selectionSessionId = 0;

    // 渲染模态框
    function renderModal() {
      render(
        h(GalleryModal, {
          isOpen: isModalOpen,
          onClose: () => {
            isModalOpen = false;
            pendingNavigation = null;
            selectionSession = null;
            renderModal();
          },
          initialNavigation: pendingNavigation,
          selectionSession,
        }),
        modalContainer,
      );
    }

    // 渲染 Toast 容器（只渲染一次）
    render(h(ToastContainer), toastContainer);

    // 初始化渲染
    renderModal();

    // 全局导航函数：从Prompt选择器打开画廊到指定视图
    window.__openPromptGalleryTo = (navigation) => {
      selectionSession = null;
      pendingNavigation = { ...navigation, _ts: Date.now() };
      isModalOpen = true;
      renderModal();
    };

    // Prompt 选择节点专用入口：以只读数据浏览 + 即时选择模式打开画廊。
    window.__openPromptGallerySelector = (options = {}) => {
      selectionSessionId += 1;
      selectionSession = {
        id: selectionSessionId,
        selectedPromptKeys: Array.from(options.selectedPromptKeys || []),
        selectedCategoryIds: Array.from(options.selectedCategoryIds || []),
        onPromptSelectionChange: options.onPromptSelectionChange,
        onCategorySelectionChange: options.onCategorySelectionChange,
      };
      pendingNavigation = {
        type: 'category',
        categoryId: options.initialCategoryId || 'root',
        _ts: Date.now(),
      };
      isModalOpen = true;
      renderModal();
    };

    // 创建拖动功能
    new Draggable(floatingButton, (hasMoved) => {
      Storage.saveButtonPosition(floatingButton.offsetTop);
      if (!hasMoved) {
        selectionSession = null;
        pendingNavigation = null;
        isModalOpen = true;
        renderModal();
      }
    }, { axis: 'y', right: FLOATING_BUTTON_RIGHT });

    // ESC 键关闭模态框（有对话框/灯箱等浮层打开时不关闭画廊，浮层由 escapeStack 处理）
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isModalOpen && !hasEscapeLayers()) {
        isModalOpen = false;
        pendingNavigation = null;
        selectionSession = null;
        renderModal();
      }
    });
  },
});
