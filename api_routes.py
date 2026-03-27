"""
Artist Gallery API 路由
所有HTTP API端点的处理函数
"""
import json
from pathlib import Path
from aiohttp import web
import server
from .storage import get_storage
from .utils import decode_filename


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
            artist_id = artist.get("id")

            # 从映射关系中获取该画师的图片
            mappings = mapping_storage.get_mappings_by_artist(artist_id)

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

            # 构建画师对象
            result_artist = {
                "id": artist.get("id"),
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
        from .utils import scan_output_directory
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


# ============ Category CRUD API ============

@server.PromptServer.instance.routes.get("/artist_gallery/categories")
async def get_categories(request):
    """获取所有分类（树形结构）"""
    try:
        _, _, category_storage = get_storage()
        tree = category_storage.get_category_tree()
        return web.json_response({"categories": tree})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.get("/artist_gallery/categories/{category_id}")
async def get_category(request):
    """获取单个分类详情"""
    try:
        category_id = request.match_info['category_id']
        _, _, category_storage = get_storage()
        category = category_storage.get_category_by_id(category_id)

        if not category:
            return web.json_response({"error": "分类不存在"}, status=404)

        return web.json_response({"category": category})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/artist_gallery/categories")
async def add_category(request):
    """添加分类"""
    try:
        data = await request.json()
        name = data.get("name", "").strip()
        display_name = data.get("displayName", "").strip() or name
        parent_id = data.get("parentId", "root")

        if not name:
            return web.json_response({"error": "分类名称不能为空"}, status=400)

        _, _, category_storage = get_storage()
        category = category_storage.add_category(name, display_name, parent_id)

        return web.json_response({"category": category, "success": True})
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.put("/artist_gallery/categories/{category_id}")
async def update_category(request):
    """更新分类"""
    try:
        category_id = request.match_info['category_id']
        data = await request.json()

        _, _, category_storage = get_storage()

        kwargs = {}
        if "name" in data:
            kwargs["name"] = data["name"]
        if "displayName" in data:
            kwargs["displayName"] = data["displayName"]
        if "order" in data:
            kwargs["order"] = data["order"]

        success = category_storage.update_category(category_id, **kwargs)

        if success:
            category = category_storage.get_category_by_id(category_id)
            return web.json_response({"category": category, "success": True})
        else:
            return web.json_response({"error": "分类不存在"}, status=404)
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.delete("/artist_gallery/categories/{category_id}")
async def delete_category(request):
    """删除分类"""
    try:
        category_id = request.match_info['category_id']

        _, _, category_storage = get_storage()
        success = category_storage.delete_category(category_id)

        if success:
            return web.json_response({"success": True})
        else:
            return web.json_response({"error": "分类不存在"}, status=404)
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


# ============ Artist CRUD API ============

@server.PromptServer.instance.routes.get("/artist_gallery/artists")
async def get_artists(request):
    """获取所有画师列表"""
    try:
        artist_storage, _, _ = get_storage()
        artists = artist_storage.get_all_artists()
        return web.json_response({"artists": artists, "totalCount": len(artists)})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/artist_gallery/artists")
async def add_artist(request):
    """添加画师（单个）"""
    try:
        data = await request.json()
        name = data.get("name", "").strip()
        display_name = data.get("displayName", "").strip() or None
        category_id = data.get("categoryId", "root")

        if not name:
            return web.json_response({"error": "画师名称不能为空"}, status=400)

        artist_storage, _, category_storage = get_storage()

        # 验证分类存在
        category = category_storage.get_category_by_id(category_id)
        if not category:
            return web.json_response({"error": "分类不存在"}, status=400)

        artist = artist_storage.add_artist(name, display_name, category_id)

        return web.json_response({"artist": artist, "success": True})
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/artist_gallery/artists/batch")
async def add_artists_batch(request):
    """批量添加画师"""
    try:
        data = await request.json()
        artists_data = data.get("artists", [])

        if not artists_data:
            return web.json_response({"error": "画师列表不能为空"}, status=400)

        artist_storage, _, _ = get_storage()
        success_artists, failed_names = artist_storage.add_artists_batch(artists_data)

        return web.json_response({
            "success": True,
            "addedCount": len(success_artists),
            "failedCount": len(failed_names),
            "artists": success_artists,
            "failedNames": failed_names
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.delete("/artist_gallery/artists/{artist_id}")
async def delete_artist(request):
    """删除画师（包括关联的图片文件）"""
    try:
        artist_id = request.match_info['artist_id']

        artist_storage, mapping_storage, _ = get_storage()

        # 获取画师信息
        artist = artist_storage.get_artist_by_id(artist_id)
        if not artist:
            return web.json_response({"error": "画师不存在"}, status=404)

        # 获取该画师关联的图片
        mappings = mapping_storage.get_mappings_by_artist(artist_id)

        # 移除映射关系，获取孤儿图片（没有其他画师关联的图片）
        orphan_images = mapping_storage.remove_artist_from_mappings(artist_id)

        # 删除孤儿图片文件
        import folder_paths
        output_dir = Path(folder_paths.get_output_directory())
        deleted_files = []
        for image_path in orphan_images:
            full_path = output_dir / image_path
            try:
                if full_path.exists():
                    full_path.unlink()
                    deleted_files.append(image_path)
            except Exception as e:
                print(f"Error deleting file {image_path}: {e}")

        # 删除画师记录
        artist_storage.delete_artist(artist_id)

        return web.json_response({
            "success": True,
            "deletedFiles": deleted_files,
            "message": f"已删除画师 '{artist.get('displayName')}'"
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.put("/artist_gallery/artists/{artist_id}")
async def update_artist(request):
    """更新画师信息"""
    try:
        artist_id = request.match_info['artist_id']
        data = await request.json()

        artist_storage, _, category_storage = get_storage()

        kwargs = {}
        if "name" in data:
            kwargs["name"] = data["name"]
        if "displayName" in data:
            kwargs["displayName"] = data["displayName"]
        if "categoryId" in data:
            # 验证分类存在
            category = category_storage.get_category_by_id(data["categoryId"])
            if not category:
                return web.json_response({"error": "分类不存在"}, status=400)
            kwargs["categoryId"] = data["categoryId"]
        if "coverImageId" in data:
            kwargs["coverImageId"] = data["coverImageId"]

        success = artist_storage.update_artist(artist_id, **kwargs)

        if success:
            artist = artist_storage.get_artist_by_id(artist_id)
            return web.json_response({"artist": artist, "success": True})
        else:
            return web.json_response({"error": "画师不存在"}, status=404)
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.get("/artist_gallery/artist/{artist_id}/images")
async def get_artist_images(request):
    """获取画师关联的图片（通过映射查询）"""
    try:
        artist_id = request.match_info['artist_id']

        _, mapping_storage, _ = get_storage()
        mappings = mapping_storage.get_mappings_by_artist(artist_id)

        # 构建图片信息
        images = []
        for mapping in mappings:
            images.append({
                "path": mapping.get("imagePath"),
                "savedAt": mapping.get("savedAt"),
                "metadata": mapping.get("metadata", {})
            })

        # 按时间倒序排序
        images.sort(key=lambda x: x.get("savedAt", 0), reverse=True)

        return web.json_response({"images": images, "totalCount": len(images)})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


# ============ Image Mapping API ============

@server.PromptServer.instance.routes.get("/artist_gallery/image/{filename:.+}/artists")
async def get_image_artists(request):
    """获取图片关联的画师列表"""
    try:
        filename = request.match_info['filename']
        # 构建完整的图片路径
        image_path = f"artist_gallery/{filename}"

        _, mapping_storage, _ = get_storage()
        mapping = mapping_storage.get_mappings_by_image(image_path)

        if not mapping:
            return web.json_response({"artists": [], "totalCount": 0})

        artist_storage, _, _ = get_storage()
        artist_ids = mapping.get("artistIds", [])

        artists = []
        for artist_id in artist_ids:
            artist = artist_storage.get_artist_by_id(artist_id)
            if artist:
                artists.append(artist)

        return web.json_response({"artists": artists, "totalCount": len(artists)})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


# ============ Save to Gallery API ============

@server.PromptServer.instance.routes.post("/artist_gallery/save")
async def save_to_gallery(request):
    """保存图片到画廊并创建映射关系"""
    try:
        data = await request.json()
        image_filename = data.get("imageFilename")
        artist_ids = data.get("artistIds", [])
        metadata = data.get("metadata", {})

        if not image_filename:
            return web.json_response({"error": "图片文件名不能为空"}, status=400)

        if not artist_ids:
            return web.json_response({"error": "必须选择至少一个画师"}, status=400)

        # 构建图片路径
        image_path = f"artist_gallery/{image_filename}"

        # 创建映射关系
        _, mapping_storage, _ = get_storage()
        mapping = mapping_storage.add_mapping(image_path, artist_ids, metadata)

        # 更新画师的图片计数
        artist_storage, _, _ = get_storage()
        for artist_id in artist_ids:
            artist_storage.update_image_count(artist_id, 1)

        return web.json_response({
            "success": True,
            "mapping": mapping
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/artist_gallery/restore_from_metadata")
async def restore_from_metadata(request):
    """从图片的 PNG 元数据中恢复画师映射关系"""
    try:
        import folder_paths
        from PIL import Image

        data = await request.json()
        filenames = data.get("filenames", [])

        if not filenames:
            return web.json_response({"error": "没有提供文件名"}, status=400)

        output_dir = Path(folder_paths.get_output_directory())
        gallery_dir = output_dir / "artist_gallery"

        restored_count = 0
        errors = []

        for filename in filenames:
            image_path = gallery_dir / filename
            if not image_path.exists():
                errors.append(f"{filename}: 文件不存在")
                continue

            try:
                # 从 PNG 元数据中读取画师信息
                with Image.open(image_path) as img:
                    # 读取 PNG tEXt 块
                    from PIL import PngImagePlugin
                    if hasattr(img, 'text') and 'artist_gallery' in img.text:
                        # 解析画师元数据
                        artist_metadata = json.loads(img.text['artist_gallery'])
                        artist_ids = artist_metadata.get("artist_ids", [])

                        if artist_ids:
                            # 创建映射关系
                            image_rel_path = f"artist_gallery/{filename}"
                            _, mapping_storage, _ = get_storage()
                            mapping_storage.add_mapping(
                                image_rel_path,
                                artist_ids,
                                {"width": img.width, "height": img.height}
                            )

                            # 更新画师的图片计数
                            artist_storage, _, _ = get_storage()
                            for artist_id in artist_ids:
                                artist_storage.update_image_count(artist_id, 1)

                            restored_count += 1
                            print(f"[Restore] 恢复映射: {filename} -> 画师ID: {artist_ids}")
                        else:
                            errors.append(f"{filename}: 元数据中没有画师信息")
                    else:
                        errors.append(f"{filename}: 没有找到画师元数据")

            except json.JSONDecodeError as e:
                errors.append(f"{filename}: 元数据解析失败")
            except Exception as e:
                errors.append(f"{filename}: {str(e)}")

        return web.json_response({
            "success": True,
            "restored_count": restored_count,
            "total_count": len(filenames),
            "errors": errors
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
