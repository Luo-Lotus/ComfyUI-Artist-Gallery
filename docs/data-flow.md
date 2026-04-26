# 画师选择节点 & 保存图片节点 — 数据流与业务逻辑

本文档详细描述 `ArtistSelector`（画师选择）节点和 `SaveToGallery`（保存到画廊）节点的完整数据处理流程。

---

## 一、整体架构概览

```
┌──────────────────────────────────────────────────────────────────┐
│                        前端 (Preact)                             │
│                                                                  │
│  用户操作 → usePartitionState → useNodeSync → ComfyUI Widget     │
│      (状态管理)       (序列化)        (隐藏输入框)                │
└──────────────────────────────┬───────────────────────────────────┘
                               │ ComfyUI 执行工作流时
                               │ 读取 widget 值作为节点输入
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                        后端 (Python)                             │
│                                                                  │
│  ArtistSelector.select_artists()                                │
│      → 解析 metadata → 解析画师/分类/组合 → 格式化输出           │
│      → 自动创建组合 → 返回 (result_string, enriched_metadata)    │
│                               │                                  │
│                               ▼                                  │
│  SaveToGallery.save_image()                                     │
│      → 读取 enriched_metadata → 保存图片 → 创建映射 → 更新计数  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 二、前端数据处理流程

### 2.1 节点初始化

**入口文件**: `web/nodes/ArtistSelector.js`

当 ComfyUI 加载节点定义时，通过 `app.registerExtension()` 的 `beforeRegisterNodeDef` 钩子介入。当检测到节点类型为 `ArtistSelector` 时：

1. **创建隐藏输入框**：ComfyUI 根据 `INPUT_TYPES` 自动创建两个隐藏 widget：
   - `selected_artists`（STRING）：用于显示的画师名称字符串
   - `metadata`（STRING）：v1 格式的 JSON，承载完整的分区和选择信息

2. **创建 DOM 容器**：在节点上添加一个 DOM widget，作为 Preact 组件的挂载点

3. **延迟渲染**：100ms 后动态导入 `ArtistSelectorWidget` 组件并渲染到容器中，传入三个关键 props：
   - `nodeInstance`：ComfyUI 节点实例引用
   - `selectedInput`：`selected_artists` widget 引用
   - `metadataInput`：`metadata` widget 引用

### 2.2 数据加载

**Hook**: `useArtistSelector.js`

组件挂载后，并行发起三个数据加载请求：

#### (1) 加载分类树
- 请求：`GET /artist_gallery/categories`
- 返回：嵌套的分类树结构
- 处理：通过 `flattenCategories()` 扁平化为 `{ id, name, parentId, children }` 列表

#### (2) 加载所有画师和组合
- 请求：`GET /artist_gallery/artists` + `GET /artist_gallery/combinations/all`
- `allArtists`：用于补全已选画师的缓存信息（跨分类查找）
- `allCombinations`：用于分区中组合的显示和操作

#### (3) 加载当前分类数据
- 请求：`GET /artist_gallery/data?category={currentCategory}`
- 这是一个**合并接口**，同时返回当前分类下的：
  - `artists[]`：画师列表（只含 `coverImagePath` + `imageCount`，不含完整图片）
  - `combinations[]`：组合列表（含 `coverImagePath`、`artistKeys`、`outputContent`）
- 当用户点击分类导航切换时，会重新请求此接口

### 2.3 分区状态管理

**Hook**: `usePartitionState.js`

分区状态是整个选择器的核心数据结构，管理着「哪些画师/分类/组合属于哪个分区」。

#### 数据结构

```javascript
partitionData = {
    partitions: [
        {
            id: "partition-default",       // 分区唯一 ID
            name: "默认分区",                // 显示名称
            isDefault: true,                // 是否为默认分区
            enabled: true,                  // 是否启用
            config: {
                format: "{content}",        // 输出格式模板
                randomMode: false,          // 随机模式
                randomCount: 3,             // 随机数量
                cycleMode: false,           // 循环模式
                saveToGallery: true,        // 是否保存到画廊
                autoCreateCombination: false // 是否自动创建组合
            }
        },
        // ... 最多 10 个分区
    ],
    artistPartitionMap: {      // 画师 → 分区ID 的映射
        "root:artist_a": "partition-default",
        "cat1:artist_b": "partition-2"
    },
    categoryPartitionMap: {    // 分类 → 分区ID 的映射
        "cat-id-1": "partition-default"
    },
    combinationPartitionMap: { // 组合 → 分区ID 的映射
        "combination:uuid-xxx": "partition-default"
    },
    artistWeights: {           // 画师权重（仅画师，不含分类/组合）
        "root:artist_a": 1.5,  // key 格式同 artistPartitionMap
        "cat1:artist_b": 0.8   // 不存在或为 1.0 时表示默认权重
    },
    globalConfig: { ... }      // 全局默认配置
}
```

#### 关键设计

- **映射表模式**：使用三个扁平映射表记录归属关系，而非在每个分区内部嵌套数组
- **持久化方式**：不使用独立的 JSON 文件存储，而是通过 `useNodeSync` 序列化到 ComfyUI 节点的 widget 值中，随工作流一起保存
- **状态恢复**：组件初始化时，从 `metadataInput.value`（ComfyUI 恢复的 widget 值）解析分区数据

#### 主要操作

| 操作 | 说明 |
|------|------|
| `addPartition(name)` | 创建新分区（继承全局配置），最多 10 个 |
| `deletePartition(id)` | 删除分区，其中的画师/组合自动移回默认分区 |
| `updatePartition(id, updates)` | 更新分区名称或配置（不可改 enabled/isDefault） |
| `togglePartition(id)` | 切换分区启用/禁用 |
| `moveArtistToPartition(key, pid)` | 将画师移到指定分区（pid=null 则移除） |
| `moveCategoryToPartition(catId, pid)` | 将分类移到指定分区 |
| `moveCombinationToPartition(combKey, pid)` | 将组合移到指定分区 |
| `setArtistWeight(key, weight)` | 设置画师权重（0~2，weight=1.0 时删除 key） |

### 2.4 节点同步（前端 → ComfyUI）

**Hook**: `useNodeSync.js`

每当分区数据、选择状态发生变化时，自动将状态同步到 ComfyUI 节点的隐藏输入框。

#### 序列化过程

```
partitionData（内部格式）
    ↓ 转换
