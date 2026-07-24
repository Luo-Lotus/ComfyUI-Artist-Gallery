/**
 * 图片自定义字段编辑弹窗
 * 创建/编辑字段：名称、提取代码、分组与详情展示方式
 */
import { h } from '../lib/preact.mjs';
import { useState, useEffect, useCallback } from '../lib/hooks.mjs';
import { Dialog, DialogButton, DialogFormGroup, DialogFormItem } from './Dialog.js';
import { showToast } from './Toast.js';
import { Icon } from '../lib/icons.mjs';

const ITEM_FIELDS_HELP = `使用 AI 生成代码：
1. 点击右侧「复制 AI 提示词」
2. 将提示词发给 LLM（ChatGPT / Claude / DeepSeek）
3. 描述你想提取的字段，附上图片 Prompt 示例
4. 将 AI 返回的代码填入下方输入框

如需在图片详情中展示富文本，可让 AI 返回安全 HTML，并开启「按 HTML 渲染」`;

const EXTRACT_CODE_TEMPLATE = `def extract_func(item):
    """参数: item (dict)  返回: str"""
    # 在此编写提取逻辑
    return ""`;

const AI_SYSTEM_PROMPT = `你是一个 ComfyUI 图库图片字段提取代码生成器。用户会描述需要提取的字段，你需要生成 Python 代码。

## 图片数据结构 (item)

每个 item 是一个 dict，代表一张图片的完整信息：

{
    "imagePath": "2024-01-01/image_001.png",
    "type": "local",             // 或 "remote"
    "promptString": "artist_name, landscape",
    "generatePrompt": "{...}",   // ComfyUI 工作流 JSON 字符串，可能为空
    "fileInfo": {
        "createdAt": 1704067200000,   // 毫秒时间戳
        "size": 2048000,              // 字节
        "type": "image/png",
        "width": 1024,
        "height": 1024
    }
}

## 你需要输出

### 字段名称
用中文简短描述这个字段提取的内容。

### 提取函数 (extractCode)
Python 函数，格式如下：

\`\`\`python
def extract_func(item):
    # 提取逻辑
    return ""
\`\`\`

- item: 上述图片数据 dict
- 返回 str，作为该字段的值
- 返回空字符串表示该图片没有此字段值
- 如需富文本展示，可返回 HTML 字符串，并在字段设置中开启「按 HTML 渲染」
- HTML 支持 p、div、span、br、标题、加粗/斜体/下划线、ul/ol/li、blockquote、code/pre、table 和 a，也支持安全的内联排版样式；图片、表单、iframe、脚本、事件属性、危险 CSS 和危险 URL 会被过滤
- 普通文本字段不要额外包裹 HTML
- 可用内置函数: int, str, float, len, bool, isinstance, list, dict, set, tuple, sorted, enumerate, zip, map, filter, any, all, min, max, sum, abs, range, reversed, hasattr, getattr, type, round, pow, divmod
- 可用模块（直接使用，无需 import）: re, json, math, datetime, timezone, timedelta
- 不可用: import, open, exec, eval, os, pathlib, subprocess

## 输出格式

先用一句话说明这个字段提取什么内容，然后用代码块给出 extractCode。不要输出 JSON，直接输出代码。

## 示例

用户: "提取图片分辨率，格式如 1024x1024"

你:
这个字段提取图片的分辨率尺寸。

\`\`\`python
def extract_func(item):
    fi = item.get('fileInfo', {})
    w = fi.get('width')
    h = fi.get('height')
    if w and h:
        return f"{w}x{h}"
    return ""
\`\`\`

---

用户: "从 generatePrompt 中提取使用的 checkpoint 模型名称"

你:
这个字段从 ComfyUI 工作流 JSON 中提取 checkpoint 模型名称。

\`\`\`python
def extract_func(item):
    gp = item.get('generatePrompt', '')
    if not gp:
        return ""
    matches = re.findall(r'"ckpt_name"\s*:\s*"([^"]*)"', gp)
    return matches[0] if matches else ""
\`\`\`

---

用户: "提取图片的创建日期（年月）"

你:
这个字段提取图片创建日期的年月部分。

\`\`\`python
def extract_func(item):
    ts = item.get('fileInfo', {}).get('createdAt', 0)
    if not ts:
        return ""
    return datetime.fromtimestamp(ts / 1000, tz=timezone.utc).strftime('%Y-%m')
\`\`\`

---

用户: "从 promptString 中提取逗号分隔的提示词，并在图片详情中显示为 HTML 列表"

你:
这个字段将提示词转换为可在图片详情中渲染的 HTML 列表；创建字段后请开启「按 HTML 渲染」。

\`\`\`python
def extract_func(item):
    prompt = item.get('promptString', '')
    values = [value.strip() for value in prompt.split(',') if value.strip()]
    if not values:
        return ""
    escaped = []
    for value in values:
        safe_value = (value.replace('&', '&amp;').replace('<', '&lt;')
                     .replace('>', '&gt;').replace('"', '&quot;'))
        escaped.append(f"<li>{safe_value}</li>")
    return "<ul>" + "".join(escaped) + "</ul>"
\`\`\`

## 注意事项
1. 不要使用 import、open、exec、eval，所有常用模块已内置可直接使用
2. generatePrompt 是 JSON 字符串，使用前用 if 判断是否为空
3. fileInfo 字段可能不存在，用 .get() 安全取值
4. re 模块可直接使用，如 re.findall(r'pattern', string)
5. datetime 模块可直接使用，如 datetime.fromtimestamp(ts/1000)
6. 生成 HTML 时必须转义来自图片数据的动态文本；可使用安全的内联 style 排版，不要输出 style 标签、script、iframe、表单、图片、on* 事件属性、外部资源或危险 URL
7. HTML 字段的提取函数仍然只返回 str，不要返回 DOM、Markdown 或 JSON`;

