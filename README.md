# Prompt Gallery - ComfyUI Prompt图库插件

一个 ComfyUI 自定义节点插件，提供Prompt图库管理、Prompt选择和图片保存功能。

有任何问题或建议，欢迎加QQ群：1082160486，群内也有一些可以直接导入的资源

![demo1](assets/demo1.png)
![demo2](assets/demo2.png)
![demo3](assets/demo3.png)

## 功能特点

- **悬浮图库入口** - 页面右下角可拖动的 🎨 按钮，点击弹出图库管理界面
- **5个自定义节点** - Prompt图库、Prompt选择、保存到画廊、快速保存Prompt、从分类读取Prompt
- **Prompt选择器节点** - 可在 ComfyUI 工作流中直接选择Prompt，输出Prompt名称字符串
- **分区管理系统** - 将Prompt按分区组织，支持分区级别的启用/禁用
- **Prompt权重** - 每个Prompt可独立调整权重（0~2），悬浮标签即可调节，标签颜色随权重变化
- **随机/循环模式** - 每个分区可独立配置随机抽取或循环输出
- **分类浏览** - 按分类层级浏览Prompt，支持面包屑导航
- **组合系统** - 将多个Prompt组合为一个选择单元，支持封面图和自动创建
- **封面图系统** - 每个 Prompt 和组合支持设置封面图（`coverImageId`）；列表期只读封面、不做匹配，首次启动在后台一次性回填历史 Prompt 封面，图片详情按需延迟加载
- **自动创建组合** - 保存图片时可自动根据选中Prompt创建组合（每个分区独立配置，可指定保存到的分类）
- **自动扫描** - 自动检测 ComfyUI output 目录中匹配命名规则的图片
- **拖拽操作** - 支持将Prompt和分类拖拽到不同分区
- **格式模板** - 自定义输出格式，支持 `{content}` 和 `{random(min,max,step)}` 变量
- **图片保存** - 将生成的图片保存到画廊并关联Prompt信息，支持通过 `metadata_json` 或 `prompt_string` 两种方式关联Prompt；即使未匹配到任何Prompt也会保存图片
- **快速保存Prompt** - 将工作流中的文本直接保存为新的Prompt条目，支持自动更新已有的同名Prompt
- **从分类读取Prompt** - 按分类批量读取Prompt内容，支持选取所有、取最新/最旧N个、随机取N个等模式
- **分类画廊控制** - 分类支持"禁止保存到画廊"设置，该分类及其子分类下的Prompt不参与 `prompt_string` 自动匹配
- **批量操作** - 批量添加Prompt、批量删除、批量移动
- **导入导出** - 支持数据导入导出，批量导入和ZIP导入均支持分离存储选项
- **远程图片** - 支持远程URL图片，所有画廊功能（浏览、搜索、组合、删除）均兼容
- **历史视图** - 按日期分组浏览所有已保存图片，支持Prompt和组合过滤
- **Lightbox编辑器** - 全屏图片查看器支持编辑模式，包含混淆（像素打乱）、画笔、马赛克、撤销等功能
- **自定义过滤器** - 支持创建和管理自定义过滤条件，灵活筛选Prompt
- **设置面板** - 全局配置管理，支持个性化设置

## 安装方法

### 方法一：手动安装

1. 将 `prompt_gallery` 文件夹复制到 ComfyUI 的 `custom_nodes` 目录：

```
ComfyUI/custom_nodes/prompt_gallery/
```

2. 重启 ComfyUI

### 方法二：Git Clone

```bash
cd ComfyUI/custom_nodes/
git clone <repository-url> prompt_gallery
```

然后重启 ComfyUI。

### 安装 Python 依赖

本插件依赖 `pyahocorasick`（用于首次启动时在后台高性能回填历史 Prompt 的封面图）。未安装时插件仍可运行，但会自动回退到慢速实现。

- 便携版（`ComfyUI_windows_portable`）：

```bash
./python_embeded/python.exe -m pip install -r custom_nodes/prompt-gallery/requirements.txt
```

- 普通环境：

```bash
pip install -r custom_nodes/prompt-gallery/requirements.txt
```

### 验证安装

重启后打开 ComfyUI 界面，在节点搜索中输入 `Prompt` 或 `Prompt`，应能看到以下五个节点：

