"""
Artist CRUD 端点
"""
from pathlib import Path
from aiohttp import web
import server
from ..storage import get_storage


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
                if "categoryId" in kwargs and cat_id == category_id:
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
