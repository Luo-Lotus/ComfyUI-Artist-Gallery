# Prompt Gallery ZIP 导入格式

导入包是一个 ZIP 文件，根目录必须包含 `manifest.json`。本地图片可以放在 ZIP 内，远程图片直接登记 URL。

## 版本选择

| 版本 | 内容 | 使用场景 |
| --- | --- | --- |
| v1 | Prompt + 图片 | 全部导入当前选中的分类 |
| v2 | 分类树 + Prompt + 图片 | 保留分类结构 |

旧 v2 文件中的 `combinations` 字段会被忽略，不会导入。

## ZIP 结构

```text
package.zip
├── manifest.json
└── images/
    ├── example-1.png
    └── example-2.webp
```

只有远程图片时不需要 `images/` 目录。

## v1 格式

v1 中的 Prompt 全部写入用户导入时选择的目标分类。

```json
{
  "version": 1,
  "prompts": [
    {
      "value": "artist_name",
      "name": "Artist Name",
      "alias": "artist"
    }
  ],
  "images": [
    {
      "path": "images/example-1.png",
      "promptString": "artist_name, portrait"
    }
  ]
}
```

## v2 格式

v2 会在当前目标分类下重建 manifest 中的分类树。

```json
{
  "version": 2,
  "exportedAt": 1784304000000,
  "rootCategoryId": "artists",
  "rootCategoryName": "Artists",
  "categories": [
    {
      "id": "artists",
      "name": "Artists",
      "parentId": null,
      "order": 0
    },
    {
      "id": "illustrators",
      "name": "Illustrators",
      "parentId": "artists",
      "order": 0
    }
  ],
  "prompts": [
    {
      "value": "artist_name",
      "name": "Artist Name",
      "alias": "artist",
      "categoryId": "illustrators"
    }
  ],
  "images": [
    {
      "path": "images/example-1.png",
      "promptString": "artist_name, portrait"
    },
    {
      "path": "https://example.com/example-2.webp",
      "type": "remote",
      "promptString": "artist_name, landscape"
    }
  ]
}
```

## 字段说明

### manifest

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `version` | 是 | `1` 或 `2` |
| `prompts` | 是 | Prompt 数组，可以为空 |
| `images` | 是 | 图片数组，可以为空 |
| `categories` | v2 | 分类数组 |
| `rootCategoryId` | v2 | 导入树根分类的原始 ID |
| `rootCategoryName` | v2 | 导入树根分类名称 |

### prompts[]

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `value` | 是 | 实际输出和图片匹配使用的 Prompt 文本 |
| `name` | 否 | 显示名称，默认使用 `value` |
| `alias` | 否 | 搜索别名 |
| `categoryId` | v2 | 引用 `categories[].id` |

同一分类中重复的 `value` 会被跳过。

### categories[]

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | ZIP 内部使用的分类 ID |
| `name` | 是 | 分类名称 |
| `parentId` | 否 | 父分类 ID；根分类使用 `null` |
| `order` | 否 | 同级排序值，默认 `0` |

导入时会生成新的分类 ID，并自动重建父子关系。

### images[]

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `path` | 是 | ZIP 内路径或远程 HTTP(S) URL |
| `type` | 否 | 远程图片建议设置为 `remote` |
| `promptString` | 建议 | 图片对应的完整提示词，用于 Prompt 图片匹配和封面补齐 |

兼容旧包时，如果没有 `promptString`，导入器会尝试用 `prompts` 或 `promptNames` 数组逗号拼接。

## Python 生成示例

```python
import json
import zipfile

manifest = {
    "version": 2,
    "rootCategoryId": "root-import",
    "rootCategoryName": "Imported",
    "categories": [
        {"id": "root-import", "name": "Imported", "parentId": None, "order": 0}
    ],
    "prompts": [
        {
            "value": "artist_name",
            "name": "Artist Name",
            "alias": "",
            "categoryId": "root-import",
        }
    ],
    "images": [
        {
            "path": "images/example.png",
            "promptString": "artist_name, portrait",
        }
    ],
}

with zipfile.ZipFile("prompt_gallery_import.zip", "w", zipfile.ZIP_DEFLATED) as zf:
    zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    zf.write("example.png", "images/example.png")
```

## 导入行为

- 本地图片会复制到 ComfyUI 的 `output/prompt_gallery/`。
- 远程图片只登记 URL，不下载文件。
- 图片索引保存 `promptString`，不会持久化 Prompt ID 映射。
- 新导入的 Prompt 没有封面时，只从本批导入图片中选择最新匹配图片作为封面。
- 开启“单独存储”后，分类、Prompt 和图片会写入同前缀的独立分片文件。
