# Prompt Gallery 数据流与存储设计

本文档描述当前 Prompt 选择、图片保存、运行时关联、封面补齐和图片导入流程。用户安装与使用方法见项目根目录的 `README.md`。

## 一、核心设计

当前数据模型不再维护 Image 到 Prompt 的强映射，核心规则如下：

1. Prompt 以 `(categoryId, value)` 标识，独立存储在 `prompts.json`。
2. Image 独立存储在 `images.json`，只保存图片路径、`promptString`、生成信息和文件信息。
3. 查询某个 Prompt 的图片时，在运行时判断 Prompt `value` 是否包含在图片的 `promptString` 中。
4. `coverImageId` 是 Prompt 上的持久化封面路径，用于列表快速展示，不代表图片归属关系。
5. `imageCount` 不再读取或维护；旧数据中的字段可以保留，但不是有效数据源。
6. 删除或移动 Prompt 不修改图片索引。

因此，Prompt 与 Image 的关系是可派生关系：

```text
Prompt.value
    |
    | case-insensitive substring match
    v
Image.promptString
```

## 二、整体数据流

```text
Prompt 选择节点
  前端选择 Prompt / 分类
        |
        v
  metadata widget 随工作流保存
        |
        v
  PromptSelector.select_prompts()
        |
        +--> prompts_string --------------+
        |                                  |
        +--> metadata_json                 |
                                           v
生成提示词链路 ---------------------> SaveToGallery.prompt_string
                                           |
                                           +--> 同步保存 PNG
                                           |
                                           +--> 后台批量登记 images.json
                                           |
                                           +--> 后台匹配 Prompt 并补空封面

图库查询
  Prompt.value
        |
        v
  扫描 Image.promptString
        |
        v
  返回匹配图片
```

`PromptSelector.metadata_json` 不再是 `SaveToGallery` 的输入。保存节点只依赖必填的 `prompt_string`，因此也可以接入任意其他文本节点。

## 三、Prompt 选择节点

### 3.1 前端初始化

入口为 `web/nodes/PromptSelector.js`。ComfyUI 注册 `PromptsSelector` 节点时，前端会：

1. 隐藏 `selected_prompts` 和 `metadata` 两个原生 widget。
2. 创建 DOM widget。
3. 动态加载 `PromptSelectorWidget`。
4. 从 `metadata` 恢复分区状态。

节点也可通过 `window.__openPromptGallerySelector` 打开画廊选择会话。会话以当前 `orderItems` 初始化选中状态，卡片点击把明确的目标状态即时写回默认分区；取消选择会从所有分区移除该项。画廊选择模式只保留浏览、搜索、排序与选择能力。

主要职责分布：

| 模块 | 职责 |
| --- | --- |
| `usePromptSelector.js` | 分类浏览、搜索、已选项补全和封面缓存 |
| `usePartitionState.js` | 分区、成员顺序、权重和配置状态 |
| `useNodeSync.js` | 将状态序列化回 ComfyUI widget |

### 3.2 数据加载

选择器按需加载数据，避免首次打开时获取全部 Prompt：

- 当前分类：读取当前分类直属 Prompt 和子分类。
- 全局搜索：输入停止 200ms 后搜索 Prompt。
- 已选项补全：工作流恢复后，批量解析当前分类之外的 Prompt 和分类。
- 封面：按当前可见或预览项批量读取持久化 `coverImageId`。

分类列表接口和封面接口都不会扫描图片索引。

### 3.3 分区状态

当前前端状态以 `orderItems` 为唯一成员来源：

```javascript
{
  partitions: [
    {
      id: 'partition-default',
      name: '默认分区',
      isDefault: true,
      enabled: true,
      order: 0,
      config: {
        format: '{content}',
        randomMode: false,
        randomCount: 3,
        cycleMode: false
      },
      orderItems: [
        { type: 'prompt', key: 'root:prompt_a' },
        { type: 'category', key: 'category-id' }
      ]
    }
  ],
  promptWeights: {
    'root:prompt_a': 1.5
  },
  globalConfig: {}
}
```

关键约束：

- Prompt key 是 `categoryId:value`，不是数据库 ID。
- 同一个项目只存在于一个分区；分区内顺序由 `orderItems` 决定。
- 删除非默认分区时，成员去重后转移到默认分区。
- 权重只应用于直接选择的 Prompt。
- 分区配置中不再有 `saveToGallery`；图片保存由独立节点决定。
- 旧工作流中的 `promptKeys` 和 `categoryIds` 仍可转换为 `orderItems`。
- 旧工作流中的组合项不兼容，加载时直接丢弃。

### 3.4 同步到工作流

`useNodeSync` 使用 `requestAnimationFrame` 合并同一轮交互中的更新，然后写入：

```json
{
  "version": 1,
  "partitions": [],
  "globalConfig": {},
  "promptWeights": {}
}
```

- `selected_prompts`：已选 Prompt 显示名称的逗号拼接，仅用于显示。
- `metadata`：完整分区状态，是后端执行时的实际输入。

