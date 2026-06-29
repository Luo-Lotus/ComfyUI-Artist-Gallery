import uuid
from pathlib import Path
from typing import List, Optional

from ._json_store import SplitJsonStorage


class CategoryStorage(SplitJsonStorage):
    """分类数据存储管理"""

    item_key = "categories"
    file_attr = "categories_file"
    glob_pattern = "*.categories.json"

    def __init__(self, storage_dir: Path):
        super().__init__(storage_dir)
        self.storage_dir = storage_dir
        self.categories_file = storage_dir / "categories.json"
        self._idx_by_id = None
        self._idx_by_parent = None
        self._ensure_storage_dir()

    def _ensure_storage_dir(self):
        """确保存储目录存在并初始化"""
        self.storage_dir.mkdir(parents=True, exist_ok=True)

        if not self.categories_file.exists() and not self._has_split_files():
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

    def _invalidate_cache(self):
        super()._invalidate_cache()
        self._idx_by_id = None
        self._idx_by_parent = None

    def _build_indexes(self):
        data = self._read_data()
        self._idx_by_id = {}
        self._idx_by_parent = {}
        for cat in data.get("categories", []):
            self._idx_by_id[cat.get("id")] = cat
            self._idx_by_parent.setdefault(cat.get("parentId"), []).append(cat)
        for children in self._idx_by_parent.values():
            children.sort(key=lambda x: x.get("order", 0))

    def get_all_categories(self) -> List[dict]:
        """获取所有分类"""
        with self._lock:
            data = self._read_data()
            return data.get("categories", [])

    def get_category_by_id(self, category_id: str) -> Optional[dict]:
        """根据ID获取分类"""
        with self._lock:
            if self._idx_by_id is None:
                self._build_indexes()
            return self._idx_by_id.get(category_id)

    def get_children(self, parent_id: Optional[str]) -> List[dict]:
        """获取指定分类的子分类"""
        with self._lock:
            if self._idx_by_parent is None:
                self._build_indexes()
            return list(self._idx_by_parent.get(parent_id, []))

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

    def batch_move(self, moves: List[dict]) -> List[dict]:
        """
        批量移动分类（一次锁和一次写入）。
        :param moves: [{"id": str, "parentId": str|None}, ...]
        :return: 被移动的分类列表
        """
        if not moves:
            return []
        parent_by_id = {m.get("id"): m.get("parentId") for m in moves if m.get("id")}
        moved = []
        with self._lock:
            data = self._read_data()
            for cat in data["categories"]:
                cat_id = cat.get("id")
                if cat_id in parent_by_id:
                    cat["parentId"] = parent_by_id[cat_id]
                    moved.append(cat)
            if moved:
                self._write_data(data)
            return moved

    def get_descendant_ids(self, category_id: str) -> List[str]:
        """获取指定分类及其所有后代的ID列表"""
        result = [category_id]

        def collect(parent_id):
            for cat in self.get_children(parent_id):
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
