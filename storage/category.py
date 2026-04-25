import json
import uuid
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import threading


class CategoryStorage:
    """分类数据存储管理"""

    def __init__(self, storage_dir: Path):
        self.storage_dir = storage_dir
        self.categories_file = storage_dir / "categories.json"
        self._lock = threading.Lock()
        self._cache = None
        self._ensure_storage_dir()

    def _ensure_storage_dir(self):
        """确保存储目录存在并初始化"""
        self.storage_dir.mkdir(parents=True, exist_ok=True)

        if not self.categories_file.exists():
            # 创建默认根分类
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

    def _read_data(self) -> dict:
        """读取数据文件（带缓存）"""
        if self._cache is not None:
            return self._cache
        try:
            with open(self.categories_file, 'r', encoding='utf-8') as f:
                self._cache = json.load(f)
            return self._cache
        except Exception as e:
            print(f"Error reading categories file: {e}")
            self._cache = {"categories": []}
            return self._cache

    def _write_data(self, data: dict):
        """写入数据文件（同时更新缓存）"""
        try:
            with open(self.categories_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            self._cache = data
        except Exception as e:
            self._cache = None
            print(f"Error writing categories file: {e}")
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

    def add_category(self, name: str, parent_id: str = "root") -> dict:
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
            "createdAt": int(time.time() * 1000)
        }

        with self._lock:
            data = self._read_data()
            data["categories"].append(new_category)
            self._write_data(data)
            return new_category

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
        """删除分类（需先删除子分类）"""
        with self._lock:
            data = self._read_data()

            # 不允许删除根分类 - 直接在已读取的数据中查找
            if category_id == "root":
                raise ValueError("不能删除根分类")

            # 检查是否有子分类
            has_children = any(c.get("parentId") == category_id for c in data["categories"])
            if has_children:
                raise ValueError("请先删除子分类")

            original_count = len(data["categories"])
            data["categories"] = [c for c in data["categories"] if c.get("id") != category_id]

            if len(data["categories"]) < original_count:
                self._write_data(data)
                return True
            return False