两者都随 ComfyUI 工作流保存，不写入插件的独立配置文件。

### 3.5 后端执行

`PromptSelector.select_prompts()` 按以下顺序处理：

1. 解析并校验 `metadata.version == 1`。
2. 跳过禁用分区。
3. 按 `orderItems` 解析直接 Prompt 和分类。
4. 分类展开为该分类及全部后代分类中的 Prompt。
5. 对 Prompt 去重并构建工作列表。
6. 应用循环或随机模式。
7. 对 Prompt 应用格式和权重。
8. 返回 `prompts_string` 和 `metadata_json`。

输出格式支持：

- `{content}`：替换为 Prompt `value`。
- `{random(min,max,step)}`：按步长生成范围内随机值。
- 权重不为 `1.0` 时，在格式化结果外包裹 `(content:weight)`。

循环状态保存在当前 Python 进程内的 `_cycle_states` 中，不写入磁盘；ComfyUI 重启后会重置。

后端返回的富化元数据格式为：

```json
{
  "prompt_names": ["prompt_a", "prompt_b"],
  "selected_prompts": [
    { "categoryId": "root", "value": "prompt_a" }
  ],
  "formatted_result": "prompt_a,prompt_b"
}
```

该输出可供其他节点使用，但 `SaveToGallery` 不读取它。

## 四、SaveToGallery

### 4.1 输入与保存路径

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `images` | IMAGE | 是 | 一张或多张图片 |
| `prompt_string` | STRING | 是 | 最终提示词文本，也是图片关联的唯一来源 |
| `prefix` | STRING | 否 | 默认 `prompt_gallery/AG`，支持 `strftime` |
| `prompt` | PROMPT | 隐藏 | ComfyUI API prompt |
| `extra_pnginfo` | EXTRA_PNGINFO | 隐藏 | workflow 等附加信息 |

`prefix` 最后一段作为文件名前缀，其余部分作为 `output` 下的相对目录。例如：

```text
prefix = prompt_gallery/AG
result = output/prompt_gallery/AG_<timestamp>_0.png

prefix = gallery/%Y/%m/portrait
result = output/gallery/2026/07/portrait_<timestamp>_0.png
```

### 4.2 同步阶段

工作流返回前执行以下操作：

1. 校验 `prompt_string` 非空。
2. 一次性将图片 Tensor 转为 NumPy。
3. 逐张生成 PNG 并写入磁盘。
4. 收集待写入的图片索引和 ComfyUI UI 返回值。
5. 启动后台线程。

PNG 中写入：

- `prompt`：序列化后的 ComfyUI API prompt。
- `prompt_gallery`：`{"promptString": "..."}`。
- `extra_pnginfo`：包括 workflow 在内的额外信息。

磁盘写入仍是同步操作，因为节点必须保证返回的图片路径已经存在。

### 4.3 后台阶段

后台线程执行：

1. 使用 `add_mappings_batch()` 一次加锁、一次写入全部图片索引。
2. 从全部 Prompt 的 `value` 和逗号分隔别名构建匹配表。
3. 在 `prompt_string` 中进行不区分大小写的字符串包含匹配。
4. 使用本批次第一张图片，为匹配到且没有封面的 Prompt 批量设置 `coverImageId`。

Prompt 匹配表带有模块级缓存。只有 Prompt `value`、别名或分类集合变化时才重建。

后台失败不会撤销已经写入磁盘的 PNG，错误会输出到 ComfyUI 日志。

### 4.4 图片索引格式

```json
{
  "type": "local",
  "imagePath": "prompt_gallery/AG_1752724800000_0.png",
  "fileInfo": {
    "createdAt": 1752724800000,
    "size": 123456,
    "type": "image/png",
    "width": 1024,
    "height": 1024
  },
  "promptString": "prompt_a, prompt_b",
  "generatePrompt": "{...}"
}
```

索引中不再写入 `prompts`、`promptIds` 或其他 Image 到 Prompt 的持久化关系。

## 五、图片查询

### 5.1 Prompt 详情

Prompt 图片查询规则：

```python
prompt.value.lower() in image.promptString.lower()
```

这意味着修改 Prompt `value` 后，旧图片不会被改写；如果旧 `promptString` 不包含新值，旧图片将不再匹配该 Prompt。复制相同 `value` 的 Prompt 到其他分类时，两者会看到相同的派生图片集合。

### 5.2 列表数据

分类列表只读取：

- 当前分类直属 Prompt。
- 当前分类直属子分类。
- Prompt 上持久化的 `coverImageId`。

列表不扫描 `images.json`，也不计算图片数量。进入 Prompt 详情后才查询图片。

### 5.3 历史分组

历史图片查询会：

1. 加载图片索引。
2. 按 `promptString` 执行 Prompt、搜索和自定义筛选。
3. 通过所选图片字段的 `extractCode` 计算分组值。
4. 组内和分组均按降序排列，`未分类` 固定在最后。
5. 构建完整 JSON 响应。

