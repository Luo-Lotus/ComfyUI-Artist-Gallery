from pathlib import Path

from ._image_index import image_exists


def find_latest_prompt_cover(prompt_value, mapping_storage, output_dir):
    mappings = mapping_storage.get_mappings_by_prompt(prompt_value)
    existing = [m for m in mappings if image_exists(m, output_dir)]
    if not existing:
        return None

    def sort_key(mapping):
        file_info = mapping.get("fileInfo") or {}
        return file_info.get("createdAt") or 0

    latest = max(existing, key=sort_key)
    return latest.get("imagePath")


def ensure_prompt_cover(prompt_storage, mapping_storage, category_id, value, output_dir):
    prompt = prompt_storage.get_prompt(category_id, value)
    if not prompt or prompt.get("coverImageId"):
        return None
    cover = find_latest_prompt_cover(value, mapping_storage, output_dir)
    if cover:
        prompt_storage.update_prompt(category_id, value, coverImageId=cover)
    return cover
