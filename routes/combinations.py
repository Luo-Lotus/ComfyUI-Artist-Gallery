"""
组合 API 端点
"""
import json
from pathlib import Path
from aiohttp import web
import server
from ..storage import get_storage
from ._utils import is_remote_path




# ============ 组合 CRUD API ============

@server.PromptServer.instance.routes.get("/prompt_gallery/combinations")
async def get_combinations(request):
    """获取组合列表（支持 ?category= 过滤），附带封面图片路径"""
    try:
        import folder_paths
        from pathlib import Path

        _, mapping_storage, _, combination_storage = get_storage()
        output_dir = folder_paths.get_output_directory()

        category_id = request.query.get("category")
        if category_id:
            raw_combinations = combination_storage.get_combinations_by_category(category_id)
        else:
            raw_combinations = combination_storage.get_all_combinations()

        # 为每个组合添加封面图片路径
        result_combinations = []
        for comb in raw_combinations:
            comb_data = dict(comb)
            # 优先使用设置的封面，否则取第一个成员Prompt的第一张图
            cover_path = comb.get("coverImageId")
            if not cover_path:
                for prompt_name in comb.get("prompts", []):
                    mappings = mapping_storage.get_mappings_by_prompt(prompt_name)
                    for m in mappings:
                        image_path = m.get("imagePath")
                        if is_remote_path(image_path, m.get("type", "")) or (Path(output_dir) / image_path).exists():
                            cover_path = image_path
                            break
                    if cover_path:
                        break
            comb_data["coverImagePath"] = cover_path
            result_combinations.append(comb_data)

        return web.json_response({
            "success": True,
            "combinations": result_combinations,
        })
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


@server.PromptServer.instance.routes.get("/prompt_gallery/combinations/all")
async def get_all_combinations(request):
    """获取所有组合（选择器用），附带封面图片路径"""
    try:
        import folder_paths
        from pathlib import Path

        _, mapping_storage, _, combination_storage = get_storage()
        output_dir = folder_paths.get_output_directory()
        raw_combinations = combination_storage.get_all_combinations()

        # 为每个组合添加封面图片路径
        result_combinations = []
        for comb in raw_combinations:
            comb_data = dict(comb)
            # 优先使用设置的封面，否则取第一个成员Prompt的第一张图
            cover_path = comb.get("coverImageId")
            if not cover_path:
                for prompt_name in comb.get("prompts", []):
                    mappings = mapping_storage.get_mappings_by_prompt(prompt_name)
                    for m in mappings:
                        image_path = m.get("imagePath")
                        if is_remote_path(image_path, m.get("type", "")) or (Path(output_dir) / image_path).exists():
                            cover_path = image_path
                            break
                    if cover_path:
                        break
            comb_data["coverImagePath"] = cover_path
            result_combinations.append(comb_data)

        return web.json_response({
            "success": True,
            "combinations": result_combinations,
        })
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


@server.PromptServer.instance.routes.get("/prompt_gallery/combinations/{id}")
async def get_combination(request):
    """获取单个组合"""
    try:
        combination_id = request.match_info.get("id")
        _, _, _, combination_storage = get_storage()

        combination = combination_storage.get_combination_by_id(combination_id)
        if not combination:
            return web.json_response({"success": False, "error": "组合不存在"}, status=404)

        return web.json_response({
            "success": True,
            "combination": combination,
        })
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/prompt_gallery/combinations")
async def create_combination(request):
    """创建组合"""
    try:
        data = await request.json()
        name = data.get("name", "").strip()
        category_id = data.get("categoryId", "root")
        prompts = data.get("prompts", [])
        output_content = data.get("outputContent", "")

        if not name:
            return web.json_response({"success": False, "error": "组合名称不能为空"}, status=400)
        if not prompts:
            return web.json_response({"success": False, "error": "请选择至少一个Prompt"}, status=400)

        _, _, _, combination_storage = get_storage()
        combination = combination_storage.add_combination(
            name=name,
            category_id=category_id,
            prompts=prompts,
            output_content=output_content,
        )

        return web.json_response({
            "success": True,
            "combination": combination,
        })
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


