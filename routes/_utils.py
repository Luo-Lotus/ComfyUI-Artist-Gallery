"""路由共用工具函数"""
from pathlib import Path
from typing import Optional


def is_remote_path(image_path: str, mapping_type: str = "") -> bool:
    """判断图片路径是否为远程URL"""
    return mapping_type == "remote" or image_path.startswith("http://") or image_path.startswith("https://")


def resolve_output_path(relative_path: str) -> Optional[Path]:
    """
    将相对路径拼接到 ComfyUI output 目录并 resolve。
    结果必须仍位于 output 目录内，否则返回 None（防路径穿越）。
    """
    if not relative_path:
        return None
    import folder_paths
    output_dir = Path(folder_paths.get_output_directory()).resolve()
    try:
        candidate = (output_dir / relative_path).resolve()
    except (OSError, ValueError):
        return None
    if not candidate.is_relative_to(output_dir):
        return None
    return candidate


def is_safe_filename(name: str) -> bool:
    """校验是否为不含路径成分的普通文件名（拒绝 / \\ .. 等穿越成分）。"""
    if not name or not isinstance(name, str):
        return False
    if "/" in name or "\\" in name or ".." in name:
        return False
    if name in (".", ""):
        return False
    return Path(name).name == name
