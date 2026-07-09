/**
 * 筛查项编辑弹窗
 * 创建/编辑筛查项：名称、执行函数、提取选项值函数
 */
import { h } from '../lib/preact.mjs';
import { useState, useEffect, useCallback } from '../lib/hooks.mjs';
import { Dialog, DialogButton, DialogFormGroup, DialogFormItem } from './Dialog.js';
import { showToast } from './Toast.js';
import { Icon } from '../lib/icons.mjs';

const ITEM_FIELDS_HELP = `使用 AI 生成代码：
1. 点击右侧「复制 AI 提示词」
2. 将提示词发给 LLM（ChatGPT / Claude / DeepSeek）
3. 描述你想筛选的条件，附上图片 Prompt 示例
4. 将 AI 返回的 JSON 填入下方三个输入框`;

const FILTER_CODE_TEMPLATE = `def filter_func(item, keywords):
    """参数: item (dict), keywords (str)  返回: bool"""
    if not keywords:
        return True
    # 在此编写筛选逻辑
    return True`;

const AI_SYSTEM_PROMPT = `你是一个 ComfyUI 图库筛查项代码生成器。用户会描述筛选需求，你需要生成 Python 代码。

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

## 你需要输出三个部分

### 1. 筛查项名称
用中文简短描述这个筛选功能。

### 2. 执行函数 (filterCode)
Python 函数，格式如下：

\`\`\`python
def filter_func(item, keywords):
    if not keywords:
        return True
    # 筛选逻辑
    return True  # 或 False
\`\`\`

- item: 上述图片数据 dict
- keywords: 用户在输入框输入的字符串，可能为空
- 返回 bool，True 表示匹配
- keywords 为空时必须返回 True（表示不筛选）
- 可用内置函数: int, str, float, len, bool, isinstance, list, dict, set, tuple, sorted, enumerate, zip, map, filter, any, all, min, max, sum, abs, range, reversed, hasattr, getattr, type, round, pow, divmod
- 可用模块（直接使用，无需 import）: re, json, math, datetime, timezone, timedelta
- 不可用: import, open, exec, eval, os, pathlib, subprocess

### 3. 提取选项值函数 (extractCode)（可选）
如果需要下拉补全功能，提供此函数：

\`\`\`python
def extract_func(item):
    # 返回字符串作为下拉选项
    return ""
\`\`\`

- 返回 str，会自动去重排序显示在下拉列表中
- 不需要下拉功能时，说"不需要提取函数"即可

## 输出格式

先用一句话说明这个筛选的功能，然后用代码块分别给出 filterCode 和 extractCode（如果需要）。不要输出 JSON，直接输出代码。

## 示例

用户: "筛选分辨率大于等于 1024x1024 的图片，输入格式如 1024x1024"

你:
这个筛查项按分辨率筛选图片，输入宽高如 1024x1024，匹配大于等于该尺寸的图片。

执行函数：
\`\`\`python
def filter_func(item, keywords):
    if not keywords:
        return True
    try:
        parts = keywords.lower().split('x')
        w, h = int(parts[0]), int(parts[1])
        fi = item.get('fileInfo', {})
        return fi.get('width', 0) >= w and fi.get('height', 0) >= h
    except:
        return False
\`\`\`

提取函数（用于下拉显示所有实际分辨率）：
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

用户: "按 Prompt 名称模糊搜索"

你:
这个筛查项按 Prompt 名称关键词搜索，支持模糊匹配。

执行函数：
\`\`\`python
def filter_func(item, keywords):
    if not keywords:
        return True
    kw = keywords.lower()
    return kw in item.get('promptString', '').lower()
\`\`\`

不需要提取函数。

---

用户: "筛选 generatePrompt 中包含指定 unet_name 的图片，下拉显示所有 unet_name"

你:
这个筛查项从 generatePrompt（ComfyUI 工作流 JSON 字符串）中提取 unet_name 字段进行筛选。

执行函数：
\`\`\`python
def filter_func(item, keywords):
    if not keywords:
        return True
    gp = item.get('generatePrompt', '')
    if not gp:
        return False
    return keywords in gp
\`\`\`

提取函数（用于下拉显示所有 unet_name）：
\`\`\`python
def extract_func(item):
    gp = item.get('generatePrompt', '')
    if not gp:
        return ""
    matches = re.findall(r'"unet_name"\s*:\s*"([^"]*)"', gp)
    return matches[0] if matches else ""
\`\`\`

## 注意事项
1. keywords 为空时 filterCode 必须返回 True
2. 不要使用 import、open、exec、eval，所有常用模块已内置可直接使用
3. generatePrompt 是 JSON 字符串，使用前用 if 判断是否为空
4. fileInfo 字段可能不存在，用 .get() 安全取值
5. re 模块可直接使用，如 re.findall(r'pattern', string)
6. datetime 模块可直接使用，如 datetime.fromtimestamp(ts/1000)`;

