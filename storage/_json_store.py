import json
import threading
from pathlib import Path
from typing import Dict, List

from ._config import get_disabled_files


class SplitJsonStorage:
    """Shared JSON storage for main files plus optional enabled shard files."""

    item_key = ""
    file_attr = ""
    glob_pattern = ""

    def __init__(self, storage_dir: Path):
        self.storage_dir = storage_dir
        self._lock = threading.Lock()
        self._cache = None

    @property
    def primary_file(self) -> Path:
        return getattr(self, self.file_attr)

    def _invalidate_cache(self):
        self._cache = None

    def _glob_source_files(self) -> List[Path]:
        disabled = get_disabled_files(self.storage_dir)
        sources = []
        primary = self.primary_file
        if primary.exists():
            sources.append(primary)
        for f in sorted(self.storage_dir.glob(self.glob_pattern)):
            if f.resolve() != primary.resolve() and f.name not in disabled:
                sources.append(f)
        return sources

    def _has_split_files(self) -> bool:
        primary = self.primary_file
        return any(f.resolve() != primary.resolve() for f in self.storage_dir.glob(self.glob_pattern))

    def _read_data(self) -> dict:
        if self._cache is not None:
            return self._cache

        merged_items = []
        for source_file in self._glob_source_files():
            try:
                with open(source_file, "r", encoding="utf-8") as f:
                    file_data = json.load(f)
                for item in file_data.get(self.item_key, []):
                    item["_source_file"] = str(source_file)
                    merged_items.append(item)
            except Exception as e:
                print(f"Error reading {source_file.name}: {e}")

        self._cache = {self.item_key: merged_items}
        return self._cache

    def _write_data(self, data: dict):
        try:
            groups: Dict[str, list] = {}
            for item in data.get(self.item_key, []):
                source = item.pop("_source_file", None) or str(self.primary_file)
                groups.setdefault(source, []).append(item)

            main_key = str(self.primary_file)
            if main_key not in groups and len(groups) > 0:
                groups[main_key] = []

            for file_path_str, items in groups.items():
                file_path = Path(file_path_str)
                file_path.parent.mkdir(parents=True, exist_ok=True)
                with open(file_path, "w", encoding="utf-8") as f:
                    json.dump({self.item_key: items}, f, ensure_ascii=False, indent=2)

            self._invalidate_cache()
        except Exception as e:
            self._invalidate_cache()
            print(f"Error writing {self.item_key} files: {e}")
            raise
