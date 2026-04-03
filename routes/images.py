"""
Image 操作端点
"""
import json
from pathlib import Path
from aiohttp import web
import server
from ..storage import get_storage


# ============ Image Mapping API ============

@server.PromptServer.instance.routes.get("/artist_gallery/image/{filename:.+}/artists")
async def get_image_artists(request):
    """获取图片关联的画师列表"""
    try:
        filename = request.match_info['filename']
        # 构建完整的图片路径
        image_path = f"artist_gallery/{filename}"

        _, mapping_storage, _, _ = get_storage()
        mapping = mapping_storage.get_mappings_by_image(image_path)

        if not mapping:
            return web.json_response({"artists": [], "totalCount": 0})

        artist_storage, _, _, _ = get_storage()
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

@server.PromptServer.instance.routes.get("/artist_gallery/image/info")
async def get_image_info(request):
    """获取图片详细信息（画师、prompt、工作流、文件信息）"""
    try:
        image_path = request.query.get("path", "")
        if not image_path:
            return web.json_response({"error": "缺少path参数"}, status=400)

        import folder_paths
        output_dir = Path(folder_paths.get_output_directory())
        full_path = output_dir / image_path

        if not full_path.exists():
            return web.json_response({"error": "图片文件不存在"}, status=404)

        result = {"mapping": None, "pnginfo": {}, "fileInfo": {}}

        # 1. 从映射存储获取画师关联
        artist_storage, mapping_storage, _, _ = get_storage()
        mapping = mapping_storage.get_mappings_by_image(image_path)
        if mapping:
            result["mapping"] = {
                "artistNames": mapping.get("artistNames", []),
                "savedAt": mapping.get("savedAt"),
                "metadata": mapping.get("metadata", {}),
            }

        # 2. 读取 PNG 元数据
        try:
            from PIL import Image
            with Image.open(full_path) as img:
                if hasattr(img, "text"):
                    result["pnginfo"] = dict(img.text)
                result["fileInfo"]["width"] = img.width
                result["fileInfo"]["height"] = img.height
        except Exception:
            pass

        # 3. 文件基本信息
        try:
            stat = full_path.stat()
            result["fileInfo"]["size"] = stat.st_size
            result["fileInfo"]["sizeFormatted"] = f"{stat.st_size / 1024:.1f} KB"
        except Exception:
            pass

        return web.json_response({"success": True, "info": result})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

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
        _, mapping_storage, _, _ = get_storage()
        mapping = mapping_storage.add_mapping(image_path, artist_ids, metadata)

        # 更新画师的图片计数
        artist_storage, _, _, _ = get_storage()
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
                            _, mapping_storage, _, _ = get_storage()
                            mapping_storage.add_mapping(
                                image_rel_path,
                                artist_ids,
                                {"width": img.width, "height": img.height}
                            )

                            # 更新画师的图片计数
                            artist_storage, _, _, _ = get_storage()
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

        artist_storage, mapping_storage, _, _ = get_storage()

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

        artist_storage, mapping_storage, _, _ = get_storage()

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

        artist_storage, mapping_storage, _, _ = get_storage()

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
