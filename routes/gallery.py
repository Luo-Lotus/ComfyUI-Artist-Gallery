"""
Gallery 数据 & HTML 端点
"""
from aiohttp import web
import server
from ..storage import get_storage


# ============ Gallery 数据 API ============

@server.PromptServer.instance.routes.get("/prompt_gallery/data")
async def get_gallery_data(request):
    """获取Prompt图库数据 API（支持分类筛选）"""
    try:
        # 获取分类参数
        category_id = request.query.get("category", "root")

        prompt_storage, _, category_storage = get_storage()

        # 验证分类存在
        category = category_storage.get_category_by_id(category_id)
        if not category:
            return web.json_response({"error": "分类不存在"}, status=400)

        # 列表期只读持久化 coverImageId，不做任何 prompt×mapping 匹配（避免 O(P×M) 卡死）。
        # 图片数量由详情页 /images_grouped 返回的图片列表推导。
        result_prompts = []
        for prompt in prompt_storage.get_prompts_by_category(category_id):
            result_prompts.append({
                "value": prompt.get("value"),
                "name": prompt.get("name"),
                "categoryId": prompt.get("categoryId", "root"),
                "coverImagePath": prompt.get("coverImageId"),
                "createdAt": prompt.get("createdAt", 0),
                "metadata": prompt.get("metadata", {}),
            })

        # 排序Prompt
        result_prompts.sort(key=lambda x: x.get("value", "").lower())

        # 获取当前分类的直接子分类
        child_categories = category_storage.get_children(category_id)

        return web.json_response({
            "prompts": result_prompts,
            "childCategories": [{"id": c.get("id"), "name": c.get("name"), "parentId": c.get("parentId"), "metadata": c.get("metadata", {})} for c in child_categories],
            "totalCount": len(result_prompts),
            "categoryId": category_id,
            "generatedAt": int(__import__('time').time() * 1000)
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error getting gallery data: {e}")
        return web.json_response({"error": str(e)}, status=500)
