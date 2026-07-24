"""从 data.json 生成 Prompt Gallery 导入 ZIP（v2 格式，远程图片）"""
import json
import zipfile
import time

INPUT = "data.json"
OUTPUT = "artist_gallery_import.zip"
CDN_BASE = "https://cdn.mooshieblob.com/20260325_anima_all_artists/images"


def format_value(tag: str) -> str:
    """去掉开头@、下划线，括号前加转义反斜杠"""
    v = tag.lstrip("@").replace("_", " ")
    v = v.replace("(", "\\(").replace(")", "\\)")
    return v


with open(INPUT, "r", encoding="utf-8") as f:
    data = json.load(f)

CATEGORY_ID = "cat_artists"

manifest = {
    "version": 2,
    "exportedAt": int(time.time() * 1000),
    "rootCategoryId": CATEGORY_ID,
    "rootCategoryName": "Artists",
    "categories": [
        {"id": CATEGORY_ID, "name": "Artists", "parentId": None, "order": 0}
    ],
    "prompts": [],
    "images": [],
}

for item in data:
    tag = item["tag"]
    image_id = item["imageId"]
    value = format_value(tag)

    manifest["prompts"].append({
        "value": value,
        "name": value,
        "alias": tag,
        "categoryId": CATEGORY_ID,
    })
    manifest["images"].append({
        "path": f"{CDN_BASE}/{image_id}.webp",
        "type": "remote",
        "prompts": [value],
    })

with zipfile.ZipFile(OUTPUT, "w", zipfile.ZIP_DEFLATED) as zf:
    zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))

print(f"Done: {OUTPUT}")
print(f"  Prompts: {len(manifest['prompts'])}")
print(f"  Images:  {len(manifest['images'])}")
