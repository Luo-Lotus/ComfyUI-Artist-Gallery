# Prompt Gallery 导入格式说明

本文档说明如何手动构造可导入 Prompt Gallery 的 ZIP 文件，方便批量迁移数据或用脚本/AI 生成导入包。

## 概览

导入支持两种格式版本：

| 版本 | 内容 | 适用场景 |
|------|------|----------|
| v1 | Prompt + 图片 | 简单批量导入，不涉及分类层级 |
| v2 | 分类树 + Prompt + 组合 + 图片 | 完整数据迁移，保留分类结构 |

ZIP 文件的核心是根目录下的 `manifest.json`，描述所有元数据；图片文件放在 `images/` 目录下。

---

## v1 格式（Prompt + 图片）

### 目录结构

```
my_export.zip
├── manifest.json
└── images/
    ├── photo_001.png
    ├── photo_002.jpg
    └── photo_003.webp
```

### manifest.json

```json
{
  "version": 1,
  "exportedAt": 1715000000000,
  "prompts": [
    {
      "value": "akakura",
      "name": "赤倉",
      "alias": "akakura,赤倉先生"
    },
    {
      "value": "mike",
      "name": "Mike",
      "alias": ""
    }
  ],
  "images": [
    {
      "path": "images/photo_001.png",
      "promptString": "akakura"
    },
    {
      "path": "images/photo_002.jpg",
      "promptString": "akakura, mike"
    },
    {
      "path": "images/photo_003.webp",
      "promptString": "mike"
    }
  ]
}
```

### 字段说明

#### prompts[]

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `value` | string | 是 | Prompt 唯一标识（用于匹配和关联） |
| `name` | string | 否 | 显示名称，默认等于 value |
| `alias` | string | 否 | 别名，逗号分隔 |

#### images[]

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `path` | string | 是 | 本地图片在 ZIP 内的路径（`images/xxx.png`）或远程图片 URL |
| `type` | string | 否 | `"local"`（默认）或 `"remote"`。URL 路径会自动识别为 remote |
| `promptString` | string | 是 | 用于运行时匹配 Prompt 的提示词文本；Prompt 详情和计数只从该字段做字符串包含匹配 |

> 兼容旧字段：`prompts`/`promptNames` 会在导入时转换为 `promptString`（用逗号连接），不再作为持久映射存储；`name` 等价于 `value`。

### 远程图片

`path` 为 HTTP/HTTPS URL 时，不需要在 ZIP 中包含实际图片文件。导入时会直接创建远程映射，前端显示时会从 URL 加载。

```json
{
  "version": 1,
  "exportedAt": 1715000000000,
  "prompts": [
    {"value": "akakura", "name": "赤倉"}
  ],
  "images": [
    {
      "path": "images/local_photo.png",
      "promptString": "akakura"
    },
    {
      "path": "https://example.com/remote_art.jpg",
      "type": "remote",
      "promptString": "akakura"
    }
  ]
}
```

> `type: "remote"` 可省略，`path` 以 `http://` 或 `https://` 开头时会自动识别。

---

## v2 格式（分类 + Prompt + 组合 + 图片）

### 目录结构

```
my_export.zip
├── manifest.json
└── images/
    ├── 001.png
    ├── 002.png
    └── 003.png
```

### manifest.json

```json
{
  "version": 2,
  "exportedAt": 1715000000000,
  "rootCategoryId": "cat_001",
  "rootCategoryName": "人物风格",
  "categories": [
    {
      "id": "cat_001",
      "name": "人物风格",
      "parentId": null,
      "order": 0
    },
    {
      "id": "cat_002",
      "name": "日系",
      "parentId": "cat_001",
      "order": 0
    },
    {
      "id": "cat_003",
      "name": "欧美",
      "parentId": "cat_001",
      "order": 1
    }
  ],
  "prompts": [
    {
      "value": "akakura",
      "name": "赤倉",
      "alias": "",
      "categoryId": "cat_002"
    },
    {
      "value": "rossdraws",
      "name": "RossDraws",
      "alias": "ross",
      "categoryId": "cat_003"
    }
  ],
  "combinations": [
    {
      "name": "赤倉+Ross",
      "categoryId": "cat_001",
      "prompts": ["akakura", "rossdraws"],
      "outputContent": "@akakura,@rossdraws"
    }
  ],
  "images": [
    {
      "path": "images/001.png",
      "promptString": "akakura"
    },
    {
      "path": "images/002.png",
      "promptString": "rossdraws"
    },
    {
      "path": "images/003.png",
      "promptString": "akakura, rossdraws"
    }
  ]
}
```

