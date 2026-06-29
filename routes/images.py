"""
Image 操作端点
"""
import json
from pathlib import Path
from aiohttp import web
import server
from ..storage import get_storage
from ._utils import is_remote_path
from ._delete_utils import remove_image_prompt_link, delete_image_completely


# ============ Image Mapping API ============

@server.PromptServer.instance.routes.get("/prompt_gallery/image/{filename:[\s\S]+}/prompts")
async def get_image_prompts(request):
    """获取图片关联的Prompt列表"""
    try:
        filename = request.match_info['filename']
        # 构建完整的图片路径
        image_path = f"prompt_gallery/{filename}"

        _, mapping_storage, _, _ = get_storage()
        mapping = mapping_storage.get_mappings_by_image(image_path)

        if not mapping:
            return web.json_response({"prompts": [], "totalCount": 0})

        prompt_storage, _, _, _ = get_storage()
        prompt_ids = mapping.get("promptIds", [])

        prompts = []
        for prompt_id in prompt_ids:
            prompt = prompt_storage.get_prompt_by_id(prompt_id)
            if prompt:
                prompts.append(prompt)

        return web.json_response({"prompts": prompts, "totalCount": len(prompts)})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


# ============ Save to Gallery API ============

@server.PromptServer.instance.routes.get("/prompt_gallery/image/info")
async def get_image_info(request):
    """获取图片详细信息（Prompt、prompt、工作流、文件信息）"""
    try:
        image_path = request.query.get("path", "")
        if not image_path:
            return web.json_response({"error": "缺少path参数"}, status=400)

        import folder_paths
        output_dir = Path(folder_paths.get_output_directory())

        remote = is_remote_path(image_path)

        result = {"mapping": None, "pnginfo": {}, "fileInfo": {}}

        # 1. 从映射存储获取Prompt关联
        prompt_storage, mapping_storage, _, _ = get_storage()
        mapping = mapping_storage.get_mappings_by_image(image_path)

        # 远程图片必须有映射记录，本地图片必须有文件
        if remote:
            if not mapping:
                return web.json_response({"error": "远程图片映射不存在"}, status=404)
        else:
            full_path = Path(output_dir) / image_path
            if not full_path.exists():
                return web.json_response({"error": "图片文件不存在"}, status=404)

        if mapping:
            result["mapping"] = {
                "type": mapping.get("type", "local"),
                "prompts": mapping.get("prompts", []),
                "fileInfo": mapping.get("fileInfo", {}),
                "promptString": mapping.get("promptString", ""),
                "generatePrompt": mapping.get("generatePrompt"),
            }

        if remote:
            # 远程图片：从映射中获取文件信息
            fi = mapping.get("fileInfo", {}) if mapping else {}
            result["fileInfo"] = {
                "width": fi.get("width", 0),
                "height": fi.get("height", 0),
                "size": fi.get("size", 0),
                "sizeFormatted": "远程图片",
            }
        else:
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