@server.PromptServer.instance.routes.put("/prompt_gallery/combinations/{id}")
async def update_combination(request):
    """更新组合"""
    try:
        combination_id = request.match_info.get("id")
        data = await request.json()

        _, _, _, combination_storage = get_storage()
        combination = combination_storage.update_combination(combination_id, **data)

        if not combination:
            return web.json_response({"success": False, "error": "组合不存在"}, status=404)

        return web.json_response({
            "success": True,
            "combination": combination,
        })
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


@server.PromptServer.instance.routes.delete("/prompt_gallery/combinations/{id}")
async def delete_combination(request):
    """删除组合"""
    try:
        combination_id = request.match_info.get("id")

        _, _, _, combination_storage = get_storage()

        success = combination_storage.delete_combination(combination_id)

        if not success:
            return web.json_response({"success": False, "error": "组合不存在"}, status=404)

        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/prompt_gallery/combinations/{id}/duplicate")
async def duplicate_combination(request):
    """复制组合（独立副本）"""
    try:
        combination_id = request.match_info.get("id")
        try:
            data = await request.json()
        except:
            data = {}
        new_name = data.get("newName")

        _, _, _, combination_storage = get_storage()
        combination = combination_storage.duplicate_combination(combination_id, new_name)

        if not combination:
            return web.json_response({"success": False, "error": "组合不存在"}, status=404)

        return web.json_response({
            "success": True,
            "combination": combination,
        })
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/prompt_gallery/combinations/{id}/move")
async def move_combination(request):
    """移动组合到新分类"""
    try:
        combination_id = request.match_info.get("id")
        data = await request.json()
        new_category_id = data.get("targetCategoryId", data.get("newCategoryId", "root"))

        _, _, _, combination_storage = get_storage()
        success = combination_storage.move_combination(combination_id, new_category_id)

        if not success:
            return web.json_response({"success": False, "error": "组合不存在"}, status=404)

        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


@server.PromptServer.instance.routes.get("/prompt_gallery/combinations/{id}/images")
async def get_combination_images(request):
    """
    获取组合的合并图片（交集：只返回同时属于所有成员Prompt的图片）
    """
    try:
        import folder_paths
        from ..utils import decode_filename

        combination_id = request.match_info.get("id")
        output_dir = folder_paths.get_output_directory()

        _, mapping_storage, _, combination_storage = get_storage()
        combination = combination_storage.get_combination_by_id(combination_id)

        if not combination:
            return web.json_response({"success": False, "error": "组合不存在"}, status=404)

        prompts = combination.get("prompts", [])
        if not prompts:
            return web.json_response({
                "success": True,
                "images": [],
                "totalCount": 0,
            })

        # 获取每个Prompt的图片路径集合
        prompt_image_sets = []
        for prompt_name in prompts:
            mappings = mapping_storage.get_mappings_by_prompt(prompt_name)
            paths = set()
            for m in mappings:
                image_path = m.get("imagePath")
                if is_remote_path(image_path, m.get("type", "")) or (Path(output_dir) / image_path).exists():
                    paths.add(image_path)
            prompt_image_sets.append(paths)

        if not prompt_image_sets:
            return web.json_response({
                "success": True,
                "images": [],
                "totalCount": 0,
            })

        # 交集：只保留属于所有Prompt的图片
        common_paths = prompt_image_sets[0]
        for s in prompt_image_sets[1:]:
            common_paths = common_paths & s

        # 构建图片信息
        images = []
        for image_path in common_paths:
            if is_remote_path(image_path):
                images.append({
                    "path": image_path,
                    "type": "remote",
                    "size": 0,
                    "mtime": 0,
                    "prompts": prompts,
                })
                continue
            full_path = Path(output_dir) / image_path
            try:
                stat = full_path.stat()
                images.append({
                    "path": image_path,
                    "size": stat.st_size,
                    "mtime": stat.st_mtime * 1000,
                    "prompts": prompts,
                })
            except Exception:
                pass

        # 按时间排序
        images.sort(key=lambda x: x["mtime"], reverse=True)

        return web.json_response({
            "success": True,
            "images": images,
            "totalCount": len(images),
        })
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


@server.PromptServer.instance.routes.delete("/prompt_gallery/combinations/batch")
async def batch_delete_combinations(request):
    """批量删除组合"""
    try:
        data = await request.json()
        ids = data.get("ids", [])

        _, _, _, combination_storage = get_storage()

        deleted = combination_storage.batch_delete(ids)

        return web.json_response({
            "success": True,
            "deleted": deleted,
        })
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)