- 🎨 Prompt图库
- 🎨 Prompt选择
- 🎨 保存到画廊
- 🎨 快速保存Prompt
- 🎨 从分类读取Prompt

## 节点说明

### 🎨 Prompt图库 (PromptGallery)

管理Prompt图库的 UI 入口节点。

- **类型**: 输出节点（不产生工作流输出）
- **输入**:
    - `action`: 操作选项（打开画廊 / 刷新数据 / 统计信息）
- **使用**: 添加到工作流后，点击页面右下角的 🎨 悬浮按钮打开图库管理界面
- **界面功能**:
    - Prompt和组合的浏览、搜索、过滤
    - 分类树形导航
    - 历史视图（按日期分组浏览图片）
    - Lightbox图片查看器（支持编辑模式）
    - 自定义过滤器
    - 设置面板
    - 批量操作（删除、移动、复制）
    - 导入导出（JSON、ZIP）

### 🎨 Prompt选择 (PromptSelector)

在工作流中选择Prompt并输出Prompt名称字符串。

- **类型**: 功能节点
- **输出**:
    - `prompts_string`: 逗号分隔的Prompt名称字符串
    - `metadata_json`: 包含分区配置的 JSON 元数据
- **功能**:
    - 前端交互式选择Prompt
    - 支持分区管理（创建、删除、重命名）
    - 分区成员统一列表（orderItems）：Prompt、分类、组合混排，支持拖拽排序
    - 支持随机模式（每次随机抽取 N 个Prompt）
    - 支持循环模式（每次执行输出下一个Prompt）
    - 支持组合选择（将多个Prompt作为一个选择单元）
    - 支持Prompt权重调整（0~2，悬浮标签显示滑块，标签颜色随权重变化）
    - 支持自定义输出格式
    - 每个分区独立配置自动创建组合
    - 封面图悬停预览（直接使用coverImagePath，无API调用）
    - 分区内容悬停预览弹窗

### 🎨 保存到画廊 (SaveToGallery)

将生成的图片保存到画廊目录并关联Prompt信息。

- **类型**: 输出节点
- **输入**:
    - `images`: ComfyUI 图片张量
    - `metadata_json`: Prompt元数据 JSON（可连接 PromptSelector 的输出，优先级高）
    - `filename_prefix`: 文件名前缀（默认 `AG`）
    - `prompt_string`: 提示词字符串（自动匹配已知Prompt名，无需连接 PromptSelector）
- **输出**: 图片保存到 `output/prompt_gallery/` 目录
- **说明**:
    - 两者都提供时，优先使用 `metadata_json`
    - `prompt_string` 模式会自动从提示词中匹配已知Prompt名（不区分大小写，循环子串匹配），支持带格式前缀的名称（如 `@mike`、`(sarah:1.2)` 等）
    - 即使未匹配到任何Prompt，图片也会保存（关联的Prompt列表为空）
    - 设置了"禁止保存到画廊"的分类及其子分类下的Prompt不参与匹配

### 🎨 快速保存Prompt (QuickSavePrompt)

将工作流中的文本直接保存为新的Prompt条目。

- **类型**: 输出节点
- **输入**:
    - `prompt_name`: Prompt名称（用于显示和识别）
    - `category`: 目标分类（下拉选择已有分类）
    - `prompt_value`: Prompt内容（文本输入，可连接其他节点输出）
- **功能**:
    - 自动检查同分类下是否已有同名Prompt
    - 已存在时自动更新内容（同步更新图片映射中的旧值）
    - 不存在时创建新的Prompt条目
    - 适合在工作流中动态生成和保存Prompt

### 🎨 从分类读取Prompt (PromptCategoryReader)

按分类批量读取Prompt内容，支持多种选取模式。

- **类型**: 功能节点
- **输出**:
    - `text`: 按指定分隔符拼接的Prompt内容字符串
- **输入**:
    - `category`: 源分类（下拉选择，支持"全部"和带缩进的层级分类）
    - `property`: 读取属性（`value` 或 `name`）
    - `mode`: 选取模式
        - `选取所有`: 返回该分类（含子分类）下的所有Prompt
        - `取最新N个`: 按创建时间倒序取前N个
        - `取最旧N个`: 按创建时间正序取前N个
        - `随机取N个`: 随机选取N个
    - `count`: 数量（仅在取N个模式下生效）
    - `separator`: 分隔符（默认 `, `）
