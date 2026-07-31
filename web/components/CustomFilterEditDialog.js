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
3. 描述你想筛选的条件；如需图片 Prompt 示例，可打开一张图片，在详情中点击「复制 API Prompt」后粘贴给 AI
4. 将 AI 返回的名称、输入框提示和执行函数填入下方输入框`;

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

用户可能会在需求后附上一份从图片详情中复制的 ComfyUI API Prompt JSON。请结合这份真实样本定位节点、class_type 和 inputs，不要假定节点 ID 固定。若用户还没有提供样本，但需求依赖 generatePrompt，请先提醒用户：打开一张有代表性的图片，在图片详情中点击「复制 API Prompt」，再把内容粘贴给你。

## 你需要输出三个部分

### 1. 筛查项名称
用中文简短描述这个筛选功能。

### 2. 输入框提示 (placeholder)
用一句简短示例告诉用户应输入什么、支持什么语法。即使筛查项不需要输入，也要说明 placeholder 建议留空。

### 3. 执行函数 (filterCode)
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
- 可用内置函数: int, str, float, len, bool, isinstance, list, dict, set, tuple, sorted, enumerate, zip, map, filter, any, all, min, max, sum, abs, range, reversed, round, pow, divmod
- 可捕获异常: ValueError, TypeError, KeyError, IndexError, Exception
- 可用模块（直接使用，无需 import）: re, json, math, datetime, timezone, timedelta
- 如确需 import，只允许 datetime、re、json、math、time；不可用 open、exec、eval、os、pathlib、subprocess

## 输出格式

依次给出筛查项名称、placeholder 和 filterCode。不要把结果包装成 JSON，代码只放在一个 Python 代码块中。

## 示例

用户: "筛选分辨率大于等于 1024x1024 的图片，输入格式如 1024x1024"

你:
这个筛查项按分辨率筛选图片，输入宽高如 1024x1024，匹配大于等于该尺寸的图片。

输入框提示：输入最小尺寸，如 1024x1024

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

---

用户: "按 Prompt 名称模糊搜索"

你:
这个筛查项按 Prompt 名称关键词搜索，支持模糊匹配。

输入框提示：输入 Prompt 关键词

执行函数：
\`\`\`python
def filter_func(item, keywords):
    if not keywords:
        return True
    kw = keywords.lower()
    return kw in item.get('promptString', '').lower()
\`\`\`

---

用户: "筛选 generatePrompt 中包含指定 unet_name 的图片"

你:
这个筛查项从 generatePrompt（ComfyUI 工作流 JSON 字符串）中提取 unet_name 字段进行筛选。

输入框提示：输入 unet_name，如 flux1-dev.safetensors

执行函数：
\`\`\`python
def filter_func(item, keywords):
    if not keywords:
        return True
    gp = item.get('generatePrompt', '')
    if not gp:
        return False
    return keywords.lower() in gp.lower()
\`\`\`

## 注意事项
1. keywords 为空时 filterCode 必须返回 True
2. 优先直接使用已内置的模块；如确需 import，仅限 datetime、re、json、math、time。不要使用 open、exec、eval
3. generatePrompt 是 JSON 字符串，使用前用 if 判断是否为空
4. fileInfo 字段可能不存在，用 .get() 安全取值
5. re 模块可直接使用，如 re.findall(r'pattern', string)
6. datetime 模块可直接使用，如 datetime.fromtimestamp(ts/1000)
7. 下方会附上系统当前内置筛查项的真实实现。优先复用其中的空输入处理、匹配语义和安全取值方式，但不要照搬与用户需求无关的逻辑`;

function formatBuiltinFilterExamples(filters) {
    const builtins = filters.filter((filter) => filter?.builtin);
    if (builtins.length === 0) return '';

    const examples = builtins.map((filter) => {
        const placeholder = filter.placeholder || '（留空）';
        return `### ${filter.name}\n输入框提示：${placeholder}\n\n\`\`\`python\n${filter.filterCode || ''}\n\`\`\``;
    });

    return `## 当前内置筛查项示例（系统实时读取）\n\n${examples.join('\n\n---\n\n')}`;
}

function handleCopyAiPrompt(filters) {
    let prompt = AI_SYSTEM_PROMPT;
    const examples = formatBuiltinFilterExamples(filters);
    if (examples) {
        prompt += `\n\n${examples}`;
    }

    navigator.clipboard.writeText(prompt).then(() => {
        showToast(
            examples ? '已复制 AI 提示词（含内置筛查项示例）' : '已复制 AI 提示词（未找到内置筛查项示例）',
            examples ? 'success' : 'warning',
        );
    }).catch(() => {
        showToast('复制失败，请重试', 'error');
    });
}

export function CustomFilterEditDialog({ isOpen, onClose, onSave, editItem, filters = [] }) {
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
          onClick: () => handleCopyAiPrompt(filters),
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
