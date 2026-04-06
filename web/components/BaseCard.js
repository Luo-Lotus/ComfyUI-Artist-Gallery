/**
 * BaseCard 基础卡片组件
 * 封装分类卡片、画师卡片、组合卡片的共同行为：
 * - CSS 类名计算（卡片类型 + 选择态）
 * - 点击路由（多选模式 / 普通模式，支持 Shift 范围选择）
 * - 右键菜单挂载
 * - 选择态 UI（复选框 + 选中标记，通过 CSS ::after 实现）
 */
import { h } from '../lib/preact.mjs';

export function BaseCard({
    cardType,
    // 选择相关
    selectionMode = false,
    selected = false,
    selectionKey,
    onSelect,
    // 点击
    onClick,
    // 右键菜单
    onContextMenu,
    // 样式
    className = '',
    children,
}) {
    const computedClass = [
        `${cardType}-card`,
        selectionMode ? 'selection-mode' : '',
        selected ? 'selected' : '',
        className,
    ].filter(Boolean).join(' ');

    const handleClick = (e) => {
        if (selectionMode && onSelect) {
            e.stopPropagation();
            onSelect(selectionKey, e.shiftKey);
        } else if (onClick) {
            onClick(e);
        }
    };

    return h('div', {
        class: computedClass,
        onClick: handleClick,
        onContextMenu: onContextMenu || null,
    }, children);
}