- **功能**:
    - 递归读取子分类下的所有Prompt
    - 支持按创建时间排序
    - 支持随机选取
    - 适合批量获取Prompt内容用于后续处理

## 使用方法

### Prompt图库

1. 在工作流中添加 **Prompt图库** 节点
2. 点击页面右下角的 🎨 悬浮按钮（可拖动到任意位置）
3. 在弹窗中浏览所有Prompt和组合
4. 使用搜索框按名称过滤
5. 使用分类树形导航筛选Prompt
6. 点击图片查看大图（Lightbox 显示关联Prompt标签）
7. 在 Lightbox 中点击"编辑"进入编辑模式（混淆、画笔、马赛克）
8. 右键图片可设置封面、移动、复制等操作
9. 点击历史图标进入历史视图，按日期浏览图片
10. 使用自定义过滤器创建复杂筛选条件
11. 点击设置图标打开设置面板

### Prompt选择器

1. 在工作流中添加 **Prompt选择** 节点
2. 节点上会显示交互式选择界面：
    - **已选区域**（上方）: 显示分区及已选Prompt/分类/组合，支持拖拽管理
    - **浏览区域**（下方）: 搜索、分类浏览、选择Prompt
3. 在浏览区域点击Prompt、分类或组合即可添加到当前分区
4. 鼠标悬停在Prompt或组合上可预览封面图
5. 鼠标悬停在已选Prompt标签上可调整权重（0~2），标签背景色随权重变化
6. 已选标签支持拖拽排序（同一分区内）和跨分区拖拽
7. 点击分区标题旁的按钮可切换分区配置：
    - **🎲 随机模式**: 每次执行随机抽取指定数量的Prompt
    - **🔄 循环模式**: 每次执行依次输出一个Prompt
    - **💾 保存到画廊**: 启用后图片保存时关联Prompt
    - **🔗 自动创建组合**: 保存时自动创建包含当前Prompt的组合（可配置保存到的分类）
    - **格式模板**: 自定义输出格式，支持 `{content}` 和 `{random(min,max,step)}` 变量
8. 节点输出可直接连接到提示词节点或其他文本输入

### 保存到画廊

支持两种方式关联Prompt：

**方式一：通过Prompt选择器（推荐）**

1. 在工作流中添加 **保存到画廊** 节点
2. 将图片生成节点的输出连接到 `images` 输入
3. 将Prompt选择节点的 `metadata_json` 输出连接到 `metadata_json` 输入
4. 图片将保存到 `output/prompt_gallery/` 并自动关联Prompt信息
5. 如果分区启用了自动创建组合，保存时会自动创建组合

**方式二：通过提示词字符串**

1. 在工作流中添加 **保存到画廊** 节点
2. 将图片生成节点的输出连接到 `images` 输入
3. 将包含Prompt名称的文本连接到 `prompt_string` 输入（无需连接Prompt选择器）
4. 插件会自动从提示词中匹配已知Prompt名，并关联到保存的图片

> 两种方式可同时使用，同时提供时优先使用 `metadata_json`。

### 快速保存Prompt

1. 在工作流中添加 **快速保存Prompt** 节点
2. 在 `prompt_name` 输入框填写Prompt名称
3. 在 `category` 下拉菜单选择目标分类
4. 将包含Prompt内容的文本节点连接到 `prompt_value` 输入
5. 执行工作流后，Prompt将自动保存到图库
6. 如果同分类下已存在同名Prompt，会自动更新其内容

### 从分类读取Prompt

1. 在工作流中添加 **从分类读取Prompt** 节点
2. 在 `category` 下拉菜单选择源分类（可选择"全部"读取所有分类）
3. 在 `property` 选择读取 `value`（内容）或 `name`（名称）
4. 在 `mode` 选择选取模式：
    - `选取所有`: 获取该分类下的所有Prompt
    - `取最新N个`: 获取最近创建的N个Prompt
    - `取最旧N个`: 获取最早创建的N个Prompt
    - `随机取N个`: 随机获取N个Prompt