v1 metadata（传输格式）
```

具体步骤：

1. **构建 partitions 数组**：遍历每个分区，从映射表中反查出属于该分区的所有 key：
   - `artistKeys`：从 `artistPartitionMap` 过滤出属于该分区的画师 key（格式 `"categoryId:artistName"`）
   - `categoryIds`：从 `categoryPartitionMap` 过滤出属于该分区的分类 ID
   - `combinationKeys`：从 `combinationPartitionMap` 过滤出属于该分区的组合 key（格式 `"combination:{uuid}"`）

2. **构建 metadata 对象**：
   ```json
   {
       "version": 1,
       "partitions": [
           {
               "id": "partition-default",
               "name": "默认分区",
               "isDefault": true,
               "enabled": true,
               "config": { "format": "{content}", ... },
               "artistKeys": ["root:artist_a", "cat1:artist_b"],
               "categoryIds": ["cat-id-1"],
               "combinationKeys": ["combination:uuid-xxx"]
           }
       ],
       "globalConfig": { ... }
   }
   ```

3. **写入 widget**：
   - `selectedInput.value` = 逗号分隔的画师名（仅用于显示，后端不使用）
   - `metadataInput.value` = JSON.stringify(metadata)

4. **触发更新**：调用 `nodeInstance.graph.change()` 通知 ComfyUI 图需要重新执行

### 2.5 用户交互流程

```
用户点击画师
    ↓
toggleSelection(categoryId, name)
    ↓
生成 key = "categoryId:name"
    ↓
更新 selectedKeys（Set）和 selectedArtistsCache（Object）
    ↓
moveArtistToPartition(key, defaultPartition.id)
    ↓
partitionData 更新
    ↓
useNodeSync useEffect 触发
    ↓