@server.PromptServer.instance.routes.post("/prompt_gallery/save")
async def save_to_gallery(request):
    """保存图片到画廊并创建映射关系"""
    try:
        data = await request.json()
        image_filename = data.get("imageFilename")
        prompt_values = data.get("promptValues", [])
        metadata = data.get("metadata", {})

        if not image_filename:
            return web.json_response({"error": "图片文件名不能为空"}, status=400)

        if not prompt_values:
            return web.json_response({"error": "必须选择至少一个Prompt"}, status=400)

        # 构建图片路径
        image_path = f"prompt_gallery/{image_filename}"

        # 构建 fileInfo
        file_info = {}
        if "width" in metadata:
            file_info["width"] = metadata["width"]
        if "height" in metadata:
            file_info["height"] = metadata["height"]

        # 创建映射关系
        prompt_storage, mapping_storage, _, _ = get_storage()
        mapping = mapping_storage.add_mapping(
            image_path=image_path,
            prompt_values=prompt_values,
            file_info=file_info,
            prompt_string=metadata.get("promptString", ""),
            mapping_type="local",
        )

        # 更新Prompt的图片计数
        for prompt_id in prompt_values:
            prompt_storage.update_image_count(prompt_id, 1)

        return web.json_response({
            "success": True,
            "mapping": mapping
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/prompt_gallery/restore_from_metadata")
async def restore_from_metadata(request):
    """从图片的 PNG 元数据中恢复Prompt映射关系"""
    try:
        import folder_paths
        from PIL import Image

        data = await request.json()
        filenames = data.get("filenames", [])

        if not filenames:
            return web.json_response({"error": "没有提供文件名"}, status=400)

        output_dir = Path(folder_paths.get_output_directory())
        gallery_dir = output_dir / "prompt_gallery"

        # 预先获取存储实例（循环内复用）
        prompt_storage, mapping_storage, _, _ = get_storage()

        restored_count = 0
        errors = []

        for filename in filenames:
            image_path = gallery_dir / filename
            if not image_path.exists():
                errors.append(f"{filename}: 文件不存在")
                continue

            try:
                # 从 PNG 元数据中读取Prompt信息
                with Image.open(image_path) as img:
                    # 读取 PNG tEXt 块
                    from PIL import PngImagePlugin
                    if hasattr(img, 'text') and 'prompt_gallery' in img.text:
                        # 解析Prompt元数据
                        prompt_metadata = json.loads(img.text['prompt_gallery'])
                        prompt_ids = prompt_metadata.get("prompt_ids", [])

                        if prompt_ids:
                            # 创建映射关系
                            image_rel_path = f"prompt_gallery/{filename}"
                            mapping_storage.add_mapping(
                                image_path=image_rel_path,
                                prompt_values=prompt_ids,
                                file_info={"width": img.width, "height": img.height},
                                mapping_type="local",
                            )

                            # 更新Prompt的图片计数
                            for prompt_id in prompt_ids:
                                prompt_storage.update_image_count(prompt_id, 1)

                            restored_count += 1
                            print(f"[Restore] 恢复映射: {filename} -> PromptID: {prompt_ids}")
                        else:
                            errors.append(f"{filename}: 元数据中没有Prompt信息")
                    else:
                        errors.append(f"{filename}: 没有找到Prompt元数据")

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


@server.PromptServer.instance.routes.delete("/prompt_gallery/image")
async def delete_image(request):
    """
    删除单张图片

    请求体: {
      "imagePath": "prompt_gallery/xxx.png",
      "promptValue": "1girl"  // 可选：传了表示从 prompt 详情删图片（只断开关联），不传表示完全删除
    }
    """
    try:
        data = await request.json()
        image_path = data.get("imagePath")
        prompt_value = data.get("promptValue")

        if not image_path:
            return web.json_response({"error": "缺少imagePath参数"}, status=400)

        prompt_storage, mapping_storage, _, _ = get_storage()

        if prompt_value:
            # 从 prompt 详情删图片：只断开该 prompt 的关联
            result = remove_image_prompt_link(image_path, prompt_value, mapping_storage)
            # 更新 prompt 的 imageCount
            all_prompts = prompt_storage.get_all_prompts()
            for p in all_prompts:
                if p.get("value") == prompt_value:
                    prompt_storage.update_image_count(p.get("categoryId"), prompt_value, -1)
            return web.json_response({
                "success": True,
                "message": "图片已删除" if result["file_deleted"] else "已断开关联",
                "fileDeleted": result["file_deleted"],
                "mappingDeleted": result["mapping_deleted"],
            })
        else:
            # 从历史视图删图片：完全删除
            result = delete_image_completely(image_path, mapping_storage, prompt_storage)
            return web.json_response({
                "success": True,
                "message": "图片已删除",
                "fileDeleted": result["file_deleted"],
                "affectedPrompts": result["affected_prompts"],
            })

    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/prompt_gallery/image/move")
async def move_image(request):
    """移动图片到其他Prompt下"""
    try:
        data = await request.json()
        image_path = data.get("imagePath")
        from_prompt_value = data.get("fromPromptValue")
        to_prompt_value = data.get("toPromptValue")
        to_category_id = data.get("toCategoryId")

        if not image_path or not from_prompt_value or not to_prompt_value:
            return web.json_response({"error": "缺少必要参数"}, status=400)

        if from_prompt_value == to_prompt_value:
            return web.json_response({"error": "不能移动到同一个Prompt"}, status=400)

        prompt_storage, mapping_storage, _, _ = get_storage()

        # 验证目标Prompt存在
        to_category_id = to_category_id or "root"
        to_prompt = prompt_storage.get_prompt(to_category_id, to_prompt_value)
        if not to_prompt:
            return web.json_response({"error": "目标Prompt不存在"}, status=400)

        # 获取图片映射
        mapping = mapping_storage.get_mappings_by_image(image_path)
        if not mapping:
            return web.json_response({"error": "图片映射不存在"}, status=404)

        # 从映射中移除原Prompt，添加目标Prompt
        prompt_values = mapping.get("prompts", [])
        if from_prompt_value not in prompt_values:
            return web.json_response({"error": "原Prompt未关联此图片"}, status=400)

        prompt_values.remove(from_prompt_value)
        if to_prompt_value not in prompt_values:
            prompt_values.append(to_prompt_value)

        # 更新映射到文件
        success = mapping_storage.update_mapping(image_path, prompt_values)

        if success:
            # 更新图片计数：使用组合键
            from_prompt = None
            for a in prompt_storage.get_all_prompts():
                if a.get("value") == from_prompt_value:
                    from_prompt = a
                    break

            if from_prompt:
                prompt_storage.update_image_count(from_prompt.get("categoryId", "root"), from_prompt_value, -1)
            prompt_storage.update_image_count(to_category_id, to_prompt_value, 1)

            return web.json_response({
                "success": True,
                "message": f"已移动图片到Prompt '{to_prompt.get('name', to_prompt.get('value'))}'"
            })
        else:
            return web.json_response({"error": "更新映射失败"}, status=500)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/prompt_gallery/image/copy")
async def copy_image(request):
    """
    复制图片到其他Prompt
    不修改原映射，只是添加新的Prompt到图片的映射中
    """
    try:
        data = await request.json()
        image_path = data.get("imagePath")
        to_prompt_value = data.get("toPromptValue")
        to_category_id = data.get("toCategoryId")

        if not image_path or not to_prompt_value:
            return web.json_response({"error": "缺少必要参数"}, status=400)

        prompt_storage, mapping_storage, _, _ = get_storage()

        # 验证目标Prompt存在
        to_category_id = to_category_id or "root"
        to_prompt = prompt_storage.get_prompt(to_category_id, to_prompt_value)
        if not to_prompt:
            return web.json_response({"error": "目标Prompt不存在"}, status=400)

        # 获取图片映射
        mapping = mapping_storage.get_mappings_by_image(image_path)
        if not mapping:
            return web.json_response({"error": "图片映射不存在"}, status=404)

        # 获取当前Prompt列表
        prompt_values = mapping.get("prompts", [])

        # 如果已经关联，不重复添加
        if to_prompt_value in prompt_values:
            return web.json_response({"error": "图片已关联到目标Prompt"}, status=400)

        # 添加目标Prompt到映射
        prompt_values.append(to_prompt_value)

        # 更新映射到文件
        success = mapping_storage.update_mapping(image_path, prompt_values)

        if success:
            # 更新目标Prompt图片计数
            prompt_storage.update_image_count(to_category_id, to_prompt_value, 1)

            return web.json_response({
                "success": True,
                "message": f"已复制图片到Prompt '{to_prompt.get('name', to_prompt.get('value'))}'"
            })
        else:
            return web.json_response({"error": "更新映射失败"}, status=500)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
