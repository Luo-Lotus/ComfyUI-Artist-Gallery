"""
Image 操作端点
"""
import json
from pathlib import Path
from aiohttp import web
import server
from ..storage import get_storage
from ._utils import is_remote_path
from ._delete_utils import delete_image_completely


# ============ Image Mapping API ============

@server.PromptServer.instance.routes.get("/prompt_gallery/image/{filename:[\s\S]+}/prompts")
async def get_image_prompts(request):
    """根据图片 promptString 反查匹配的 Prompt 列表"""
    try:
        filename = request.match_info['filename']
        # 构建完整的图片路径
        image_path = f"prompt_gallery/{filename}"

        _, mapping_storage, _, _ = get_storage()
        mapping = mapping_storage.get_mappings_by_image(image_path)

        if not mapping:
            return web.json_response({"prompts": [], "totalCount": 0})

        prompt_storage, _, _, _ = get_storage()
        prompt_string_lower = (mapping.get("promptString") or "").lower()
        prompts = []
        if prompt_string_lower:
            for prompt in prompt_storage.get_all_prompts():
                value = (prompt.get("value") or "").lower()
                if value and value in prompt_string_lower:
                    prompts.append(prompt)

        return web.json_response({"prompts": prompts, "totalCount": len(prompts)})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


# ============ Save to Gallery API ============

@server.PromptServer.instance.routes.get("/prompt_gallery/image/info")
async def get_image_info(request):
    """获取图片 PNG 元数据和图片索引中的 API Prompt。"""
    try:
        image_path = request.query.get("path", "")
        if not image_path:
            return web.json_response({"error": "缺少path参数"}, status=400)

        import folder_paths
        output_dir = Path(folder_paths.get_output_directory())

        remote = is_remote_path(image_path)

        _, mapping_storage, _, _ = get_storage()
        mapping = mapping_storage.get_mappings_by_image(image_path)
        result = {
            "pnginfo": {},
            "generatePrompt": mapping.get("generatePrompt") if mapping else None,
        }

        # 远程图片必须有映射记录，本地图片必须有文件
        if remote:
            if not mapping:
                return web.json_response({"error": "远程图片映射不存在"}, status=404)
        else:
            full_path = Path(output_dir) / image_path
            if not full_path.exists():
                return web.json_response({"error": "图片文件不存在"}, status=404)

            # 读取 PNG 元数据（工作流/prompt）
            try:
                from PIL import Image
                with Image.open(full_path) as img:
                    if hasattr(img, "text"):
                        result["pnginfo"] = dict(img.text)
            except Exception:
                pass

        return web.json_response({"success": True, "info": result})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@server.PromptServer.instance.routes.post("/prompt_gallery/save")
async def save_to_gallery(request):
    """保存图片到画廊并创建图片索引"""
    try:
        data = await request.json()
        image_filename = data.get("imageFilename")
        prompt_string = data.get("promptString", data.get("prompt_string", ""))
        metadata = data.get("metadata", {})

        if not image_filename:
            return web.json_response({"error": "图片文件名不能为空"}, status=400)

        if not prompt_string:
            return web.json_response({"error": "必须提供 promptString"}, status=400)

        # 构建图片路径
        image_path = f"prompt_gallery/{image_filename}"

        # 构建 fileInfo
        file_info = {}
        if "width" in metadata:
            file_info["width"] = metadata["width"]
        if "height" in metadata:
            file_info["height"] = metadata["height"]

        # 创建映射关系
        _, mapping_storage, _, _ = get_storage()
        mapping = mapping_storage.add_mapping(
            image_path=image_path,
            file_info=file_info,
            prompt_string=prompt_string or metadata.get("promptString", ""),
            mapping_type="local",
        )

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
        _, mapping_storage, _, _ = get_storage()

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
                        prompt_string = prompt_metadata.get("promptString") or ", ".join(prompt_ids)

                        if prompt_string:
                            # 创建映射关系
                            image_rel_path = f"prompt_gallery/{filename}"
                            mapping_storage.add_mapping(
                                image_path=image_rel_path,
                                prompt_string=prompt_string,
                                file_info={"width": img.width, "height": img.height},
                                mapping_type="local",
                            )

                            restored_count += 1
                            print(f"[Restore] 恢复映射: {filename} -> promptString: {prompt_string[:80]}")
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
      "imagePath": "prompt_gallery/xxx.png"
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
            return web.json_response({"error": "当前版本不支持从 Prompt 断开图片关联，请从历史视图删除整张图片"}, status=400)
        else:
            # 从历史视图删图片：完全删除
            result = delete_image_completely(image_path, mapping_storage, None)
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
    """图片不再支持移动到其他 Prompt。"""
    return web.json_response({"error": "当前版本不支持将图片移动到其他 Prompt"}, status=400)


@server.PromptServer.instance.routes.post("/prompt_gallery/image/copy")
async def copy_image(request):
    """图片不再支持复制到其他 Prompt。"""
    return web.json_response({"error": "当前版本不支持将图片复制到其他 Prompt"}, status=400)