序列化 v1 metadata → 写入 widget → graph.change()
```

分类选择和组合选择的流程类似，分别调用 `toggleCategorySelection` 和 `toggleCombinationSelection`。

---

## 三、后端数据处理流程

### 3.1 ArtistSelector.select_artists() — 主入口

当 ComfyUI 执行工作流时，调用此函数。

**输入**：
- `selected_artists`（STRING）：前端显示用的画师名（后端不使用）
- `metadata`（STRING）：v1 格式的 JSON

**输出**：
- `artists_string`（STRING）：格式化后的画师名称字符串，可直接作为提示词
- `metadata_json`（STRING）：富化后的 JSON，供下游 `SaveToGallery` 使用

#### 处理流程

```
输入 metadata JSON
    ↓
版本检查（version !== 1 → 返回空）
    ↓
加载所有画师和分类数据（从 storage）
    ↓
遍历每个分区 ──────────────────────────────┐
    ↓                                       │
跳过 enabled=false 的分区                   │
    ↓                                       │
读取分区配置（format, randomMode, 等）      │
    ↓                                       │
解析画师来源（三种）────→ 合并去重           │
    ↓                                       │
处理循环/随机模式                            │
    ↓                                       │
格式化输出 + 收集画师                        │
    ↓                                       │
└────────────────────────────────────────────┘
    ↓
自动创建组合（遍历分区再次检查）
    ↓
构建富化 metadata
    ↓
