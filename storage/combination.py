import uuid
import time
from pathlib import Path
from typing import List, Optional

from ._json_store import SplitJsonStorage


class CombinationStorage(SplitJsonStorage):
    """组合数据存储管理"""

    item_key = "combinations"
    file_attr = "combinations_file"
    glob_pattern = "*.combinations.json"

    def __init__(self, storage_dir: Path):
        super().__init__(storage_dir)
        self.storage_dir = storage_dir
        self.combinations_file = storage_dir / "combinations.json"
        self._idx_by_id = None
        self._idx_by_category = None
        self._ensure_storage_dir()

    def _ensure_storage_dir(self):
        """确保存储目录存在并初始化"""
        self.storage_dir.mkdir(parents=True, exist_ok=True)

        if not self.combinations_file.exists() and not self._has_split_files():
            self._write_data({"combinations": []})

    def _invalidate_cache(self):
        super()._invalidate_cache()
        self._idx_by_id = None
        self._idx_by_category = None

    def _build_indexes(self):
        data = self._read_data()
        self._idx_by_id = {}
        self._idx_by_category = {}
        for combination in data.get("combinations", []):
            if combination.get("id"):
                self._idx_by_id[combination.get("id")] = combination
            self._idx_by_category.setdefault(combination.get("categoryId", "root"), []).append(combination)

    def get_all_combinations(self) -> List[dict]:
        """获取所有组合"""
        with self._lock:
            data = self._read_data()
            return data.get("combinations", [])

    def get_combinations_by_category(self, category_id: str) -> List[dict]:
        """获取指定分类下的组合"""
        with self._lock:
            if self._idx_by_category is None:
                self._build_indexes()
            return list(self._idx_by_category.get(category_id, []))

    def get_combination_by_id(self, combination_id: str) -> Optional[dict]:
        """根据ID获取组合"""
        with self._lock:
            if self._idx_by_id is None:
                self._build_indexes()
            return self._idx_by_id.get(combination_id)

    def add_combination(self, name: str, category_id: str, prompts: List[str],
                        output_content: str = "", target_file: Optional[str] = None) -> dict:
        """
        添加组合
        :param name: 组合名称
        :param category_id: 所属分类
        :param prompts: 成员Prompt值列表
        :param output_content: 自定义输出内容，为空时自动生成为逗号连接
        """
        if not output_content:
            output_content = ",".join(prompts)

        new_combination = {
            "id": str(uuid.uuid4()),
            "name": name,
            "categoryId": category_id,
            "prompts": prompts,
            "outputContent": output_content,
            "createdAt": int(time.time() * 1000),
            "metadata": {},
        }
        if target_file:
            new_combination["_source_file"] = target_file

        with self._lock:
            data = self._read_data()
            data["combinations"].append(new_combination)
            self._write_data(data)
            return new_combination

    def update_combination(self, combination_id: str, **kwargs) -> Optional[dict]:
        """更新组合信息"""
        with self._lock:
            data = self._read_data()

            for c in data["combinations"]:
                if c.get("id") == combination_id:
                    for key, value in kwargs.items():
                        if key in ("name", "prompts", "outputContent", "categoryId", "coverImageId"):
                            c[key] = value
                        elif key == "metadata":
                            if not isinstance(c.get("metadata"), dict):
                                c["metadata"] = {}
                            c["metadata"].update(value)
                    self._write_data(data)
                    return c
            return None

    def set_cover_batch(self, updates_by_id: dict) -> int:
        """
        批量回填组合 coverImageId（按组合 ID 精确匹配）。
        只更新当前没有封面的组合，避免覆盖用户手动设置。
        """
        if not updates_by_id:
            return 0
        with self._lock:
            data = self._read_data()
            changed = 0
            for combination in data["combinations"]:
                if combination.get("coverImageId"):
                    continue
                cover = updates_by_id.get(combination.get("id"))
                if cover:
                    combination["coverImageId"] = cover
                    changed += 1
            if changed:
                self._write_data(data)
            return changed

    def delete_combination(self, combination_id: str) -> bool:
        """删除组合"""
        with self._lock:
            data = self._read_data()
            original_count = len(data["combinations"])
            data["combinations"] = [
                c for c in data["combinations"] if c.get("id") != combination_id
            ]

            if len(data["combinations"]) < original_count:
                self._write_data(data)
                return True
            return False

    def move_combination(self, combination_id: str, new_category_id: str) -> bool:
        """移动组合到新分类"""
        result = self.update_combination(combination_id, categoryId=new_category_id)
        return result is not None

    def batch_move(self, combination_ids: List[str], new_category_id: str) -> List[dict]:
        """批量移动组合到新分类（一次锁和一次写入）"""
        if not combination_ids:
            return []
        id_set = set(combination_ids)
        moved = []
        with self._lock:
            data = self._read_data()
            for combination in data["combinations"]:
                if combination.get("id") in id_set:
                    combination["categoryId"] = new_category_id
                    moved.append(combination)
            if moved:
                self._write_data(data)
            return moved

    def find_by_content(self, output_content: str) -> Optional[dict]:
        """按输出内容查找组合（用于查重）"""
        combinations = self.get_all_combinations()
        for c in combinations:
            if c.get("outputContent") == output_content:
                return c
        return None

    def remove_prompt_from_all(self, prompt_value: str) -> int:
        """
        从所有组合中移除指定Prompt值
        :return: 受影响的组合数量
        """
        with self._lock:
            data = self._read_data()
            affected = 0

            for c in data["combinations"]:
                keys = c.get("prompts", [])
                if prompt_value in keys:
                    keys.remove(prompt_value)
                    c["prompts"] = keys
                    # 更新 outputContent（如果未自定义，重新生成）
                    if not c.get("outputContent") or c["outputContent"] == ",".join(keys + [prompt_value]):
                        c["outputContent"] = ",".join(keys)
                    affected += 1

            if affected > 0:
                self._write_data(data)
            return affected

    def batch_remove_prompts_from_all(self, prompt_values: List[str]) -> int:
        """批量从所有组合中移除多个 Prompt 值（一次锁完成）"""
        if not prompt_values:
            return 0
        prompt_set = set(prompt_values)
        with self._lock:
            data = self._read_data()
            affected = 0
            for c in data["combinations"]:
                keys = c.get("prompts", [])
                matched = prompt_set & set(keys)
                if matched:
                    remaining = [p for p in keys if p not in prompt_set]
                    old_content = c.get("outputContent", "")
                    # 如果 outputContent 是自动生成的（等于旧 prompts 逗号拼接），则重新生成
                    if not old_content or old_content == ",".join(keys):
                        c["outputContent"] = ",".join(remaining)
                    c["prompts"] = remaining
                    affected += 1
            if affected > 0:
                self._write_data(data)
            return affected

    def batch_delete(self, combination_ids: List[str]) -> int:
        """批量删除组合"""
        with self._lock:
            data = self._read_data()
            id_set = set(combination_ids)
            original_count = len(data["combinations"])
            data["combinations"] = [
                c for c in data["combinations"] if c.get("id") not in id_set
            ]
            deleted = original_count - len(data["combinations"])
            if deleted > 0:
                self._write_data(data)
            return deleted
