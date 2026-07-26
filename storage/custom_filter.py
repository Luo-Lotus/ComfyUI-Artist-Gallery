"""
自定义筛查项存储
"""
import json
import uuid
import threading
from pathlib import Path
from typing import List, Optional

from ._config import write_json_atomic


# 内置筛选项
_BUILTIN_FILTERS = [
    {
        "id": "builtin_global_search",
        "name": "全局查找",
        "placeholder": "用 & 表示且，| 表示或，如：cat&dog | bird",
        "filterCode": (
            "def filter_func(item, keywords):\n"
            "    if not keywords:\n"
            "        return True\n"
            "    gen_prompt = item.get('generatePrompt', '')\n"
            "    if not gen_prompt:\n"
            "        return False\n"
            "    gp = gen_prompt.lower()\n"
            "    or_groups = [g.strip() for g in keywords.split('|') if g.strip()]\n"
            "    for group in or_groups:\n"
            "        and_parts = [p.strip() for p in group.split('&') if p.strip()]\n"
            "        if and_parts and all(p in gp for p in and_parts):\n"
            "            return True\n"
            "    return False"
        ),
        "extractCode": "",
        "builtin": True,
        "options": [],
        "createdAt": 0,
    },
]


class CustomFilterStorage:
    """自定义筛查项管理"""

    def __init__(self, storage_dir: Path):
        self.storage_dir = storage_dir
        self.filters_file = storage_dir / "custom_filters.json"
        self._lock = threading.Lock()
        self._cache = None
        self._ensure_file()

    def _ensure_file(self):
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        if not self.filters_file.exists():
            self._write_data({"filters": list(_BUILTIN_FILTERS)})
        else:
            # 确保存在内置筛选项，同步名称/placeholder/filterCode
            data = self._read_data()
            existing_map = {f["id"]: f for f in data.get("filters", [])}
            changed = False
            for bf in _BUILTIN_FILTERS:
                if bf["id"] not in existing_map:
                    data["filters"].append(dict(bf))
                    changed = True
                else:
                    ef = existing_map[bf["id"]]
                    for key in ("name", "placeholder", "filterCode"):
                        if ef.get(key) != bf[key]:
                            ef[key] = bf[key]
                            changed = True
            if changed:
                self._write_data(data)

    def _read_data(self) -> dict:
        if self._cache is not None:
            return self._cache
        try:
            with open(self.filters_file, 'r', encoding='utf-8') as f:
                self._cache = json.load(f)
        except Exception:
            self._cache = {"filters": []}
        return self._cache

    def _write_data(self, data: dict):
        write_json_atomic(self.filters_file, data)
        self._cache = None

    def get_all(self) -> List[dict]:
        with self._lock:
            data = self._read_data()
            return list(data.get("filters", []))

    def get_by_id(self, filter_id: str) -> Optional[dict]:
        for f in self.get_all():
            if f["id"] == filter_id:
                return f
        return None

    def create(self, name: str, filter_code: str, extract_code: str = "", placeholder: str = "") -> dict:
        with self._lock:
            data = self._read_data()
            item = {
                "id": uuid.uuid4().hex[:12],
                "name": name,
                "placeholder": placeholder,
                "filterCode": filter_code,
                "extractCode": extract_code,
                "builtin": False,
                "options": [],
                "createdAt": __import__('time').time_ns() // 1_000_000,
            }
            data["filters"].append(item)
            self._write_data(data)
            return item

    def update(self, filter_id: str, name: str = None, filter_code: str = None,
               extract_code: str = None, options: list = None,
               placeholder: str = None) -> Optional[dict]:
        with self._lock:
            data = self._read_data()
            for f in data["filters"]:
                if f["id"] == filter_id:
                    is_builtin = f.get("builtin", False)
                    if name is not None and not is_builtin:
                        f["name"] = name
                    if placeholder is not None:
                        f["placeholder"] = placeholder
                    if filter_code is not None:
                        f["filterCode"] = filter_code
                    if extract_code is not None:
                        f["extractCode"] = extract_code
                    if options is not None:
                        f["options"] = options
                    self._write_data(data)
                    return f
        return None

    def delete(self, filter_id: str) -> bool:
        with self._lock:
            data = self._read_data()
            for f in data["filters"]:
                if f["id"] == filter_id and f.get("builtin", False):
                    return False  # 拒绝删除内置筛选项
            before = len(data["filters"])
            data["filters"] = [f for f in data["filters"] if f["id"] != filter_id]
            if len(data["filters"]) < before:
                self._write_data(data)
                return True
        return False
