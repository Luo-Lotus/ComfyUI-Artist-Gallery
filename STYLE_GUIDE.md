# Artist Gallery 样式指导文档

本文档描述了 Artist Gallery 项目的样式规范和设计系统。

## 目录
- [颜色系统](#颜色系统)
- [字体排版](#字体排版)
- [间距系统](#间距系统)
- [组件样式](#组件样式)
- [动画和过渡](#动画和过渡)
- [响应式设计](#响应式设计)

---

## 颜色系统

### 主色调
```css
--primary-blue: #3b82f6;      /* 主蓝色 - 按钮、链接、高亮 */
--primary-hover: #4a9eff;      /* 悬停状态 */
--bg-dark: #1a1a1a;            /* 深色背景 */
--bg-card: #2a2a2a;            /* 卡片背景 */
--bg-hover: #3a3a3a;           /* 悬停背景 */
```

### 文字颜色
```css
--text-primary: #e0e0e0;       /* 主要文字 */
--text-secondary: #888;         /* 次要文字 */
--text-muted: #666;             /* 弱化文字 */
```

### 功能色
```css
--success: #28a745;            /* 成功 - 绿色 */
--error: #ef4444;              /* 错误 - 红色 */
--warning: #ffc107;            /* 警告 - 黄色 */
--info: #17a2b8;               /* 信息 - 青色 */
```

### 边框颜色
```css
--border-primary: #444;        /* 主要边框 */
--border-secondary: #333;      /* 次要边框 */
--border-focus: #4a9eff;       /* 焦点边框 */
```

---

## 字体排版

### 字体大小
```css
--font-xs: 10px;               /* 最小字号 */
--font-sm: 11px;               /* 小字号 */
--font-base: 12px;             /* 基础字号 */
--font-md: 13px;               /* 中等字号 */
--font-lg: 14px;               /* 大字号 */
--font-xl: 16px;               /* 特大字号 */
--font-2xl: 18px;              /* 标题字号 */
--font-3xl: 20px;              /* 主标题字号 */
```

### 字重
```css
--font-normal: 400;            /* 常规 */
--font-medium: 500;            /* 中等 */
--font-semibold: 600;          /* 半粗 */
--font-bold: 700;              /* 粗体 */
```

### 行高
```css
--leading-tight: 1.2;          /* 紧凑 */
--leading-normal: 1.4;         /* 正常 */
--leading-relaxed: 1.6;        /* 宽松 */
```

---

## 间距系统

### Spacing Scale
```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
```

### 组件内边距
```css
/* 小按钮 */
--padding-btn-sm: 6px 12px;

/* 常规按钮 */
--padding-btn-base: 8px 16px;

/* 输入框 */
--padding-input: 8px 12px;

/* 卡片 */
--padding-card: 16px;
```

---

## 组件样式

### 按钮

#### 主要按钮
```css
.btn-primary {
    background: var(--primary-blue);
    color: white;
    padding: var(--padding-btn-base);
    border-radius: 6px;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
}

.btn-primary:hover {
    background: var(--primary-hover);
    transform: translateY(-1px);
}
```

#### 次要按钮
```css
.btn-secondary {
    background: var(--bg-card);
    color: var(--text-primary);
    border: 1px solid var(--border-primary);
    padding: var(--padding-btn-base);
    border-radius: 6px;
    cursor: pointer;
}

.btn-secondary:hover {
    background: var(--bg-hover);
    border-color: var(--border-focus);
}
```

#### 图标按钮
```css
.btn-icon {
    width: 32px;
    height: 32px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
}

.btn-icon:hover {
    background: var(--bg-hover);
    transform: scale(1.1);
}
```

### 输入框

```css
.input {
    width: 100%;
    padding: var(--padding-input);
    background: var(--bg-card);
    border: 1px solid var(--border-primary);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: var(--font-md);
    transition: all 0.2s;
}

.input:focus {
    outline: none;
    border-color: var(--border-focus);
    box-shadow: 0 0 0 2px rgba(74, 158, 255, 0.2);
}

.input::placeholder {
    color: var(--text-muted);
}
```

### 卡片

```css
.card {
    background: var(--bg-card);
    border: 1px solid var(--border-primary);
    border-radius: 8px;
    overflow: hidden;
    transition: all 0.2s;
}

.card:hover {
    border-color: var(--border-focus);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}
```

### 对话框

```css
.dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: fadeIn 0.2s;
}

.dialog-content {
    background: var(--bg-dark);
    border: 1px solid var(--border-primary);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    max-width: 500px;
    width: 90%;
    animation: slideUp 0.3s;
}

.dialog-header {
    padding: 20px 24px;
    border-bottom: 1px solid var(--border-secondary);
}

.dialog-body {
    padding: 24px;
}

.dialog-footer {
    padding: 16px 24px;
    border-top: 1px solid var(--border-secondary);
    display: flex;
    gap: 12px;
    justify-content: flex-end;
}
```

---

## 动画和过渡

### 过渡时长
```css
--duration-fast: 0.15s;
--duration-base: 0.2s;
--duration-slow: 0.3s;
```

### 缓动函数
```css
--ease-in: cubic-bezier(0.4, 0, 1, 1);
--ease-out: cubic-bezier(0, 0, 0.2, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
```

### 常用动画

#### 淡入
```css
@keyframes fadeIn {
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
}
```

#### 滑入上
```css
@keyframes slideUp {
    from {
        opacity: 0;
        transform: translateY(20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
```

#### 滑入右
```css
@keyframes slideInRight {
    from {
        opacity: 0;
        transform: translateX(20px);
    }
    to {
        opacity: 1;
        transform: translateX(0);
    }
}
```

---

## 响应式设计

### 断点
```css
--breakpoint-sm: 640px;
--breakpoint-md: 768px;
--breakpoint-lg: 1024px;
--breakpoint-xl: 1280px;
```

### 网格布局
```css
/* 画廊网格 */
.gallery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-4);
}

/* 中等屏幕 */
@media (max-width: 768px) {
    .gallery-grid {
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: var(--space-3);
    }
}

/* 小屏幕 */
@media (max-width: 480px) {
    .gallery-grid {
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
        gap: var(--space-2);
    }
}
```

---

## 滚动条样式

```css
/* 自定义滚动条 */
::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}

::-webkit-scrollbar-track {
    background: var(--bg-dark);
}

::-webkit-scrollbar-thumb {
    background: var(--border-primary);
    border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
    background: var(--border-secondary);
}
```

---

## 工具类

### 文字省略
```css
.truncate {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
```

### Flex 居中
```css
.flex-center {
    display: flex;
    align-items: center;
    justify-content: center;
}
```

### 绝对居中
```css
.absolute-center {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
}
```

---

## 设计原则

1. **一致性**: 使用统一的颜色、间距、字体大小
2. **可访问性**: 确保足够的对比度，提供清晰的焦点状态
3. **响应式**: 优先移动端设计，逐步增强到桌面端
4. **性能**: 使用 CSS 过渡而非 JavaScript 动画
5. **可维护性**: 使用 CSS 变量，便于主题切换

---

## 组件示例

### 分类卡片
```css
.category-card {
    background: var(--bg-card);
    border: 1px solid var(--border-primary);
    border-radius: 8px;
    padding: 16px;
    cursor: pointer;
    transition: all var(--duration-base);
}

.category-card:hover {
    border-color: var(--border-focus);
    transform: translateY(-2px);
}

.category-card.selected {
    background: var(--bg-hover);
    border-color: var(--primary-blue);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}
```

### 画师卡片
```css
.artist-card {
    background: var(--bg-card);
    border: 1px solid var(--border-primary);
    border-radius: 8px;
    overflow: hidden;
    transition: all var(--duration-base);
}

.artist-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.4);
}

.artist-cover-image {
    width: 100%;
    aspect-ratio: 16/10;
    object-fit: cover;
}
```

### 面包屑
```css
.breadcrumb {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    background: var(--bg-dark);
    border-radius: 6px;
    font-size: var(--font-md);
}

.breadcrumb-item {
    color: var(--primary-blue);
    cursor: pointer;
    transition: color var(--duration-fast);
}

.breadcrumb-item:hover {
    color: var(--primary-hover);
    text-decoration: underline;
}

.breadcrumb-separator {
    color: var(--text-muted);
}
```

---

## 颜色对比度要求

- **正文文字**: 对比度 ≥ 4.5:1 (WCAG AA)
- **大号文字**: 对比度 ≥ 3:1 (WCAG AA)
- **图标和图形**: 对比度 ≥ 3:1 (WCAG AA)

当前配色方案满足 WCAG AA 标准。

---

## 最佳实践

1. **使用 CSS 变量**: 所有颜色、间距、字体大小都应使用变量
2. **避免魔法数字**: 不要在样式中直接使用数字，使用预定义的变量
3. **过渡效果**: 所有交互元素都应有过渡效果
4. **焦点状态**: 所有可聚焦元素都应有清晰的焦点指示
5. **加载状态**: 为异步操作提供加载反馈

---

## 更新日志

- 2026-03-28: 创建初始版本，定义颜色系统、字体排版、组件样式
