"""
初始化数据接口
一次性返回分类树 + 所有Prompt + 所有组合，减少前端请求数量
列表期只读持久化 coverImageId，不做任何 prompt×mapping 匹配（避免 O(P×M) 卡死）。
"""
from aiohttp import web
import server
from ..storage import get_storage


@server.PromptServer.instance.routes.get("/prompt_gallery/covers")
async def get_covers(request):
    """批量获取封面图路径：只回读持久化的 coverImageId（不做匹配）。"""
    try:
        # 解析查询参数
        prompts_param = request.query.get("prompts", "").strip()
        combinations_param = request.query.get("combinations", "").strip()

        prompt_keys = [k.strip() for k in prompts_param.split(",") if k.strip()] if prompts_param else []
        combination_ids = [k.strip() for k in combinations_param.split(",") if k.strip()] if combinations_param else []

        if not prompt_keys and not combination_ids:
            return web.json_response({"covers": {}})

        prompt_storage, _, _, combination_storage = get_storage()

        covers = {}

        # 处理 prompt 封面（按 "categoryId:value" 精确查）
        if prompt_keys:
            all_prompts = prompt_storage.get_all_prompts()
            prompt_index = {}
            for p in all_prompts:
                key = f"{p.get('categoryId', 'root')}:{p.get('value')}"
                prompt_index[key] = p
            for key in prompt_keys:
                p = prompt_index.get(key)
                if not p:
                    continue
                cover_path = p.get("coverImageId")
                if cover_path:
                    covers[key] = cover_path

        # 处理 combination 封面
        if combination_ids:
            all_combinations = combination_storage.get_all_combinations()
            comb_index = {c.get("id"): c for c in all_combinations}
            for cid in combination_ids:
                c = comb_index.get(cid)
                if not c:
                    continue
                cover_path = c.get("coverImageId")
                if cover_path:
                    covers[f"combination:{cid}"] = cover_path

        return web.json_response({"covers": covers})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)




@server.PromptServer.instance.routes.get("/prompt_gallery/init")
async def get_init_data(request):
    """初始化数据接口：返回分类树、所有Prompt、所有组合（封面只取持久化 coverImageId）。"""
    try:
        prompt_storage, _, category_storage, combination_storage = get_storage()

        # 1. 分类（扁平列表，前端无需再拍平）
        categories = category_storage.get_all_categories()

        # 2. 所有Prompt（coverImagePath 直接取 coverImageId，不匹配）
        prompts = []
        for prompt in prompt_storage.get_all_prompts():
            p = dict(prompt)
            p["coverImagePath"] = p.get("coverImageId")
            prompts.append(p)

        # 3. 所有组合（封面同样只取 coverImageId）
        combinations = []
        for comb in combination_storage.get_all_combinations():
            comb_data = dict(comb)
            comb_data["coverImagePath"] = comb_data.get("coverImageId")
            combinations.append(comb_data)

        return web.json_response({
            "categories": categories,
            "prompts": prompts,
            "combinations": combinations,
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
