"""
存储配置管理（分片文件禁用状态等）
独立模块，避免与 _resolve.py 产生循环导入。
"""
import json
from pathlib import Path


def get_storage_config_path(storage_dir: Path) -> Path:
    return storage_dir / "storage_config.json"


def get_disabled_files(storage_dir: Path) -> set:
    """读取已禁用的分片文件名集合，配置文件不存在或解析失败时返回空集合"""
    config_path = get_storage_config_path(storage_dir)
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return set(data.get("disabled_files", []))
    except Exception:
        return set()


def toggle_disabled_file(storage_dir: Path, filename: str) -> bool:
    """切换分片文件的禁用状态，返回 True 表示已禁用，False 表示已启用"""
    config_path = get_storage_config_path(storage_dir)
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception:
        data = {}

    disabled = set(data.get("disabled_files", []))
    if filename in disabled:
        disabled.discard(filename)
        result = False
    else:
        disabled.add(filename)
        result = True

    data["disabled_files"] = sorted(disabled)
    with open(config_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return result


def toggle_disabled_files(storage_dir: Path, filenames: list) -> bool:
    """批量切换一组文件的禁用状态（基于第一个文件的状态决定整体切换方向）"""
    config_path = get_storage_config_path(storage_dir)
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception:
        data = {}

    disabled = set(data.get("disabled_files", []))
    # 若其中有任一文件已禁用，则整体启用；否则整体禁用
    should_disable = not any(f in disabled for f in filenames)

    for f in filenames:
        if should_disable:
            disabled.add(f)
        else:
            disabled.discard(f)

    data["disabled_files"] = sorted(disabled)
    with open(config_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return should_disable


def get_max_backups(storage_dir: Path) -> int:
    """读取最大备份数量配置，默认 3"""
    config_path = get_storage_config_path(storage_dir)
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return int(data.get("max_backups", 3))
    except Exception:
        return 3


def set_max_backups(storage_dir: Path, value: int) -> None:
    """设置最大备份数量"""
    config_path = get_storage_config_path(storage_dir)
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception:
        data = {}

    data["max_backups"] = max(1, min(20, value))
    with open(config_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