5. 设置 `count`（仅在取N个模式下）和 `separator`
6. 输出可连接到其他需要Prompt内容的节点

### 输出格式模板

在Prompt选择节点的分区配置中，可以自定义输出格式：

| 变量                     | 说明       | 示例                            |
| ------------------------ | ---------- | ------------------------------- |
| `{content}`              | Prompt名称 | `prompt_name`                   |
| `{random(min,max,step)}` | 随机数     | `{random(0.5,2.0,0.1)}` → `1.3` |

格式示例：

- 默认: `{content}` → `prompt_name`
- 加权重: `({content}:{random(0.5,2.0,0.1)})` → `(prompt_name:1.3)`
- 自定义前缀: `by {content}` → `by prompt_name`
- 组合格式: `@{content}` → 自动创建组合时使用 `@prompt_one,@prompt_two`

### Prompt权重

每个Prompt可独立设置权重（0~2，默认 1.0），权重与格式模板独立，自动包裹格式化结果：

| 格式模板      | 权重 | 输出                  |
| ------------- | ---- | --------------------- |
| `{content}`   | 1.0  | `prompt_name`         |
| `{content}`   | 1.5  | `(prompt_name:1.5)`   |
| `({content})` | 1.5  | `((prompt_name):1.5)` |
| `@{content}`  | 1.5  | `(@prompt_name:1.5)`  |

- 鼠标悬浮在已选Prompt标签上，标签上方会出现滑块
- 权重为 1.0 时不显示权重数字，也不包裹输出
- 标签背景色随权重变化（低权重淡蓝，高权重深蓝紫）
- 组合和分类标签不支持权重调整

## 图片命名规则

插件会自动扫描 ComfyUI output 目录中符合以下命名规则的图片：

```
@Prompt名,_序号.扩展名
```

示例：

- `@mike,_1.png`
- `@sarah,_2.jpg`
- `@prompt_name,_1.webp`

支持的图片格式：`.png`、`.jpg`、`.jpeg`、`.webp`

## 项目结构

