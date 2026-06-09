"""
Batch 操作端点
"""
from pathlib import Path
from aiohttp import web
import server
from ..storage import get_storage
from ..storage.backup import BackupManager
from ._utils import is_remote_path
from ._delete_utils import delete_category_cascade, delete_prompt_cascade, batch_delete_prompts_cascade, remove_image_prompt_link, delete_image_completely


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

        # 备份
        storage_dir = Path(prompt_storage.storage_dir)
        BackupManager(storage_dir).create_backup()

        result = {
            "deleted_categories": [],
            "deleted_prompts": [],
            "deleted_files": [],
            "disassociated_images": [],
            "deleted_combinations": 0,
            "errors": [],
        }

        # 删除分类（级联）
        for cat_id in category_ids:
            try:
                category = category_storage.get_category_by_id(cat_id)
                if not category:
                    result["errors"].append(f"分类 {cat_id} 不存在")
                    continue
                cat_result = delete_category_cascade(
                    cat_id,
                    prompt_storage, mapping_storage,
                    category_storage, combination_storage,
                )
                result["deleted_categories"].extend(cat_result["deleted_categories"])
                result["deleted_prompts"].extend(cat_result["deleted_prompts"])
                result["deleted_files"].extend(cat_result["deleted_files"])
                result["disassociated_images"].extend(cat_result["disassociated_images"])
                result["deleted_combinations"] += cat_result["deleted_combinations"]
            except Exception as e:
                result["errors"].append(f"删除分类 {cat_id} 失败: {str(e)}")

        # 删除 Prompt（批量级联）
        if prompts:
            # 先验证并收集有效的 prompt keys
            valid_keys = []
            for prompt_data in prompts:
                category_id = prompt_data.get("categoryId")
                value = prompt_data.get("value")
                if not category_id or not value:
                    result["errors"].append(f"无效的 Prompt 数据: {prompt_data}")
                    continue
                prompt = prompt_storage.get_prompt(category_id, value)
                if not prompt:
                    result["errors"].append(f"Prompt {value} 不存在")
                    continue
                valid_keys.append((category_id, value))
                result["deleted_prompts"].append(prompt.get("name", value))

            # 批量级联删除（3 次锁操作代替 N*M 次）
            if valid_keys:
                prompt_result = batch_delete_prompts_cascade(
                    valid_keys,
                    prompt_storage, mapping_storage, combination_storage,
                )
                result["deleted_files"].extend(prompt_result["deleted_files"])
                result["disassociated_images"].extend(prompt_result["disassociated_images"])

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

        # 删除图片
        for img_data in images:
            try:
                image_path = img_data.get("path")
                if not image_path:
                    continue
                img_result = delete_image_completely(image_path, mapping_storage, prompt_storage)
                if img_result["file_deleted"]:
                    result["deleted_files"].append(image_path)
            except Exception as e:
                result["errors"].append(f"删除图片失败: {str(e)}")

        had_errors = len(result["errors"]) > 0
        had_deletions = (
            len(result["deleted_categories"]) > 0
            or len(result["deleted_prompts"]) > 0
            or len(result["deleted_files"]) > 0
        )

        return web.json_response({
            "success": had_deletions or not had_errors,
            "deletedCategories": result["deleted_categories"],
            "deletedPrompts": result["deleted_prompts"],
            "deletedFiles": result["deleted_files"],
            "disassociatedImages": result["disassociated_images"],
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
      "prompts": [{"categoryId": "xxx", "value": "yyy", "newCategoryId": "zzz"}]
    }
    """
    try:
        data = await request.json()
        categories = data.get("categories", [])
        prompts = data.get("prompts", [])

        prompt_storage, _, category_storage, _ = get_storage()

        moved_categories = []
        moved_prompts = []
        errors = []

        # 移动分类
        for cat_data in categories:
            try:
                cat_id = cat_data.get("id")
                new_parent_id = cat_data.get("newParentId", "root")

                # 验证目标分类存在
                if new_parent_id != "root":
                    target_cat = category_storage.get_category_by_id(new_parent_id)
                    if not target_cat:
                        errors.append(f"目标分类 {new_parent_id} 不存在")
                        continue

                # 检查是否会形成循环
                def check_cycle(parent_id, target_id):
                    if parent_id == target_id:
                        return True
                    cat = category_storage.get_category_by_id(parent_id)
                    if not cat or not cat.get("parentId"):
                        return False
                    return check_cycle(cat["parentId"], target_id)

                if new_parent_id != "root" and check_cycle(new_parent_id, cat_id):
                    errors.append(f"不能将分类 {cat_id} 移动到自己的子分类下")
                    continue

                # 更新分类的父分类
                success = category_storage.update_category(cat_id, parentId=new_parent_id)
                if success:
                    cat = category_storage.get_category_by_id(cat_id)
                    moved_categories.append(cat.get("name", cat_id))
                else:
                    errors.append(f"分类 {cat_id} 不存在")

            except Exception as e:
                errors.append(f"移动分类 {cat_data.get('id')} 失败: {str(e)}")

        # 移动Prompt
        for prompt_data in prompts:
            try:
                category_id = prompt_data.get("categoryId")
                value = prompt_data.get("value")
                new_category_id = prompt_data.get("newCategoryId", "root")

                # 验证目标分类存在
                target_cat = category_storage.get_category_by_id(new_category_id)
                if not target_cat:
                    errors.append(f"目标分类 {new_category_id} 不存在")
                    continue

                # 更新Prompt的分类
                success = prompt_storage.update_prompt(category_id, value, categoryId=new_category_id)
                if success:
                    prompt = prompt_storage.get_prompt(new_category_id, value)
                    moved_prompts.append(prompt.get("name", value))
                else:
                    errors.append(f"Prompt {value} 不存在")

            except Exception as e:
                errors.append(f"移动Prompt {prompt_data.get('value')} 失败: {str(e)}")

        return web.json_response({
            "success": True,
            "movedCategories": moved_categories,
            "movedPrompts": moved_prompts,
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

        for prompt_data in prompts:
            try:
                category_id = prompt_data.get("categoryId")
                value = prompt_data.get("value")
                target_category_id = prompt_data.get("targetCategoryId")
                new_name = prompt_data.get("newName", value)

                # 验证源Prompt存在
                source_prompt = prompt_storage.get_prompt(category_id, value)
                if not source_prompt:
                    errors.append(f"源Prompt {value} 不存在")
                    continue

                # 验证目标分类存在
                target_cat = category_storage.get_category_by_id(target_category_id)
                if not target_cat:
                    errors.append(f"目标分类 {target_category_id} 不存在")
                    continue

                # 创建新Prompt（使用相同或新名称）
                try:
                    new_prompt = prompt_storage.add_prompt(
                        value=new_name,
                        name=source_prompt.get("name"),
                        category_id=target_category_id
                    )
                    copied_prompts.append(new_prompt.get("name", new_name))
                except ValueError as e:
                    errors.append(f"复制Prompt {value} 失败: {str(e)}")

            except Exception as e:
                errors.append(f"复制Prompt {prompt_data.get('value')} 失败: {str(e)}")

        return web.json_response({
            "success": True,
            "copiedPrompts": copied_prompts,
            "errors": errors
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.json_response({"error": str(e)}, status=500)
