"""
Artist Gallery Node - 扫描并管理画师图片
"""
import os
import re
import json
from pathlib import Path
from aiohttp import web
import server

# 画师名称解析正则
ARTIST_REGEX = re.compile(r'^@([^,]+?)(?:,+\s*)?(?:_\d+)?\.(png|jpg|jpeg|webp)$', re.IGNORECASE)


def decode_filename(filename):
    """URL 解码文件名（支持多重编码）"""
    import urllib.parse
    decoded = filename
    max_iterations = 5
    iteration = 0
    previous = ''
    while decoded != previous and iteration < max_iterations:
        previous = decoded
        try:
            decoded = urllib.parse.unquote(previous)
        except Exception:
            break
        iteration += 1
    return decoded


def parse_artist_name(filename):
    """解析文件名获取画师名称"""
    decoded_filename = decode_filename(filename)
    match = ARTIST_REGEX.match(decoded_filename)
    return match.group(1) if match else None


def scan_output_directory(output_dir):
    """扫描 output 目录获取画师数据"""
    output_path = Path(output_dir)

    if not output_path.exists():
        return {"artists": [], "totalCount": 0, "error": "目录不存在"}

    artists = {}

    # 扫描所有图片文件
    for ext in ['*.png', '*.jpg', '*.jpeg', '*.webp']:
        for img_path in output_path.rglob(ext):
            filename = img_path.name
            artist_name = parse_artist_name(filename)

            if not artist_name:
                continue

            # 获取相对于 output 目录的路径（用于 /view 端点）
            try:
                rel_path = str(img_path.relative_to(output_path))
            except ValueError:
                # 如果图片不在 output 目录下，跳过
                continue

            if artist_name not in artists:
                artists[artist_name] = {
                    "name": artist_name,
                    "displayName": f"@{artist_name}",
                    "imageCount": 0,
                    "images": []
                }

            try:
                stat = img_path.stat()
                artists[artist_name]["images"].append({
                    "path": rel_path,
                    "size": stat.st_size,
                    "mtime": stat.st_mtime * 1000  # 转换为毫秒
                })
            except Exception as e:
                print(f"Error reading file {img_path}: {e}")
                continue

    # 排序图片
    for artist in artists.values():
        artist["images"].sort(key=lambda x: decode_filename(x["path"]))
        artist["imageCount"] = len(artist["images"])

    # 排序画师
    sorted_artists = sorted(artists.values(), key=lambda x: x["name"].lower())

    return {
        "artists": sorted_artists,
        "totalCount": len(sorted_artists),
        "generatedAt": None
    }


class ArtistGallery:
    """画师图库节点"""

    CATEGORY = "🎨 Artist Gallery"
    RETURN_TYPES = ()
    FUNCTION = "gallery"
    OUTPUT_NODE = True

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
        }

    def gallery(self):
        """节点执行函数（无实际输出，仅用于触发）"""
        return ()


# HTTP 路由处理
@server.PromptServer.instance.routes.get("/artist_gallery/data")
async def get_gallery_data(request):
    """获取画师图库数据 API"""
    import folder_paths
    output_dir = folder_paths.get_output_directory()

    data = scan_output_directory(output_dir)
    return web.json_response(data)


@server.PromptServer.instance.routes.get("/artist_gallery/html")
async def get_gallery_html(request):
    """返回图库 HTML 页面"""
    html_path = Path(__file__).parent / "web" / "gallery.html"
    if html_path.exists():
        with open(html_path, 'r', encoding='utf-8') as f:
            html_content = f.read()
        return web.Response(text=html_content, content_type='text/html')
    else:
        return web.Response(text="Gallery HTML not found", status=404)
