/**
 * 卡片大小预设系统
 * 基于 scale 缩放系数动态计算 CSS 变量
 * scale 范围: 0.5 (最小) ~ 1.5 (最大)，1.0 为当前默认值
 */

// 基准值（对应 scale=1.0，即 :root 中的默认值）
// key 经 toKebab 转换后加上 --card- 前缀即为 CSS 变量名
const BASE_SIZES = {
    gridMinWidth: 250,
    gridGap: 14,
    radius: 16,
    padding: 10,
    headerGap: 8,
    artistNameFont: 14,
    artistCountFont: 11,
    favBtnSize: 14,
    categoryIconSize: 48,
    categoryPadding: 20,
    categoryNameFont: 16,
    categoryMetaFont: 13,
    emptyHeight: 200,
    emptyIconSize: 48,
    emptyTextFont: 14,
    imageRadius: 8,
};

/**
 * 将 camelCase 转为 kebab-case
 */
function toKebab(str) {
    return str.replace(/([A-Z])/g, '-$1').toLowerCase();
}

/**
 * 根据缩放系数计算所有 CSS 变量
 * @param {number} scale 缩放系数 0.5~1.5
 * @returns {Object} CSS 变量键值对 { '--card-grid-min-width': '250px', ... }
 */
export function computeSizeVars(scale) {
    const vars = {};
    for (const [key, base] of Object.entries(BASE_SIZES)) {
        let value = Math.round(base * scale);
        // 限制 gap 最小值
        if (key === 'gridGap') value = Math.max(6, value);
        vars[`--card-${toKebab(key)}`] = `${value}px`;
    }
    return vars;
}

/**
 * 将 CSS 变量应用到 DOM 元素上
 * @param {HTMLElement} el 目标元素
 * @param {number} scale 缩放系数 0.5~1.5
 */
export function applySizeStyles(el, scale) {
    if (!el) return;
    const vars = computeSizeVars(scale);
    for (const [prop, value] of Object.entries(vars)) {
        el.style.setProperty(prop, value);
    }
}
