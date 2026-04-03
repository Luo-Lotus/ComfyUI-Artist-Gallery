# Artist Gallery Style Guide

本文件定义了画廊 UI 和节点 Widget 的完整样式规范。新建或修改组件时必须遵循。

---

## 1. 设计系统总览

项目存在两套独立主题：

| 场景 | 主题 | 基调 |
|------|------|------|
| **画廊 UI**（Modal、Dialog、Toast） | 粉色浅色主题 | 温暖、柔和 |
| **节点 Widget**（ArtistSelector） | 暗色主题 | 与 ComfyUI 节点编辑器一致 |

---

## 2. 画廊 UI — 粉色主题

### 2.1 调色板

| 用途 | CSS 值 | 示例 |
|------|--------|------|
| **主色** | `#ff6b9d` | 标题、标签、激活态按钮 |
| **次色** | `#ffb6c1` | 边框、分割线、默认态按钮边框 |
| **背景浅** | `#fff5f8` | 输入框背景、hover 背景 |
| **背景浅深** | `#ffeef2` | 深层 hover |
| **表面** | `#fff` | 卡片、内容区背景 |
| **渐变** | `linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)` | 主 Modal 背景、浮动按钮 |
| **文本主** | `#4a4a4a` | 正文、输入框文字 |
| **文本标题** | `#333` | 标题、重要文字 |
| **文本弱** | `#999` | 次要信息、placeholder |
| **文本强调浅** | `#ff9cbd` | 统计数字、空状态 |
| **危险** | `#ff4444` / `#ee3333` | 删除按钮 |
| **成功** | `#28a745` / `#4caf50` | 成功提示、确认态 |

### 2.2 排版

| 元素 | 字号 | 字重 |
|------|------|------|
| Modal 标题 | 18px | 700 |
| 卡片画师名 | 14px (var) | 700 |
| 正文 / 按钮 | 13px | 600 |
| 表单标签 | 13px | 600 |
| 辅助文字 | 12px | 500 |
| 计数/元信息 | 11px (var) | 600 |

### 2.3 圆角

| 元素 | 圆角 |
|------|------|
| Modal / Dialog | 16px–20px |
| 卡片 | 16px (var) |
| 按钮 | 12px |
| 输入框 | 12px（搜索框 16px） |
| 图片容器 | 8px–12px |
| 标签 / Badge | 10px–12px |
| Toast | 12px |

### 2.4 边框

| 状态 | 样式 |
|------|------|
| 默认 | `2px solid #ffb6c1` |
| 聚焦 | `2px solid #ff6b9d` |
| 卡片 hover | `2px solid #ffb6c1`（或 `transparent` → `#ffb6c1`） |
| 分割线 | `2px solid #ffb6c1` 或 `1px solid #eee` |

### 2.5 阴影

| 层级 | 样式 |
|------|------|
| 卡片默认 | `0 2px 12px rgba(255, 182, 159, 0.15)` |
| 卡片 hover | `0 4px 16px rgba(255, 182, 159, 0.25)` |
| Dialog | `0 8px 32px rgba(0, 0, 0, 0.2)` |
| Modal | `0 8px 32px rgba(255, 107, 157, 0.3)` |
| Toast | `0 4px 20px rgba(0, 0, 0, 0.15)` |

### 2.6 间距

| 场景 | 值 |
|------|-----|
| 网格间距 | `14px` (var `--card-grid-gap`) |
| 卡片内边距 | `10px` (var `--card-padding`) |
| 表单组间距 | `16px` |
| 表单项间距 | `6px` |
| Modal body | `12px` |
| Dialog body | `16px` |
| 按钮间距 | `8px` |

### 2.7 过渡

| 场景 | 时长 | 属性 |
|------|------|------|
| 通用 hover / focus | `0.2s` | `all` |
| Modal 出现 | `0.3s` | `opacity`, `transform` |
| Toast 滑入 | `0.3s` | `ease-out` |

### 2.8 组件样式速查

#### 按钮（`.gallery-modal-btn` / `.gallery-btn`）
```css
padding: 6px 12px;
border: 2px solid #ffb6c1;
border-radius: 12px;
background: #fff5f8;
color: #ff6b9d;
font-size: 13px;
font-weight: 600;
/* primary 变体: background: #ff6b9d; color: #fff; */
/* danger 变体: background: #ff4444; color: #fff; */
```

#### 输入框（`.gallery-form-input`）
```css
width: 100%;
padding: 10px 14px;
border: 2px solid #ffb6c1;
border-radius: 12px;
background: #fff5f8;
color: #4a4a4a;
font-size: 13px;
/* focus: border-color: #ff6b9d; background: #fff; */
```

#### 表单标签（`.gallery-form-label`）
```css
font-size: 13px;
font-weight: 600;
color: #ff6b9d;
```

#### 信息块（`.image-info-block`）
```css
border: 2px solid #ffb6c1;
border-radius: 12px;
/* 标题栏: background: #fff5f8; border-bottom: 2px solid #ffb6c1; color: #ff6b9d; */
/* 内容区: background: #fff; color: #4a4a4a; */
/* pre 代码块: background: #fff5f8; border: 2px solid #ffeef2; color: #4a4a4a; */
```

