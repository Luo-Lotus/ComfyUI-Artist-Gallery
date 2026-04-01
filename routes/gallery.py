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

        artist_storage, mapping_storage, category_storage, combination_storage = get_storage()

        # 验证分类存在
        category = category_storage.get_category_by_id(category_id)
        if not category:
            return web.json_response({"error": "分类不存在"}, status=400)

        # 只获取该分类下的画师（不包含子分类）
        artists_data = [
            a for a in artist_storage.get_all_artists()
            if a.get("categoryId") == category_id
        ]

        # 构建结果列表（只返回封面信息，不返回完整图片列表）
        result_artists = []

        for artist in artists_data:
            artist_name = artist.get("name")

            # 获取该画师的图片映射数量（只计数，不返回完整列表）
            mappings = mapping_storage.get_mappings_by_artist(artist_name)
            image_count = 0
            for mapping in mappings:
                image_path = mapping.get("imagePath")
                full_path = Path(output_dir) / image_path
                if full_path.exists():
                    image_count += 1

            # 获取封面图片路径：优先用设置的封面，否则取第一张
            cover_path = artist.get("coverImageId")
            if not cover_path:
                first_mapping = mapping_storage.get_first_mapping_by_artist(artist_name)
                if first_mapping:
                    cover_path = first_mapping.get("imagePath")

            # 构建画师对象（不包含 images 数组）
            result_artist = {
                "name": artist.get("name"),
                "displayName": artist.get("displayName"),
                "categoryId": artist.get("categoryId", "root"),
                "coverImagePath": cover_path,
                "imageCount": image_count,
                "createdAt": artist.get("createdAt", 0)
            }

            result_artists.append(result_artist)

        # 排序画师
        result_artists.sort(key=lambda x: x["name"].lower())

        # 获取当前分类下的组合，并添加封面图片路径
        raw_combinations = combination_storage.get_combinations_by_category(category_id)
        result_combinations = []
        for comb in raw_combinations:
            comb_data = dict(comb)
            # 优先使用设置的封面，否则取第一个成员画师的第一张图
            cover_path = comb.get("coverImageId")
            if not cover_path:
                for artist_name in comb.get("artistKeys", []):
                    mappings = mapping_storage.get_mappings_by_artist(artist_name)
                    for m in mappings:
                        image_path = m.get("imagePath")
                        full_path = Path(output_dir) / image_path
                        if full_path.exists():
                            cover_path = image_path
                            break
                    if cover_path:
                        break
            comb_data["coverImagePath"] = cover_path
            result_combinations.append(comb_data)

        return web.json_response({
            "artists": result_artists,
            "combinations": result_combinations,
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