function handleCopyAiPrompt() {
    navigator.clipboard.writeText(AI_SYSTEM_PROMPT).then(() => {
        showToast('已复制 AI 提示词到剪贴板', 'success');
    }).catch(() => {
        showToast('复制失败，请手动复制', 'error');
    });
}

export function ImageFieldEditDialog({ isOpen, onClose, onSave, editItem }) {
    const [name, setName] = useState('');
    const [extractCode, setExtractCode] = useState('');
    const [groupable, setGroupable] = useState(false);
    const [renderHtml, setRenderHtml] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (editItem) {
                setName(editItem.name || '');
                setExtractCode(editItem.extractCode || EXTRACT_CODE_TEMPLATE);
                setGroupable(editItem.groupable || false);
                setRenderHtml(editItem.renderHtml || false);
            } else {
                setName('');
                setExtractCode(EXTRACT_CODE_TEMPLATE);
                setGroupable(false);
                setRenderHtml(false);
            }
        }
    }, [isOpen, editItem]);

    const handleSave = useCallback(async () => {
        if (!name.trim()) {
            showToast('请输入字段名称', 'warning');
            return;
        }
        if (!extractCode.trim()) {
            showToast('请输入提取代码', 'warning');
            return;
        }

        setSaving(true);
        try {
            const payload = {
                name: name.trim(),
                extractCode: extractCode.trim(),
                groupable,
                renderHtml,
            };

            let url, method;
            if (editItem) {
                url = `/prompt_gallery/image_fields/${editItem.id}`;
                method = 'PUT';
            } else {
                url = '/prompt_gallery/image_fields';
                method = 'POST';
            }

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const result = await res.json();

            if (result.success) {
                showToast(editItem ? '字段已更新' : '字段已创建', 'success');
                if (onSave) onSave(result.field);
                onClose();
            } else {
                showToast('保存失败: ' + (result.error || '未知错误'), 'error');
            }
        } catch (e) {
            showToast('保存失败: ' + e.message, 'error');
        } finally {
            setSaving(false);
        }
    }, [name, extractCode, groupable, renderHtml, editItem, onSave, onClose]);

    const renderFooter = () => [
        h(DialogButton, { onClick: onClose }, '取消'),
        h(DialogButton, {
            variant: 'primary',
            onClick: handleSave,
            disabled: saving,
        }, saving ? '保存中...' : '保存'),
    ];

    const isBuiltin = editItem?.builtin;

    return h(Dialog, {
        isOpen,
        onClose,
        title: editItem ? '编辑图片字段' : '新建图片字段',
        titleIcon: h(Icon, { name: 'image', size: 18 }),
        maxWidth: '700px',
        maxHeight: '80vh',
        footer: renderFooter(),
    }, [
        // 使用指引 + AI 提示词按钮
        h('div', {
            style: {
                padding: '8px 12px',
                background: 'var(--g-bg-input)',
                border: '1px solid var(--g-border)',
                borderRadius: '6px',
                fontSize: '12px',
                color: 'var(--g-text-secondary)',
                marginBottom: '14px',
                whiteSpace: 'pre-line',
                lineHeight: '1.6',
                position: 'relative',
            },
        }, [
            h('div', {
                style: {
                    position: 'absolute',
                    top: '6px',
                    right: '8px',
                    display: 'flex',
                    gap: '6px',
                },
            }, [
                h('button', {
                    style: {
                        border: '1px solid var(--g-border)',
                        background: 'var(--g-bg-input)',
                        color: 'var(--g-accent)',
                        borderRadius: '4px',
                        padding: '3px 8px',
                        fontSize: '11px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                    },
                    onClick: handleCopyAiPrompt,
                    title: '复制系统提示词，发给 AI 让它帮你生成代码',
                }, [
                    h(Icon, { name: 'copy', size: 11 }),
                    '复制 AI 提示词',
                ]),
            ]),
            ITEM_FIELDS_HELP,
        ]),

        h(DialogFormGroup, {}, [
            // 名称
            h(DialogFormItem, { label: '字段名称' }, [
                h('input', {
                    class: 'gallery-form-input',
                    type: 'text',
                    value: name,
                    onInput: (e) => setName(e.target.value),
                    placeholder: '例如：分辨率、模型名称',
                    disabled: isBuiltin,
                }),
            ]),

            // 提取代码
            h(DialogFormItem, { label: '提取代码（Python，定义 extract_func(item) -> str）' }, [
                h('textarea', {
                    class: 'gallery-form-textarea code',
                    value: extractCode,
                    onInput: (e) => setExtractCode(e.target.value),
                    rows: 10,
                    style: { fontFamily: 'monospace', fontSize: '12px', resize: 'vertical' },
                }),
            ]),

            // 参与图片分组
            h(DialogFormItem, { label: '分组选项' }, [
                h('label', {
                    style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        color: '#555',
                    },
                }, [
                    h('input', {
                        type: 'checkbox',
                        checked: groupable,
                        onChange: (e) => setGroupable(e.target.checked),
                    }),
                    '参与图片分组（开启后可在图片列表左侧按此字段分组）',
                ]),
            ]),

            // 图片详情展示方式
            h(DialogFormItem, { label: '详情展示' }, [
                h('label', {
                    style: {
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        color: '#555',
                    },
                }, [
                    h('input', {
                        type: 'checkbox',
                        checked: renderHtml,
                        onChange: (e) => setRenderHtml(e.target.checked),
                        style: { marginTop: '2px' },
                    }),
                    h('span', {}, [
                        '按 HTML 渲染字段值',
                        h('span', {
                            style: {
                                display: 'block',
                                marginTop: '3px',
                                color: 'var(--g-text-secondary)',
                                fontSize: '12px',
                                lineHeight: '1.5',
                            },
                        }, '仅影响图片详情展示；HTML 会经过安全过滤，复制、分组和选项提取仍使用原始字符串。'),
                    ]),
                ]),
            ]),
        ]),
    ]);
}
