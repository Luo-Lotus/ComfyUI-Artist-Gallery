import json
import uuid
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import threading

from ._config import get_disabled_files


class CategoryStorage:
    """分类数据存储管理"""

    def __init__(self, storage_dir: Path):
        self.storage_dir = storage_dir
        self.categories_file = storage_dir / "categories.json"
        self._glob_pattern = "*.categories.json"
        self._lock = threading.Lock()
        self._cache = None
        self._ensure_storage_dir()

    def _ensure_storage_dir(self):
        """确保存储目录存在并初始化"""
        self.storage_dir.mkdir(parents=True, exist_ok=True)

        if not self.categories_file.exists():
            split_files = [f for f in self.storage_dir.glob(self._glob_pattern)
                           if f.resolve() != self.categories_file.resolve()]
            if not split_files:
                import time
                default_data = {
                    "categories": [{
                        "id": "root",
                        "name": "全部",
                        "parentId": None,
                        "order": 0,
                        "createdAt": int(time.time() * 1000)
                    }]
                }
                self._write_data(default_data)

    def _glob_source_files(self) -> list:
        """查找所有源文件：主文件 + glob 匹配的分片文件（排除已禁用）"""
        disabled = get_disabled_files(self.storage_dir)
        sources = []
        if self.categories_file.exists():
            sources.append(self.categories_file)
        for f in sorted(self.storage_dir.glob(self._glob_pattern)):
            if f.resolve() != self.categories_file.resolve():
                if f.name not in disabled:
                    sources.append(f)
        return sources

    def _read_data(self) -> dict:
        """读取并合并所有源文件（带缓存）"""
        if self._cache is not None:
            return self._cache
        merged_items = []
        for source_file in self._glob_source_files():
            try:
                with open(source_file, 'r', encoding='utf-8') as f:
                    file_data = json.load(f)
                for item in file_data.get("categories", []):
                    item["_source_file"] = str(source_file)
                    merged_items.append(item)
            except Exception as e:
                print(f"Error reading {source_file.name}: {e}")
        self._cache = {"categories": merged_items}
        return self._cache

    def _write_data(self, data: dict):
        """按来源文件分组回写，新数据写入主文件"""
        try:
            groups: Dict[str, list] = {}
            for item in data.get("categories", []):
                source = item.pop("_source_file", None) or str(self.categories_file)
                groups.setdefault(source, []).append(item)

            main_key = str(self.categories_file)
            if main_key not in groups and len(groups) > 0:
                groups[main_key] = []

            for file_path_str, items in groups.items():
                file_path = Path(file_path_str)
                file_path.parent.mkdir(parents=True, exist_ok=True)
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump({"categories": items}, f, ensure_ascii=False, indent=2)

            self._cache = None
        except Exception as e:
            self._cache = None
            print(f"Error writing categories files: {e}")
            raise

    def get_all_categories(self) -> List[dict]:
        """获取所有分类"""
        with self._lock:
            data = self._read_data()
            return data.get("categories", [])

    def get_category_by_id(self, category_id: str) -> Optional[dict]:
        """根据ID获取分类"""
        categories = self.get_all_categories()
        for cat in categories:
            if cat.get("id") == category_id:
                return cat
        return None

    def get_children(self, parent_id: Optional[str]) -> List[dict]:
        """获取指定分类的子分类"""
        categories = self.get_all_categories()
        children = [c for c in categories if c.get("parentId") == parent_id]
        return sorted(children, key=lambda x: x.get("order", 0))

    def get_category_tree(self) -> List[dict]:
        """获取完整的分类树结构"""
        def build_tree(parent_id=None):
            children = self.get_children(parent_id)
            return [{
                **child,
                "children": build_tree(child["id"])
            } for child in children]

        return build_tree(None)

    def add_category(self, name: str, parent_id: str = "root", target_file: Optional[str] = None) -> dict:
        """添加分类"""
        import time

        # 检查name唯一性
        data = self._read_data()
        existing_names = {c.get("name") for c in data.get("categories", [])}
        if name in existing_names:
            raise ValueError(f"分类名称 '{name}' 已存在")

        # 获取当前最大order值
        siblings = [c for c in data["categories"] if c.get("parentId") == parent_id]
        max_order = max([c.get("order", 0) for c in siblings], default=-1)

        new_category = {
            "id": str(uuid.uuid4()),
            "name": name,
            "parentId": parent_id,
            "order": max_order + 1,
            "createdAt": int(time.time() * 1000),
            "metadata": {}
        }
        if target_file:
            new_category["_source_file"] = target_file

        with self._lock:
            data = self._read_data()
            data["categories"].append(new_category)
            self._write_data(data)
            return new_category

    def add_categories_batch(self, specs: List[dict], target_file: Optional[str] = None) -> List[dict]:
        """
        批量添加分类（一次读写）。
        :param specs: [{"name": str, "parentId": str|None, "order": int}, ...]
        :return: 创建的分类列表
        """
        import time as _time
        print(f"[CategoryStorage] 批量创建 {len(specs)} 个分类...")
        with self._lock:
            data = self._read_data()
            existing_names = {c.get("name") for c in data.get("categories", [])}
            created = []
            for spec in specs:
                name = spec.get("name", "")
                if not name:
                    continue
                final_name = name
                suffix = 2
                while final_name in existing_names:
                    final_name = f"{name} ({suffix})"
                    suffix += 1
                new_cat = {
                    "id": str(uuid.uuid4()),
                    "name": final_name,
                    "parentId": spec.get("parentId"),
                    "order": spec.get("order", 0),
                    "createdAt": int(_time.time() * 1000),
                    "metadata": {}
                }
                if target_file:
                    new_cat["_source_file"] = target_file
                data["categories"].append(new_cat)
                existing_names.add(final_name)
                created.append(new_cat)
            self._write_data(data)
            print(f"[CategoryStorage] 分类批量创建完成: {len(created)} 个")
            return created

    def update_category(self, category_id: str, **kwargs) -> bool:
        """更新分类信息"""
        with self._lock:
            data = self._read_data()

            # 检查name唯一性
            if "name" in kwargs:
                new_name = kwargs["name"]
                for cat in data["categories"]:
                    if cat.get("id") != category_id and cat.get("name") == new_name:
                        raise ValueError(f"分类名称 '{new_name}' 已存在")

            for cat in data["categories"]:
                if cat.get("id") == category_id:
                    for key, value in kwargs.items():
                        if key in ["name", "order", "parentId"]:
                            cat[key] = value
                        elif key == "metadata":
                            if not isinstance(cat.get("metadata"), dict):
                                cat["metadata"] = {}
                            cat["metadata"].update(value)
                    self._write_data(data)
                    return True
            return False

    def get_descendant_ids(self, category_id: str) -> List[str]:
        """获取指定分类及其所有后代的ID列表"""
        all_cats = self.get_all_categories()
        result = [category_id]

        def collect(parent_id):
            for cat in all_cats:
                if cat.get("parentId") == parent_id:
                    result.append(cat["id"])
                    collect(cat["id"])

        collect(category_id)
        return result

    def delete_category(self, category_id: str) -> bool:
        """删除分类"""
        with self._lock:
            data = self._read_data()

            if category_id == "root":
                raise ValueError("不能删除根分类")

            original_count = len(data["categories"])
            data["categories"] = [c for c in data["categories"] if c.get("id") != category_id]

            if len(data["categories"]) < original_count:
                self._write_data(data)
                return True
            return False

    def batch_delete(self, category_ids: List[str]) -> int:
        """
        批量删除分类（一次锁和一次写入）。
        :param category_ids: 要删除的分类 ID 列表
        :return: 实际删除数量
        """
        id_set = set(category_ids)
        if not id_set:
            return 0
        if "root" in id_set:
            raise ValueError("不能删除根分类")

        with self._lock:
            data = self._read_data()
            original_count = len(data["categories"])
            data["categories"] = [
                c for c in data["categories"]
                if c.get("id") not in id_set
            ]
            deleted = original_count - len(data["categories"])
            if deleted > 0:
                self._write_data(data)
            return deleted
