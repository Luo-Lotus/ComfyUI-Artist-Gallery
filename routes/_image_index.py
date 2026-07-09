from pathlib import Path

from ._utils import is_remote_path


def image_exists(mapping: dict, output_dir) -> bool:
    image_path = mapping.get("imagePath")
    if not image_path:
        return False
    return is_remote_path(image_path, mapping.get("type", "")) or (Path(output_dir) / image_path).exists()


def build_prompt_string_index(mapping_storage, prompt_values):
    return mapping_storage.build_prompt_index_for_values(prompt_values)


def image_info_from_mapping(mapping, output_dir, prompts=None):
    image_path = mapping.get("imagePath")
    mapping_type = mapping.get("type", "local")
    if is_remote_path(image_path, mapping_type):
        return {
            "path": image_path,
            "type": "remote",
            "size": 0,
            "mtime": mapping.get("fileInfo", {}).get("createdAt", 0),
            "prompts": prompts or [],
            "promptString": mapping.get("promptString", ""),
        }

    full_path = Path(output_dir) / image_path
    stat = full_path.stat()
    return {
        "path": image_path,
        "size": stat.st_size,
        "mtime": stat.st_mtime * 1000,
        "prompts": prompts or [],
        "promptString": mapping.get("promptString", ""),
    }
