import shutil
from pathlib import Path
from typing import Tuple

from .artist import ArtistStorage
from .image_mapping import ImageMappingStorage
from .category import CategoryStorage
from .combination import CombinationStorage
from .migration import migrate_artist_data


def _resolve_storage_dir() -> Path:
    """
    解析数据存储目录。
    优先使用 user/default/artist_gallery/，不可用时回退到插件目录。
    如果旧位置有数据但新位置没有，自动复制迁移。
    """
    plugin_dir = Path(__file__).parent.parent
    new_storage_dir = None

    # 尝试获取 ComfyUI 用户目录
    try:
        import folder_paths
        user_dir = folder_paths.get_user_directory()
        if user_dir:
            new_storage_dir = Path(user_dir) / "default" / "artist_gallery"
    except Exception:
        pass

    # folder_paths 不可用，回退到插件目录
    if not new_storage_dir:
        return plugin_dir

    # 新目录已有数据，直接使用
    new_has_data = (
        (new_storage_dir / "artists.json").exists()
        or (new_storage_dir / "image_artists.json").exists()
        or (new_storage_dir / "categories.json").exists()
    )
    if new_has_data:
        return new_storage_dir

    # 检查旧位置是否有数据文件
    old_files = [
        plugin_dir / "artists.json",
        plugin_dir / "image_artists.json",
        plugin_dir / "categories.json",
        plugin_dir / "combinations.json",
    ]
    old_has_data = any(f.exists() for f in old_files)

    if not old_has_data:
        # 两边都没有数据，使用新目录（全新安装）
        return new_storage_dir

    # 旧位置有数据，新位置没有 → 自动迁移
    try:
        new_storage_dir.mkdir(parents=True, exist_ok=True)
        for old_file in old_files:
            if old_file.exists():
                shutil.copy2(old_file, new_storage_dir / old_file.name)
        print(f"[artist_gallery] 数据已迁移: {plugin_dir} -> {new_storage_dir}")
    except Exception as e:
        print(f"[artist_gallery] 迁移失败，回退到插件目录: {e}")
        return plugin_dir

    return new_storage_dir


def get_storage() -> Tuple[ArtistStorage, ImageMappingStorage, CategoryStorage, CombinationStorage]:
    """获取存储实例"""
    storage_dir = _resolve_storage_dir()

    artist_storage = ArtistStorage(storage_dir)
    mapping_storage = ImageMappingStorage(storage_dir)
    category_storage = CategoryStorage(storage_dir)
    combination_storage = CombinationStorage(storage_dir)

    # 自动迁移现有画师数据（旧版本兼容）
    try:
        migrate_artist_data(artist_storage)
    except Exception as e:
        print(f"Warning: Failed to migrate artist data: {e}")

    return artist_storage, mapping_storage, category_storage, combination_storage
