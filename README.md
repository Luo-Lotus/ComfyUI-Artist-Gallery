# Artist Gallery - ComfyUI 画师图库插件

一个 ComfyUI 自定义节点插件，提供画师图库管理、画师选择和图片保存功能。

![demo1](assets/demo1.png)
![demo2](assets/demo2.png)
![demo3](assets/demo3.png)

## 功能特点

- **悬浮图库入口** - 页面右下角可拖动的 🎨 按钮，点击弹出图库管理界面
- **画师选择器节点** - 可在 ComfyUI 工作流中直接选择画师，输出画师名称字符串
- **分区管理系统** - 将画师按分区组织，支持分区级别的启用/禁用
- **画师权重** - 每个画师可独立调整权重（0~2），悬浮标签即可调节，标签颜色随权重变化
- **随机/循环模式** - 每个分区可独立配置随机抽取或循环输出
- **分类浏览** - 按分类层级浏览画师，支持面包屑导航
- **组合系统** - 将多个画师组合为一个选择单元，支持封面图和自动创建
- **封面图系统** - 每个画师和组合支持设置封面图，图库列表延迟加载图片详情
- **自动创建组合** - 保存图片时可自动根据选中画师创建组合（每个分区独立配置）
- **自动扫描** - 自动检测 ComfyUI output 目录中匹配命名规则的图片
- **拖拽操作** - 支持将画师和分类拖拽到不同分区
- **格式模板** - 自定义输出格式，支持 `{content}` 和 `{random(min,max,step)}` 变量
- **图片保存** - 将生成的图片保存到画廊并关联画师信息，支持通过 `metadata_json` 或 `prompt_string` 两种方式关联画师
- **批量操作** - 批量添加画师、批量删除、批量移动
- **导入导出** - 支持画师和分类数据的导入导出

## 安装方法

### 方法一：手动安装

1. 将 `artist_gallery` 文件夹复制到 ComfyUI 的 `custom_nodes` 目录：

```
ComfyUI/custom_nodes/artist_gallery/
```

2. 重启 ComfyUI

### 方法二：Git Clone

```bash
cd ComfyUI/custom_nodes/
git clone <repository-url> artist_gallery
```

然后重启 ComfyUI。

### 验证安装

重启后打开 ComfyUI 界面，在节点搜索中输入 `Artist` 或 `画师`，应能看到以下三个节点：

- 🎨 画师图库
- 🎨 画师选择
- 🎨 保存到画廊

## 节点说明

### 🎨 画师图库 (ArtistGallery)

管理画师图库的 UI 入口节点。

- **类型**: 输出节点（不产生工作流输出）
- **输入**:
    - `action`: 操作选项（打开画廊 / 刷新数据 / 统计信息）
- **使用**: 添加到工作流后，点击页面右下角的 🎨 悬浮按钮打开图库管理界面

### 🎨 画师选择 (ArtistSelector)

在工作流中选择画师并输出画师名称字符串。

- **类型**: 功能节点
- **输出**:
    - `artists_string`: 逗号分隔的画师名称字符串
    - `metadata_json`: 包含分区配置的 JSON 元数据
- **功能**:
    - 前端交互式选择画师
    - 支持分区管理（创建、删除、重命名）
    - 支持随机模式（每次随机抽取 N 个画师）
    - 支持循环模式（每次执行输出下一个画师）
    - 支持组合选择（将多个画师作为一个选择单元）
    - 支持画师权重调整（0~2，悬浮标签显示滑块，标签颜色随权重变化）
    - 支持自定义输出格式
    - 每个分区独立配置自动创建组合

### 🎨 保存到画廊 (SaveToGallery)

将生成的图片保存到画廊目录并关联画师信息。

- **类型**: 输出节点
- **输入**:
    - `images`: ComfyUI 图片张量
    - `metadata_json`: 画师元数据 JSON（可连接 ArtistSelector 的输出，优先级高）
    - `filename_prefix`: 文件名前缀（默认 `AG`）
    - `prompt_string`: 提示词字符串（自动匹配已知画师名，无需连接 ArtistSelector）
- **输出**: 图片保存到 `output/artist_gallery/` 目录
- **说明**:
    - `metadata_json` 和 `prompt_string` 至少提供一个
    - 两者都提供时，优先使用 `metadata_json`
    - `prompt_string` 模式会自动从提示词中匹配已知画师名（不区分大小写），支持带格式前缀的名称（如 `@mike`、`(sarah:1.2)` 等）

