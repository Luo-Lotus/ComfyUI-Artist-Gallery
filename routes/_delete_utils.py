"""
删除操作工具函数
所有删除逻辑的统一实现，路由层只做薄封装。
"""
from pathlib import Path

from ._utils import is_remote_path, resolve_output_path


def _get_output_dir():
    import folder_paths
    return Path(folder_paths.get_output_directory())


def delete_image_file(image_path: str, mapping_type: str = "") -> bool:
    """删除本地图片文件，远程图片跳过。返回是否删除了文件。"""
    if is_remote_path(image_path, mapping_type):
        return False
    # 先 resolve 并确认仍在 output 目录内，防止路径穿越删除任意文件
    full_path = resolve_output_path(image_path)
    if full_path is None:
        print(f"[DeleteUtils] 拒绝删除 output 目录之外的路径: {image_path}")
        return False
    try:
        if full_path.exists():
            full_path.unlink()
            return True
    except Exception as e:
        print(f"[DeleteUtils] 删除文件失败 {image_path}: {e}")
    return False


def delete_image_completely(image_path: str, mapping_storage) -> dict:
    """
    完全删除一张图片（历史视图场景）。
    删映射（主索引 + comfy_output 分片）+ 删磁盘文件。
    """
    result = {"file_deleted": False}

    mappings = mapping_storage.delete_mappings_by_images([image_path])
    if not mappings:
        return result

    result["file_deleted"] = delete_image_file(image_path, mappings[0].get("type", ""))

    return result


def delete_images_completely_batch(image_paths: list, mapping_storage) -> dict:
    """
    批量完全删除图片（历史视图场景）。
    删映射（主索引 + comfy_output 分片）+ 批量删磁盘文件。
    """
    result = {"deleted_files": []}
    unique_paths = list(dict.fromkeys(path for path in image_paths if path))
    if not unique_paths:
        return result

    removed_mappings = mapping_storage.delete_mappings_by_images(unique_paths)
    if not removed_mappings:
        return result

    # 同一路径可能同时存在主索引与 comfy_output 分片映射，文件只删一次
    type_by_path = {}
    for mapping in removed_mappings:
        image_path = mapping.get("imagePath", "")
        if image_path:
            type_by_path.setdefault(image_path, mapping.get("type", ""))

    for image_path, mapping_type in type_by_path.items():
        if delete_image_file(image_path, mapping_type):
            result["deleted_files"].append(image_path)

    return result


def delete_category_cascade(category_id: str,
                             prompt_storage,
                             category_storage) -> dict:
    """
    删除分类：
    1. 递归收集所有子分类 ID
    2. 删除这些分类下的 prompt 记录
    3. 删除分类记录

    不清理图片映射。
    """
    result = {
        "deleted_categories": [],
        "deleted_prompts": [],
    }

    # 1. 递归收集所有子分类
    all_cat_ids = category_storage.get_descendant_ids(category_id)
    cat_id_set = set(all_cat_ids)

    # 2. 收集所有分类下的 prompt，批量级联删除
    all_prompts = prompt_storage.get_all_prompts()
    prompts_to_delete = [
        a for a in all_prompts
        if a.get("categoryId") in cat_id_set
    ]

    if prompts_to_delete:
        prompt_keys = [(p["categoryId"], p["value"]) for p in prompts_to_delete]
        prompt_storage.batch_delete_prompts(prompt_keys)
        for p in prompts_to_delete:
            result["deleted_prompts"].append(p.get("name", p["value"]))

    # 3. 批量删除分类记录（一次写入）
    try:
        deleted_count = category_storage.batch_delete(all_cat_ids)
        if deleted_count:
            result["deleted_categories"].extend(all_cat_ids)
    except Exception as e:
        print(f"[DeleteUtils] 批量删除分类失败: {e}")

    return result
