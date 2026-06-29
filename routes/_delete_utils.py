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
    """
    从图片映射中移除一个 prompt 关联。
    - 若移除后映射的 prompts 为空 → 删文件 + 删映射
    - 若移除后还有其他 prompt → 只更新映射
    """
    result = {"file_deleted": False, "mapping_deleted": False, "orphan": False}

    mapping = mapping_storage.get_mappings_by_image(image_path)
    if not mapping:
        return result

    prompts = list(mapping.get("prompts", []))
    if prompt_value not in prompts:
        return result

    prompts.remove(prompt_value)

    if prompts:
        # 还有其他 prompt，只更新映射
        mapping_storage.update_mapping(image_path, prompts)
    else:
        # 没有其他 prompt 了，删文件 + 删映射
        result["orphan"] = True
        result["file_deleted"] = delete_image_file(image_path, mapping.get("type", ""))
        mapping_storage.delete_mapping_by_image(image_path)
        result["mapping_deleted"] = True

    return result


def delete_image_completely(image_path: str, mapping_storage, prompt_storage) -> dict:
    """
    完全删除一张图片（历史视图场景）。
    删文件 + 删映射 + 更新所有关联 prompt 的 imageCount。
    """
    result = {"file_deleted": False, "affected_prompts": []}

    mapping = mapping_storage.get_mappings_by_image(image_path)
    if not mapping:
        return result

    prompt_values = mapping.get("prompts", [])

    # 删文件
    result["file_deleted"] = delete_image_file(image_path, mapping.get("type", ""))

    # 删映射
    mapping_storage.delete_mapping_by_image(image_path)

    # 更新关联 prompt 的 imageCount
    all_prompts = prompt_storage.get_all_prompts()
    deltas = {}
    for pv in prompt_values:
        for p in all_prompts:
            if p.get("value") == pv:
                key = (p.get("categoryId", "root"), pv)
                deltas[key] = deltas.get(key, 0) - 1
                result["affected_prompts"].append(pv)

    if deltas:
        prompt_storage.update_image_count_batch(deltas)

    return result


def delete_prompt_cascade(category_id: str, value: str,
                           prompt_storage, mapping_storage,
                           combination_storage) -> dict:
    """
    级联删除一个 prompt：
    1. 遍历所有映射，对该 prompt 关联的图片调用 remove_image_prompt_link
    2. 从所有组合中移除该 prompt
    3. 删除 prompt 记录
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
    批量级联删除多个 prompt（高效版本，一次锁完成所有存储操作）。
    :param prompt_keys: [(categoryId, value), ...]
    """
    result = {
        "deleted_files": [],
        "disassociated_images": [],
    }
    if not prompt_keys:
        return result

    prompt_values = [value for _, value in prompt_keys]

    # 1. 批量从映射中移除 prompt 关联（一次锁）
    link_result = mapping_storage.batch_remove_prompt_links(prompt_values)
    for item in link_result["orphan_images"]:
        path = item["path"]
        if path:
            delete_image_file(path, item.get("type", ""))
            result["deleted_files"].append(path)
    result["disassociated_images"] = [p for p in link_result["updated_paths"] if p]

    # 2. 批量从组合中移除 prompt（一次锁）
    combination_storage.batch_remove_prompts_from_all(prompt_values)

    # 3. 批量删除 prompt 记录（一次锁）
    prompt_storage.batch_delete_prompts(prompt_keys)

    return result


def delete_category_cascade(category_id: str,
                             prompt_storage, mapping_storage,
                             category_storage, combination_storage) -> dict:
    """
    级联删除分类：
    1. 递归收集所有子分类 ID
    2. 收集所有分类下的组合，批量删除
    3. 收集所有分类下的 prompt，逐个调用 delete_prompt_cascade
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
