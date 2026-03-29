# Artist Gallery - ComfyUI 画师图库插件

一个 ComfyUI 自定义节点插件，提供画师图库管理、画师选择和图片保存功能。

## 功能特点

- **悬浮图库入口** - 页面右下角可拖动的 🎨 按钮，点击弹出图库管理界面
- **画师选择器节点** - 可在 ComfyUI 工作流中直接选择画师，输出画师名称字符串
- **分区管理系统** - 将画师按分区组织，支持分区级别的启用/禁用
- **随机/循环模式** - 每个分区可独立配置随机抽取或循环输出
- **分类浏览** - 按分类层级浏览画师，支持面包屑导航
- **自动扫描** - 自动检测 ComfyUI output 目录中匹配命名规则的图片
- **拖拽操作** - 支持将画师和分类拖拽到不同分区
- **格式模板** - 自定义输出格式，支持 `{content}` 和 `{random(min,max,step)}` 变量
- **图片保存** - 将生成的图片保存到画廊并关联画师信息

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
  - 支持自定义输出格式

### 🎨 保存到画廊 (SaveToGallery)

将生成的图片保存到画廊目录并关联画师信息。

- **类型**: 输出节点
- **输入**:
  - `images`: ComfyUI 图片张量
  - `metadata_json`: 画师元数据 JSON（可连接 ArtistSelector 的输出）
  - `filename_prefix`: 文件名前缀（默认 `AG`）
- **输出**: 图片保存到 `output/artist_gallery/` 目录

## 使用方法

### 画师图库

1. 在工作流中添加 **画师图库** 节点
2. 点击页面右下角的 🎨 悬浮按钮（可拖动到任意位置）
3. 在弹窗中浏览所有画师
4. 使用搜索框按名称过滤
5. 点击图片查看大图
6. 点击 📋 复制画师标签

### 画师选择器

1. 在工作流中添加 **画师选择** 节点
2. 节点上会显示交互式选择界面：
   - **已选区域**（上方）: 显示分区及已选画师，支持拖拽管理
   - **浏览区域**（下方）: 搜索、分类浏览、选择画师
3. 在浏览区域点击画师或分类即可添加到当前分区
4. 点击分区标题旁的按钮可切换分区配置：
   - **🎲 随机模式**: 每次执行随机抽取指定数量的画师
   - **🔄 循环模式**: 每次执行依次输出一个画师
5. 节点输出可直接连接到提示词节点或其他文本输入

### 保存到画廊

1. 在工作流中添加 **保存到画廊** 节点
2. 将图片生成节点的输出连接到 `images` 输入
3. 将画师选择节点的 `metadata_json` 输出连接到 `metadata_json` 输入
4. 图片将保存到 `output/artist_gallery/` 并自动关联画师信息

### 输出格式模板

在画师选择节点的分区配置中，可以自定义输出格式：

| 变量 | 说明 | 示例 |
|------|------|------|
| `{content}` | 画师名称 | `artist_name` |
| `{random(min,max,step)}` | 随机数 | `{random(0.5,2.0,0.1)}` → `1.3` |

格式示例：
- 默认: `{content}` → `artist_name`
- 加权重: `({content}:{random(0.5,2.0,0.1)})` → `(artist_name:1.3)`
- 自定义前缀: `by {content}` → `by artist_name`

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
├── __init__.py              # 插件入口，注册节点
├── nodes.py                 # 节点类定义
├── api_routes.py            # HTTP API 端点
├── storage.py               # 数据持久化层
├── utils.py                 # 工具函数
├── artists.json             # 画师数据（自动生成）
├── categories.json          # 分类数据（自动生成）
├── image_artists.json       # 图片-画师映射（自动生成）
└── web/
    ├── artist_gallery.js    # 图库前端入口
    ├── ArtistSelector.js    # 选择器前端入口
    ├── components/          # Preact 组件
    ├── nodes/               # 节点专用组件
    │   └── components/
    │       ├── ArtistSelectorWidget.js
    │       ├── PartitionList.js
    │       ├── PartitionItem.js
    │       ├── PartitionHeader.js
    │       ├── PartitionContent.js
    │       ├── AddPartitionForm.js
    │       └── hooks/       # 自定义 Hooks
    ├── services/            # API 服务层
    ├── lib/                 # Preact 库文件
    └── styles/
        └── gallery.css      # 样式文件
```

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/artist_gallery/data` | 扫描 output 目录，返回画师图片数据 |
| GET | `/artist_gallery/artists` | 获取所有画师列表 |
| POST | `/artist_gallery/artists` | 添加画师 |
| PUT | `/artist_gallery/artists/{id}` | 更新画师 |
| DELETE | `/artist_gallery/artists/{id}` | 删除画师 |
| POST | `/artist_gallery/artists/batch` | 批量添加画师 |
| GET | `/artist_gallery/artist/{id}/images` | 获取画师的图片列表 |

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

**分区拖拽不生效**
- 确保拖拽的是画师标签或分类卡片到目标分区
- 刷新浏览器页面后重试

## 开发说明

- Python 文件修改后需重启 ComfyUI
- JavaScript/CSS 文件修改后刷新浏览器即可（建议 Ctrl+Shift+R）
- 前端使用 Preact 组件化架构，组件位于 `web/components/` 和 `web/nodes/components/`
