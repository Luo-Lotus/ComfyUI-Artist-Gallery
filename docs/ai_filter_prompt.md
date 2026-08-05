# AI 生成自定义筛查项

## 如何使用

### 第一步：复制提示词

在筛查项编辑弹窗中，点击右上角的「复制 AI 提示词」按钮，将系统提示词复制到剪贴板。复制内容会自动附上当前内置筛查项的名称、输入提示和真实执行代码，供 AI 参考。

### 第二步：发送给 LLM

打开任意 LLM（ChatGPT、Claude、DeepSeek 等）：

1. 将复制的提示词作为**系统消息**粘贴
2. 在**用户消息**中描述你的筛选需求
3. 如果需求需要分析真实工作流，请在图库中打开一张有代表性的图片，点击「复制 API Prompt」，再将复制的 JSON 作为图片 Prompt 示例一并粘贴给 AI

#### 示例对话

**系统消息**：（粘贴复制的提示词）

**用户消息**：
```
我的图片 Prompt 大多是这样的：
masterpiece, best quality, 1girl, solo, long hair, oil painting, impressionism
masterpiece, best quality, landscape, sunset, watercolor, sketch

我想筛选用特定风格生成的图片，输入框可以让我输入风格关键词如 oil painting、watercolor 等。
```

AI 会给出筛查项名称、输入框提示（placeholder），然后在 Python 代码块中给出 `filterCode`。

### 第三步：填入筛查项

将 AI 输出中的代码分别填入编辑弹窗：

- **筛查项名称** ← AI 给出的功能名
- **输入框提示** ← AI 给出的 placeholder
- **执行函数** ← `filterCode` Python 代码块中的内容

点击「保存」即可。

---

## 需求示例

告诉 AI 你想筛选什么，越具体越好：

| 需求 | 给 AI 的描述 |
|------|------------|
| 按分辨率 | "筛选宽高都 >= 1024 的图片，输入格式 1024x1024" |
| 按 LoRA | "筛选 generatePrompt 中包含 lora 的图片" |
| 按文件大小 | "筛选大于 5MB 的图片，输入框输入数字表示 MB" |
| 按生成日期 | "筛选某天生成的图片，输入格式 2024-01-01" |
| 按采样器 | "筛选使用 euler 采样器的图片" |
| 按 Prompt 风格 | "筛选 prompts 中包含 watercolor 或 sketch 的图片" |