`comfy_output*.images.json` 默认不进入普通图片查询，只有历史视图显式启用时才按需加载。

## 六、导入流程

### 6.1 ZIP 导入

ZIP v1 和 v2 均以 `promptString` 作为图片关联来源。兼容旧包时，导入器会将 `prompts` 或 `promptNames` 用逗号连接为 `promptString`，但不会继续持久化旧数组字段。

导入过程按批次执行：

1. 创建分类和 Prompt。
2. 解压本地图片或登记远程 URL。
3. 一次写入本批次图片索引。
4. 只扫描本次导入的 `mapping_specs`，为没有封面的 Prompt 补封面。

旧 v2 包中的 `combinations` 字段直接忽略。

封面候选按 `fileInfo.createdAt` 选择最新图片。安装 `pyahocorasick` 时使用 Aho-Corasick 单次扫描，否则回退为逐值字符串匹配。

### 6.2 导入 ComfyUI Output

`导入输出图片` 使用 SSE 实时返回 `preparing`、`scanning`、`metadata`、`writing` 和 `done` 阶段。

后端流程：

1. 调用 `get_all_image_paths()` 构建路径集合，用相对 `output` 的 `imagePath` 去重。
2. 使用 `os.scandir` 递归扫描白名单或黑名单目录。
3. 每 500 张组成一批，最多并发 10 个线程读取文件信息和 PNG `prompt`。
4. 批量写入 `comfy_output.images.json`。

这类索引的 `promptString` 留空，生成信息保存在 `generatePrompt`，后续由图片自定义字段解析。该分片只用于历史视图，不参与 Prompt 图片匹配或封面回填。

前后端 SSE 公共封装分别位于：

- 后端：`routes/_sse.py`
- 前端：`web/services/sseClient.js`

## 七、封面流程

封面是查询性能优化，不是图片关联数据源。

| 触发场景 | 候选范围 | 行为 |
| --- | --- | --- |
| 新建 Prompt | 全部普通图片索引 | 查找最新有效匹配图片 |
| SaveToGallery | 本次保存第一张图片 | 为本次匹配到的空封面 Prompt 设置封面 |
| ZIP 导入 | 本次导入图片 | 为新导入 Prompt 补空封面 |
| 手动自动匹配封面 | 全部普通图片索引 | 为所有空封面 Prompt 选择最新图片 |

启动迁移不会自动扫描全量图片补封面。历史数据需要在设置页手动执行 `自动匹配封面`。

手动回填会忽略不存在的本地图片，远程图片视为有效；已有封面不会被覆盖。

## 八、迁移与兼容

首次使用当前迁移版本时，启动迁移会执行：

1. 旧 Artist schema 到 Prompt schema 的字段与文件迁移。
2. 旧图片 schema 到 `images.json` 的迁移。
3. 对缺少 `promptString` 的旧图片索引，从 `prompts` 或 `promptIds` 生成逗号分隔文本。
4. 将旧组合按 `value = outputContent`、`name = 组合名称` 转成普通 Prompt；空输出回退为成员逗号拼接，同分类同 value 只补空封面。

组合迁移完成后删除旧组合文件。旧工作流中的组合 ID 不做兼容，图片索引也不会因迁移而改写。

迁移完成后写入 `.migration_version`，后续启动不重复执行。旧 `imageCount` 可以保留，但系统不再读取、更新或迁移它。

## 九、存储与并发

默认存储目录为 ComfyUI 的 `user/default/prompt_gallery`：

| 文件 | 内容 |
| --- | --- |
| `prompts.json` / `*.prompts.json` | Prompt |
| `categories.json` / `*.categories.json` | 分类 |
| `images.json` / `*.images.json` | 普通图片索引 |
| `comfy_output*.images.json` | 仅历史视图使用的 Output 导入索引 |
| `image_fields.json` | 图片自定义字段 |
| `custom_filters.json` | 自定义筛选器 |

`SplitJsonStorage` 的行为：

- 主文件与已启用分片合并读取。
- 读取结果缓存在内存，写入后统一失效。
- 每个 Storage 使用线程锁保护读改写。
- 批量操作尽量在一次锁和一次文件写入中完成。
- `_source_file` 只用于决定回写分片，不会持久化到 JSON。
- `comfy_output` 分片从普通 glob 读取中排除，避免大文件常驻缓存。

## 十、关键不变量

后续修改代码时应保持以下约束：

1. Image 到 Prompt 的关联只能从 `promptString` 派生，不能重新引入持久化 Prompt ID 数组。
2. `SaveToGallery.prompt_string` 必须保持必填，保存失败与后台索引失败必须可区分。
3. 列表接口不能为了图片数量或封面扫描全部图片索引。
4. `coverImageId` 只在为空时自动补齐，用户设置的封面不能被后台任务覆盖。
5. 批量写入必须复用 Storage 的批处理方法，避免每张图片重复读写 JSON。
6. Output 导入分片不能进入普通 Prompt 匹配和封面回填路径。
