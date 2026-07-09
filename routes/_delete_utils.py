"""
删除操作工具函数
所有删除逻辑的统一实现，路由层只做薄封装。
"""
from pathlib import Path

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
    """
    完全删除一张图片（历史视图场景）。
    删文件 + 删映射。
    """
    result = {"file_deleted": False, "affected_prompts": []}

    mapping = mapping_storage.get_mappings_by_image(image_path)
    if not mapping:
        return result

    # 删文件
    result["file_deleted"] = delete_image_file(image_path, mapping.get("type", ""))

    # 删映射
    mapping_storage.delete_mapping_by_image(image_path)

    return result


def delete_images_completely_batch(image_paths: list, mapping_storage, prompt_storage) -> dict:
    """
    批量完全删除图片（历史视图场景）。
    删文件 + 批量删映射。
    """
    result = {"deleted_files": [], "affected_prompts": []}
    unique_paths = list(dict.fromkeys(path for path in image_paths if path))
    if not unique_paths:
        return result

    removed_mappings = mapping_storage.batch_delete_by_images(unique_paths)
    if not removed_mappings:
        return result

    for mapping in removed_mappings:
        image_path = mapping.get("imagePath", "")
        if delete_image_file(image_path, mapping.get("type", "")):
            result["deleted_files"].append(image_path)

        for prompt_value in mapping.get("prompts", []) or []:
            result["affected_prompts"].append(prompt_value)

    return result


def delete_prompt_cascade(category_id: str, value: str,
                           prompt_storage, mapping_storage,
                           combination_storage) -> dict:
    """
    删除一个 prompt。
    Prompt 与图片/组合已改为弱关联，删除 Prompt 不再清理图片映射或组合成员。
    """
    result = {
        "deleted_files": [],
        "disassociated_images": [],
        "affected_combinations": 0,
    }

    prompt_storage.delete_prompt(category_id, value)

    return result


def batch_delete_prompts_cascade(prompt_keys: list,
                                  prompt_storage, mapping_storage,
                                  combination_storage) -> dict:
    """
    批量删除多个 prompt。
    Prompt 与图片/组合已改为弱关联，这里只删除 Prompt 记录。
    :param prompt_keys: [(categoryId, value), ...]
    """
    result = {
        "deleted_files": [],
        "disassociated_images": [],
    }
    if not prompt_keys:
        return result

    prompt_storage.batch_delete_prompts(prompt_keys)

    return result


def delete_category_cascade(category_id: str,
                             prompt_storage, mapping_storage,
                             category_storage, combination_storage) -> dict:
    """
    删除分类：
    1. 递归收集所有子分类 ID
    2. 删除这些分类下的组合记录
    3. 删除这些分类下的 prompt 记录
    4. 删除分类记录

    不再清理图片映射，也不再从其他组合中移除 Prompt 成员。
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
        prompt_storage.batch_delete_prompts(prompt_keys)
        for p in prompts_to_delete:
            result["deleted_prompts"].append(p.get("name", p["value"]))

    # 4. 批量删除分类记录（一次写入）
    try:
        deleted_count = category_storage.batch_delete(all_cat_ids)
        if deleted_count:
            result["deleted_categories"].extend(all_cat_ids)
    except Exception as e:
        print(f"[DeleteUtils] 批量删除分类失败: {e}")

    return result