```
prompt_gallery/
├── __init__.py                  # 插件入口，注册5个节点
├── nodes.py                     # 节点类定义 & 输出处理逻辑
├── utils.py                     # 工具函数（文件扫描、辅助方法）
├── storage/                     # 数据持久化层（多文件 glob 架构）
│   ├── __init__.py              # 存储模块导出 + get_storage()
│   ├── prompt.py                # Prompt存储 (PromptStorage) — *.prompts.json
│   ├── category.py              # 分类存储 (CategoryStorage) — *.categories.json
│   ├── combination.py           # 组合存储 (CombinationStorage) — *.combinations.json
│   ├── image_mapping.py         # 图片映射 (ImageMappingStorage) — *.images.json
│   ├── migration.py             # 数据迁移
│   └── _resolve.py              # 存储目录解析
├── routes/                      # HTTP API 端点
│   ├── __init__.py              # 路由注册入口
│   ├── _utils.py                # 共用工具函数 (is_remote_path)
│   ├── prompts.py               # Prompt CRUD API
│   ├── categories.py            # 分类 CRUD API
│   ├── combinations.py          # 组合 CRUD API
│   ├── gallery.py               # 图库数据 API
│   ├── images.py                # 图片信息、保存、删除/移动/复制
│   ├── batch.py                 # 批量删除/移动/复制
│   ├── import_export.py         # 导入导出 API（批量导入 + ZIP 导入）
│   ├── history.py               # 历史图片 API（按日期分组）
│   ├── init.py                  # 初始化数据 API（分类+Prompt+组合一次性返回）
│   ├── cycle_state.py           # 循环状态 API
│   └── migration.py             # 数据迁移 API
├── docs/
│   └── data-flow.md             # 数据流文档
├── IMPORT_FORMAT.md             # 导入格式说明文档
└── web/                         # 前端资源
    ├── prompt_gallery.js        # 图库前端入口
    ├── utils.js                 # 共享工具函数
    ├── Draggable.js             # 拖拽功能
    ├── lib/                     # 第三方库
    │   ├── preact.mjs           # Preact 核心
    │   ├── hooks.mjs            # Preact hooks
    │   ├── icons.mjs            # SVG 图标系统（Icon组件 + iconToSvg函数）
    │   └── gilbert.mjs          # Gilbert曲线算法（图片混淆用）
    ├── components/              # Preact 组件
    │   ├── GalleryModal.js      # 图库主容器（懒加载图片、设置封面菜单）
    │   ├── GalleryContext.js     # 共享状态 (context provider)
    │   ├── GalleryHeader.js     # 图库头部操作栏
    │   ├── GalleryGrid.js       # Prompt网格布局
    │   ├── GalleryCard.js       # Prompt卡片（使用coverImagePath）
    │   ├── GalleryFilterBar.js  # 过滤/搜索栏
    │   ├── CombinationCard.js   # 组合卡片
    │   ├── CombinationDialog.js # 组合创建/编辑对话框
    │   ├── CombinationDetailView.js # 组合详情视图
    │   ├── Lightbox.js          # 全屏图片查看器（支持编辑模式：混淆/画笔/马赛克）
    │   ├── BaseCard.js          # 卡片基础组件（选择、右键菜单）
    │   ├── ContextMenu.js       # 右键菜单组件
    │   ├── LazyList.js          # 虚拟滚动列表
    │   ├── Toast.js             # 通知提示系统
    │   ├── Dialog.js            # 可复用模态对话框
    │   ├── AddPromptDialog.js   # 添加Prompt对话框
    │   ├── DeleteConfirmDialog.js # 删除确认对话框
    │   ├── CopyDialog.js        # 复制对话框
    │   ├── MoveDialog.js        # 移动对话框
    │   ├── CategoryDialog.js    # 分类对话框
    │   ├── ImportImagesDialog.js # 批量导入对话框（支持分离存储）
    │   ├── ImportZipDialog.js   # ZIP导入对话框（拖拽+分离存储）
    │   ├── ImportOutputDialog.js # 导入输出对话框
    │   ├── ExportDialog.js      # 导出对话框
    │   ├── HistoryView.js       # 历史视图（按日期分组浏览）
    │   ├── ImageGroupView.js    # 图片分组展示
    │   ├── PromptDetailModal.js # Prompt详情弹窗
    │   ├── PromptDetailView.js  # Prompt详情视图
    │   ├── Breadcrumb.js        # 面包屑导航
    │   ├── BatchActionBar.js    # 批量操作栏
    │   ├── BatchConfirmDialog.js # 批量确认对话框
    │   ├── CategoryCard.js      # 分类卡片
    │   ├── FileUploader.js      # 文件上传组件
    │   ├── FlatSelector.js      # 扁平选择器
    │   ├── TreeSelector.js      # 树形选择器
    │   ├── ImportPreview.js     # 导入预览
    │   ├── SizePresets.js       # 尺寸预设选项
    │   ├── CustomFilterPanel.js # 自定义过滤面板
    │   ├── CustomFilterEditDialog.js # 自定义过滤编辑对话框
    │   ├── SettingsDialog.js    # 设置对话框
    │   └── hooks/               # 自定义 Hooks
    │       ├── useGalleryData.js      # 数据获取与缓存
    │       ├── useFilteredPrompts.js  # 过滤排序（useMemo优化）
    │       ├── useCategoryManager.js  # 分类管理
    │       ├── useSelection.js        # 选择状态
    │       ├── useItemOperations.js   # 条目操作
    │       └── useLightboxEditor.js   # Lightbox编辑模式（画布、撤销、画笔、马赛克、混淆）
    ├── nodes/                   # 节点专用组件
    │   ├── PromptSelector.js    # 选择器节点入口 (beforeRegisterNodeDef)
    │   └── components/
    │       ├── PromptSelectorWidget.js  # 选择器主组件（悬停预览、拖拽排序）
    │       ├── PartitionList.js         # 分区列表（拖拽排序）
    │       ├── PartitionItem.js         # 分区项
    │       ├── PartitionHeader.js       # 分区标题（自动创建图标标识）
    │       ├── PartitionConfigPanel.js  # 分区配置面板（格式、随机、循环、保存、自动创建）
    │       ├── PartitionContent.js      # 分区内容展示
    │       ├── AddPartitionForm.js      # 添加分区表单
    │       ├── ConfigPanel.js           # 配置面板
    │       ├── CategoryConfigDialog.js  # 分类配置对话框
    │       ├── GlobalConfigDialog.js    # 全局配置对话框
    │       └── hooks/
    │           ├── usePromptSelector.js  # 选择器逻辑（通过/init加载数据）
    │           ├── useImagePreview.js    # 封面图悬停预览（直接DOM，无API调用）
    │           ├── useNodeSync.js        # 节点值同步
    │           ├── usePartitionPreview.js # 分区内容悬停预览弹窗
    │           ├── useBodyRender.js      # Portal渲染钩子（渲染到document.body）
    │           ├── usePartitionState.js  # 分区状态、orderItems管理与持久化
    │           └── useFormatProcessor.js # 格式处理钩子
    ├── services/
    │   └── promptApi.js         # API 调用封装
    └── styles/                  # 样式文件
        ├── variables.css        # CSS 变量定义
        ├── gallery.css          # 图库主样式
        ├── gallery-card.css     # 卡片样式
        ├── gallery-grid.css     # 网格布局样式
        ├── modal.css            # 模态框基础样式
        ├── lightbox.css         # Lightbox样式（查看器、信息面板、编辑工具栏）
        ├── prompt-selector.css  # 选择器样式
        ├── prompt-detail.css    # Prompt详情样式
        ├── combination.css      # 组合样式
        ├── category.css         # 分类样式
        ├── toast.css            # 通知样式
        ├── dialogs.css          # 对话框样式
        ├── context-menu.css     # 右键菜单样式
        ├── batch.css            # 批量操作样式
        ├── history.css          # 历史视图样式
        ├── import.css           # 导入相关样式
        ├── custom-filter.css    # 自定义过滤样式
        ├── settings.css         # 设置面板样式
        ├── floating-btn.css     # 悬浮按钮样式
        ├── lazy-list.css        # 虚拟滚动样式
        ├── selectors.css        # 选择器组件样式
        └── size-slider.css      # 尺寸滑块样式
```

