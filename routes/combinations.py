"""
组合 API 端点
"""
from aiohttp import web
import server
from ..storage import get_storage


# ============ 组合 CRUD API ============


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
