/**
 * Artist Gallery Extension
 * 主入口文件 - 使用 Preact 构建的悬浮可拖动图库按钮
 */

import { app } from '../../scripts/app.js';
import { Draggable } from './Draggable.js';
import { Storage } from './utils.js';

// ============ 加载 Preact 库和 Hooks ============
const { h, render, createElement } = await import(
    new URL('./lib/preact.mjs', import.meta.url).href
);
const { useState, useEffect, useCallback, useMemo, useRef } =
    await import(new URL('./lib/hooks.mjs', import.meta.url).href);

// 将 hooks 挂载到全局以便组件使用
self.preactHooks = { useState, useEffect, useCallback, useMemo, useRef };
self.preactCore = { h, render, createElement };

// ============ 加载样式 ============
const styleLink = document.createElement('link');
styleLink.rel = 'stylesheet';
styleLink.href = new URL('./styles/gallery.css', import.meta.url);
document.head.appendChild(styleLink);

// ============ 加载组件 ============
// 动态导入所有组件
const { GalleryModal } = await import(
    new URL('./components/GalleryModal.js', import.meta.url).href
);

// ============ 注册扩展 ============
app.registerExtension({
    name: 'ArtistGallery.GalleryButton',

    async setup() {
        // 创建悬浮按钮
        const floatingButton = document.createElement('div');
        floatingButton.id = 'artist-gallery-floating-btn';
        floatingButton.innerHTML = '🎨';
        document.body.appendChild(floatingButton);

        // 加载保存的位置
        function loadButtonPosition() {
            const pos = Storage.getButtonPosition();
            if (pos) {
                floatingButton.style.left = pos.left + 'px';
                floatingButton.style.top = pos.top + 'px';
                floatingButton.style.right = 'auto';
                floatingButton.style.bottom = 'auto';
            }
        }
        loadButtonPosition();

        // 创建模态框容器
        const modalContainer = document.createElement('div');
        modalContainer.id = 'artist-gallery-modal-container';
        document.body.appendChild(modalContainer);

        // 应用状态
        let isModalOpen = false;

        // 渲染模态框
        function renderModal() {
            render(
                h(GalleryModal, {
                    isOpen: isModalOpen,
                    onClose: () => {
                        isModalOpen = false;
                        renderModal();
                    },
                }),
                modalContainer,
            );
        }

        // 初始化渲染
        renderModal();

        // 创建拖动功能
        const draggable = new Draggable(floatingButton, (hasMoved) => {
            Storage.saveButtonPosition(
                floatingButton.offsetLeft,
                floatingButton.offsetTop,
            );
            if (!hasMoved) {
                isModalOpen = true;
                renderModal();
            }
        });

        // ESC 键关闭模态框
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isModalOpen) {
                isModalOpen = false;
                renderModal();
            }
        });
    },
});
