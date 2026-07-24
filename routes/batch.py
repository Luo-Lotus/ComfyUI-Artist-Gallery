"""
Batch 操作端点
"""
from aiohttp import web
import server
from ..storage import get_storage
from ._delete_utils import delete_category_cascade, delete_images_completely_batch


# ============ Batch Operations API ============

@server.PromptServer.instance.routes.delete("/prompt_gallery/batch/delete")
async def batch_delete(request):
    """
    批量删除分类、Prompt 和图片

    请求体: {
      "categories": ["cat1", "cat2"],
      "prompts": [{"categoryId": "xxx", "value": "yyy"}],
      "combinations": ["comb_id1", "comb_id2"],
      "images": [{"path": "prompt_gallery/xxx.png"}]
    }
    """
    try:
        data = await request.json()
        category_ids = data.get("categories", [])
        prompts = data.get("prompts", [])
        combination_ids = data.get("combinations", [])
        images = data.get("images", [])

        prompt_storage, mapping_storage, category_storage, combination_storage = get_storage()

        result = {
            "deleted_categories": [],
            "deleted_prompts": [],
            "deleted_files": [],
            "deleted_combinations": 0,
            "errors": [],
        }

        # 删除分类
        deleted_category_set = set()
        for cat_id in category_ids:
            try:
                if cat_id in deleted_category_set:
                    continue
                category = category_storage.get_category_by_id(cat_id)
                if not category:
                    result["errors"].append(f"分类 {cat_id} 不存在")
                    continue
                cat_result = delete_category_cascade(
                    cat_id,
                    prompt_storage,
                    category_storage, combination_storage,
                )
                result["deleted_categories"].extend(cat_result["deleted_categories"])
                result["deleted_prompts"].extend(cat_result["deleted_prompts"])
                result["deleted_combinations"] += cat_result["deleted_combinations"]
                deleted_category_set.update(cat_result["deleted_categories"])
            except Exception as e:
                result["errors"].append(f"删除分类 {cat_id} 失败: {str(e)}")

        # 删除 Prompt
        if prompts:
            # 先验证并收集有效的 prompt keys
            valid_keys = []
            for prompt_data in prompts:
                category_id = prompt_data.get("categoryId")
                value = prompt_data.get("value")
                if not category_id or not value:
                    result["errors"].append(f"无效的 Prompt 数据: {prompt_data}")
                    continue
                if category_id in deleted_category_set:
                    continue
                prompt = prompt_storage.get_prompt(category_id, value)
                if not prompt:
                    result["errors"].append(f"Prompt {value} 不存在")
                    continue
                valid_keys.append((category_id, value))
                result["deleted_prompts"].append(prompt.get("name", value))

            if valid_keys:
                prompt_storage.batch_delete_prompts(valid_keys)

        # 删除组合（批量删除，一次写入）
        if combination_ids:
            all_combinations = combination_storage.get_all_combinations()
            existing_ids = {c.get("id") for c in all_combinations}
            valid_ids = []
            seen_ids = set()
            for comb_id in combination_ids:
                if comb_id in seen_ids:
                    continue
                seen_ids.add(comb_id)
                if comb_id not in existing_ids:
                    result["errors"].append(f"组合 {comb_id} 不存在")
                    continue
                valid_ids.append(comb_id)
            if valid_ids:
                result["deleted_combinations"] += combination_storage.batch_delete(valid_ids)

        # 删除图片（显式图片删除仍然删除文件和映射，但批量写 images.json）
        image_paths = []
        for img_data in images:
            image_path = img_data.get("path")
            if image_path:
                image_paths.append(image_path)
        if image_paths:
            try:
                img_result = delete_images_completely_batch(
                    image_paths, mapping_storage
                )
                result["deleted_files"].extend(img_result["deleted_files"])
            except Exception as e:
                result["errors"].append(f"删除图片失败: {str(e)}")

        had_errors = len(result["errors"]) > 0
        had_deletions = (
            len(result["deleted_categories"]) > 0
            or len(result["deleted_prompts"]) > 0
            or len(result["deleted_files"]) > 0
            or result["deleted_combinations"] > 0
        )

        return web.json_response({
            "success": had_deletions or not had_errors,
            "deletedCategories": result["deleted_categories"],
            "deletedPrompts": result["deleted_prompts"],
            "deletedFiles": result["deleted_files"],
            "deletedCombinations": result["deleted_combinations"],
            "errors": result["errors"],
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/prompt_gallery/batch/move")
async def batch_move(request):
    """
    批量移动分类和Prompt
    请求体: {
      "categories": [{"id": "xxx", "newParentId": "yyy"}],
      "prompts": [{"categoryId": "xxx", "value": "yyy", "newCategoryId": "zzz"}],
      "combinations": [{"id": "xxx", "newCategoryId": "zzz"}]
    }
    """
    try:
        data = await request.json()
        categories = data.get("categories", [])
        prompts = data.get("prompts", [])
        combinations = data.get("combinations", [])

        prompt_storage, _, category_storage, combination_storage = get_storage()

        moved_categories = []
        moved_prompts = []
        moved_combinations = []
        errors = []

        # 移动分类
        valid_category_move_map = {}
        if categories:
            all_categories = category_storage.get_all_categories()
            category_index = {cat.get("id"): cat for cat in all_categories}
            pending_parent_by_id = {}

            def check_cycle(parent_id, target_id):
                seen = {target_id}
                while parent_id and parent_id != "root":
                    if parent_id in seen:
                        return True
                    seen.add(parent_id)
                    if parent_id in pending_parent_by_id:
                        parent_id = pending_parent_by_id[parent_id]
                        continue
                    parent = category_index.get(parent_id)
                    if not parent:
                        return False
                    parent_id = parent.get("parentId")
                return False

            for cat_data in categories:
                try:
                    cat_id = cat_data.get("id")
                    new_parent_id = cat_data.get("newParentId", "root")

                    if cat_id not in category_index:
                        errors.append(f"分类 {cat_id} 不存在")
                        continue

                    if new_parent_id != "root" and new_parent_id not in category_index:
                        errors.append(f"目标分类 {new_parent_id} 不存在")
                        continue

                    if new_parent_id != "root" and check_cycle(new_parent_id, cat_id):
                        errors.append(f"不能将分类 {cat_id} 移动到自己的子分类下")
                        continue

                    valid_category_move_map[cat_id] = new_parent_id
                    pending_parent_by_id[cat_id] = new_parent_id

                except Exception as e:
                    errors.append(f"移动分类 {cat_data.get('id')} 失败: {str(e)}")

        if valid_category_move_map:
            moved = category_storage.batch_move([
                {"id": cat_id, "parentId": parent_id}
                for cat_id, parent_id in valid_category_move_map.items()
            ])
            moved_categories.extend([cat.get("name", cat.get("id")) for cat in moved])

        # 移动Prompt
        valid_prompt_moves = []
        if prompts:
            category_ids = {cat.get("id") for cat in category_storage.get_all_categories()}
            prompt_index = {
                (prompt.get("categoryId", "root"), prompt.get("value", "")): prompt
                for prompt in prompt_storage.get_all_prompts()
            }

            for prompt_data in prompts:
                try:
                    category_id = prompt_data.get("categoryId")
                    value = prompt_data.get("value")
                    new_category_id = prompt_data.get("newCategoryId", "root")

                    if new_category_id not in category_ids:
                        errors.append(f"目标分类 {new_category_id} 不存在")
                        continue

                    prompt = prompt_index.get((category_id, value))
                    if not prompt:
                        errors.append(f"Prompt {value} 不存在")
                        continue

                    if (new_category_id, value) in prompt_index and new_category_id != category_id:
                        errors.append(f"目标分类 {new_category_id} 已存在 Prompt {value}")
                        continue

                    valid_prompt_moves.append((category_id, value, new_category_id))
                    prompt_index.pop((category_id, value), None)
                    prompt_index[(new_category_id, value)] = prompt

                except Exception as e:
                    errors.append(f"移动Prompt {prompt_data.get('value')} 失败: {str(e)}")

        if valid_prompt_moves:
            moved = prompt_storage.batch_move_to_categories(valid_prompt_moves)
            moved_prompts.extend([prompt.get("name", prompt.get("value")) for prompt in moved])

        # 移动组合
        combination_moves_by_target = {}
        seen_combination_ids = set()
        for comb_data in combinations:
            try:
                comb_id = comb_data.get("id")
                new_category_id = comb_data.get("newCategoryId", comb_data.get("targetCategoryId", "root"))
                if not comb_id:
                    errors.append(f"无效的组合数据: {comb_data}")
                    continue
                if comb_id in seen_combination_ids:
                    continue
                seen_combination_ids.add(comb_id)

                target_cat = category_storage.get_category_by_id(new_category_id)
                if not target_cat:
                    errors.append(f"目标分类 {new_category_id} 不存在")
                    continue

                combination = combination_storage.get_combination_by_id(comb_id)
                if not combination:
                    errors.append(f"组合 {comb_id} 不存在")
                    continue

                combination_moves_by_target.setdefault(new_category_id, []).append(comb_id)
            except Exception as e:
                errors.append(f"移动组合 {comb_data.get('id')} 失败: {str(e)}")

        for target_id, ids in combination_moves_by_target.items():
            for combination in combination_storage.batch_move(ids, target_id):
                moved_combinations.append(combination.get("name", combination.get("id")))

        return web.json_response({
            "success": True,
            "movedCategories": moved_categories,
            "movedPrompts": moved_prompts,
            "movedCombinations": moved_combinations,
            "errors": errors
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/prompt_gallery/batch/copy")
async def batch_copy(request):
    """
    批量复制Prompt到目标分类
    请求体: {
      "prompts": [{"categoryId": "xxx", "value": "yyy", "targetCategoryId": "zzz"}]
    }
    """
    try:
        data = await request.json()
        prompts = data.get("prompts", [])

        prompt_storage, _, category_storage, _ = get_storage()

        copied_prompts = []
        errors = []
        items_to_create = []

        category_ids = {cat.get("id") for cat in category_storage.get_all_categories()}
        all_prompts = prompt_storage.get_all_prompts()
        prompt_index = {
            (prompt.get("categoryId", "root"), prompt.get("value", "")): prompt
            for prompt in all_prompts
        }
        existing_keys = set(prompt_index.keys())

        for prompt_data in prompts:
            try:
                category_id = prompt_data.get("categoryId")
                value = prompt_data.get("value")
                target_category_id = prompt_data.get("targetCategoryId")
                new_name = prompt_data.get("newName", value)

                # 验证源Prompt存在
                source_prompt = prompt_index.get((category_id, value))
                if not source_prompt:
                    errors.append(f"源Prompt {value} 不存在")
                    continue

                # 验证目标分类存在
                if target_category_id not in category_ids:
                    errors.append(f"目标分类 {target_category_id} 不存在")
                    continue

                new_key = (target_category_id, new_name)
                if new_key in existing_keys:
                    errors.append(f"目标分类 {target_category_id} 已存在 Prompt {new_name}")
                    continue

                existing_keys.add(new_key)
                items_to_create.append({
                    "value": new_name,
                    "name": source_prompt.get("name"),
                    "alias": source_prompt.get("alias", ""),
                    "categoryId": target_category_id,
                })

            except Exception as e:
                errors.append(f"复制Prompt {prompt_data.get('value')} 失败: {str(e)}")

        if items_to_create:
            success_prompts, failed_values = prompt_storage.add_prompts_import(items_to_create)
            copied_prompts.extend([
                prompt.get("name", prompt.get("value"))
                for prompt in success_prompts
            ])
            for value in failed_values:
                errors.append(f"复制Prompt {value} 失败: 已存在或无效")

        return web.json_response({
            "success": True,
            "copiedPrompts": copied_prompts,
            "errors": errors
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.json_response({"error": str(e)}, status=500)