### 字段说明

#### categories[]

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 分类唯一 ID（用于被 prompts/combinations 引用） |
| `name` | string | 是 | 分类名称 |
| `parentId` | string\|null | 否 | 父分类 ID，null 表示顶层 |
| `order` | number | 否 | 排序权重，默认 0 |

#### prompts[]

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `value` | string | 是 | Prompt 唯一标识 |
| `name` | string | 否 | 显示名称 |
| `alias` | string | 否 | 别名 |
| `categoryId` | string | 否 | 所属分类 ID，默认 "root" |

#### combinations[]

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 组合名称 |
| `categoryId` | string | 否 | 所属分类 ID |
| `prompts` | string[] | 是 | 成员 Prompt value 列表 |
| `outputContent` | string | 否 | 自定义输出内容，为空时自动用逗号连接 prompts |

#### images[]

同 v1。

---

## Python 构造示例

### 示例 1：最简 v1（纯 Prompt，无图片）

```python
import json
import zipfile

manifest = {
    "version": 1,
    "exportedAt": 1715000000000,
    "prompts": [
        {"value": "akakura", "name": "赤倉"},
        {"value": "mike", "name": "Mike"},
        {"value": "rossdraws", "name": "RossDraws", "alias": "ross"},
    ],
    "images": [],
}

with zipfile.ZipFile("prompts_only.zip", "w", zipfile.ZIP_DEFLATED) as zf:
    zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
```

### 示例 2：v1 带图片

```python
import json
import zipfile
from pathlib import Path

# 准备图片目录（把你的图片放这里）
image_dir = Path("./my_images")

manifest = {
    "version": 1,
    "exportedAt": 1715000000000,
    "prompts": [
        {"value": "akakura", "name": "赤倉"},
    ],
    "images": [],
}

with zipfile.ZipFile("export_with_images.zip", "w", zipfile.ZIP_DEFLATED) as zf:
    zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))

    # 遍历目录下的图片，添加到 ZIP
    for img_path in sorted(image_dir.glob("*.png")):
        zip_path = f"images/{img_path.name}"
        zf.write(img_path, zip_path)
        manifest["images"].append({
            "path": zip_path,
            "promptString": "akakura",
        })

    # 需要重写 manifest（因为 images 列表在循环中才填充）
    # 或者先收集完再一次性写入
```

更好的做法是先收集再写入：

```python
import json
import zipfile
from pathlib import Path

image_dir = Path("./my_images")
prompt_value = "akakura"

# 1. 先收集图片列表
image_entries = []
for img_path in sorted(image_dir.glob("*.png")):
    image_entries.append({
        "local_path": img_path,
        "zip_path": f"images/{img_path.name}",
        "promptString": prompt_value,
    })

# 2. 构建 manifest
manifest = {
    "version": 1,
    "exportedAt": 1715000000000,
    "prompts": [
        {"value": prompt_value, "name": "赤倉"},
    ],
    "images": [
        {"path": e["zip_path"], "promptString": e["promptString"]}
        for e in image_entries
    ],
}

# 3. 写入 ZIP
with zipfile.ZipFile("export_v1.zip", "w", zipfile.ZIP_DEFLATED) as zf:
    zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    for e in image_entries:
        zf.write(e["local_path"], e["zip_path"])

print(f"导出完成: {len(image_entries)} 张图片")
```

### 示例 3：完整 v2（分类 + Prompt + 组合 + 图片）

