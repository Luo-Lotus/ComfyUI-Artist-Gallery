from pathlib import Path

from ._utils import is_remote_path


def image_exists(mapping: dict, output_dir) -> bool:
    image_path = mapping.get("imagePath")
    if not image_path:
        return False
    return is_remote_path(image_path, mapping.get("type", "")) or (Path(output_dir) / image_path).exists()
