"""
Artist Gallery API 路由
所有HTTP API端点的处理函数
"""
import json
from pathlib import Path
from aiohttp import web
import server
from .storage import get_storage, migrate_to_composite_key, _resolve_storage_dir
from .utils import decode_filename
from . import import_handler


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
        parent_id = data.get("parentId", "root")

        if not name:
            return web.json_response({"error": "分类名称不能为空"}, status=400)

        _, _, category_storage = get_storage()
        category = category_storage.add_category(name, parent_id)

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


@server.PromptServer.instance.routes.post("/artist_gallery/categories/{category_id}/move")
async def move_category(request):
    """移动分类到其他分类下"""
    try:
        category_id = request.match_info['category_id']
        data = await request.json()
        new_parent_id = data.get("newParentId", "root")

        if new_parent_id == category_id:
            return web.json_response({"error": "不能将分类移动到自己下面"}, status=400)

        _, _, category_storage = get_storage()

        # 检查是否会形成循环
        def check_cycle(parent_id, target_id):
            if parent_id == target_id:
                return True
            cat = category_storage.get_category_by_id(parent_id)
            if not cat or not cat.get("parentId"):
                return False
            return check_cycle(cat["parentId"], target_id)

        if new_parent_id != "root" and check_cycle(new_parent_id, category_id):
            return web.json_response({"error": "不能将分类移动到自己的子分类下"}, status=400)

        # 更新分类的父分类
        success = category_storage.update_category(category_id, parentId=new_parent_id)

        if success:
            category = category_storage.get_category_by_id(category_id)
            return web.json_response({"category": category, "success": True})
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
        category_id = data.get("categoryId", "root")

        if not artists_data:
            return web.json_response({"error": "画师列表不能为空"}, status=400)

        artist_storage, _, _ = get_storage()
        success_artists, failed_names = artist_storage.add_artists_batch(artists_data, category_id)

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
    """删除画师（包括关联的图片文件）- 兼容旧版本"""
    try:
        artist_id = request.match_info['artist_id']

        artist_storage, mapping_storage, _ = get_storage()

        # 获取画师信息
        artist = artist_storage.get_artist_by_id(artist_id)
        if not artist:
            return web.json_response({"error": "画师不存在"}, status=404)

        # 获取该画师关联的图片
        mappings = mapping_storage.get_mappings_by_artist_id(artist_id)

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
        artist_storage.delete_artist_by_id(artist_id)

        return web.json_response({
            "success": True,
            "deletedFiles": deleted_files,
            "message": f"已删除画师 '{artist.get('displayName')}'"
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.get(r"/artist_gallery/artists/{category_id}/{name:.+}")
async def get_artist_composite(request):
    """获取单个画师详情（使用组合键）"""
    try:
        category_id = request.match_info['category_id']
        name = request.match_info['name']

        artist_storage, _, _ = get_storage()
        artist = artist_storage.get_artist(category_id, name)

        if not artist:
            return web.json_response({"error": "画师不存在"}, status=404)

        return web.json_response({"artist": artist})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.put(r"/artist_gallery/artists/{category_id}/{name:.+}")
async def update_artist_composite(request):
    """更新画师信息（使用组合键）"""
    try:
        category_id = request.match_info['category_id']
        old_name = request.match_info['name']
        data = await request.json()

        artist_storage, mapping_storage, category_storage = get_storage()

        # 检查是否要修改名称
        new_name = data.get("name", old_name)
        name_changed = (old_name != new_name)

        # 如果修改了名称，需要先检查新名称是否在任意分类下已存在
        if name_changed:
            # 获取所有画师，检查新名称是否已存在
            all_artists = artist_storage.get_all_artists()
            for artist in all_artists:
                if artist.get("name") == new_name:
                    return web.json_response({"error": f"画师名称 '{new_name}' 已存在（在分类 '{artist.get('categoryId', 'root')}' 中）"}, status=400)

        kwargs = {}
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
        if "name" in data:
            kwargs["name"] = new_name

        # 如果修改了名称，需要找到所有分类下同名的画师并批量更新
        updated_artists = []
        success = True  # 默认成功，用于非名称变更的情况

        if name_changed:
            # 获取所有画师
            all_artists = artist_storage.get_all_artists()

            # 找出所有与旧名称同名的画师
            same_name_artists = [a for a in all_artists if a.get("name") == old_name]

            # 批量更新所有同名画师
            for same_name_artist in same_name_artists:
                cat_id = same_name_artist.get("categoryId", "root")
                # 更新画师名称（只传入需要更新的字段）
                update_kwargs = {}
                if "displayName" in kwargs:
                    update_kwargs["displayName"] = kwargs["displayName"]
                if "categoryId" in kwargs:
                    update_kwargs["categoryId"] = kwargs["categoryId"]
                if "coverImageId" in kwargs:
                    update_kwargs["coverImageId"] = kwargs["coverImageId"]
                update_kwargs["name"] = new_name

                success = artist_storage.update_artist(cat_id, old_name, **update_kwargs)
                if success:
                    updated_artists.append({
                        "categoryId": cat_id,
                        "oldName": old_name,
                        "newName": new_name
                    })
        else:
            # 只更新当前画师（不修改名称）
            success = artist_storage.update_artist(category_id, old_name, **kwargs)

        if success:
            # 如果修改了名称，更新所有相关映射
            updated_mappings = 0
            if name_changed:
                updated_mappings = mapping_storage.rename_artist_in_mappings(old_name, new_name)

            # 重新查询更新后的画师信息
            new_category_id = kwargs.get("categoryId", category_id)
            artist = artist_storage.get_artist(new_category_id, new_name)

            result = {
                "artist": artist,
                "success": True
            }

            # 如果更新了映射，添加更新数量
            if name_changed:
                result["updatedMappings"] = updated_mappings
                result["updatedArtists"] = updated_artists

            return web.json_response(result)
        else:
            return web.json_response({"error": "画师不存在"}, status=404)
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.delete(r"/artist_gallery/artists/{category_id}/{name:.+}")
async def delete_artist_composite(request):
    """
    删除画师（使用组合键）

    删除逻辑：
    - 检查是否存在其他分类的同名画师
    - 如果存在：只删除画师记录，不修改图片映射
    - 如果不存在：移除图片映射，删除孤儿图片
    """
    try:
        category_id = request.match_info['category_id']
        name = request.match_info['name']

        artist_storage, mapping_storage, _ = get_storage()

        # 获取画师信息
        artist = artist_storage.get_artist(category_id, name)
        if not artist:
            return web.json_response({"error": "画师不存在"}, status=404)

        # 检查是否存在其他分类的同名画师
        all_artists = artist_storage.get_all_artists()
        same_name_artists = [a for a in all_artists if a.get("name") == name and a.get("categoryId") != category_id]
        has_other_categories = len(same_name_artists) > 0

        deleted_files = []

        if not has_other_categories:
            # 这是最后一个同名画师，可以安全清理图片
            # 移除映射关系，获取孤儿图片（没有其他画师关联的图片）
            orphan_images = mapping_storage.remove_artist_from_mappings(name)

            # 删除孤儿图片文件
            import folder_paths
            output_dir = Path(folder_paths.get_output_directory())
            for image_path in orphan_images:
                full_path = output_dir / image_path
                try:
                    if full_path.exists():
                        full_path.unlink()
                        deleted_files.append(image_path)
                except Exception as e:
                    print(f"Error deleting file {image_path}: {e}")

        # 删除画师记录
        artist_storage.delete_artist(category_id, name)

        return web.json_response({
            "success": True,
            "deletedFiles": deleted_files,
            "message": f"已删除画师 '{artist.get('displayName')}'",
            "hasOtherCategories": has_other_categories
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


@server.PromptServer.instance.routes.post("/artist_gallery/artists/{artist_id}/move")
async def move_artist(request):
    """移动画师到其他分类下"""
    try:
        artist_id = request.match_info['artist_id']
        data = await request.json()
        new_category_id = data.get("newCategoryId", "root")

        artist_storage, _, category_storage = get_storage()

        # 验证新分类存在
        category = category_storage.get_category_by_id(new_category_id)
        if not category:
            return web.json_response({"error": "目标分类不存在"}, status=400)

        # 更新画师的分类
        success = artist_storage.update_artist(artist_id, categoryId=new_category_id)

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


@server.PromptServer.instance.routes.delete("/artist_gallery/image")
async def delete_image(request):
    """
    删除单张图片（从画师详情中）

    请求体: {
      "imagePath": "artist_gallery/xxx.png"
      // artistId不再需要，自动从映射中获取
    }

    逻辑：
    - 如果图片被多个画师引用，只删除图片文件
    - 如果图片只被一个画师引用，删除文件和映射
    """
    try:
        data = await request.json()
        image_path = data.get("imagePath")

        if not image_path:
            return web.json_response({"error": "缺少imagePath参数"}, status=400)

        artist_storage, mapping_storage, _ = get_storage()

        # 获取图片映射
        mapping = mapping_storage.get_mappings_by_image(image_path)
        if not mapping:
            return web.json_response({"error": "图片映射不存在"}, status=404)

        # 获取关联的画师列表
        artist_names = mapping.get("artistNames", [])

        # 删除图片文件
        import folder_paths
        output_dir = Path(folder_paths.get_output_directory())
        full_path = output_dir / image_path

        file_deleted = False
        try:
            if full_path.exists():
                full_path.unlink()
                file_deleted = True
        except Exception as e:
            return web.json_response({"error": f"删除文件失败: {str(e)}"}, status=500)

        # 删除映射关系
        mapping_storage.delete_mapping_by_image(image_path)

        # 更新所有关联画师的图片计数
        for artist_name in artist_names:
            # 查找所有同名画师并更新计数
            all_artists = artist_storage.get_all_artists()
            for artist in all_artists:
                if artist.get("name") == artist_name:
                    artist_storage.update_image_count(
                        artist.get("categoryId"),
                        artist_name,
                        -1
                    )

        return web.json_response({
            "success": True,
            "message": "图片已删除",
            "fileDeleted": file_deleted,
            "affectedArtists": artist_names
        })

    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/artist_gallery/image/move")
async def move_image(request):
    """移动图片到其他画师下"""
    try:
        data = await request.json()
        image_path = data.get("imagePath")
        from_artist_name = data.get("fromArtistName")
        to_artist_name = data.get("toArtistName")
        to_category_id = data.get("toCategoryId")

        if not image_path or not from_artist_name or not to_artist_name:
            return web.json_response({"error": "缺少必要参数"}, status=400)

        if from_artist_name == to_artist_name:
            return web.json_response({"error": "不能移动到同一个画师"}, status=400)

        artist_storage, mapping_storage, _ = get_storage()

        # 验证目标画师存在
        to_category_id = to_category_id or "root"
        to_artist = artist_storage.get_artist(to_category_id, to_artist_name)
        if not to_artist:
            return web.json_response({"error": "目标画师不存在"}, status=400)

        # 获取图片映射
        mapping = mapping_storage.get_mappings_by_image(image_path)
        if not mapping:
            return web.json_response({"error": "图片映射不存在"}, status=404)

        # 从映射中移除原画师，添加目标画师
        artist_names = mapping.get("artistNames", [])
        if from_artist_name not in artist_names:
            return web.json_response({"error": "原画师未关联此图片"}, status=400)

        artist_names.remove(from_artist_name)
        if to_artist_name not in artist_names:
            artist_names.append(to_artist_name)

        # 更新映射到文件
        success = mapping_storage.update_mapping(image_path, artist_names)

        if success:
            # 更新图片计数：使用组合键
            from_artist = None
            for a in artist_storage.get_all_artists():
                if a.get("name") == from_artist_name:
                    from_artist = a
                    break

            if from_artist:
                artist_storage.update_image_count(from_artist.get("categoryId", "root"), from_artist_name, -1)
            artist_storage.update_image_count(to_category_id, to_artist_name, 1)

            return web.json_response({
                "success": True,
                "message": f"已移动图片到画师 '{to_artist.get('displayName', to_artist.get('name'))}'"
            })
        else:
            return web.json_response({"error": "更新映射失败"}, status=500)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/artist_gallery/artists/{category_id}/{name:.+}/copy")
async def copy_artist(request):
    """
    复制画师到其他分类
    创建一个新的画师实例，共享所有图片（因为图片映射使用画师名称）
    """
    try:
        category_id = request.match_info['category_id']
        name = request.match_info['name']
        data = await request.json()
        target_category_id = data.get("targetCategoryId")
        new_name = data.get("newName", name)

        if not target_category_id:
            return web.json_response({"error": "缺少目标分类ID"}, status=400)

        artist_storage, _, category_storage = get_storage()

        # 验证源画师存在
        source_artist = artist_storage.get_artist(category_id, name)
        if not source_artist:
            return web.json_response({"error": "源画师不存在"}, status=404)

        # 验证目标分类存在
        target_category = category_storage.get_category_by_id(target_category_id)
        if not target_category:
            return web.json_response({"error": "目标分类不存在"}, status=400)

        # 创建新画师（使用相同或新名称）
        try:
            new_artist = artist_storage.add_artist(
                name=new_name,
                display_name=source_artist.get("displayName"),
                category_id=target_category_id
            )
        except ValueError as e:
            return web.json_response({"error": str(e)}, status=400)

        # 图片会自动共享，因为映射使用画师名称

        return web.json_response({
            "success": True,
            "artist": new_artist,
            "message": f"已复制画师到分类 '{target_category.get('name')}'"
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/artist_gallery/image/copy")
async def copy_image(request):
    """
    复制图片到其他画师
    不修改原映射，只是添加新的画师到图片的映射中
    """
    try:
        data = await request.json()
        image_path = data.get("imagePath")
        to_artist_name = data.get("toArtistName")
        to_category_id = data.get("toCategoryId")

        if not image_path or not to_artist_name:
            return web.json_response({"error": "缺少必要参数"}, status=400)

        artist_storage, mapping_storage, _ = get_storage()

        # 验证目标画师存在
        to_category_id = to_category_id or "root"
        to_artist = artist_storage.get_artist(to_category_id, to_artist_name)
        if not to_artist:
            return web.json_response({"error": "目标画师不存在"}, status=400)

        # 获取图片映射
        mapping = mapping_storage.get_mappings_by_image(image_path)
        if not mapping:
            return web.json_response({"error": "图片映射不存在"}, status=404)

        # 获取当前画师列表
        artist_names = mapping.get("artistNames", [])

        # 如果已经关联，不重复添加
        if to_artist_name in artist_names:
            return web.json_response({"error": "图片已关联到目标画师"}, status=400)

        # 添加目标画师到映射
        artist_names.append(to_artist_name)

        # 更新映射到文件
        success = mapping_storage.update_mapping(image_path, artist_names)

        if success:
            # 更新目标画师图片计数
            artist_storage.update_image_count(to_category_id, to_artist_name, 1)

            return web.json_response({
                "success": True,
                "message": f"已复制图片到画师 '{to_artist.get('displayName', to_artist.get('name'))}'"
            })
        else:
            return web.json_response({"error": "更新映射失败"}, status=500)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


# ============ Migration API ============

@server.PromptServer.instance.routes.post("/artist_gallery/migrate")
async def migrate_data(request):
    """
    迁移数据到组合键架构
    从 UUID 架构迁移到 (categoryId, name) 组合键架构
    """
    try:
        # 获取存储目录
        storage_dir = _resolve_storage_dir()

        # 执行迁移
        result = migrate_to_composite_key(storage_dir)

        if result["success"]:
            return web.json_response({
                "success": True,
                "message": result["message"],
                "backup_dir": result["backup_dir"],
                "validation": result["validation"]
            })
        else:
            return web.json_response({
                "success": False,
                "error": result["message"],
                "backup_dir": result.get("backup_dir")
            }, status=500)

    except Exception as e:
        return web.json_response({
            "success": False,
            "error": f"迁移失败: {str(e)}"
        }, status=500)


# ============ Import API ============

@server.PromptServer.instance.routes.post("/artist_gallery/import/batch")
async def import_images_batch(request):
    """
    批量导入图片到画廊
    支持单个画师导入和自定义规则批量导入
    """
    import asyncio
    import base64
    import time
    import random
    import folder_paths
    from io import BytesIO

    from .import_handler import (
        save_image_with_metadata,
        parse_artist_info_from_filename
    )

    try:
        data = await request.json()
        mode = data.get("mode", "single")  # "single" | "custom"
        images = data.get("images", [])
        config = data.get("config", {})

        print(f"[ImportBatch] 收到导入请求")
        print(f"  mode: {mode}")
        print(f"  images数量: {len(images)}")
        print(f"  config: {config}")
        if images:
            print(f"  第一个文件名: {images[0].get('filename')}")

        if not images:
            return web.json_response({"error": "没有提供图片"}, status=400)

        # 获取存储实例
        artist_storage, mapping_storage, category_storage = get_storage()

        # 准备输出目录
        output_dir = Path(folder_paths.get_output_directory())
        save_dir = output_dir / "artist_gallery"
        save_dir.mkdir(parents=True, exist_ok=True)

        # 并发控制（最多5个并发）
        semaphore = asyncio.Semaphore(5)

        async def import_single_image(image_data: dict):
            """导入单张图片"""
            async with semaphore:
                try:
                    # 1. 解码base64
                    image_bytes = base64.b64decode(image_data['data'])
                    filename = image_data['filename']

                    # 2. 解析画师信息
                    if mode == "single":
                        # 单个画师模式：直接使用配置中的画师信息
                        artist_name = config.get("artistName", "").strip()
                        display_name = config.get("displayName", artist_name)
                        category_id = config.get("categoryId", "root")
                        will_create_artist = False
                        error_msg = None
                    else:
                        # 自定义模式：从文件名解析
                        artist_name, display_name, error_msg, will_create_artist = \
                            parse_artist_info_from_filename(filename, config)
                        category_id = config.get("defaultCategoryId", "root")

                    if not artist_name:
                        return {
                            'filename': filename,
                            'success': False,
                            'error': error_msg or '无法解析画师名称'
                        }

                    # 3. 确保画师存在
                    artist = artist_storage.get_artist(category_id, artist_name)
                    if not artist and will_create_artist:
                        try:
                            artist = artist_storage.add_artist(
                                name=artist_name,
                                display_name=display_name,
                                category_id=category_id
                            )
                        except ValueError:
                            # 画师已存在（并发情况）
                            artist = artist_storage.get_artist(category_id, artist_name)

                    if not artist:
                        return {
                            'filename': filename,
                            'success': False,
                            'error': '画师不存在且未启用自动创建'
                        }

                    # 4. 生成唯一文件名
                    timestamp = int(time.time() * 1000)
                    counter = random.randint(0, 99999)
                    new_filename = f"AG_{timestamp}_{counter:05}.png"
                    save_path = save_dir / new_filename

                    # 5. 保存图片并嵌入metadata（一次性完成）
                    selected_artists = [{
                        "categoryId": category_id,
                        "name": artist_name,
                        "displayName": display_name
                    }]

                    success, metadata = save_image_with_metadata(
                        image_bytes=image_bytes,
                        save_path=save_path,
                        artist_names=[artist_name],
                        display_names=[display_name],
                        categories=[category_id],
                        selected_artists=selected_artists
                    )

                    if not success:
                        # 保存失败，删除文件（如果已创建）
                        if save_path.exists():
                            save_path.unlink()
                        return {
                            'filename': filename,
                            'success': False,
                            'error': '图片保存失败'
                        }

                    # 6. 创建映射关系
                    image_rel_path = f"artist_gallery/{new_filename}"
                    mapping_storage.add_mapping(
                        image_rel_path,
                        [artist_name],
                        metadata or {"width": 0, "height": 0}
                    )

                    # 7. 更新画师计数
                    artist_storage.update_image_count(category_id, artist_name, 1)

                    return {
                        'filename': filename,
                        'success': True,
                        'imagePath': image_rel_path,
                        'artistName': artist_name,
                        'displayName': display_name,
                        'categoryId': category_id
                    }

                except Exception as e:
                    import traceback
                    traceback.print_exc()
                    return {
                        'filename': image_data.get('filename', 'unknown'),
                        'success': False,
                        'error': str(e)
                    }

        # 并发处理所有图片
        tasks = [import_single_image(img) for img in images]
        results = await asyncio.gather(*tasks)

        # 统计结果
        imported = sum(1 for r in results if r['success'])
        failed = len(results) - imported

        # 收集创建的画师
        created_artists = [
            r for r in results
            if r['success'] and r.get('artistName')
        ]

        return web.json_response({
            'success': True,
            'imported': imported,
            'failed': failed,
            'results': results,
            'createdArtists': created_artists
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.json_response({'error': str(e)}, status=500)


@server.PromptServer.instance.routes.post("/artist_gallery/import/preview")
async def import_preview(request):
    """
    预览导入结果
    显示文件名如何解析，不会实际导入
    """
    try:
        data = await request.json()
        filenames = data.get("filenames", [])
        config = data.get("config", {})

        if not filenames:
            return web.json_response({"error": "没有提供文件名"}, status=400)

        from .import_handler import parse_artist_info_from_filename

        preview = []

        for filename in filenames:
            artist_name, display_name, error_msg, will_create = \
                parse_artist_info_from_filename(filename, config)

            category_id = config.get("defaultCategoryId", "root")

            # 获取分类名称
            _, _, category_storage = get_storage()
            category = category_storage.get_category_by_id(category_id)
            category_name = category.get("name", "unknown") if category else "unknown"

            # 检查画师是否存在
            artist_storage, _, _ = get_storage()
            artist_exists = artist_storage.get_artist(category_id, artist_name) is not None if artist_name else False

            preview.append({
                'filename': filename,
                'parsedArtist': artist_name,
                'displayName': display_name,
                'category': category_name,
                'categoryId': category_id,
                'willCreate': will_create and not artist_exists,
                'warnings': [] if artist_name else ['无法解析画师名称']
            })

        # 统计
        matched = sum(1 for p in preview if p['parsedArtist'])
        unmatched = len(preview) - matched

        return web.json_response({
            'preview': preview,
            'totalFiles': len(filenames),
            'matchedFiles': matched,
            'unmatchedFiles': unmatched
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.json_response({'error': str(e)}, status=500)


# ============ Batch Operations API ============

@server.PromptServer.instance.routes.delete("/artist_gallery/batch/delete")
async def batch_delete(request):
    """
    批量删除分类和画师

    删除逻辑：
    1. 删除分类：只删除画师记录，不修改图片映射（避免影响其他分类的同名画师）
    2. 删除独立画师：移除图片映射，删除孤儿图片文件

    请求体: {
      "categories": ["cat1", "cat2"],
      "artists": [{"categoryId": "xxx", "name": "yyy"}]
    }
    """
    try:
        data = await request.json()
        category_ids = data.get("categories", [])
        artists = data.get("artists", [])

        artist_storage, mapping_storage, category_storage = get_storage()
        import folder_paths
        output_dir = Path(folder_paths.get_output_directory())

        deleted_categories = []
        deleted_artists = []
        deleted_images = []
        errors = []

        # ============ 第一部分：删除分类 ============
        # 只删除画师记录，不修改图片映射
        for cat_id in category_ids:
            try:
                category = category_storage.get_category_by_id(cat_id)
                if not category:
                    errors.append(f"分类 {cat_id} 不存在")
                    continue

                # 递归获取所有子分类
                def get_all_child_categories(parent_id):
                    children = category_storage.get_child_categories(parent_id)
                    result = [parent_id]
                    for child in children:
                        result.extend(get_all_child_categories(child['id']))
                    return result

                all_cat_ids = get_all_child_categories(cat_id)

                # 获取这些分类下的所有画师
                all_artists = []
                for cid in all_cat_ids:
                    all_artists.extend([
                        a for a in artist_storage.get_all_artists()
                        if a.get("categoryId") == cid
                    ])

                # 只删除画师记录，不修改图片映射
                for artist in all_artists:
                    artist_name = artist.get("name")
                    artist_cat_id = artist.get("categoryId")

                    # 删除画师记录（不影响图片映射）
                    artist_storage.delete_artist(artist_cat_id, artist_name)
                    deleted_artists.append(artist.get("displayName", artist_name))

                # 删除分类记录（从叶子节点开始）
                for cid in reversed(all_cat_ids):
                    category_storage.delete_category(cid)
                    deleted_categories.append(category.get("name"))

            except Exception as e:
                errors.append(f"删除分类 {cat_id} 失败: {str(e)}")

        # ============ 第二部分：删除独立画师 ============
        # 移除图片映射，删除孤儿图片文件
        for artist_data in artists:
            try:
                category_id = artist_data.get("categoryId")
                name = artist_data.get("name")

                # 获取画师
                artist = artist_storage.get_artist(category_id, name)
                if not artist:
                    errors.append(f"画师 {name} 不存在")
                    continue

                # 移除图片映射，获取孤儿图片
                orphan_images = mapping_storage.remove_artist_from_mappings(name)

                # 删除孤儿图片文件
                for image_path in orphan_images:
                    full_path = output_dir / image_path
                    try:
                        if full_path.exists():
                            full_path.unlink()
                            deleted_images.append(image_path)
                    except Exception as e:
                        errors.append(f"删除文件 {image_path} 失败: {e}")

                # 删除画师记录
                artist_storage.delete_artist(category_id, name)
                deleted_artists.append(artist.get("displayName", name))

            except Exception as e:
                errors.append(f"删除画师 {artist_data.get('name')} 失败: {str(e)}")

        return web.json_response({
            "success": True,
            "deletedCategories": deleted_categories,
            "deletedArtists": deleted_artists,
            "deletedImages": deleted_images,
            "errors": errors
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/artist_gallery/batch/move")
async def batch_move(request):
    """
    批量移动分类和画师
    请求体: {
      "categories": [{"id": "xxx", "newParentId": "yyy"}],
      "artists": [{"categoryId": "xxx", "name": "yyy", "newCategoryId": "zzz"}]
    }
    """
    try:
        data = await request.json()
        categories = data.get("categories", [])
        artists = data.get("artists", [])

        artist_storage, _, category_storage = get_storage()

        moved_categories = []
        moved_artists = []
        errors = []

        # 移动分类
        for cat_data in categories:
            try:
                cat_id = cat_data.get("id")
                new_parent_id = cat_data.get("newParentId", "root")

                # 验证目标分类存在
                if new_parent_id != "root":
                    target_cat = category_storage.get_category_by_id(new_parent_id)
                    if not target_cat:
                        errors.append(f"目标分类 {new_parent_id} 不存在")
                        continue

                # 检查是否会形成循环
                def check_cycle(parent_id, target_id):
                    if parent_id == target_id:
                        return True
                    cat = category_storage.get_category_by_id(parent_id)
                    if not cat or not cat.get("parentId"):
                        return False
                    return check_cycle(cat["parentId"], target_id)

                if new_parent_id != "root" and check_cycle(new_parent_id, cat_id):
                    errors.append(f"不能将分类 {cat_id} 移动到自己的子分类下")
                    continue

                # 更新分类的父分类
                success = category_storage.update_category(cat_id, parentId=new_parent_id)
                if success:
                    cat = category_storage.get_category_by_id(cat_id)
                    moved_categories.append(cat.get("name", cat_id))
                else:
                    errors.append(f"分类 {cat_id} 不存在")

            except Exception as e:
                errors.append(f"移动分类 {cat_data.get('id')} 失败: {str(e)}")

        # 移动画师
        for artist_data in artists:
            try:
                category_id = artist_data.get("categoryId")
                name = artist_data.get("name")
                new_category_id = artist_data.get("newCategoryId", "root")

                # 验证目标分类存在
                target_cat = category_storage.get_category_by_id(new_category_id)
                if not target_cat:
                    errors.append(f"目标分类 {new_category_id} 不存在")
                    continue

                # 更新画师的分类
                success = artist_storage.update_artist(category_id, name, categoryId=new_category_id)
                if success:
                    artist = artist_storage.get_artist(new_category_id, name)
                    moved_artists.append(artist.get("displayName", name))
                else:
                    errors.append(f"画师 {name} 不存在")

            except Exception as e:
                errors.append(f"移动画师 {artist_data.get('name')} 失败: {str(e)}")

        return web.json_response({
            "success": True,
            "movedCategories": moved_categories,
            "movedArtists": moved_artists,
            "errors": errors
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/artist_gallery/batch/copy")
async def batch_copy(request):
    """
    批量复制画师到目标分类
    请求体: {
      "artists": [{"categoryId": "xxx", "name": "yyy", "targetCategoryId": "zzz"}]
    }
    """
    try:
        data = await request.json()
        artists = data.get("artists", [])

        artist_storage, _, category_storage = get_storage()

        copied_artists = []
        errors = []

        for artist_data in artists:
            try:
                category_id = artist_data.get("categoryId")
                name = artist_data.get("name")
                target_category_id = artist_data.get("targetCategoryId")
                new_name = artist_data.get("newName", name)

                # 验证源画师存在
                source_artist = artist_storage.get_artist(category_id, name)
                if not source_artist:
                    errors.append(f"源画师 {name} 不存在")
                    continue

                # 验证目标分类存在
                target_cat = category_storage.get_category_by_id(target_category_id)
                if not target_cat:
                    errors.append(f"目标分类 {target_category_id} 不存在")
                    continue

                # 创建新画师（使用相同或新名称）
                try:
                    new_artist = artist_storage.add_artist(
                        name=new_name,
                        display_name=source_artist.get("displayName"),
                        category_id=target_category_id
                    )
                    copied_artists.append(new_artist.get("displayName", new_name))
                except ValueError as e:
                    errors.append(f"复制画师 {name} 失败: {str(e)}")

            except Exception as e:
                errors.append(f"复制画师 {artist_data.get('name')} 失败: {str(e)}")

        return web.json_response({
            "success": True,
            "copiedArtists": copied_artists,
            "errors": errors
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.json_response({"error": str(e)}, status=500)


# ============ Cycle State API ============

# 全局循环状态存储
_cycle_states = {}  # node_id -> cycle_index


@server.PromptServer.instance.routes.post("/artist_gallery/cycle-state")
async def save_cycle_state(request):
    """保存循环状态"""
    try:
        data = await request.json()
        node_id = data.get("node_id")
        cycle_index = data.get("cycle_index", 0)

        if not node_id:
            return web.json_response({"error": "缺少node_id参数"}, status=400)

        _cycle_states[node_id] = cycle_index

        return web.json_response({
            "success": True,
            "cycle_index": cycle_index
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.get("/artist_gallery/cycle-state")
async def get_cycle_state(request):
    """获取循环状态"""
    try:
        node_id = request.query.get("node_id")

        if not node_id:
            return web.json_response({"error": "缺少node_id参数"}, status=400)

        cycle_index = _cycle_states.get(node_id, 0)

        return web.json_response({
            "cycle_index": cycle_index
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/artist_gallery/cycle-state/reset")
async def reset_cycle_state(request):
    """重置循环状态"""
    try:
        data = await request.json()
        node_id = data.get("node_id")

        if not node_id:
            return web.json_response({"error": "缺少node_id参数"}, status=400)

        if node_id in _cycle_states:
            del _cycle_states[node_id]

        return web.json_response({
            "success": True
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
