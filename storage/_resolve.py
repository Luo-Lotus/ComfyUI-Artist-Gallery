import shutil
import threading
from pathlib import Path
from typing import Tuple

from .prompt import PromptStorage
from .image_mapping import ImageMappingStorage
from .category import CategoryStorage
from .combination import CombinationStorage
from .custom_filter import CustomFilterStorage
from .image_field import ImageFieldStorage
from .migration import migrate_prompt_data, migrate_to_prompt_schema, migrate_image_schema

_storage_instances = None
_custom_filter_instance = None
_image_field_instance = None
_storage_init_lock = threading.Lock()


def _resolve_storage_dir() -> Path:
    """
    解析数据存储目录。
    优先使用 user/default/prompt_gallery/，不可用时回退到插件目录。
    如果旧位置有数据但新位置没有，自动复制迁移。
    """
    plugin_dir = Path(__file__).parent.parent
    new_storage_dir = None

    # 尝试获取 ComfyUI 用户目录
    try:
        import folder_paths
        user_dir = folder_paths.get_user_directory()
        if user_dir:
            new_storage_dir = Path(user_dir) / "default" / "prompt_gallery"
    except Exception:
        pass

    # folder_paths 不可用，回退到插件目录
    if not new_storage_dir:
        return plugin_dir

    # 新目录已有数据，直接使用（含旧格式兼容 + 分片文件检测）
    new_has_data = (
        (new_storage_dir / "prompts.json").exists()
        or (new_storage_dir / "image_prompts.json").exists()
        or (new_storage_dir / "images.json").exists()
        or (new_storage_dir / "categories.json").exists()
        or (new_storage_dir / "artists.json").exists()
        or (new_storage_dir / "image_artists.json").exists()
        or any(new_storage_dir.glob("*.prompts.json"))
        or any(new_storage_dir.glob("*.categories.json"))
        or any(new_storage_dir.glob("*.combinations.json"))
        or any(new_storage_dir.glob("*.image_prompts.json"))
        or any(new_storage_dir.glob("*.images.json"))
    )
    if new_has_data:
        return new_storage_dir

    # 检查旧位置是否有数据文件（含旧格式兼容）
    old_files = [
        plugin_dir / "prompts.json",
        plugin_dir / "image_prompts.json",
        plugin_dir / "images.json",
        plugin_dir / "categories.json",
        plugin_dir / "combinations.json",
        plugin_dir / "artists.json",
        plugin_dir / "image_artists.json",
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
        print(f"[prompt_gallery] 数据已迁移: {plugin_dir} -> {new_storage_dir}")
    except Exception as e:
        print(f"[prompt_gallery] 迁移失败，回退到插件目录: {e}")
        return plugin_dir

    return new_storage_dir


def get_storage() -> Tuple[PromptStorage, ImageMappingStorage, CategoryStorage, CombinationStorage]:
    """获取存储实例（懒加载单例，首次调用时初始化，后续返回缓存实例）"""
    global _storage_instances
    if _storage_instances is not None:
        return _storage_instances

    with _storage_init_lock:
        # 双重检查锁定
        if _storage_instances is not None:
            return _storage_instances

        storage_dir = _resolve_storage_dir()

        # 迁移只在首次初始化时运行
        try:
            migrate_to_prompt_schema(storage_dir)
        except Exception as e:
            print(f"Warning: Failed to migrate to prompt schema: {e}")

        try:
            migrate_image_schema(storage_dir)
        except Exception as e:
            print(f"Warning: Failed to migrate image schema: {e}")

        prompt_storage = PromptStorage(storage_dir)
        mapping_storage = ImageMappingStorage(storage_dir)
        category_storage = CategoryStorage(storage_dir)
        combination_storage = CombinationStorage(storage_dir)

        # 自动迁移现有Prompt数据（旧版本兼容）
        try:
            migrate_prompt_data(prompt_storage)
        except Exception as e:
            print(f"Warning: Failed to migrate prompt data: {e}")

        _storage_instances = (prompt_storage, mapping_storage, category_storage, combination_storage)
        return _storage_instances


def get_custom_filter_storage() -> CustomFilterStorage:
    """获取自定义筛查项存储实例（懒加载单例）"""
    global _custom_filter_instance
    if _custom_filter_instance is not None:
        return _custom_filter_instance

    with _storage_init_lock:
        if _custom_filter_instance is not None:
            return _custom_filter_instance
        storage_dir = _resolve_storage_dir()
        _custom_filter_instance = CustomFilterStorage(storage_dir)
        return _custom_filter_instance


def get_image_field_storage() -> ImageFieldStorage:
    """获取图片自定义字段存储实例（懒加载单例）"""
    global _image_field_instance
    if _image_field_instance is not None:
        return _image_field_instance

    with _storage_init_lock:
        if _image_field_instance is not None:
            return _image_field_instance
        storage_dir = _resolve_storage_dir()
        _image_field_instance = ImageFieldStorage(storage_dir)
        return _image_field_instance


def clear_all_caches():
    """清除所有 Storage 单例的缓存和索引"""
    global _storage_instances
    if _storage_instances is None:
        return
    prompt_storage, mapping_storage, category_storage, combination_storage = _storage_instances
    for s in (prompt_storage, mapping_storage, category_storage, combination_storage):
        s._cache = None
    prompt_storage._idx_by_key = None
    prompt_storage._idx_by_id = None
    prompt_storage._idx_by_category = None
    mapping_storage._idx_by_path = None
    mapping_storage._idx_by_prompt = None
    category_storage._idx_by_id = None
    category_storage._idx_by_parent = None
    combination_storage._idx_by_id = None
    combination_storage._idx_by_category = None
