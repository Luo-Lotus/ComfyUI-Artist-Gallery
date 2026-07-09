"""
Gallery 数据 & HTML 端点
"""
from pathlib import Path
from aiohttp import web
import server
from ..storage import get_storage
from ..utils import decode_filename


# ============ Gallery 数据 API ============

@server.PromptServer.instance.routes.get("/prompt_gallery/data")
async def get_gallery_data(request):
    """获取Prompt图库数据 API（支持分类筛选）"""
    import folder_paths
    output_dir = Path(folder_paths.get_output_directory())

    try:
        # 获取分类参数
        category_id = request.query.get("category", "root")

        prompt_storage, _, category_storage, combination_storage = get_storage()

        # 验证分类存在
        category = category_storage.get_category_by_id(category_id)
        if not category:
            return web.json_response({"error": "分类不存在"}, status=400)

        # 列表期只读持久化 coverImageId，不做任何 prompt×mapping 匹配（避免 O(P×M) 卡死）。
        # 图片数量改由详情页 /prompt_images 返回的图片列表推导。
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

        # 获取当前分类下的组合，封面只取持久化 coverImageId
        result_combinations = []
        for comb in combination_storage.get_combinations_by_category(category_id):
            comb_data = dict(comb)
            comb_data["coverImagePath"] = comb.get("coverImageId")
            result_combinations.append(comb_data)

        # 获取当前分类的直接子分类
        child_categories = category_storage.get_children(category_id)

        return web.json_response({
            "prompts": result_prompts,
            "combinations": result_combinations,
            "childCategories": [{"id": c.get("id"), "name": c.get("name"), "parentId": c.get("parentId"), "metadata": c.get("metadata", {})} for c in child_categories],
            "totalCount": len(result_prompts),
            "categoryId": category_id,
            "generatedAt": int(__import__('time').time() * 1000)
        })

    except Exception as e:
        print(f"Error getting gallery data: {e}")
        # 降级到扫描方式
        from ..utils import scan_output_directory
        data = scan_output_directory(str(output_dir))
        return web.json_response(data)


@server.PromptServer.instance.routes.get("/prompt_gallery/html")
async def get_gallery_html(request):
    """返回图库 HTML 页面"""
    html_path = Path(__file__).parent.parent / "web" / "gallery.html"
    if html_path.exists():
        with open(html_path, 'r', encoding='utf-8') as f:
            html_content = f.read()
        return web.Response(text=html_content, content_type='text/html')
    else:
        return web.Response(text="Gallery HTML not found", status=404)