#### Dialog 容器（`.gallery-dialog-content`）
```css
max-width: 500px;
max-height: 500px;  /* 需要更高时可传 maxHeight prop */
width: 90%;
background: white;
border-radius: 16px;
box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
```

#### 选择器列表（`.flat-selector`）
```css
/* 搜索框 */
background: #fff5f8;
border: 2px solid #ffb6c1;
border-radius: 8px;
/* focus: border-color: #ff6b9d; */

/* 列表容器 */
max-height: 300px;
border: 2px solid #ffb6c1;
background: #fff;

/* 列表项 */
padding: 10px 12px;
border-bottom: 1px solid #ffeef2;
/* hover: background: #fff5f8; */
/* selected: background: #ffeef2; border-left: 3px solid #ff6b9d; */

/* 文字 */
color: #333; font-weight: 500;
/* 计数 badge: color: #888; background: #f0f0f0; border-radius: 10px; */
```

---

## 3. 节点 Widget — 暗色主题

节点 Widget 运行在 ComfyUI 暗色编辑器内，使用独立的暗色调色板。

### 3.1 调色板

| 用途 | CSS 值 |
|------|--------|
| **背景** | `#1e1e1e` |
| **表面** | `#2a2a2a` |
| **边框** | `#333` |
| **边框 hover** | `#444` |
| **强调色** | `#6c5ce7`（紫色） |
| **强调背景** | `rgba(108, 92, 231, 0.15)` |
| **强调边框** | `rgba(108, 92, 231, 0.3)` |
| **强调浅背景** | `rgba(108, 92, 231, 0.1)` |
| **文本主** | `#ddd` / `#eee` |
| **文本弱** | `#888` / `#999` |
| **文本弱弱** | `#666` |
| **危险** | `rgba(255, 68, 68, 0.2)` |

### 3.2 组件样式速查

#### 分区容器
```css
background: #1e1e1e;
border: 1px solid #333;
border-radius: 8px;
```

#### 分区标题
```css
background: rgba(255, 255, 255, 0.05);
border-bottom: 1px solid #333;
color: #ddd;
font-size: 13px;
font-weight: 600;
padding: 8px 12px;
```

#### 画师标签（tag）
```css
background: rgba(108, 92, 231, 0.1);
border: 1px solid rgba(108, 92, 231, 0.3);
border-radius: 6px;
color: #ddd;
font-size: 12px;
padding: 3px 8px;
/* selected: background: rgba(108, 92, 231, 0.15); */
```

#### 孤立标签（orphaned）
```css
background: rgba(255, 152, 0, 0.2);
border: 1px dashed rgba(255, 152, 0, 0.5);
opacity: 0.75;
```

#### 输入框
```css
background: #2a2a2a;
border: 1px solid #444;
border-radius: 6px;
color: #ddd;
font-size: 13px;
/* focus: border-color: #6c5ce7; */
```

#### 按钮
```css
background: rgba(255, 255, 255, 0.05);
border: 1px solid #444;
border-radius: 6px;
color: #aaa;
font-size: 12px;
padding: 4px 10px;
/* hover: background: rgba(255, 255, 255, 0.1); color: #fff; */
/* active/primary: background: rgba(108, 92, 231, 0.2); border-color: #6c5ce7; color: #ddd; */
```

#### 开关（toggle）
```css
/* 关闭态 */
background: #333;
border: 1px solid #444;
/* 开启态 */
background: rgba(108, 92, 231, 0.3);
border-color: #6c5ce7;
```

---

## 4. 命名规范

### CSS 类名
- **画廊组件**: `gallery-` 前缀（如 `.gallery-card`、`.gallery-btn`）
- **对话框组件**: `gallery-dialog-` 前缀（如 `.gallery-dialog-content`）
- **表单元素**: `gallery-form-` 前缀（如 `.gallery-form-input`、`.gallery-form-label`）
- **功能组件**: 按功能命名（如 `.flat-selector`、`.lazy-list`、`.toast`）
- **节点 Widget**: `artist-selector-` 前缀（如 `.artist-selector-tag`）

### CSS 文件组织
- 每个组件/功能一个 CSS 文件
- 统一在 `gallery.css` 中 `@import` 汇总
- 节点 Widget 样式在 `artist-selector.css`

---

## 5. 新增组件样式检查清单

创建新 CSS 或新组件时，对照以下清单：

### 画廊 UI 组件
- [ ] 使用 `#ff6b9d` / `#ffb6c1` 色系，不引入新主色
- [ ] 边框使用 `2px solid #ffb6c1`
- [ ] 输入框/交互元素有 focus 态（`border-color: #ff6b9d`）
- [ ] hover 有视觉反馈（背景变化或 `translateY(-1px)`）
- [ ] 圆角使用 8px/12px/16px 之一
- [ ] 文字颜色使用 `#4a4a4a`（正文）或 `#ff6b9d`（标签/标题）
- [ ] 过渡使用 `all 0.2s`
- [ ] 在 Dialog 中使用时确认 `max-height` 不裁剪内容

### 节点 Widget 组件
- [ ] 使用暗色主题（`#1e1e1e` / `#2a2a2a` / `#333`）
- [ ] 强调色使用 `#6c5ce7`（紫色），不用粉色
- [ ] 文字使用 `#ddd` / `#888`
- [ ] 边框使用 `1px solid #333`（非 2px）
- [ ] 圆角使用 `6px` / `8px`