```python
import json
import zipfile
from pathlib import Path

image_dir = Path("./my_images")

# ---- 定义数据 ----
categories = [
    {"id": "cat_style",  "name": "人物风格", "parentId": None, "order": 0},
    {"id": "cat_jp",     "name": "日系",     "parentId": "cat_style", "order": 0},
    {"id": "cat_western","name": "欧美",     "parentId": "cat_style", "order": 1},
]

prompts = [
    {"value": "akakura",   "name": "赤倉",     "alias": "",   "categoryId": "cat_jp"},
    {"value": "rossdraws", "name": "RossDraws", "alias": "ross","categoryId": "cat_western"},
    {"value": "wlop",      "name": "WLOP",      "alias": "",   "categoryId": "cat_western"},
]

combinations = [
    {
        "name": "日系+欧美混搭",
        "categoryId": "cat_style",
        "prompts": ["akakura", "rossdraws"],
        "outputContent": "@akakura,@rossdraws",
    },
]

# ---- 收集图片 ----
image_entries = []
for img_path in sorted(image_dir.glob("*.png")):
    # 按文件名规则分配 Prompt（示例：文件名包含 prompt value）
    assigned = [p["value"] for p in prompts if p["value"] in img_path.stem.lower()]
    if not assigned:
        assigned = [prompts[0]["value"]]  # 默认关联第一个

    image_entries.append({
        "local_path": img_path,
        "zip_path": f"images/{img_path.name}",
        "promptString": ", ".join(assigned),
    })

# ---- 构建 manifest ----
manifest = {
    "version": 2,
    "exportedAt": 1715000000000,
    "rootCategoryId": "cat_style",
    "rootCategoryName": "人物风格",
    "categories": categories,
    "prompts": prompts,
    "combinations": combinations,
    "images": [
        {"path": e["zip_path"], "promptString": e["promptString"]}
        for e in image_entries
    ],
}

# ---- 写入 ZIP ----
output_file = "export_v2.zip"
with zipfile.ZipFile(output_file, "w", zipfile.ZIP_DEFLATED) as zf:
    zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    for e in image_entries:
        zf.write(e["local_path"], e["zip_path"])

print(f"导出完成: {output_file}")
print(f"  分类: {len(categories)}")
print(f"  Prompt: {len(prompts)}")
print(f"  组合: {len(combinations)}")
print(f"  图片: {len(image_entries)}")
```

### 示例 4：从 CSV/TXT 批量生成 Prompt

```python
"""
从文本文件批量生成 Prompt 导入包。
每行一个 prompt，格式: value|name|alias（alias 可选）
"""
import json
import zipfile

# 读取 prompt 列表
prompts = []
with open("prompts.txt", "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        entry = {"value": parts[0], "name": parts[1] if len(parts) > 1 else parts[0]}
        if len(parts) > 2:
            entry["alias"] = parts[2]
        prompts.append(entry)

manifest = {
    "version": 1,
    "exportedAt": 1715000000000,
    "prompts": prompts,
    "images": [],
}

with zipfile.ZipFile("from_text.zip", "w", zipfile.ZIP_DEFLATED) as zf:
    zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))

print(f"生成 {len(prompts)} 个 Prompt")
```

`prompts.txt` 示例：
```
akakura|赤倉|akakura先生
rossdraws|RossDraws|ross
wlop|WLOP
greg_rutkowski|Greg Rutkowski
# 这是注释，会被跳过
sarah|Sarah|
```

### 示例 5：从现有图片目录自动生成

```python
"""
扫描图片目录，按文件名自动提取 Prompt 名称并生成导入包。
文件名格式: @prompt_name,_001.png（与 Prompt Gallery 的检测规则一致）
"""
import json
import re
import zipfile
from pathlib import Path

ARTIST_REGEX = re.compile(r'^@([^,]+?)(?:,+\s*)?(?:_\d+)?\.(png|jpg|jpeg|webp)$', re.IGNORECASE)
image_dir = Path("./source_images")

prompts_map = {}  # value -> prompt entry
image_entries = []

for img_path in sorted(image_dir.iterdir()):
    m = ARTIST_REGEX.match(img_path.name)
    if not m:
        continue

    value = m.group(1).strip()
    if value not in prompts_map:
        prompts_map[value] = {"value": value, "name": value}

    image_entries.append({
        "local_path": img_path,
        "zip_path": f"images/{img_path.name}",
        "promptString": value,
    })

manifest = {
    "version": 1,
    "exportedAt": 1715000000000,
    "prompts": list(prompts_map.values()),
    "images": [
        {"path": e["zip_path"], "promptString": e["promptString"]}
        for e in image_entries
    ],
}

with zipfile.ZipFile("from_images.zip", "w", zipfile.ZIP_DEFLATED) as zf:
    zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    for e in image_entries:
        zf.write(e["local_path"], e["zip_path"])

print(f"Prompt: {len(prompts_map)}, 图片: {len(image_entries)}")
```

### 示例 6：远程图片（纯 URL，无本地文件）

```python
"""
导入远程图片映射，不需要在 ZIP 中包含实际图片文件。
适用于图片托管在外部服务（如网盘、CDN）的场景。
"""
import json
import zipfile

manifest = {
    "version": 1,
    "exportedAt": 1715000000000,
    "prompts": [
        {"value": "akakura", "name": "赤倉"},
        {"value": "wlop", "name": "WLOP"},
    ],
    "images": [
        # 远程图片 — path 直接用 URL，无需 ZIP 内有对应文件
        {
            "path": "https://i.imgur.com/example1.png",
            "type": "remote",
            "promptString": "akakura",
        },
        {
            "path": "https://cdn.example.com/art/wlop_001.jpg",
            "type": "remote",
            "promptString": "wlop",
        },
        {
            "path": "https://cdn.example.com/art/collab.png",
            "type": "remote",
            "promptString": "akakura, wlop",
        },
    ],
}

# ZIP 中只需要 manifest.json，不需要 images/ 目录
with zipfile.ZipFile("remote_images.zip", "w", zipfile.ZIP_DEFLATED) as zf:
    zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))

print("导出完成（远程图片，ZIP 仅含 manifest）")
```

