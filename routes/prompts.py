"""
Prompt CRUD 端点
"""
from pathlib import Path
from aiohttp import web
import server
from ..storage import get_storage
from ._prompt_cover import ensure_prompt_cover


# ============ Prompt CRUD API ============

@server.PromptServer.instance.routes.post("/prompt_gallery/batch_resolve")
async def batch_resolve(request):
    """批量解析 Prompt 和分类。"""
    try:
        data = await request.json()
        prompt_keys = data.get("prompts", [])
        category_ids = data.get("categories", [])
        prompt_storage, _, category_storage = get_storage()

        result = {}

        # 解析 prompts（支持 "categoryId:value" 和纯 "value" 两种格式）
        if prompt_keys:
            prompts_result = {}
            for key in prompt_keys:
                if ':' in key:
                    category_id, value = key.split(':', 1)
                    p = prompt_storage.get_prompt(category_id, value)
                else:
                    p = prompt_storage.get_prompt_by_value(key)
                if p:
                    result_key = f"{p.get('categoryId', 'root')}:{p.get('value')}"
                    prompts_result[result_key] = {
                        "value": p.get("value"),
                        "name": p.get("name"),
                        "categoryId": p.get("categoryId", "root"),
                        "alias": p.get("alias", ""),
                        "createdAt": p.get("createdAt", 0),
                        "metadata": p.get("metadata", {}),
                    }
            result["prompts"] = prompts_result

        # 解析 categories
        if category_ids:
            categories_result = {}
            for cat_id in category_ids:
                cat = category_storage.get_category_by_id(cat_id)
                if cat:
                    categories_result[cat_id] = {
                        "id": cat.get("id"),
                        "name": cat.get("name"),
                        "parentId": cat.get("parentId"),
                        "metadata": cat.get("metadata"),
                    }
            result["categories"] = categories_result

        return web.json_response(result)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.get("/prompt_gallery/search")