## API 端点

### 图库数据

| 方法 | 路径                      | 说明                                           |
| ---- | ------------------------- | ---------------------------------------------- |
| GET  | `/prompt_gallery/init`    | 初始化数据（分类+Prompt+组合，一次性返回）     |
| GET  | `/prompt_gallery/data`    | 获取Prompt和组合数据（支持 `?category=` 过滤） |
| GET  | `/prompt_gallery/html`    | 图库 HTML 页面                                 |
| POST | `/prompt_gallery/batch_resolve` | 批量解析混合实体键（Prompt/分类/组合）   |

### Prompt管理

| 方法   | 路径                                                | 说明                           |
| ------ | --------------------------------------------------- | ------------------------------ |
| GET    | `/prompt_gallery/prompts`                           | 获取所有Prompt列表             |
| POST   | `/prompt_gallery/prompts`                           | 添加Prompt                     |
| POST   | `/prompt_gallery/prompts/batch`                     | 批量添加Prompt                 |
| PUT    | `/prompt_gallery/prompts/{id}`                      | 更新Prompt（按ID）             |
| DELETE | `/prompt_gallery/prompts/{id}`                      | 删除Prompt（按ID）             |
| GET    | `/prompt_gallery/prompts/{categoryId}/{value}`      | 获取Prompt详情（组合键）       |
| PUT    | `/prompt_gallery/prompts/{categoryId}/{value}`      | 更新Prompt（组合键）           |
| DELETE | `/prompt_gallery/prompts/{categoryId}/{value}`      | 删除Prompt（组合键）           |
| POST   | `/prompt_gallery/prompts/{categoryId}/{value}/copy` | 复制Prompt到其他分类           |
| POST   | `/prompt_gallery/prompts/{id}/move`                 | 移动Prompt到其他分类           |
| GET    | `/prompt_gallery/prompt/{id}/images`                | 获取Prompt图片列表             |
| GET    | `/prompt_gallery/images_grouped`                    | 获取分组图片（支持 `prompt` 查询） |

### 分类管理

