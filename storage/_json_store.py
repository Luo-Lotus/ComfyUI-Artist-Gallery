import json
import threading
from pathlib import Path
from typing import Dict, List

from ._config import get_disabled_files, write_json_atomic


class SplitJsonStorage:
    """Shared JSON storage for main files plus optional enabled shard files."""

    item_key = ""
    file_attr = ""
    glob_pattern = ""

    def __init__(self, storage_dir: Path):
        self.storage_dir = storage_dir
        self._lock = threading.Lock()
        self._cache = None
        self._failed_sources = set()

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
            if f.resolve() == primary.resolve():
                continue
            if f.name in disabled:
                continue
            # comfy_output*.images.json 是系统外导入、仅历史视图用的文件，
            # 与 prompt 无关，不参与 prompt 关联/封面等解析；
            # 跳过以避免每次读取都 parse 这类超大分片。历史视图按需单独读取。
            if f.name.startswith("comfy_output"):
                continue
            sources.append(f)
        return sources

    def _has_split_files(self) -> bool:
        primary = self.primary_file
        return any(f.resolve() != primary.resolve() for f in self.storage_dir.glob(self.glob_pattern))

    def _read_data(self) -> dict:
        if self._cache is not None:
            return self._cache

        merged_items = []
        failed_sources = set()
        for source_file in self._glob_source_files():
            try:
                with open(source_file, "r", encoding="utf-8") as f:
                    file_data = json.load(f)
                for item in file_data.get(self.item_key, []):
                    item["_source_file"] = str(source_file)
                    merged_items.append(item)
            except Exception as e:
                print(f"Error reading {source_file.name}: {e}")
                failed_sources.add(str(source_file))

        self._failed_sources = failed_sources
        self._cache = {self.item_key: merged_items}
        return self._cache

    def _write_data(self, data: dict):
        try:
            failed_sources = self._failed_sources
            main_key = str(self.primary_file)

            # 不修改缓存里的原对象：按来源文件分组，写入去掉 _source_file 的副本，
            # 保证中途失败时内存路由信息完好。
            groups: Dict[str, list] = {}
            for item in data.get(self.item_key, []):
                source = item.get("_source_file") or main_key
                groups.setdefault(source, []).append(
                    {k: v for k, v in item.items() if k != "_source_file"}
                )

            # 主文件条目为空时补写空主文件；但主文件读取失败时禁止，
            # 避免把暂时读不出来的数据永久清空。
            if main_key not in groups and len(groups) > 0 and main_key not in failed_sources:
                groups[main_key] = []

            # 读取失败的来源文件绝不重写（其条目已从合并结果中缺失，重写等于丢数据）。
            for file_path_str in groups:
                if file_path_str in failed_sources:
                    raise RuntimeError(
                        f"Refusing to write {Path(file_path_str).name}: "
                        f"this source file failed to read; writing would destroy its data"
                    )

            for file_path_str, items in groups.items():
                write_json_atomic(Path(file_path_str), {self.item_key: items})

            # 全部写成功后再清掉内存对象上的路由标记（对齐旧行为，调用方拿到的
            # 新增对象不携带 _source_file）；缓存随后失效重建。
            for item in data.get(self.item_key, []):
                item.pop("_source_file", None)

            self._invalidate_cache()
        except Exception as e:
            self._invalidate_cache()
            print(f"Error writing {self.item_key} files: {e}")
            raise
