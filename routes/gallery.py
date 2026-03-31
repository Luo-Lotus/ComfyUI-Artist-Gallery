"""
Gallery 数据 & HTML 端点
"""
from pathlib import Path
from aiohttp import web
import server
from ..storage import get_storage
from ..utils import decode_filename


# ============ Gallery 数据 API ============

@server.PromptServer.instance.routes.get("/artist_gallery/data")
async def get_gallery_data(request):
    """获取画师图库数据 API（支持分类筛选）"""
    import folder_paths
    output_dir = folder_paths.get_output_directory()

    try:
        # 获取分类参数
        category_id = request.query.get("category", "root")

        artist_storage, mapping_storage, category_storage = get_storage()

        # 验证分类存在
        category = category_storage.get_category_by_id(category_id)
        if not category:
            return web.json_response({"error": "分类不存在"}, status=400)

        # 只获取该分类下的画师（不包含子分类）
        artists_data = [
            a for a in artist_storage.get_all_artists()
            if a.get("categoryId") == category_id
        ]

        # 构建结果列表
        result_artists = []

        for artist in artists_data:
            artist_name = artist.get("name")

            # 从映射关系中获取该画师的图片（使用画师名称）
            mappings = mapping_storage.get_mappings_by_artist(artist_name)

            images = []
            for mapping in mappings:
                image_path = mapping.get("imagePath")

                # 获取文件信息
                full_path = Path(output_dir) / image_path
                if full_path.exists():
                    try:
                        stat = full_path.stat()
                        images.append({
                            "path": image_path,
                            "size": stat.st_size,
                            "mtime": stat.st_mtime * 1000
                        })
                    except Exception as e:
                        print(f"Error reading file {image_path}: {e}")

            # 排序图片
            images.sort(key=lambda x: decode_filename(x["path"]))

            # 构建画师对象（不再包含 id 字段）
            result_artist = {
                "name": artist.get("name"),
                "displayName": artist.get("displayName"),
                "categoryId": artist.get("categoryId", "root"),
                "coverImageId": artist.get("coverImageId"),
                "imageCount": len(images),
                "images": images,
                "createdAt": artist.get("createdAt", 0)
            }

            result_artists.append(result_artist)

        # 排序画师
        result_artists.sort(key=lambda x: x["name"].lower())

        return web.json_response({
            "artists": result_artists,
            "totalCount": len(result_artists),
            "categoryId": category_id,
            "generatedAt": int(__import__('time').time() * 1000)
        })

    except Exception as e:
        print(f"Error getting gallery data: {e}")
        # 降级到扫描方式
        from ..utils import scan_output_directory
        data = scan_output_directory(output_dir)
        return web.json_response(data)


@server.PromptServer.instance.routes.get("/artist_gallery/html")
async def get_gallery_html(request):
    """返回图库 HTML 页面"""
    html_path = Path(__file__).parent.parent / "web" / "gallery.html"
    if html_path.exists():
        with open(html_path, 'r', encoding='utf-8') as f:
            html_content = f.read()
        return web.Response(text=html_content, content_type='text/html')
    else:
        return web.Response(text="Gallery HTML not found", status=404)
