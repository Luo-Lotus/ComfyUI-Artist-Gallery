"""
Batch 操作端点
"""
from pathlib import Path
from aiohttp import web
import server
from ..storage import get_storage


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

        artist_storage, mapping_storage, category_storage, _ = get_storage()
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

        artist_storage, _, category_storage, _ = get_storage()

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

        artist_storage, _, category_storage, _ = get_storage()

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