async def search_prompts(request):
    """跨分类搜索 Prompt。"""
    try:
        q = request.query.get("q", "").strip()
        if not q:
            return web.json_response({"prompts": [], "totalCount": 0})

        try:
            limit = int(request.query.get("limit", "50"))
        except (TypeError, ValueError):
            return web.json_response({"error": "limit 参数必须是整数"}, status=400)
        limit = max(1, min(limit, 500))
        query = q.lower()

        prompt_storage, _, _ = get_storage()

        # 搜索 Prompts（封面只取持久化 coverImageId）
        all_prompts = prompt_storage.get_all_prompts()

        matched_prompts = []
        for p in all_prompts:
            if (query in (p.get("value") or "").lower()
                    or query in (p.get("name") or "").lower()
                    or query in (p.get("alias") or "").lower()):
                matched_prompts.append({
                    "value": p.get("value"),
                    "name": p.get("name"),
                    "categoryId": p.get("categoryId", "root"),
                    "coverImagePath": p.get("coverImageId"),
                    "createdAt": p.get("createdAt", 0),
                    "metadata": p.get("metadata", {}),
                })
                if len(matched_prompts) >= limit:
                    break

        return web.json_response({
            "prompts": matched_prompts,
            "totalCount": len(matched_prompts),
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/prompt_gallery/prompts")
async def add_prompt(request):
    """添加Prompt（单个）"""
    try:
        data = await request.json()
        value = data.get("value", "").strip()
        name = data.get("name", "").strip() or None
        alias = data.get("alias", "").strip()
        category_id = data.get("categoryId", "root")

        if not value:
            return web.json_response({"error": "Prompt值不能为空"}, status=400)

        import folder_paths
        prompt_storage, mapping_storage, category_storage = get_storage()

        # 验证分类存在
        category = category_storage.get_category_by_id(category_id)
        if not category:
            return web.json_response({"error": "分类不存在"}, status=400)

        prompt = prompt_storage.add_prompt(value=value, name=name, alias=alias, category_id=category_id)
        ensure_prompt_cover(prompt_storage, mapping_storage, category_id, value, Path(folder_paths.get_output_directory()))

        return web.json_response({"prompt": prompt, "success": True})
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/prompt_gallery/prompts/batch")
async def add_prompts_batch(request):
    """批量添加Prompt"""
    try:
        data = await request.json()
        prompts_data = data.get("prompts", [])
        category_id = data.get("categoryId", "root")

        if not prompts_data:
            return web.json_response({"error": "Prompt列表不能为空"}, status=400)

        import folder_paths
        prompt_storage, mapping_storage, _ = get_storage()
        success_prompts, failed_names = prompt_storage.add_prompts_batch(prompts_data, category_id)
        output_dir = Path(folder_paths.get_output_directory())
        for prompt in success_prompts:
            ensure_prompt_cover(prompt_storage, mapping_storage, prompt.get("categoryId", category_id), prompt.get("value"), output_dir)

        return web.json_response({
            "success": True,
            "addedCount": len(success_prompts),
            "failedCount": len(failed_names),
            "prompts": success_prompts,
            "failedNames": failed_names
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.put(r"/prompt_gallery/prompts/{category_id}/{value:[\s\S]+}")
async def update_prompt_composite(request):
    """更新 Prompt 信息（使用复合键）。"""
    try:
        category_id = request.match_info['category_id']
        old_value = request.match_info['value']
        data = await request.json()

        prompt_storage, _, category_storage = get_storage()

        # 检查是否要修改值
        new_value = data.get("value", old_value)
        value_changed = (old_value != new_value)

        kwargs = {}
        if "name" in data:
            kwargs["name"] = data["name"]
        if "alias" in data:
            kwargs["alias"] = data["alias"]
        if "categoryId" in data:
            # 验证分类存在
            category = category_storage.get_category_by_id(data["categoryId"])
            if not category:
                return web.json_response({"error": "分类不存在"}, status=400)
            kwargs["categoryId"] = data["categoryId"]
        if "coverImageId" in data:
            kwargs["coverImageId"] = data["coverImageId"]
        if "metadata" in data:
            kwargs["metadata"] = data["metadata"]
        if "value" in data:
            kwargs["value"] = new_value

        target_category_id = kwargs.get("categoryId", category_id)

        # 复合键唯一性检查：只针对目标 (categoryId, value)，不跨分类阻断
        if (target_category_id, new_value) != (category_id, old_value):
            existing = prompt_storage.get_prompt(target_category_id, new_value)
            if existing is not None:
                return web.json_response(
                    {"error": f"分类 '{target_category_id}' 下Prompt值 '{new_value}' 已存在"},
                    status=400,
                )

        # 只更新被寻址的这一条 Prompt（单次更新、单次写入）
        success = prompt_storage.update_prompt(category_id, old_value, **kwargs)

        if success:
            # 重新查询更新后的Prompt信息
            prompt = prompt_storage.get_prompt(target_category_id, new_value)

            result = {
                "prompt": prompt,
                "success": True
            }
            if value_changed:
                result["updatedPrompts"] = [{
                    "categoryId": category_id,
                    "oldValue": old_value,
                    "newValue": new_value,
                }]

            return web.json_response(result)
        else:
            return web.json_response({"error": "Prompt不存在"}, status=404)
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.delete(r"/prompt_gallery/prompts/{category_id}/{value:[\s\S]+}")
async def delete_prompt_composite(request):
    """删除 Prompt，不清理图片映射。"""
    try:
        category_id = request.match_info['category_id']
        value = request.match_info['value']

        prompt_storage, _, _ = get_storage()

        prompt = prompt_storage.get_prompt(category_id, value)
        if not prompt:
            return web.json_response({"error": "Prompt不存在"}, status=404)

        prompt_storage.delete_prompt(category_id, value)

        return web.json_response({
            "success": True,
            "message": f"已删除Prompt '{prompt.get('name')}'",
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post(r"/prompt_gallery/prompts/{category_id}/{value:[\s\S]+}/copy")
async def copy_prompt(request):
    """
    复制Prompt到其他分类
    创建一个新的Prompt实例，共享所有图片（因为图片映射使用Prompt值）
    """
    try:
        category_id = request.match_info['category_id']
        value = request.match_info['value']
        data = await request.json()
        target_category_id = data.get("targetCategoryId")
        new_value = data.get("newValue", value)

        if not target_category_id:
            return web.json_response({"error": "缺少目标分类ID"}, status=400)

        prompt_storage, _, category_storage = get_storage()

        # 验证源Prompt存在
        source_prompt = prompt_storage.get_prompt(category_id, value)
        if not source_prompt:
            return web.json_response({"error": "源Prompt不存在"}, status=404)

        # 验证目标分类存在
        target_category = category_storage.get_category_by_id(target_category_id)
        if not target_category:
            return web.json_response({"error": "目标分类不存在"}, status=400)

        # 创建新Prompt（使用相同或新值）
        try:
            new_prompt = prompt_storage.add_prompt(
                value=new_value,
                name=source_prompt.get("name"),
                alias=source_prompt.get("alias", ""),
                category_id=target_category_id
            )
        except ValueError as e:
            return web.json_response({"error": str(e)}, status=400)

        # 图片会自动共享，因为映射使用Prompt值

        return web.json_response({
            "success": True,
            "prompt": new_prompt,
            "message": f"已复制Prompt到分类 '{target_category.get('name')}'"
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