function handleCopyAiPrompt() {
    navigator.clipboard.writeText(AI_SYSTEM_PROMPT).then(() => {
        showToast('已复制 AI 提示词到剪贴板', 'success');
    }).catch(() => {
        showToast('复制失败，请手动复制', 'error');
    });
}

export function CustomFilterEditDialog({ isOpen, onClose, onSave, editItem }) {
  const [name, setName] = useState('');
  const [placeholder, setPlaceholder] = useState('');
  const [filterCode, setFilterCode] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const isBuiltin = editItem?.builtin;

  useEffect(() => {
    if (isOpen) {
      if (editItem) {
        setName(editItem.name || '');
        setPlaceholder(editItem.placeholder || '');
        setFilterCode(editItem.filterCode || FILTER_CODE_TEMPLATE);
      } else {
        setName('');
        setPlaceholder('');
        setFilterCode(FILTER_CODE_TEMPLATE);
      }
      setTestResult(null);
    }
  }, [isOpen, editItem]);

  const handleTest = useCallback(async () => {
    if (!editItem) {
      showToast('请先保存后再测试', 'warning');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/prompt_gallery/custom_filters/${editItem.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: '' }),
      });
      const result = await res.json();
      if (result.success) {
        setTestResult({ matched: result.matched, total: result.total, errors: result.errors });
      } else {
        setTestResult({ error: result.error });
      }
    } catch (e) {
      setTestResult({ error: e.message });
    } finally {
      setTesting(false);
    }
  }, [editItem]);

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      showToast('请输入筛查项名称', 'warning');
      return;
    }
    if (!filterCode.trim()) {
      showToast('请输入执行函数', 'warning');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        placeholder: placeholder.trim(),
        filterCode: filterCode.trim(),
      };

      let url, method;
      if (editItem) {
        url = `/prompt_gallery/custom_filters/${editItem.id}`;
        method = 'PUT';
      } else {
        url = '/prompt_gallery/custom_filters';
        method = 'POST';
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();

      if (result.success) {
        showToast(editItem ? '筛查项已更新' : '筛查项已创建', 'success');
        if (onSave) onSave(result.filter);
        onClose();
      } else {
        showToast('保存失败: ' + (result.error || '未知错误'), 'error');
      }
    } catch (e) {
      showToast('保存失败: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  }, [name, placeholder, filterCode, editItem, onSave, onClose]);

  const renderFooter = () => [
    h(DialogButton, { onClick: onClose }, '取消'),
    editItem && h(DialogButton, {
      onClick: handleTest,
      disabled: testing,
    }, testing ? '测试中...' : '测试运行'),
    h(DialogButton, {
      variant: 'primary',
      onClick: handleSave,
      disabled: saving,
    }, saving ? '保存中...' : '保存'),
  ];

  return h(Dialog, {
    isOpen,
    onClose,
    title: editItem ? '编辑筛查项' : '新建筛查项',
    titleIcon: h(Icon, { name: 'settings', size: 18 }),
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
      h(DialogFormItem, { label: '筛查项名称' }, [
        h('input', {
          class: 'gallery-form-input',
          type: 'text',
          value: name,
          onInput: (e) => setName(e.target.value),
          placeholder: '例如：分辨率筛选',
          disabled: isBuiltin,
        }),
      ]),

      // 输入提示
      h(DialogFormItem, { label: '输入框提示（placeholder）' }, [
        h('input', {
          class: 'gallery-form-input',
          type: 'text',
          value: placeholder,
          onInput: (e) => setPlaceholder(e.target.value),
          placeholder: '例如：输入关键词，用 & 分隔表示"且"，| 表示"或"',
        }),
      ]),

      // 执行函数
      h(DialogFormItem, { label: '执行函数（Python，定义 filter_func(item, keywords) -> bool）' }, [
        h('textarea', {
          class: 'gallery-form-textarea code',
          value: filterCode,
          onInput: (e) => setFilterCode(e.target.value),
          rows: 10,
          style: { fontFamily: 'monospace', fontSize: '12px', resize: 'vertical' },
        }),
      ]),

      // 测试结果
      testResult && h('div', {
        style: {
          padding: '8px 12px',
          borderRadius: '6px',
          fontSize: '12px',
          marginTop: '8px',
          background: testResult.error ? 'rgba(244, 67, 54, 0.1)' : 'rgba(76, 175, 80, 0.1)',
          border: `1px solid ${testResult.error ? 'var(--g-error)' : 'var(--g-success)'}`,
          color: testResult.error ? 'var(--g-error)' : 'var(--g-success)',
        },
      }, testResult.error
        ? `❌ 错误: ${testResult.error}`
        : `✅ 匹配 ${testResult.matched}/${testResult.total} 张` +
          (testResult.errors?.length > 0 ? ` (${testResult.errors.length} 个执行错误)` : '')
      ),
    ]),
  ]);
}