返回 (result_string, enriched_metadata)
```

### 3.2 画师来源解析

每个分区中的画师来自三个渠道，全部解析后合并为一个统一的工作列表：

#### 来源一：直接选择的画师（artistKeys）

- 格式：`"categoryId:artistName"`
- 处理：按 `:` 分割，提取 `categoryId` 和 `name`
- 示例：`"root:mike"` → `('', 'mike')`

#### 来源二：分类递归解析（categoryIds）

- 用户可能选择了整个分类而非单个画师
- 调用 `_resolve_category_to_artists(category_id, all_artists, all_categories)` 递归解析
- 解析逻辑：
  1. 查找 `parentId == category_id` 的所有子分类，递归处理
  2. 查找 `categoryId == category_id` 的所有画师，收集名称
- 防止循环引用：用 `visited` 集合记录已访问的分类 ID

#### 来源三：组合（combinationKeys）

- 格式：`"combination:{uuid}"`
- 处理：提取 UUID，从 `CombinationStorage` 查询组合详情
- 获取两个关键字段：
  - `outputContent`：组合的格式化输出文本（如 `"@artist_a,@artist_b"`）
  - `artistKeys`：组合包含的画师名称列表

#### 合并为工作列表

```python
working_items = [
    ('artist', 'root', 'mike'),           # 直接选择的画师
    ('artist', 'cat1', 'sarah'),          # 从分类解析出的画师
    ('combination', '@a,@b', ['a', 'b']), # 组合（内容 + 成员画师）
    ...
]
```

去重：按 `"categoryId:artistName"` 去重，保持选择顺序。

### 3.3 输出模式处理

#### 普通模式（默认）

所有工作项直接进入输出，每个画师应用格式模板后加入结果列表。

#### 随机模式（randomMode = true）

- 从工作列表中随机抽取 `randomCount` 个条目
- 使用 `random.sample()` 无重复抽样
- **重要**：只有被随机到的画师才会出现在输出和自动创建的组合中

#### 循环模式（cycleMode = true）

- 维护全局循环状态 `_cycle_states`（以 `节点实例ID_分区ID` 为 key）
- 每次执行取 `working_items[cycle_index]`，然后 `cycle_index = (index + 1) % length`
- 每次执行只输出一个条目（一个画师或一个组合）
- **重要**：只有当前循环到的画师会出现在输出中

### 3.4 格式化输出

每个画师条目通过 `_apply_format(name, format_str)` 处理：

1. **替换 `{content}`**：将 `{content}` 替换为画师名称
   - `"{content}"` → `"mike"`
   - `"by {content}"` → `"by mike"`
   - `"({content}:1.2)"` → `"(mike:1.2)"`

2. **替换 `{random(min,max,step)}`**：生成随机数
   - 在 `[min, max]` 范围内按 `step` 步进随机选择
   - `"(mike:{random(0.5,2.0,0.1)})"` → `"(mike:1.3)"`
   - 支持多个 `{random()}` 在同一格式字符串中

3. **组合条目特殊处理**：组合不经过格式化，直接使用其 `outputContent`

最终所有分区的格式化结果用逗号拼接：`"mike,sarah,@a,@b"`

### 3.5 画师收集（collect_artist）

在输出处理过程中，通过 `collect_artist(cat_id, name, save_to_gallery)` 函数跨分区收集所有参与输出的画师：

- 去重：用 `seen_keys` 集合防止同一画师被重复收集
- 记录 `saveToGallery` 标记：来自分区配置
- 组合条目中的画师也会被收集：遍历组合的 `artistKeys`，逐一调用 `collect_artist`
- 这些收集到的画师会用于：
  1. 构建富化 metadata 中的 `artist_names` 和 `selected_artists`
  2. 供 `SaveToGallery` 使用

同时，通过 `partition_used_artists` 字典记录每个分区实际参与输出的画师名（区分随机/循环后真正被选中的画师）。

### 3.6 自动创建组合

输出处理完成后，再次遍历所有分区，检查是否需要自动创建组合：

**条件检查**：
1. 分区已启用（`enabled = true`）
2. 分区配置中 `autoCreateCombination = true`
3. 分区配置中 `saveToGallery = true`（前置条件）
4. 该分区有实际参与输出的画师（`partition_used_artists` 不为空）

**创建逻辑**：
1. 获取该分区实际使用的画师名称列表
2. 获取该分区的格式模板
3. 对每个画师名应用格式模板，得到格式化片段
4. 用逗号拼接所有格式化片段作为 `outputContent`
5. 用逗号拼接画师名称作为组合名 `name`
6. 查重：检查 `outputContent` 相同的组合是否已存在
7. 不存在则创建新组合（存储到 `combinations.json`）

**示例**：
- 分区选择了画师 `mike`, `sarah`，格式模板为 `@{content}`
- `outputContent` = `"@mike,@sarah"`
- `name` = `"mike,sarah"`
- `artistKeys` = `["mike", "sarah"]`

### 3.7 富化 Metadata 输出

处理完成后，构建一个富化的 metadata JSON 供 `SaveToGallery` 使用：

```json
{
    "artist_names": ["mike", "sarah", "alice"],
    "selected_artists": [
        { "categoryId": "root", "name": "mike", "saveToGallery": true },
        { "categoryId": "cat1", "name": "sarah", "saveToGallery": true },
        { "categoryId": "cat2", "name": "alice", "saveToGallery": false }
    ],
    "formatted_result": "mike,sarah"
}
```

- `artist_names`：所有收集到的画师名（包含 `saveToGallery=false` 的）
- `selected_artists`：详细信息列表，含 `saveToGallery` 标记
- `formatted_result`：格式化后的输出字符串

---

## 四、SaveToGallery — 保存图片节点

### 4.1 输入

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `images` | IMAGE | 是 | ComfyUI 图片张量（可能多张） |
| `metadata_json` | STRING | 否* | 来自 ArtistSelector 的富化 metadata（优先级高） |
| `filename_prefix` | STRING | 否 | 文件名前缀，默认 `"AG"` |
| `prompt_string` | STRING | 否* | 提示词字符串，自动匹配已知画师名（备选，优先级低） |
| `prompt`（隐藏） | PROMPT | — | ComfyUI 工作流的 prompt 信息 |
| `extra_pnginfo`（隐藏） | EXTRA_PNGINFO | — | ComfyUI 附加 PNG 信息 |

> *`metadata_json` 和 `prompt_string` 至少需要提供一个。两者都提供时，优先使用 `metadata_json`。

### 4.2 处理流程

```
接收 metadata_json 和 prompt_string
    ↓
解析 metadata_json（JSON → dict）
    ↓
三路优先级判断 ──────────────────────────────────────────┐
    ↓                                                    │
Path A: metadata_json 有效                                │
（包含 artist_names 和 selected_artists）                  │
    → 筛选 saveToGallery=true 的画师                      │
    ↓                                                    │