| 方法   | 路径                                   | 说明       |
| ------ | -------------------------------------- | ---------- |
| GET    | `/prompt_gallery/categories`           | 获取分类树 |
| POST   | `/prompt_gallery/categories`           | 创建分类   |
| PUT    | `/prompt_gallery/categories/{id}`      | 更新分类   |
| DELETE | `/prompt_gallery/categories/{id}`      | 删除分类   |
| POST   | `/prompt_gallery/categories/{id}/move` | 移动分类   |

### 组合管理

| 方法   | 路径                                          | 说明                                   |
| ------ | --------------------------------------------- | -------------------------------------- |
| GET    | `/prompt_gallery/combinations`                | 获取组合列表（支持 `?category=` 过滤） |
| GET    | `/prompt_gallery/combinations/all`            | 获取所有组合                           |
| GET    | `/prompt_gallery/combinations/{id}`           | 获取单个组合                           |
| POST   | `/prompt_gallery/combinations`                | 创建组合                               |
| PUT    | `/prompt_gallery/combinations/{id}`           | 更新组合                               |
| DELETE | `/prompt_gallery/combinations/{id}`           | 删除组合                               |
| POST   | `/prompt_gallery/combinations/{id}/duplicate` | 复制组合                               |
| POST   | `/prompt_gallery/combinations/{id}/move`      | 移动组合                               |
| DELETE | `/prompt_gallery/combinations/batch`          | 批量删除组合                           |

### 图片操作

| 方法   | 路径                                    | 说明                 |
| ------ | --------------------------------------- | -------------------- |
| GET    | `/prompt_gallery/image/info`            | 获取图片详细信息     |
| POST   | `/prompt_gallery/save`                  | 保存图片到画廊       |
| DELETE | `/prompt_gallery/image`                 | 删除单张图片         |
| POST   | `/prompt_gallery/image/move`            | 已废弃：图片不再移动到其他Prompt |
| POST   | `/prompt_gallery/image/copy`            | 已废弃：图片不再复制到其他Prompt |
| POST   | `/prompt_gallery/restore_from_metadata` | 从PNG元数据恢复映射  |

### 历史视图

| 方法 | 路径                             | 说明                             |
| ---- | -------------------------------- | -------------------------------- |
| GET  | `/prompt_gallery/images_grouped` | 图片按日期分组（支持prompt过滤） |

### 导入导出

| 方法 | 路径                            | 说明                               |
| ---- | ------------------------------- | ---------------------------------- |
| POST | `/prompt_gallery/import`        | 导入数据（批量JSON，支持分离存储） |
| POST | `/prompt_gallery/import/zip`    | 导入ZIP文件（支持分离存储）        |
| POST | `/prompt_gallery/images/import` | 导入图片（批量导入，支持分离存储） |
| GET  | `/prompt_gallery/export`        | 导出数据                           |

### 批量操作

| 方法   | 路径                           | 说明     |
| ------ | ------------------------------ | -------- |
| DELETE | `/prompt_gallery/batch/delete` | 批量删除 |
| POST   | `/prompt_gallery/batch/move`   | 批量移动 |
| POST   | `/prompt_gallery/batch/copy`   | 批量复制 |

## Lightbox 编辑器

Lightbox（全屏图片查看器）支持编辑模式，点击图片上方的"编辑"按钮进入编辑模式。

### 编辑工具

| 工具 | 说明 |
|------|------|
| **混淆** | 使用 Gilbert 曲线打乱像素，相同尺寸的图片产生相同的打乱效果，可逆 |
| **还原** | 还原原图，清除所有编辑（混淆+画笔+马赛克） |
| **画笔** | 自由绘画，支持配置颜色和大小，支持触屏 |
| **马赛克** | 绘制马赛克块，自动取图片自身颜色，滑块控制块大小（1-80px） |
| **撤销** | 撤销上一步操作（最多20步），支持 Ctrl+Z 快捷键 |

### 注意事项

- 所有编辑仅预览有效，关闭 Lightbox 后丢弃，不会修改原文件
- 右键画布打开浏览器右键菜单（可复制），不会触发绘画
- 导航到其他图片会自动退出编辑模式

## 历史视图

历史视图按日期分组浏览所有已保存的图片，支持按Prompt和组合过滤。

### 功能特点

