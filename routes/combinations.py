"""
组合 API 端点
"""
from aiohttp import web
import server
from ..storage import get_storage


# ============ 组合 CRUD API ============

def _serialize_combination_with_cover(comb):
    """组合序列化：列表期封面只取持久化 coverImageId（不做 prompt×mapping 匹配）。"""
    comb_data = dict(comb)
    comb_data["coverImagePath"] = comb.get("coverImageId")
    return comb_data


@server.PromptServer.instance.routes.get("/prompt_gallery/combinations")
async def get_combinations(request):
    """获取组合列表（支持 ?category= 过滤），封面只取持久化 coverImageId"""
    try:
        _, _, _, combination_storage = get_storage()

        category_id = request.query.get("category")
        if category_id:
            raw_combinations = combination_storage.get_combinations_by_category(category_id)
        else:
            raw_combinations = combination_storage.get_all_combinations()

        result_combinations = [_serialize_combination_with_cover(comb) for comb in raw_combinations]

        return web.json_response({
            "success": True,
            "combinations": result_combinations,
        })
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


@server.PromptServer.instance.routes.get("/prompt_gallery/combinations/all")
async def get_all_combinations(request):
    """获取所有组合（选择器用），封面只取持久化 coverImageId"""
    try:
        _, _, _, combination_storage = get_storage()
        raw_combinations = combination_storage.get_all_combinations()

        result_combinations = [_serialize_combination_with_cover(comb) for comb in raw_combinations]

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
