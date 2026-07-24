"""批量封面查询接口。"""
from aiohttp import web
import server
from ..storage import get_storage


@server.PromptServer.instance.routes.get("/prompt_gallery/covers")
async def get_covers(request):
    """批量获取封面图路径：只回读持久化的 coverImageId（不做匹配）。"""
    try:
        # 解析查询参数
        prompts_param = request.query.get("prompts", "").strip()
        prompt_keys = [k.strip() for k in prompts_param.split(",") if k.strip()] if prompts_param else []

        if not prompt_keys:
            return web.json_response({"covers": {}})

        prompt_storage, _, _ = get_storage()

        covers = {}

        # 处理 prompt 封面（按 "categoryId:value" 精确查）
        if prompt_keys:
            for key in prompt_keys:
                if ":" not in key:
                    continue
                category_id, value = key.split(":", 1)
                p = prompt_storage.get_prompt(category_id, value)
                if not p:
                    continue
                cover_path = p.get("coverImageId")
                if cover_path:
                    covers[key] = cover_path

        return web.json_response({"covers": covers})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
