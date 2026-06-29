"""
删除操作工具函数
所有删除逻辑的统一实现，路由层只做薄封装。
"""
from pathlib import Path
from typing import List

from ._utils import is_remote_path


def _get_output_dir():
    import folder_paths
    return Path(folder_paths.get_output_directory())


def delete_image_file(image_path: str, mapping_type: str = "") -> bool:
    """删除本地图片文件，远程图片跳过。返回是否删除了文件。"""
    if is_remote_path(image_path, mapping_type):
        return False
    full_path = _get_output_dir() / image_path
    try:
        if full_path.exists():
            full_path.unlink()
            return True
    except Exception as e:
        print(f"[DeleteUtils] 删除文件失败 {image_path}: {e}")
    return False


def remove_image_prompt_link(image_path: str, prompt_value: str,
                              mapping_storage) -> dict:
    """兼容旧接口：图片不再维护可删除的 Prompt 强关联。"""
    return {"file_deleted": False, "mapping_deleted": False, "orphan": False}


def delete_image_completely(image_path: str, mapping_storage, prompt_storage) -> dict:
    """完全删除一张图片及其索引记录。"""
    result = {"file_deleted": False, "affected_prompts": []}

    mapping = mapping_storage.get_mappings_by_image(image_path)
    if not mapping:
        return result

    # 删文件
    result["file_deleted"] = delete_image_file(image_path, mapping.get("type", ""))

    # 删映射
    mapping_storage.delete_mapping_by_image(image_path)

    return result


def delete_prompt_cascade(category_id: str, value: str,
                           prompt_storage, mapping_storage,
                           combination_storage) -> dict:
    """
    删除一个 prompt：
    1. 从所有组合中移除该 prompt
    2. 删除 prompt 记录
    图片索引只保存 promptString，不因删除 Prompt 自动删图。
    """
    result = {
        "deleted_files": [],
        "disassociated_images": [],
        "affected_combinations": 0,
    }

    prompt_result = batch_delete_prompts_cascade(
        [(category_id, value)],
        prompt_storage, mapping_storage, combination_storage,
    )
    result["deleted_files"].extend(prompt_result["deleted_files"])
    result["disassociated_images"].extend(prompt_result["disassociated_images"])

    return result


def batch_delete_prompts_cascade(prompt_keys: list,
                                  prompt_storage, mapping_storage,
                                  combination_storage) -> dict:
    """
    批量删除多个 prompt（高效版本，一次锁完成所有存储操作）。
    :param prompt_keys: [(categoryId, value), ...]
    """
    result = {
        "deleted_files": [],
        "disassociated_images": [],
    }
    if not prompt_keys:
        return result

    prompt_values = [value for _, value in prompt_keys]

    # 1. 批量从组合中移除 prompt（一次锁）
    combination_storage.batch_remove_prompts_from_all(prompt_values)

    # 2. 批量删除 prompt 记录（一次锁）。图片索引不再维护强关联。
    prompt_storage.batch_delete_prompts(prompt_keys)

    return result


def delete_category_cascade(category_id: str,
                             prompt_storage, mapping_storage,
                             category_storage, combination_storage) -> dict:
    """
    级联删除分类：
    1. 递归收集所有子分类 ID
    2. 收集所有分类下的组合，批量删除
    3. 收集所有分类下的 prompt，批量删除 Prompt 记录
    4. 从叶到根删除分类记录
    """
    result = {
        "deleted_categories": [],
        "deleted_prompts": [],
        "deleted_files": [],
        "disassociated_images": [],
        "deleted_combinations": 0,
    }

    # 1. 递归收集所有子分类
    all_cat_ids = category_storage.get_descendant_ids(category_id)

    # 2. 收集并删除所有分类下的组合
    all_combinations = combination_storage.get_all_combinations()
    combo_ids_to_delete = [
        c["id"] for c in all_combinations
        if c.get("categoryId") in all_cat_ids
    ]
    if combo_ids_to_delete:
        result["deleted_combinations"] = combination_storage.batch_delete(combo_ids_to_delete)

    # 3. 收集所有分类下的 prompt，批量级联删除
    all_prompts = prompt_storage.get_all_prompts()
    prompts_to_delete = [
        a for a in all_prompts
        if a.get("categoryId") in all_cat_ids
    ]

    if prompts_to_delete:
        prompt_keys = [(p["categoryId"], p["value"]) for p in prompts_to_delete]
        prompt_result = batch_delete_prompts_cascade(
            prompt_keys,
            prompt_storage, mapping_storage, combination_storage,
        )
        for p in prompts_to_delete:
            result["deleted_prompts"].append(p.get("name", p["value"]))
        result["deleted_files"].extend(prompt_result["deleted_files"])
        result["disassociated_images"].extend(prompt_result["disassociated_images"])

    # 4. 批量删除分类记录（一次写入）
    try:
        deleted_count = category_storage.batch_delete(all_cat_ids)
        if deleted_count:
            result["deleted_categories"].extend(all_cat_ids)
    except Exception as e:
        print(f"[DeleteUtils] 批量删除分类失败: {e}")

    return result
