"""
组合 API 端点
"""
from pathlib import Path
from aiohttp import web
import server
from ..storage import get_storage
from ._utils import is_remote_path
from ._image_index import build_prompt_string_index, image_info_from_mapping
from ._cover_fallback import cover_fallback_enabled


# ============ 组合 CRUD API ============

def _resolve_combination_cover(comb, prompt_mapping_index, output_dir, enable_cover_fallback=False):
    """Resolve cover path using explicit cover first, then first existing member prompt image."""
    cover_path = comb.get("coverImageId")
    if cover_path:
        return cover_path
    if not enable_cover_fallback:
        return None

    output_path = Path(output_dir)
    for prompt_name in comb.get("prompts", []):
        for m in prompt_mapping_index.get(prompt_name, []):
            image_path = m.get("imagePath")
            if is_remote_path(image_path, m.get("type", "")) or (output_path / image_path).exists():
                return image_path
    return None


def _serialize_combination_with_cover(comb, prompt_mapping_index, output_dir, enable_cover_fallback=False):
    comb_data = dict(comb)
    comb_data["coverImagePath"] = _resolve_combination_cover(
        comb,
        prompt_mapping_index,
        output_dir,
        enable_cover_fallback,
    )
    return comb_data


@server.PromptServer.instance.routes.get("/prompt_gallery/combinations")
async def get_combinations(request):
    """获取组合列表（支持 ?category= 过滤），附带封面图片路径"""
    try:
        import folder_paths

        _, mapping_storage, _, combination_storage = get_storage()
        output_dir = folder_paths.get_output_directory()
        enable_cover_fallback = cover_fallback_enabled()

        category_id = request.query.get("category")
        if category_id:
            raw_combinations = combination_storage.get_combinations_by_category(category_id)
        else:
            raw_combinations = combination_storage.get_all_combinations()
        prompt_values = []
        for comb in raw_combinations:
            prompt_values.extend([p for p in comb.get("prompts", []) if p])
        prompt_mapping_index = build_prompt_string_index(mapping_storage, prompt_values)

        result_combinations = [
            _serialize_combination_with_cover(comb, prompt_mapping_index, output_dir, enable_cover_fallback)
            for comb in raw_combinations
        ]

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

        _, mapping_storage, _, combination_storage = get_storage()
        output_dir = folder_paths.get_output_directory()
        enable_cover_fallback = cover_fallback_enabled()
        raw_combinations = combination_storage.get_all_combinations()
        prompt_values = []
        for comb in raw_combinations:
            prompt_values.extend([p for p in comb.get("prompts", []) if p])
        prompt_mapping_index = build_prompt_string_index(mapping_storage, prompt_values)

        result_combinations = [
            _serialize_combination_with_cover(comb, prompt_mapping_index, output_dir, enable_cover_fallback)
            for comb in raw_combinations
        ]

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

        prompt_mapping_index = build_prompt_string_index(mapping_storage, prompts)

        # 获取每个Prompt的图片路径集合
        prompt_image_sets = []
        output_path = Path(output_dir)
        for prompt_name in prompts:
            paths = set()
            for m in prompt_mapping_index.get(prompt_name, []):
                image_path = m.get("imagePath")
                if is_remote_path(image_path, m.get("type", "")) or (output_path / image_path).exists():
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

        mapping_by_path = {}
        for prompt_name in prompts:
            for mapping in prompt_mapping_index.get(prompt_name, []):
                path = mapping.get("imagePath")
                if path and path not in mapping_by_path:
                    mapping_by_path[path] = mapping

        # 构建图片信息
        images = []
        for image_path in common_paths:
            mapping = mapping_by_path.get(image_path, {"imagePath": image_path})
            if is_remote_path(image_path):
                images.append(image_info_from_mapping(mapping, output_dir, prompts))
                continue
            full_path = Path(output_dir) / image_path
            try:
                images.append(image_info_from_mapping(mapping, output_dir, prompts))
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
