"""
Gallery 数据 & HTML 端点
"""
from pathlib import Path
from aiohttp import web
import server
from ..storage import get_storage
from ..utils import decode_filename
from ._utils import is_remote_path


# ============ Gallery 数据 API ============

@server.PromptServer.instance.routes.get("/prompt_gallery/data")
async def get_gallery_data(request):
    """获取Prompt图库数据 API（支持分类筛选）"""
    import folder_paths
    output_dir = Path(folder_paths.get_output_directory())

    try:
        # 获取分类参数
        category_id = request.query.get("category", "root")

        prompt_storage, mapping_storage, category_storage, combination_storage = get_storage()

        # 验证分类存在
        category = category_storage.get_category_by_id(category_id)
        if not category:
            return web.json_response({"error": "分类不存在"}, status=400)

        # 只获取该分类下的Prompt（不包含子分类）
        prompts_data = [
            a for a in prompt_storage.get_all_prompts()
            if a.get("categoryId") == category_id
        ]

        # 一次性构建 prompt_value → [mapping, ...] 索引，消除 N+1 查询
        prompt_mapping_index = mapping_storage.build_prompt_index()

        # 构建结果列表（只返回封面信息，不返回完整图片列表）
        result_prompts = []

        for prompt in prompts_data:
            prompt_value = prompt.get("value")
            mappings = prompt_mapping_index.get(prompt_value, [])

            # 计数
            image_count = 0
            for mapping in mappings:
                image_path = mapping.get("imagePath")
                if is_remote_path(image_path, mapping.get("type", "")) or (output_dir / image_path).exists():
                    image_count += 1

            # 获取封面图片路径：优先用设置的封面，否则取第一张存在的映射
            cover_path = prompt.get("coverImageId")
            if not cover_path:
                for m in mappings:
                    image_path = m.get("imagePath")
                    if is_remote_path(image_path, m.get("type", "")) or (output_dir / image_path).exists():
                        cover_path = image_path
                        break

            # 构建Prompt对象（不包含 images 数组）
            result_prompt = {
                "value": prompt.get("value"),
                "name": prompt.get("name"),
                "categoryId": prompt.get("categoryId", "root"),
                "coverImagePath": cover_path,
                "imageCount": image_count,
                "createdAt": prompt.get("createdAt", 0),
                "metadata": prompt.get("metadata", {}),
            }

            result_prompts.append(result_prompt)

        # 排序Prompt
        result_prompts.sort(key=lambda x: x["value"].lower())

        # 获取当前分类下的组合，并添加封面图片路径（复用同一个索引）
        raw_combinations = combination_storage.get_combinations_by_category(category_id)
        result_combinations = []
        for comb in raw_combinations:
            comb_data = dict(comb)
            # 优先使用设置的封面，否则取第一个成员Prompt的第一张图
            cover_path = comb.get("coverImageId")
            if not cover_path:
                for prompt_value in comb.get("prompts", []):
                    for m in prompt_mapping_index.get(prompt_value, []):
                        image_path = m.get("imagePath")
                        if is_remote_path(image_path, m.get("type", "")) or (output_dir / image_path).exists():
                            cover_path = image_path
                            break
                    if cover_path:
                        break
            comb_data["coverImagePath"] = cover_path
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
