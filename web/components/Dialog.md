# Dialog 组件使用指南

## 通用 Dialog 组件

一个可复用的模态框组件，简化对话框的创建。

## 基础用法

```javascript
import { Dialog, DialogButton } from './components/Dialog.js';

// 简单对话框
h(Dialog, {
    isOpen: true,
    onClose: () => console.log('关闭'),
    title: '对话框标题',
    titleIcon: '📝',
}, [
    h('p', {}, '这是对话框内容'),
]);

// 带底部按钮的对话框
h(Dialog, {
    isOpen: true,
    onClose: () => {},
    title: '确认操作',
    footer: [
        h(DialogButton, { onClick: () => {} }, '取消'),
        h(DialogButton, {
            variant: 'primary',
            onClick: () => {}
        }, '确定'),
    ],
}, '确定要执行此操作吗？');
```

## API

### Dialog Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `isOpen` | boolean | - | 对话框是否打开（必需） |
| `onClose` | function | - | 关闭回调（必需） |
| `title` | string | - | 对话框标题 |
| `titleIcon` | string | - | 标题前的图标 |
| `children` | node | - | 对话框内容 |
| `footer` | node | null | 底部操作按钮区 |
| `maxWidth` | string | '500px' | 最大宽度 |
| `showCloseButton` | boolean | true | 是否显示关闭按钮 |
| `closeOnOverlayClick` | boolean | true | 是否点击遮罩关闭 |
| `className` | string | '' | 额外的CSS类名 |

### DialogButton Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `children` | node | - | 按钮内容 |
| `onClick` | function | - | 点击回调 |
| `variant` | string | 'default' | 按钮样式: 'default' \| 'primary' \| 'danger' |
| `className` | string | '' | 额外的CSS类名 |

### DialogFormGroup Props

表单组容器

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `children` | node | - | 子元素 |
| `style` | object | {} | 额外样式 |

### DialogFormItem Props

表单项容器

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `children` | node | - | 表单控件 |
| `label` | string | null | 标签文本 |

## 完整示例

### 示例1：确认对话框

```javascript
export function ConfirmDialog({ isOpen, onConfirm, onCancel }) {
    return h(Dialog, {
        isOpen,
        onClose: onCancel,
        title: '确认删除',
        titleIcon: '⚠️',
        maxWidth: '400px',
        footer: [
            h(DialogButton, { onClick: onCancel }, '取消'),
            h(DialogButton, {
                variant: 'danger',
                onClick: onConfirm
            }, '确认删除'),
        ],
    }, [
        h('p', {}, '确定要删除此项目吗？此操作不可撤销。'),
    ]);
}
```

### 示例2：表单对话框

```javascript
export function SettingsDialog({ isOpen, onClose }) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');

    return h(Dialog, {
        isOpen,
        onClose,
        title: '用户设置',
        titleIcon: '⚙️',
        footer: [
            h(DialogButton, { onClick: onClose }, '取消'),
            h(DialogButton, {
                variant: 'primary',
                onClick: () => {/* 保存逻辑 */}
            }, '保存'),
        ],
    }, [
        h(DialogFormGroup, {}, [
            h(DialogFormItem, {
                label: '用户名'
            }, h('input', {
                type: 'text',
                value: name,
                onInput: (e) => setName(e.target.value),
                class: 'gallery-form-input',
            })),
            h(DialogFormItem, {
                label: '邮箱'
            }, h('input', {
                type: 'email',
                value: email,
                onInput: (e) => setEmail(e.target.value),
                class: 'gallery-form-input',
            })),
        ]),
    ]);
}
```

### 示例3：自定义样式

```javascript
h(Dialog, {
    isOpen: true,
    onClose: () => {},
    title: '宽对话框',
    maxWidth: '800px',  // 更宽
    className: 'custom-dialog',  // 自定义类
}, '内容...');
```

## 样式定制

Dialog 组件复用了现有的 CSS 类：

- `.gallery-modal-overlay` - 遮罩层
- `.gallery-modal-content` - 对话框容器
- `.gallery-modal-header` - 头部
- `.gallery-modal-title` - 标题
- `.gallery-modal-body` - 内容区
- `.gallery-dialog-actions` - 底部操作区
- `.gallery-form-group` - 表单组
- `.gallery-form-item` - 表单项
- `.gallery-form-label` - 标签

## 注意事项

1. **z-index**: Dialog 默认使用 20000，确保在主模态框之上
2. **自动滚动**: 内容过多时，`.gallery-modal-body` 会自动出现滚动条
3. **关闭方式**:
   - 点击右上角 ✕ 按钮
   - 点击遮罩层（可配置）
   - 调用 `onClose` 回调

## 迁移指南

如果你的代码使用了旧的对话框结构，可以这样迁移：

**之前**：
```javascript
h('div', { class: 'gallery-modal-overlay open' },
    h('div', { class: 'gallery-modal-content' },
        h('div', { class: 'gallery-modal-header' }, [...]),
        h('div', { class: 'gallery-modal-body' }, [...]),
    )
)
```

**现在**：
```javascript
h(Dialog, {
    isOpen: true,
    onClose: () => {},
    title: '标题',
}, [...内容...])
```

代码量减少 70%+！
