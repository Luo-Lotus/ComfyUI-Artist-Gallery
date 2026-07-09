"""
图片自定义字段存储
"""
import json
import uuid
import threading
from pathlib import Path
from typing import List, Optional


# 内置字段定义
_DEPRECATED_BUILTIN_FIELD_IDS = {"builtin_prompt_names"}

_BUILTIN_FIELDS = [
    {
        "id": "builtin_date",
        "name": "日期",
        "extractCode": (
            "def extract_func(item):\n"
            "    from datetime import datetime, timezone\n"
            "    ts = item.get('fileInfo', {}).get('createdAt', 0)\n"
            "    if not ts:\n"
            "        return ''\n"
            "    return datetime.fromtimestamp(ts / 1000, tz=timezone.utc).strftime('%Y-%m-%d')"
        ),
        "builtin": True,
        "groupable": True,
        "createdAt": 0,
        "options": [],
    },
    {
        "id": "builtin_dimensions",
        "name": "尺寸",
        "extractCode": (
            "def extract_func(item):\n"
            "    fi = item.get('fileInfo', {})\n"
            "    w, h = fi.get('width'), fi.get('height')\n"
            "    if w and h:\n"
            "        return f'{w}x{h}'\n"
            "    return ''"
        ),
        "builtin": True,
        "groupable": True,
        "createdAt": 0,
        "options": [],
    },
    {
        "id": "builtin_size",
        "name": "文件大小",
        "extractCode": (
            "def extract_func(item):\n"
            "    s = item.get('fileInfo', {}).get('size', 0)\n"
            "    if not s:\n"
            "        return ''\n"
            "    if s < 1024:\n"
            "        return f'{s}B'\n"
            "    elif s < 1048576:\n"
            "        return f'{s / 1024:.1f}KB'\n"
            "    else:\n"
            "        return f'{s / 1048576:.1f}MB'"
        ),
        "builtin": True,
        "groupable": True,
        "createdAt": 0,
        "options": [],
    },
    {
        "id": "builtin_prompt_string",
        "name": "提示词",
        "extractCode": (
            "def extract_func(item):\n"
            "    return item.get('promptString', '')"
        ),
        "builtin": True,
        "groupable": True,
        "createdAt": 0,
        "options": [],
    },
    {
        "id": "builtin_path",
        "name": "文件路径",
        "extractCode": (
            "def extract_func(item):\n"
            "    return item.get('imagePath', '')"
        ),
        "builtin": True,
        "groupable": True,
        "createdAt": 0,
        "options": [],
    },
]


class ImageFieldStorage:
    """图片自定义字段管理"""

    def __init__(self, storage_dir: Path):
        self.storage_dir = storage_dir
        self.fields_file = storage_dir / "image_fields.json"
        self._lock = threading.Lock()
        self._cache = None
        self._ensure_file()

    def _ensure_file(self):
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        if not self.fields_file.exists():
            self._write_data({"fields": list(_BUILTIN_FIELDS)})
        else:
            # 确保内置字段存在（合并缺失的 builtin 字段，同步名称和 extractCode）
            data = self._read_data()
            original_count = len(data.get("fields", []))
            data["fields"] = [
                f for f in data.get("fields", [])
                if f.get("id") not in _DEPRECATED_BUILTIN_FIELD_IDS
            ]
            existing_map = {f["id"]: f for f in data.get("fields", [])}
            changed = len(data["fields"]) != original_count
            for bf in _BUILTIN_FIELDS:
                if bf["id"] not in existing_map:
                    data["fields"].append(dict(bf))
                    changed = True
                else:
                    ef = existing_map[bf["id"]]
                    if ef.get("name") != bf["name"]:
                        ef["name"] = bf["name"]
                        changed = True
                    if ef.get("extractCode") != bf["extractCode"]:
                        ef["extractCode"] = bf["extractCode"]
                        changed = True
            if changed:
                self._write_data(data)

    def _read_data(self) -> dict:
        if self._cache is not None:
            return self._cache
        try:
            with open(self.fields_file, 'r', encoding='utf-8') as f:
                self._cache = json.load(f)
        except Exception:
            self._cache = {"fields": list(_BUILTIN_FIELDS)}
        return self._cache

    def _write_data(self, data: dict):
        with open(self.fields_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        self._cache = None

    def get_all(self) -> List[dict]:
        with self._lock:
            data = self._read_data()
            return data.get("fields", [])

    def get_by_id(self, field_id: str) -> Optional[dict]:
        for f in self.get_all():
            if f["id"] == field_id:
                return f
        return None

    def get_groupable(self) -> List[dict]:
        """返回所有可参与分组的字段"""
        return [f for f in self.get_all() if f.get("groupable", False)]

    def create(self, name: str, extract_code: str, groupable: bool = False) -> dict:
        with self._lock:
            data = self._read_data()
            item = {
                "id": uuid.uuid4().hex[:12],
                "name": name,
                "extractCode": extract_code,
                "builtin": False,
                "groupable": groupable,
                "createdAt": __import__('time').time_ns() // 1_000_000,
                "options": [],
            }
            data["fields"].append(item)
            self._write_data(data)
            return item

    def update(self, field_id: str, name: str = None, extract_code: str = None,
               groupable: bool = None, options: list = None) -> Optional[dict]:
        with self._lock:
            data = self._read_data()
            for f in data["fields"]:
                if f["id"] == field_id:
                    is_builtin = f.get("builtin", False)
                    if name is not None and not is_builtin:
                        f["name"] = name
                    if extract_code is not None:
                        f["extractCode"] = extract_code
                    if groupable is not None:
                        f["groupable"] = groupable
                    if options is not None:
                        f["options"] = options
                    self._write_data(data)
                    return f
        return None

    def delete(self, field_id: str) -> bool:
        with self._lock:
            data = self._read_data()
            for f in data["fields"]:
                if f["id"] == field_id and f.get("builtin", False):
                    return False  # 拒绝删除内置字段
            before = len(data["fields"])
            data["fields"] = [f for f in data["fields"] if f["id"] != field_id]
            if len(data["fields"]) < before:
                self._write_data(data)
                return True
        return False

    def reorder(self, field_ids: list) -> list:
        """按给定 ID 顺序重排字段，不在列表中的追加到末尾"""
        with self._lock:
            data = self._read_data()
            id_map = {f["id"]: f for f in data["fields"]}
            ordered = []
            for fid in field_ids:
                if fid in id_map:
                    ordered.append(id_map.pop(fid))
            ordered.extend(id_map.values())
            data["fields"] = ordered
            self._write_data(data)
            return ordered