- 按日期分组展示图片
- 支持按Prompt名称过滤
- 支持按组合过滤
- 支持图片删除、移动、复制等操作
- 点击图片可打开 Lightbox 查看大图

### 访问方式

在图库界面点击头部操作栏的历史图标进入历史视图。

## 故障排除

**看不到 🎨 悬浮按钮**

- 确认已重启 ComfyUI
- 检查页面右下角，按钮可能被拖到了其他位置
- 按 F12 打开浏览器控制台查看是否有错误

**Prompt选择器节点不显示交互界面**

- 刷新浏览器页面（Ctrl+Shift+R 强制刷新）
- 确认节点已正确添加到工作流
- 检查浏览器控制台是否有 JavaScript 错误

**扫描不到图片**

- 确认图片文件名格式正确（`@Prompt名,_序号.扩展名`）
- 确认图片在 ComfyUI 的 output 目录中
- 在图库界面点击刷新按钮重新加载

**组合自动创建不生效**

- 确认分区已开启「保存到画廊」选项
- 确认分区已开启「自动创建组合」选项
- 自动创建只在有Prompt被选中时生效
- 可在分区配置中指定保存到的分类（留空则保存到根目录）

**分区拖拽不生效**

- 确保拖拽的是Prompt标签或分类卡片到目标分区
- 刷新浏览器页面后重试

**快速保存Prompt失败**

- 确认 `prompt_name` 已填写
- 确认 `prompt_value` 已连接有效的文本输入
- 确认目标分类存在

**从分类读取Prompt返回空**

- 确认选择的分类下存在Prompt
- 如果使用"全部"，确认图库中已有Prompt数据
- 检查分类是否有子分类，节点会递归读取子分类

## 开发说明

- Python 文件修改后需重启 ComfyUI
- JavaScript/CSS 文件修改后刷新浏览器即可（建议 Ctrl+Shift+R）
- 前端使用 Preact 组件化架构，组件位于 `web/components/` 和 `web/nodes/components/`
- 后端代码已拆分为 `routes/`（API 端点）和 `storage/`（数据持久化）模块

### 图标系统

所有 UI 图标使用 SVG，通过 `web/lib/icons.mjs` 提供：

- **`Icon` Preact 组件**: 在 Preact JSX 中使用，`h(Icon, { name: 'search', size: 16 })`
- **`iconToSvg(name, size)` 函数**: 返回 SVG HTML 字符串，用于原生 DOM（如 ContextMenu）

常用图标：`search`（搜索）、`x`（关闭）、`plus`（添加）、`trash-2`（删除）、`copy`（复制）、`edit`（编辑）、`folder`（分类）、`link`（组合）、`shuffle`（随机）、`repeat`（循环）、`download`（导入）、`upload`（导出）等。

### Lightbox 编辑器技术

- 使用 Gilbert 曲线空间填充算法进行像素打乱（`web/lib/gilbert.mjs`）
- 编辑模式使用 `<canvas>` 替代 `<img>`，通过 `buildImageUrl()` 加载图片
- 画笔和马赛克支持触屏操作
- 撤销栈最多保存 20 步

### 性能优化

- 列表期接口（`/data`、`/init`、`/batch_resolve`、`/search` 等）只读持久化 `coverImageId`，**不做任何 prompt×mapping 匹配**，避免大数据量下 O(P×M) 卡死事件循环
- 图片数量改由详情页 `/images_grouped` 返回的图片列表推导，列表 API 不再返回 `imageCount`
- 图库列表 API 仅返回 `coverImagePath`（不返回完整图片数组）
- Prompt 图片懒加载（进入详情时才请求）
- 封面图预览直接使用 `coverImagePath`（无 API 调用）
- 首次启动在后台 daemon 线程用 `ahocorasick` 一次性高性能回填历史 Prompt 封面（O(总文本长度)，不阻塞页面），`.cover_backfill_version` 标记保证只跑一次
- 解析映射时忽略 `comfy_output*.images.json`（系统外导入、仅历史视图用），避免每次读取 parse 超大文件
- `/init` 端点一次性返回分类+Prompt+组合
- `batchResolve` 端点批量解析混合实体键
- `useFilteredPrompts` 使用 `useMemo` 优化过滤排序
- 虚拟滚动列表（`LazyList`）处理大量数据