Path B: metadata_json 无效，但有 prompt_string             │
    → 调用 _match_artists_from_prompt(prompt_string)       │
    → 使用正则交替模式匹配已知画师名                         │
    → 所有匹配到的画师默认 saveToGallery=true               │
    ↓                                                    │
Path C: 两者都没有有效内容                                  │
    → 输出错误日志，返回 ()                                │
    ↓                                                    │
└────────────────────────────────────────────────────────┘
    ↓ （Path A 或 Path B 得到 saveable_artists / saveable_names）
创建保存目录 output/artist_gallery/
    ↓
遍历每张图片 ──────────────────────────┐
    ↓                                  │
Tensor → numpy → PIL Image             │
    ↓                                  │
生成文件名: AG_{timestamp}_{index}.png  │
    ↓                                  │
嵌入 PNG 元数据:                        │
  - prompt (工作流信息)                  │
  - artist_gallery (画师关联信息)        │
  - extra_pnginfo (附加信息)            │
    ↓                                  │
保存 PNG 到磁盘                         │
    ↓                                  │
创建映射关系 (image_mapping):           │
  imagePath → artistNames[]             │
    ↓                                  │
更新画师图片计数 +1                     │
    ↓                                  │
└───────────────────────────────────────┘
    ↓
返回 ()
```

### 4.2.1 prompt_string 画师匹配算法

当 `metadata_json` 无效但 `prompt_string` 有内容时，使用 `_match_artists_from_prompt()` 方法自动匹配画师。

**原理**：格式模板（如 `@{content}`、`({content}:1.2)`）输出中，画师名始终是完整子串。因此只需在 prompt_string 中查找已知画师名的子串即可。

**算法步骤**：
1. 从 `ArtistStorage` 加载所有画师
2. 构建 `name → [artist, ...]` 查找表（同名画师可属于不同分类）
3. 将所有画师名编译为一个正则交替模式（`re.compile('name1|name2|...'，re.IGNORECASE)`），按名称长度降序排列确保贪心匹配
4. 单次 `findall()` 扫描 prompt_string，获取所有匹配
5. 去重保序，查找每个匹配名对应的所有画师
6. 返回 `[{categoryId, name, saveToGallery: True}, ...]`

**性能优化**：
- 正则交替模式：将 N 个画师名编译为 1 个正则，单次扫描，匹配时间与画师数量无关
- 模块级缓存：`_artist_regex_cache` + `frozenset` 指纹，画师列表未变化时复用已编译正则
- 10,000 个画师名：正则编译 ~10-50ms（一次性），匹配 <1ms
- 大小写不敏感匹配，结果使用存储中的规范大小写

**示例**：
```
prompt_string = "@mike, (sarah:1.2), some other text, @tom"
已知画师: mike, sarah, tom, alice
匹配结果: [mike, sarah, tom] → 关联到保存的图片
```

### 4.3 关键细节

#### 画师筛选

```python
saveable_artists = [a for a in selected_artists if a.get("saveToGallery", True)]
saveable_names = [a["name"] for a in saveable_artists]
```

只有 `saveToGallery=true` 的画师会参与图片关联和计数更新。这意味着：
- 如果某个分区关闭了 `saveToGallery`，该分区的画师名称不会出现在保存图片的关联信息中
- 但这些画师仍然会出现在 `ArtistSelector` 的输出字符串中（用于提示词）

#### 映射关系创建

每张保存的图片会在 `image_artists.json` 中创建一条映射记录：

```json
{
    "imagePath": "artist_gallery/AG_1712345678900_00000.png",
    "artistNames": ["mike", "sarah"],
    "width": 512,
    "height": 768
}
```

- `artistNames` 是一个数组：一张图片可以关联多个画师
- 这些关联信息用于：
  1. 画廊中按画师筛选图片
  2. 组合图片查询（取所有成员画师图片的交集）
  3. 封面图自动选取（取第一张映射的图片）

#### PNG 元数据嵌入

保存的图片会嵌入以下文本块：
- `prompt`：完整的 ComfyUI 工作流 prompt（可拖入 ComfyUI 恢复工作流）
- `artist_gallery`：画师关联信息 JSON
- `extra_pnginfo` 中的其他信息（如 workflow JSON）

---

## 五、数据流完整示例

假设用户操作如下：
- 默认分区：选择了画师 `mike`（root 分类）、画师 `sarah`（cat1 分类）、分类 `cat2`（包含画师 `alice`、`bob`）
- 分区配置：格式 `@{content}`，随机模式抽取 2 个，开启保存到画廊，开启自动创建组合
- 额外分区：选择了组合 `combination:uuid-123`（包含画师 `tom`, `jerry`，输出内容 `@tom,@jerry`）

### 前端序列化

```json
{
    "version": 1,
    "partitions": [
        {
            "id": "partition-default",
            "name": "默认分区",
            "enabled": true,
            "config": {
                "format": "@{content}",
                "randomMode": true,
                "randomCount": 2,
                "saveToGallery": true,
                "autoCreateCombination": true
            },
            "artistKeys": ["root:mike", "cat1:sarah"],
            "categoryIds": ["cat2"],
            "combinationKeys": []
        },
        {
            "id": "partition-2",
            "name": "分区2",
            "enabled": true,
            "config": { "format": "{content}", "saveToGallery": true },
            "artistKeys": [],
            "categoryIds": [],
            "combinationKeys": ["combination:uuid-123"]
        }
    ]
}
```

### 后端处理（假设随机抽到 mike 和 bob）

**解析阶段**：
- 默认分区：`mike`（直接选择）+ `sarah`（直接选择）+ `alice`, `bob`（从 cat2 解析）
- 分区2：组合 `uuid-123` → outputContent=`@tom,@jerry`, artistKeys=[`tom`, `jerry`]

**随机模式处理**（默认分区）：
- 从 [mike, sarah, alice, bob] 中随机抽取 2 个，假设得到 [bob, mike]
- 格式化：`@bob`, `@mike`

**组合处理**（分区2）：
- 直接使用组合的 outputContent：`@tom,@jerry`
- 收集组合画师：tom, jerry

**自动创建组合**（默认分区）：
- 使用实际选中的画师：bob, mike
- 格式化内容：`@bob,@mike`
- 组合名：`bob,mike`
- 检查 `@bob,@mike` 是否已存在，不存在则创建

**最终输出**：
- `artists_string` = `"@bob,@mike,@tom,@jerry"`
- `metadata_json` = `{ "artist_names": ["bob", "mike", "tom", "jerry"], ... }`

### SaveToGallery 处理

- 保存图片到 `output/artist_gallery/AG_xxx.png`
- 关联画师：`["bob", "mike", "tom", "jerry"]`
- 更新这四位画师的图片计数各 +1

---

## 六、关键数据结构速查

### 前端内部格式

```
partitionData = {
    partitions: Partition[]                          // 分区列表
    artistPartitionMap: { [artistKey]: partitionId } // 画师归属
    categoryPartitionMap: { [catId]: partitionId }   // 分类归属
    combinationPartitionMap: { [combKey]: partitionId } // 组合归属
}
```

### 前端→后端传输格式（v1 metadata）

```json
{
    "version": 1,
    "partitions": [{
        "id": "...", "name": "...", "isDefault": bool, "enabled": bool,
        "config": { format, randomMode, randomCount, cycleMode, saveToGallery, autoCreateCombination },
        "artistKeys": ["categoryId:name", ...],
        "categoryIds": ["catId", ...],
        "combinationKeys": ["combination:uuid", ...]
    }],
    "globalConfig": { ... }
}
```

### 后端→后端传递格式（enriched metadata）

```json
{
    "artist_names": ["name1", "name2", ...],
    "selected_artists": [{ "categoryId": "...", "name": "...", "saveToGallery": bool }],
    "formatted_result": "格式化后的完整字符串"
}
```

### 存储层格式

- **artists.json**: `{ id, name, displayName, categoryId, coverImageId, createdAt }`
- **combinations.json**: `{ id, name, categoryId, artistKeys[], outputContent, coverImageId, createdAt }`
- **image_artists.json**: `{ imagePath, artistNames[], width, height }`
- **categories.json**: `{ id, name, parentId, children[] }`