## 使用方法

### 画师图库

1. 在工作流中添加 **画师图库** 节点
2. 点击页面右下角的 🎨 悬浮按钮（可拖动到任意位置）
3. 在弹窗中浏览所有画师和组合
4. 使用搜索框按名称过滤
5. 点击图片查看大图（Lightbox 显示关联画师标签）
6. 右键图片可设置封面、移动、复制等操作

### 画师选择器

1. 在工作流中添加 **画师选择** 节点
2. 节点上会显示交互式选择界面：
    - **已选区域**（上方）: 显示分区及已选画师/分类/组合，支持拖拽管理
    - **浏览区域**（下方）: 搜索、分类浏览、选择画师
3. 在浏览区域点击画师、分类或组合即可添加到当前分区
4. 鼠标悬停在画师或组合上可预览封面图
5. 鼠标悬停在已选画师标签上可调整权重（0~2），标签背景色随权重变化
6. 点击分区标题旁的按钮可切换分区配置：
    - **🎲 随机模式**: 每次执行随机抽取指定数量的画师
    - **🔄 循环模式**: 每次执行依次输出一个画师
    - **💾 保存到画廊**: 启用后图片保存时关联画师
    - **🔗 自动创建组合**: 保存时自动创建包含当前画师的组合
6. 节点输出可直接连接到提示词节点或其他文本输入

### 保存到画廊

支持两种方式关联画师：

**方式一：通过画师选择器（推荐）**

1. 在工作流中添加 **保存到画廊** 节点
2. 将图片生成节点的输出连接到 `images` 输入
3. 将画师选择节点的 `metadata_json` 输出连接到 `metadata_json` 输入
4. 图片将保存到 `output/artist_gallery/` 并自动关联画师信息
5. 如果分区启用了自动创建组合，保存时会自动创建组合

**方式二：通过提示词字符串**

1. 在工作流中添加 **保存到画廊** 节点
2. 将图片生成节点的输出连接到 `images` 输入
3. 将包含画师名称的文本连接到 `prompt_string` 输入（无需连接画师选择器）
4. 插件会自动从提示词中匹配已知画师名，并关联到保存的图片

> 两种方式可同时使用，同时提供时优先使用 `metadata_json`。

### 输出格式模板

在画师选择节点的分区配置中，可以自定义输出格式：

| 变量                     | 说明     | 示例                            |
| ------------------------ | -------- | ------------------------------- |
| `{content}`              | 画师名称 | `artist_name`                   |
| `{random(min,max,step)}` | 随机数   | `{random(0.5,2.0,0.1)}` → `1.3` |

格式示例：

- 默认: `{content}` → `artist_name`
- 加权重: `({content}:{random(0.5,2.0,0.1)})` → `(artist_name:1.3)`
- 自定义前缀: `by {content}` → `by artist_name`
- 组合格式: `@{content}` → 自动创建组合时使用 `@artist_one,@artist_two`

### 画师权重

每个画师可独立设置权重（0~2，默认 1.0），权重与格式模板独立，自动包裹格式化结果：

| 格式模板 | 权重 | 输出 |
| -------- | ---- | ---- |
| `{content}` | 1.0 | `artist_name` |
| `{content}` | 1.5 | `(artist_name:1.5)` |
| `({content})` | 1.5 | `((artist_name):1.5)` |
| `@{content}` | 1.5 | `(@artist_name:1.5)` |

- 鼠标悬浮在已选画师标签上，标签上方会出现滑块
- 权重为 1.0 时不显示权重数字，也不包裹输出
- 标签背景色随权重变化（低权重淡蓝，高权重深蓝紫）
- 组合和分类标签不支持权重调整

## 图片命名规则

插件会自动扫描 ComfyUI output 目录中符合以下命名规则的图片：

```
@画师名,_序号.扩展名
```

示例：

- `@mike,_1.png`
- `@sarah,_2.jpg`
- `@artist_name,_1.webp`

支持的图片格式：`.png`、`.jpg`、`.jpeg`、`.webp`

## 项目结构

