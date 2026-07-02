"""
设置相关 API 接口
- 存储文件管理（查看、禁用/启用分片文件）
- 备份管理（查看、应用备份）
"""
import json
import re
import shutil
from pathlib import Path
from aiohttp import web
import server

from ..storage._config import (
    get_disabled_files,
    toggle_disabled_files,
    get_max_backups,
    set_max_backups,
)
from ..storage._resolve import clear_all_caches, _resolve_storage_dir, get_storage
from ..storage.backup import BackupManager

MAIN_FILES = {"prompts.json", "categories.json", "combinations.json", "images.json"}

STORAGE_TYPES = [
    {"key": "prompts", "main": "prompts.json", "glob": "*.prompts.json"},
    {"key": "categories", "main": "categories.json", "glob": "*.categories.json"},
    {"key": "combinations", "main": "combinations.json", "glob": "*.combinations.json"},
    {"key": "images", "main": "images.json", "glob": "*.images.json"},
]

# 匹配 prefix.type.json 中的 prefix 部分
_PREFIX_RE = re.compile(r'^(.+)\.(prompts|categories|combinations|images)\.json$')


def _format_size(size_bytes):
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    else:
        return f"{size_bytes / (1024 * 1024):.1f} MB"


def _extract_prefix(filename):
    """从分片文件名中提取 prefix，主文件返回 None"""
    m = _PREFIX_RE.match(filename)
    return m.group(1) if m else None


@server.PromptServer.instance.routes.get("/prompt_gallery/settings/storage_files")
async def get_storage_files(request):
    try:
        storage_dir = _resolve_storage_dir()
        disabled = get_disabled_files(storage_dir)

        # 收集所有分片文件，按 prefix 分组
        prefix_map = {}  # prefix -> {files: [...], size: int, disabled: bool}
        for st in STORAGE_TYPES:
            for f in sorted(storage_dir.glob(st["glob"])):
                if f.name == st["main"]:
                    continue
                prefix = _extract_prefix(f.name)
                if not prefix:
                    continue
                stat = f.stat()
                if prefix not in prefix_map:
                    prefix_map[prefix] = {"files": [], "totalSize": 0, "disabled": True}
                entry = prefix_map[prefix]
                entry["files"].append({
                    "name": f.name,
                    "type": st["key"],
                    "size": stat.st_size,
                    "sizeFormatted": _format_size(stat.st_size),
                })
                entry["totalSize"] += stat.st_size
                if f.name not in disabled:
                    entry["disabled"] = False

        # 转为前端需要的列表格式
        groups = []
        for prefix in sorted(prefix_map.keys()):
            entry = prefix_map[prefix]
            groups.append({
                "prefix": prefix,
                "files": entry["files"],
                "fileCount": len(entry["files"]),
                "totalSize": entry["totalSize"],
                "totalSizeFormatted": _format_size(entry["totalSize"]),
                "disabled": entry["disabled"],
            })

        return web.json_response({"success": True, "groups": groups})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/prompt_gallery/settings/storage_files/toggle")
async def toggle_storage_file(request):
    try:
        data = await request.json()
        prefix = data.get("prefix", "").strip()

        if not prefix:
            return web.json_response({"error": "prefix 不能为空"}, status=400)

        storage_dir = _resolve_storage_dir()

        # 找到该 prefix 下所有文件
        filenames = []
        for st in STORAGE_TYPES:
            for f in storage_dir.glob(f"{prefix}.{st['key']}.json"):
                if f.name != st["main"]:
                    filenames.append(f.name)

        if not filenames:
            return web.json_response({"error": "未找到对应文件"}, status=404)

        is_disabled = toggle_disabled_files(storage_dir, filenames)
        clear_all_caches()

        return web.json_response({"success": True, "disabled": is_disabled})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.get("/prompt_gallery/settings/backups")
async def get_backups(request):
    try:
        storage_dir = _resolve_storage_dir()
        max_bk = get_max_backups(storage_dir)
        bm = BackupManager(storage_dir, max_backups=max_bk)
        backups = bm.list_backups()
        for b in backups:
            b["sizeFormatted"] = _format_size(b["total_size"])
        return web.json_response({"success": True, "backups": backups, "maxBackups": max_bk})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/prompt_gallery/settings/backups/create")
async def create_backup(request):
    try:
        storage_dir = _resolve_storage_dir()
        max_bk = get_max_backups(storage_dir)
        bm = BackupManager(storage_dir, max_backups=max_bk)
        result = bm.create_backup()
        if result:
            return web.json_response({"success": True, "backup": result.name})
        return web.json_response({"success": True, "backup": None, "message": "无文件可备份"})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/prompt_gallery/settings/max_backups")
async def update_max_backups(request):
    try:
        data = await request.json()
        value = int(data.get("value", 3))
        storage_dir = _resolve_storage_dir()
        set_max_backups(storage_dir, value)
        return web.json_response({"success": True, "maxBackups": max(1, min(20, value))})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/prompt_gallery/settings/cleanup_ghost_images")
async def cleanup_ghost_image_mappings(request):
    """清理图片文件已不存在的本地图片映射。"""
    try:
        import folder_paths

        output_dir = Path(folder_paths.get_output_directory())
        _, mapping_storage, _, _ = get_storage()
        result = mapping_storage.cleanup_missing_local_mappings(output_dir)

        return web.json_response({
            "success": True,
            **result,
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/prompt_gallery/settings/backups/{name}/apply")
async def apply_backup(request):
    try:
        name = request.match_info["name"]
        storage_dir = _resolve_storage_dir()
        backup_dir = storage_dir / name

        if not backup_dir.is_dir() or not name.startswith("backup_"):
            return web.json_response({"error": "备份不存在"}, status=404)

        # 先创建安全备份
        max_bk = get_max_backups(storage_dir)
        bm = BackupManager(storage_dir, max_backups=max_bk)
        safety = bm.create_backup()

        # 还原备份文件
        for f in backup_dir.iterdir():
            if f.is_file():
                shutil.copy2(f, storage_dir / f.name)

        # 清除缓存
        clear_all_caches()

        return web.json_response({
            "success": True,
            "safety_backup": safety.name if safety else None,
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


_FAQ_PATH = Path(__file__).parent.parent / "web" / "faq.json"


@server.PromptServer.instance.routes.get("/prompt_gallery/faq")
async def get_faq(request):
    try:
        if not _FAQ_PATH.exists():
            return web.json_response({"success": True, "items": []})
        with open(_FAQ_PATH, 'r', encoding='utf-8') as f:
            items = json.load(f)
        return web.json_response({"success": True, "items": items})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
