"""
Category CRUD + 移动端点
"""
from aiohttp import web
import server
from ..storage import get_storage


# ============ Category CRUD API ============

@server.PromptServer.instance.routes.get("/artist_gallery/categories")
async def get_categories(request):
    """获取所有分类（树形结构）"""
    try:
        _, _, category_storage, _ = get_storage()
        tree = category_storage.get_category_tree()
        return web.json_response({"categories": tree})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.get("/artist_gallery/categories/{category_id}")
async def get_category(request):
    """获取单个分类详情"""
    try:
        category_id = request.match_info['category_id']
        _, _, category_storage, _ = get_storage()
        category = category_storage.get_category_by_id(category_id)

        if not category:
            return web.json_response({"error": "分类不存在"}, status=404)

        return web.json_response({"category": category})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/artist_gallery/categories")
async def add_category(request):
    """添加分类"""
    try:
        data = await request.json()
        name = data.get("name", "").strip()
        parent_id = data.get("parentId", "root")

        if not name:
            return web.json_response({"error": "分类名称不能为空"}, status=400)

        _, _, category_storage, _ = get_storage()
        category = category_storage.add_category(name, parent_id)

        return web.json_response({"category": category, "success": True})
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.put("/artist_gallery/categories/{category_id}")
async def update_category(request):
    """更新分类"""
    try:
        category_id = request.match_info['category_id']
        data = await request.json()

        _, _, category_storage, _ = get_storage()

        kwargs = {}
        if "name" in data:
            kwargs["name"] = data["name"]
        if "order" in data:
            kwargs["order"] = data["order"]

        success = category_storage.update_category(category_id, **kwargs)

        if success:
            category = category_storage.get_category_by_id(category_id)
            return web.json_response({"category": category, "success": True})
        else:
            return web.json_response({"error": "分类不存在"}, status=404)
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.delete("/artist_gallery/categories/{category_id}")
async def delete_category(request):
    """删除分类"""
    try:
        category_id = request.match_info['category_id']

        _, _, category_storage, _ = get_storage()
        success = category_storage.delete_category(category_id)

        if success:
            return web.json_response({"success": True})
        else:
            return web.json_response({"error": "分类不存在"}, status=404)
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/artist_gallery/categories/{category_id}/move")
async def move_category(request):
    """移动分类到其他分类下"""
    try:
        category_id = request.match_info['category_id']
        data = await request.json()
        new_parent_id = data.get("newParentId", "root")

        if new_parent_id == category_id:
            return web.json_response({"error": "不能将分类移动到自己下面"}, status=400)

        _, _, category_storage, _ = get_storage()

        # 检查是否会形成循环
        def check_cycle(parent_id, target_id):
            if parent_id == target_id:
                return True
            cat = category_storage.get_category_by_id(parent_id)
            if not cat or not cat.get("parentId"):
                return False
            return check_cycle(cat["parentId"], target_id)

        if new_parent_id != "root" and check_cycle(new_parent_id, category_id):
            return web.json_response({"error": "不能将分类移动到自己的子分类下"}, status=400)

        # 更新分类的父分类
        success = category_storage.update_category(category_id, parentId=new_parent_id)

        if success:
            category = category_storage.get_category_by_id(category_id)
            return web.json_response({"category": category, "success": True})
        else:
            return web.json_response({"error": "分类不存在"}, status=404)
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