```
artist_gallery/
├── __init__.py                  # 插件入口，注册节点
├── nodes.py                     # 节点类定义 & 输出处理逻辑
├── utils.py                     # 工具函数（文件扫描、辅助方法）
├── import_handler.py            # 图片导入处理
├── storage/                     # 数据持久化层
│   ├── __init__.py              # 存储模块导出
│   ├── artist.py                # 画师存储 (ArtistStorage)
│   ├── category.py              # 分类存储 (CategoryStorage)
│   ├── combination.py           # 组合存储 (CombinationStorage)
│   ├── image_mapping.py         # 图片-画师映射 (ImageMappingStorage)
│   ├── migration.py             # 数据迁移
│   └── _resolve.py              # 存储目录解析
├── routes/                      # HTTP API 端点
│   ├── __init__.py              # 路由注册入口
│   ├── artists.py               # 画师 CRUD API
│   ├── categories.py            # 分类 CRUD API
│   ├── combinations.py          # 组合 CRUD API
│   ├── gallery.py               # 图库数据 API
│   ├── images.py                # 图片服务 API
│   ├── batch.py                 # 批量操作 API
│   ├── import_export.py         # 导入导出 API
│   ├── cycle_state.py           # 循环状态 API
│   └── migration.py             # 数据迁移 API
├── artists.json                 # 画师数据（自动生成）
├── categories.json              # 分类数据（自动生成）
├── combinations.json            # 组合数据（自动生成）
├── image_artists.json           # 图片-画师映射（自动生成）
└── web/                         # 前端资源
    ├── artist_gallery.js        # 图库前端入口
    ├── utils.js                 # 共享工具函数
    ├── Draggable.js             # 拖拽功能
    ├── lib/                     # 第三方库
    │   ├── preact.mjs           # Preact 核心
    │   └── feather.mjs          # 图标库
    ├── components/              # Preact 组件
    │   ├── GalleryModal.js      # 图库主容器
    │   ├── GalleryGrid.js       # 画师网格布局
    │   ├── GalleryCard.js       # 画师卡片
    │   ├── CombinationCard.js   # 组合卡片
    │   ├── CombinationDialog.js # 组合创建/编辑对话框
    │   ├── Lightbox.js          # 全屏图片查看器
    │   ├── BaseCard.js          # 卡片基础组件
    │   ├── ContextMenu.js       # 右键菜单组件
    │   ├── LazyList.js          # 虚拟滚动列表
    │   ├── Toast.js             # 通知提示系统
    │   ├── AddArtistDialog.js   # 添加画师对话框
    │   ├── DeleteConfirmDialog.js # 删除确认对话框
    │   ├── CopyDialog.js        # 复制对话框
    │   ├── MoveDialog.js        # 移动对话框
    │   ├── CategoryDialog.js    # 分类对话框
    │   ├── ImportImagesDialog.js # 导入图片对话框
    │   └── hooks/               # 自定义 Hooks
    │       ├── useGalleryData.js      # 数据获取
    │       ├── useFilteredArtists.js  # 过滤排序
    │       └── useFormatProcessor.js  # 格式处理
    ├── nodes/                   # 节点专用组件
    │   ├── ArtistSelector.js    # 选择器节点入口
    │   └── components/
    │       ├── ArtistSelectorWidget.js  # 选择器主组件
    │       ├── PartitionList.js         # 分区列表
    │       ├── PartitionItem.js         # 分区项
    │       ├── PartitionHeader.js       # 分区标题
    │       ├── PartitionConfigPanel.js  # 分区配置面板
    │       └── hooks/
    │           ├── useArtistSelector.js  # 选择器逻辑
    │           ├── useBodyRender.js      # Body 级 Preact 渲染
    │           ├── useImagePreview.js    # 图片预览
    │           ├── useNodeSync.js        # 节点同步
    │           └── usePartitionState.js  # 分区状态管理
    ├── services/
    │   └── artistApi.js         # API 调用封装
    └── styles/                  # 样式文件
        ├── gallery.css          # 图库样式
        ├── gallery-card.css     # 卡片样式
        ├── gallery-grid.css     # 网格样式
        ├── lightbox.css         # Lightbox 样式
        ├── artist-selector.css  # 选择器样式
        ├── combination.css      # 组合样式
        ├── toast.css            # 通知样式
        ├── dialogs.css          # 对话框样式
        ├── context-menu.css     # 右键菜单样式
        └── ...                  # 其他样式文件
```

## API 端点

### 图库数据

