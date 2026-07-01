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
from .migration import (
    migrate_prompt_data,
    migrate_to_prompt_schema,
    migrate_image_schema,
    migrate_prompt_string_image_index,
    migrate_prompt_covers_from_prompt_string,
)

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


# 启动迁移版本号：新增/修改迁移时 +1，旧标记会被判定为过期而重跑一次。
# 用标记文件保证这些“只需运行一次”的迁移不会在每次启动都重新解析全部数据。
_STARTUP_MIGRATION_VERSION = 1


def _run_startup_migrations(storage_dir: Path) -> None:
    """
    启动时执行的一次性数据迁移。

    设计要点：
    1. 所有迁移都是同步的，会阻塞事件循环，因此这里只放轻量、必要的迁移。
    2. 用版本标记文件保证只运行一次，避免每次启动都重新 parse 数百 MB 的分片数据。
    3. ⚠️ 绝不在此同步运行 migrate_prompt_covers_from_prompt_string：
       该迁移若用旧实现会对每个无封面的 Prompt 在全部图片映射中做子串匹配，
       复杂度 O(prompts × mappings)。当数据量大时（如 30 万 Prompt × 10 万映射）
       会在事件循环里同步阻塞数十分钟甚至更久，导致 ComfyUI 页面一直卡死、
       所有请求（含 /）一直挂起。封面回填改由 _maybe_launch_cover_backfill 在后台
       daemon 线程用 ahocorasick 高性能完成（O(总文本长度)，不阻塞页面）。
    """
    import time as _time

    marker = storage_dir / ".migration_version"
    try:
        if marker.exists():
            with open(marker, "r", encoding="utf-8") as f:
                content = f.read().strip()
            if content and int(content) >= _STARTUP_MIGRATION_VERSION:
                print(f"[prompt_gallery] 启动迁移已跳过（标记版本 {content}）")
                return
    except Exception:
        pass

    def _run(name, fn):
        t0 = _time.time()
        try:
            fn(storage_dir)
            print(f"[prompt_gallery] 迁移 {name} 完成（{_time.time() - t0:.2f}s）")
        except Exception as e:
            print(f"[prompt_gallery] 迁移 {name} 失败（{_time.time() - t0:.2f}s）: {e}")

    _run("to_prompt_schema", migrate_to_prompt_schema)
    _run("image_schema", migrate_image_schema)
    _run("prompt_string_image_index", migrate_prompt_string_image_index)

    try:
        with open(marker, "w", encoding="utf-8") as f:
            f.write(str(_STARTUP_MIGRATION_VERSION))
    except Exception as e:
        print(f"[prompt_gallery] 写入迁移标记失败: {e}")


# 封面回填版本号：仅用于一次性补齐无封面 Prompt 的 coverImageId。
# 与 _STARTUP_MIGRATION_VERSION 相互独立。bump 时旧标记会触发重跑。
_COVER_BACKFILL_VERSION = 1


def _maybe_launch_cover_backfill(prompt_storage, mapping_storage, combination_storage, storage_dir: Path) -> None:
    """
    首次启动时在后台 daemon 线程里跑一次高性能封面回填（ahocorasick）。

    设计要点：
    - 不阻塞 get_storage() / 事件循环（页面加载不受影响）。
    - 用 .cover_backfill_version 标记保证只跑一次；失败不写标记、下次启动重试。
    - 回填通过 PromptStorage.set_cover_batch 一次锁读写完成，与并发编辑串行、不覆盖已设封面。
    - 不调用 clear_all_caches()：set_cover_batch→_write_data→_invalidate_cache 已在锁内
      失效 prompt 缓存，后续请求自然读到新封面。
    """
    marker = storage_dir / ".cover_backfill_version"
    try:
        if marker.exists():
            with open(marker, "r", encoding="utf-8") as f:
                content = f.read().strip()
            if content and int(content) >= _COVER_BACKFILL_VERSION:
                return
    except Exception:
        pass

    def _worker():
        try:
            import folder_paths
            output_dir = Path(folder_paths.get_output_directory())
        except Exception:
            output_dir = None
        try:
            print("[prompt_gallery] 封面回填开始（后台线程，首次启动仅一次）")
            result = migrate_prompt_covers_from_prompt_string(storage_dir, output_dir)
            print(f"[prompt_gallery] 封面回填完成: {result.get('message')}")
            try:
                with open(marker, "w", encoding="utf-8") as f:
                    f.write(str(_COVER_BACKFILL_VERSION))
            except Exception as e:
                print(f"[prompt_gallery] 写入封面回填标记失败: {e}")
        except Exception as e:
            import traceback
            print(f"[prompt_gallery] 封面回填失败（将在下次启动重试）: {e}")
            traceback.print_exc()

    t = threading.Thread(target=_worker, name="pg-cover-backfill", daemon=True)
    t.start()


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

        # 启动迁移（带版本标记，只跑一次；排除了会导致卡死的 cover 迁移）
        _run_startup_migrations(storage_dir)

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

        # 首次启动在后台线程补齐无封面 Prompt 的 coverImageId（不阻塞，标记文件保证只跑一次）。
        _maybe_launch_cover_backfill(prompt_storage, mapping_storage, combination_storage, storage_dir)

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