### 示例 7：混合本地 + 远程图片

```python
import json
import zipfile
from pathlib import Path

local_images = Path("./local_photos")

local_entries = []
for img in sorted(local_images.glob("*.png")):
    local_entries.append({
        "local_path": img,
        "zip_path": f"images/{img.name}",
        "promptString": "akakura",
    })

manifest = {
    "version": 1,
    "exportedAt": 1715000000000,
    "prompts": [
        {"value": "akakura", "name": "赤倉"},
    ],
    "images": [
        # 本地图片
        *[{"path": e["zip_path"], "promptString": e["promptString"]} for e in local_entries],
        # 远程图片
        {
            "path": "https://example.com/extra_art.png",
            "type": "remote",
            "promptString": "akakura",
        },
    ],
}

with zipfile.ZipFile("mixed.zip", "w", zipfile.ZIP_DEFLATED) as zf:
    zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    for e in local_entries:
        zf.write(e["local_path"], e["zip_path"])

print(f"本地: {len(local_entries)}, 远程: 1")
```

---

## JavaScript/Node.js 构造示例

```javascript
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_node_process');

// 需要安装: npm install archiver
const archiver = require('archiver');

async function createImportZip(outputPath, imageDir, prompts) {
  const imageEntries = [];
  const files = fs.readdirSync(imageDir).filter(f => /\.(png|jpe?g|webp)$/i.test(f)).sort();

  for (const file of files) {
    imageEntries.push({
      zipPath: `images/${file}`,
      localPath: path.join(imageDir, file),
      prompts: prompts.map(p => p.value), // 默认关联所有 prompt
    });
  }

  const manifest = {
    version: 1,
    exportedAt: Date.now(),
    prompts: prompts,
    images: imageEntries.map(e => ({ path: e.zipPath, prompts: e.prompts })),
  };

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    archive.on('error', reject);

    archive.pipe(output);
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

    for (const e of imageEntries) {
      archive.file(e.localPath, { name: e.zipPath });
    }

    archive.finalize();
  });
}

// 使用
createImportZip('export.zip', './images', [
  { value: 'akakura', name: '赤倉' },
  { value: 'rossdraws', name: 'RossDraws', alias: 'ross' },
]).then(() => console.log('done'));
```

---

## Shell 脚本示例（纯 Prompt，无图片）

```bash
#!/bin/bash
# 从命令行参数生成纯 Prompt 导入包

OUTPUT="prompts.zip"
PROMPTS='[]'

for arg in "$@"; do
  # 格式: value:name 或 value
  VALUE="${arg%%:*}"
  NAME="${arg#*:}"
  [ "$NAME" = "$VALUE" ] && NAME=""
  PROMPTS=$(echo "$PROMPTS" | jq --arg v "$VALUE" --arg n "$NAME" '. + [{"value": $v, "name": (if $n == "" then $v else $n end)}]')
done

MANIFEST=$(jq -n \
  --argjson prompts "$PROMPTS" \
  --argjson ts "$(date +%s)000" \
  '{version: 1, exportedAt: $ts, prompts: $prompts, images: []}')

echo "$MANIFEST" | zip -j "$OUTPUT" -
# 或用 zipnote 注入 manifest.json
```

---

## 常见问题

**Q: 图片路径必须在 `images/` 下吗？**
A: 是的，`path` 字段必须指向 ZIP 内的实际文件路径，建议统一用 `images/` 前缀。

**Q: 一张图片可以关联多个 Prompt 吗？**
A: 可以，`prompts` 数组可以包含多个值。

**Q: v1 和 v2 可以混用吗？**
A: 不可以，`manifest.json` 中的 `version` 字段决定使用哪种解析逻辑。

**Q: `exportedAt` 必须精确吗？**
A: 不必须，可以填任意时间戳或直接写 `0`，仅用于展示。

**Q: 不带图片的 ZIP 可以导入吗？**
A: 可以，`images` 数组为空时只导入 Prompt/分类/组合元数据。

**Q: 分类 ID 可以用任意字符串吗？**
A: 可以，只要在 manifest 内部保持引用一致即可。导入时会重新映射为新的 UUID。