| 方法 | 路径                   | 说明                                         |
| ---- | ---------------------- | -------------------------------------------- |
| GET  | `/artist_gallery/data` | 获取画师和组合数据（支持 `?category=` 过滤） |
| GET  | `/artist_gallery/html` | 图库 HTML 页面                               |

### 画师管理

| 方法   | 路径                                 | 说明                       |
| ------ | ------------------------------------ | -------------------------- |
| GET    | `/artist_gallery/artists`            | 获取所有画师列表           |
| POST   | `/artist_gallery/artists`            | 添加画师                   |
| PUT    | `/artist_gallery/artists/{id}`       | 更新画师                   |
| DELETE | `/artist_gallery/artists/{id}`       | 删除画师                   |
| POST   | `/artist_gallery/artists/batch`      | 批量添加画师               |
| GET    | `/artist_gallery/artist/{id}/images` | 获取画师图片列表           |
| GET    | `/artist_gallery/artist_images`      | 获取画师图片（按名称查询） |
| PUT    | `/artist_gallery/artists/{id}/cover` | 设置画师封面图             |

### 分类管理

| 方法   | 路径                                   | 说明       |
| ------ | -------------------------------------- | ---------- |
| GET    | `/artist_gallery/categories`           | 获取分类树 |
| POST   | `/artist_gallery/categories`           | 创建分类   |
| PUT    | `/artist_gallery/categories/{id}`      | 更新分类   |
| DELETE | `/artist_gallery/categories/{id}`      | 删除分类   |
| POST   | `/artist_gallery/categories/{id}/move` | 移动分类   |

### 组合管理

| 方法   | 路径                                          | 说明                                   |
| ------ | --------------------------------------------- | -------------------------------------- |
| GET    | `/artist_gallery/combinations`                | 获取组合列表（支持 `?category=` 过滤） |
| GET    | `/artist_gallery/combinations/all`            | 获取所有组合                           |
| GET    | `/artist_gallery/combinations/{id}`           | 获取单个组合                           |
| POST   | `/artist_gallery/combinations`                | 创建组合                               |
| PUT    | `/artist_gallery/combinations/{id}`           | 更新组合                               |
| DELETE | `/artist_gallery/combinations/{id}`           | 删除组合                               |
| POST   | `/artist_gallery/combinations/{id}/duplicate` | 复制组合                               |
| POST   | `/artist_gallery/combinations/{id}/move`      | 移动组合                               |
| GET    | `/artist_gallery/combinations/{id}/images`    | 获取组合图片                           |
| DELETE | `/artist_gallery/combinations/batch`          | 批量删除组合                           |

### 图片与导入导出

| 方法 | 路径                            | 说明         |
| ---- | ------------------------------- | ------------ |
| GET  | `/artist_gallery/image/{path}`  | 获取图片文件 |
| POST | `/artist_gallery/import`        | 导入画师数据 |
| GET  | `/artist_gallery/export`        | 导出画师数据 |
| POST | `/artist_gallery/images/import` | 导入图片     |
| POST | `/artist_gallery/batch/delete`  | 批量删除     |

## 故障排除

**看不到 🎨 悬浮按钮**

- 确认已重启 ComfyUI
- 检查页面右下角，按钮可能被拖到了其他位置
- 按 F12 打开浏览器控制台查看是否有错误

**画师选择器节点不显示交互界面**

- 刷新浏览器页面（Ctrl+Shift+R 强制刷新）
- 确认节点已正确添加到工作流
- 检查浏览器控制台是否有 JavaScript 错误

**扫描不到图片**

- 确认图片文件名格式正确（`@画师名,_序号.扩展名`）
- 确认图片在 ComfyUI 的 output 目录中
- 在图库界面点击刷新按钮重新加载

**组合自动创建不生效**

- 确认分区已开启「保存到画廊」选项
- 确认分区已开启「自动创建组合」选项
- 自动创建只在有画师被选中时生效

**分区拖拽不生效**

- 确保拖拽的是画师标签或分类卡片到目标分区
- 刷新浏览器页面后重试

## 开发说明

- Python 文件修改后需重启 ComfyUI
- JavaScript/CSS 文件修改后刷新浏览器即可（建议 Ctrl+Shift+R）
- 前端使用 Preact 组件化架构，组件位于 `web/components/` 和 `web/nodes/components/`
- 后端代码已拆分为 `routes/`（API 端点）和 `storage/`（数据持久化）模块
