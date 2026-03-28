/**
 * 右键菜单组件
 * 类似 antd 的全局菜单实现，不受组件布局影响
 */
import { h } from '../lib/preact.mjs';
import { useEffect, useRef, useState } from '../lib/hooks.mjs';

let globalMenuState = {
    items: null,
    position: null,
    onClose: null
};

// 全局菜单渲染容器
let menuContainer = null;
let menuRoot = null;

// 初始化全局菜单容器
function initGlobalMenu() {
    if (menuContainer) return;

    menuContainer = document.createElement('div');
    menuContainer.id = 'global-context-menu-container';
    menuContainer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 99999;
    `;
    document.body.appendChild(menuContainer);
}

// 渲染全局菜单
function renderGlobalMenu() {
    if (!menuContainer) {
        initGlobalMenu();
    }

    // 清空现有内容
    menuContainer.innerHTML = '';

    if (!globalMenuState.items || !globalMenuState.position) {
        return;
    }

    // 创建菜单元素
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = `${globalMenuState.position.x}px`;
    menu.style.top = `${globalMenuState.position.y}px`;

    // 渲染菜单项
    globalMenuState.items.forEach((item, index) => {
        const menuItem = document.createElement('div');
        menuItem.className = 'context-menu-item';

        // 添加图标
        if (item.icon) {
            const icon = document.createElement('span');
            icon.className = 'context-menu-icon';
            icon.textContent = item.icon;
            menuItem.appendChild(icon);
        }

        // 添加标签
        const label = document.createElement('span');
        label.className = 'context-menu-label';
        label.textContent = item.label;
        menuItem.appendChild(label);

        // 点击事件
        menuItem.addEventListener('click', (e) => {
            e.stopPropagation();
            if (item.action) {
                item.action();
            }
            closeGlobalMenu();
        });

        menu.appendChild(menuItem);
    });

    menuContainer.appendChild(menu);
}

// 关闭全局菜单
function closeGlobalMenu() {
    if (globalMenuState.onClose) {
        globalMenuState.onClose();
    }
    globalMenuState = {
        items: null,
        position: null,
        onClose: null
    };
    if (menuContainer) {
        menuContainer.innerHTML = '';
    }
}

// 全局点击事件监听
function setupGlobalListeners() {
    // 点击其他地方关闭菜单
    window.addEventListener('click', (e) => {
        if (menuContainer && menuContainer.contains(e.target)) {
            return;
        }
        closeGlobalMenu();
    }, true);

    // 右键点击其他地方关闭菜单
    window.addEventListener('contextmenu', (e) => {
        if (menuContainer && menuContainer.contains(e.target)) {
            return;
        }
        closeGlobalMenu();
    }, true);

    // ESC 键关闭菜单
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeGlobalMenu();
        }
    });
}

// 初始化
setupGlobalListeners();

/**
 * 右键菜单 Hook
 */
export function useContextMenu() {
    const showContextMenu = (e, items, onClose) => {
        e.preventDefault();
        e.stopPropagation();

        // 关闭之前的菜单
        closeGlobalMenu();

        // 计算菜单位置
        let x = e.clientX;
        let y = e.clientY;

        // 设置全局菜单状态
        globalMenuState = {
            items,
            position: { x, y },
            onClose: onClose || (() => {})
        };

        // 渲染菜单
        renderGlobalMenu();
    };

    return {
        showContextMenu,
        hideContextMenu: closeGlobalMenu
    };
}

// 导出关闭函数供外部使用
export function closeAllContextMenus() {
    closeGlobalMenu();
}
