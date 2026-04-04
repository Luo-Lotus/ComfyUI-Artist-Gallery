/**
 * SVG 图标库
 * 基于 Lucide 图标（MIT 协议）的 path 数据
 * 导出 Icon Preact 组件和 iconToSvg 字符串辅助函数
 */
import { h } from './preact.mjs';

// 图标 path 数据（单 path 图标用字符串，多 path 图标用数组）
const ICONS = {
    search: ['M21 21l-4.35-4.35', 'M11 19a8 8 0 100-16 8 8 0 000 16z'],
    'trash-2': ['M3 6h18', 'M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6', 'M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2', 'M10 11v6', 'M14 11v6'],
    copy: ['M20 9h-9a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-9a2 2 0 00-2-2z', 'M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1'],
    folder: ['M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z'],
    'folder-plus': ['M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z', 'M12 11v6', 'M9 14h6'],
    plus: ['M12 5v14', 'M5 12h14'],
    link: ['M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71'],
    download: ['M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
    upload: ['M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'],
    'refresh-cw': ['M1 4v6h6', 'M23 20v-6h-6', 'M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15'],
    x: ['M18 6L6 18', 'M6 6l12 12'],
    star: ['M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.26L12 2z'],
    image: ['M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2z', 'M8.5 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3z', 'M21 15l-5-5L5 21'],
    'arrow-left': ['M19 12H5', 'M12 19l-7-7 7-7'],
    'arrow-up': ['M12 19V5', 'M5 12l7-7 7 7'],
    'arrow-down': ['M12 5v14', 'M19 12l-7 7-7-7'],
    edit: ['M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7', 'M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z'],
    'check-circle': ['M22 11.08V12a10 10 0 11-5.93-9.14', 'M22 4L12 14.01l-3-3'],
    'x-circle': ['M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2s10 4.477 10 10z', 'M15 9l-6 6', 'M9 9l6 6'],
    'alert-triangle': ['M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z', 'M12 9v4', 'M12 17h.01'],
    'info-circle': ['M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2s10 4.477 10 10z', 'M12 16v-4', 'M12 8h.01'],
    'clipboard-list': ['M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2', 'M9 2h6a1 1 0 011 1v2a1 1 0 01-1 1H9a1 1 0 01-1-1V3a1 1 0 011-1z', 'M9 12h6', 'M9 16h6'],
    package: ['M16.5 9.4l-9-5.19', 'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z', 'M3.27 6.96L12 12.01l8.73-5.05', 'M12 22.08V12'],
    move: ['M5 9l-3 3 3 3', 'M9 5l3-3 3 3', 'M15 19l-3 3-3-3', 'M19 9l3 3-3 3', 'M2 12h20', 'M12 2v20'],
    palette: ['M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.65 1.5-1.5 0-.39-.15-.74-.39-1.04-.23-.29-.38-.63-.38-1.01C12.73 17.08 13.76 16 15.03 16H18c2.21 0 4-1.79 4-4 0-4.42-4.03-8-10-8z', 'M8.5 11a1.5 1.5 0 100-3 1.5 1.5 0 000 3z', 'M12 7.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z', 'M15.5 11a1.5 1.5 0 100-3 1.5 1.5 0 000 3z', 'M7 14.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z'],
    // Node widget icons
    settings: ['M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z', 'M12 8a4 4 0 100 8 4 4 0 000-8z'],
    power: ['M18.36 6.64a9 9 0 11-12.73 0', 'M12 2v10'],
    ban: ['M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z', 'M4.93 4.93l14.14 14.14'],
    repeat: ['M17 1l4 4-4 4', 'M3 11V9a4 4 0 014-4h14', 'M7 23l-4-4 4-4', 'M21 13v2a4 4 0 01-4 4H3'],
    shuffle: ['M16 3h5v5', 'M4 20L21 3', 'M21 16v5h-5', 'M15 15l6 6', 'M4 4l5 5'],
    lightbulb: ['M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 006 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5', 'M9 18h6', 'M10 22h4'],
    loader: ['M12 2v4', 'M12 18v4', 'M4.93 4.93l2.83 2.83', 'M16.24 16.24l2.83 2.83', 'M2 12h4', 'M18 12h4', 'M4.93 19.07l2.83-2.83', 'M16.24 7.76l2.83-2.83'],
    minus: ['M5 12h14'],
    'chevron-right': ['M9 18l6-6-6-6'],
    'chevron-left': ['M15 18l-6-6 6-6'],
};

/**
 * Preact Icon 组件
 * @param {Object} props
 * @param {string} props.name - 图标名称
 * @param {number} [props.size=16] - 图标大小
 * @param {string} [props.color] - 颜色（默认 currentColor）
 * @param {string} [props.class] - CSS 类名
 * @param {Object} [props.style] - 内联样式
 */
export function Icon({ name, size = 16, color, class: className, style }) {
    const paths = ICONS[name];
    if (!paths) return null;
    return h('svg', {
        xmlns: 'http://www.w3.org/2000/svg',
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: color || 'currentColor',
        'stroke-width': 2,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        class: className,
        style,
    }, paths.map((d, i) => h('path', { key: i, d })));
}

/**
 * 生成 SVG HTML 字符串（用于非 Preact 场景，如 ContextMenu 原生 DOM）
 * @param {string} name - 图标名称
 * @param {number} [size=16] - 图标大小
 * @param {string} [color] - 颜色
 * @returns {string} SVG HTML 字符串
 */
export function iconToSvg(name, size = 16, color) {
    const paths = ICONS[name];
    if (!paths) return '';
    const pathsHtml = paths.map((d) => `<path d="${d}"/>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color || 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${pathsHtml}</svg>`;
}
