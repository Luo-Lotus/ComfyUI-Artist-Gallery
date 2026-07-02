import uuid
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from ._json_store import SplitJsonStorage


class PromptStorage(SplitJsonStorage):
    """Prompt数据存储管理"""

    item_key = "prompts"
    file_attr = "prompts_file"
    glob_pattern = "*.prompts.json"

    def __init__(self, storage_dir: Path):
        super().__init__(storage_dir)
        self.storage_dir = storage_dir
        self.prompts_file = storage_dir / "prompts.json"
        self._idx_by_key = None  # (categoryId, value) -> prompt
        self._idx_by_id = None   # id -> prompt
        self._idx_by_category = None  # categoryId -> [prompt, ...]
        self._ensure_storage_dir()

    def _ensure_storage_dir(self):
        """确保存储目录存在"""
        self.storage_dir.mkdir(parents=True, exist_ok=True)

        # 有分片文件时不创建主文件
        if not self.prompts_file.exists() and not self._has_split_files():
            self._write_data({"prompts": []})

    def _invalidate_cache(self):
        super()._invalidate_cache()
        self._idx_by_key = None
        self._idx_by_id = None
        self._idx_by_category = None

    def _build_indexes(self):
        """构建内存索引（懒加载，写入时失效）"""
        data = self._read_data()
        self._idx_by_key = {}
        self._idx_by_id = {}
        self._idx_by_category = {}
        for p in data.get("prompts", []):
            category_id = p.get("categoryId", "root")
            key = (category_id, p.get("value", ""))
            self._idx_by_key[key] = p
            self._idx_by_category.setdefault(category_id, []).append(p)
            if p.get("id"):
                self._idx_by_id[p["id"]] = p

    def get_all_prompts(self) -> List[dict]:
        """获取所有Prompt"""
        with self._lock:
            data = self._read_data()
            return data.get("prompts", [])

    def get_prompt_by_id(self, prompt_id: str) -> Optional[dict]:
        """根据 ID 获取Prompt（O(1) 索引查找）"""
        with self._lock:
            if self._idx_by_id is None:
                self._build_indexes()
            return self._idx_by_id.get(prompt_id)

    def get_prompt(self, category_id: str, value: str) -> Optional[dict]:
        """
        根据分类ID和值获取Prompt（组合键，O(1) 索引查找）
        :param category_id: 分类 ID
        :param value: Prompt值
        :return: Prompt对象或 None
        """
        with self._lock:
            if self._idx_by_key is None:
                self._build_indexes()
            return self._idx_by_key.get((category_id, value))

    def get_prompts_by_category(self, category_id: str) -> List[dict]:
        """获取指定分类下的Prompt（不包含子分类，O(1) 索引查找）"""
        with self._lock:
            if self._idx_by_category is None:
                self._build_indexes()
            return list(self._idx_by_category.get(category_id, []))

    def get_prompt_by_name(self, name: str) -> Optional[dict]:
        """
        根据值获取Prompt（返回第一个匹配的Prompt）
        注意：如果存在多个同值Prompt（不同分类），只返回第一个
        建议使用 get_prompt(category_id, value) 精确查询
        """
        prompts = self.get_all_prompts()
        for prompt in prompts:
            if prompt.get("value") == name:
                return prompt
        return None

    def get_prompt_by_value(self, value: str) -> Optional[dict]:
        """根据值获取Prompt（返回第一个匹配）"""
        return self.get_prompt_by_name(value)

    def add_prompt(self, value: str, name: Optional[str] = None, alias: str = "",
                   category_id: str = "root", target_file: Optional[str] = None) -> dict:
        """
        添加Prompt
        :param value: Prompt值（同一分类下唯一）
        :param name: 显示名称（可选，默认等于value）
        :param alias: 别名（逗号分隔）
        :param category_id: 所属分类ID（默认为root）
        :return: 新创建的Prompt对象
        :raises ValueError: 如果同一分类下 value 已存在
        """
        # 先检查同一分类下 value 是否已存在（不持有锁）
        data = self._read_data()
        existing_values_in_category = {
            a.get("value") for a in data.get("prompts", [])
            if a.get("categoryId") == category_id
        }
        if value in existing_values_in_category:
            raise ValueError(f"分类 '{category_id}' 下Prompt值 '{value}' 已存在")

        # 如果未提供 name，使用 value
        if not name:
            name = value

        new_prompt = {
            "value": value,
            "name": name,
            "alias": alias,
            "categoryId": category_id,
            "coverImageId": None,
            "createdAt": int(__import__('time').time() * 1000),
            "metadata": {
                "description": "",
                "tags": [],
                "customFields": {}
            }
        }
        if target_file:
            new_prompt["_source_file"] = target_file

        # 获取锁并写入
        with self._lock:
            data = self._read_data()
            data["prompts"].append(new_prompt)
            self._write_data(data)

            return new_prompt

    def add_prompts_batch(self, prompts_data: List[dict], category_id: str = "root",
                          target_file: Optional[str] = None) -> Tuple[List[dict], List[str]]:
        """
        批量添加Prompt
        :param prompts_data: Prompt数据列表，每个元素包含 {"value": str, "name": str(可选), "alias": str(可选)}
        :param category_id: 所属分类ID，默认为root
        :return: (成功添加的Prompt列表, 失败的值列表)
        """
        with self._lock:
            success_prompts = []
            failed_values = []

            data = self._read_data()
            existing_values = {a.get("value") for a in data["prompts"]}

            for prompt_data in prompts_data:
                value = prompt_data.get("value", "").strip()
                if not value:
                    failed_values.append(f"空值")
                    continue

                if value in existing_values:
                    failed_values.append(value)
                    continue

                name = prompt_data.get("name") or value
                alias = prompt_data.get("alias", "")

                new_prompt = {
                    "value": value,
                    "name": name,
                    "alias": alias,
                    "categoryId": category_id,
                    "coverImageId": None,
                    "createdAt": int(__import__('time').time() * 1000),
                }
                if target_file:
                    new_prompt["_source_file"] = target_file

                data["prompts"].append(new_prompt)
                success_prompts.append(new_prompt)
                existing_values.add(value)

            self._write_data(data)
            return success_prompts, failed_values

    def add_prompts_import(self, items: List[dict], target_file: Optional[str] = None) -> Tuple[List[dict], List[str]]:
        """
        导入批量添加Prompt（一次读写，支持不同categoryId）
        :param items: [{"value": str, "name": str, "alias": str, "categoryId": str}, ...]
        :param target_file: 分离存储目标文件
        :return: (成功列表, 失败值列表)
        """
        import time as _time
        print(f"[PromptStorage] 批量导入 {len(items)} 个 Prompt...")
        with self._lock:
            data = self._read_data()
            existing = {(a.get("value"), a.get("categoryId")) for a in data["prompts"]}
            success, failed = [], []
            for item in items:
                value = (item.get("value") or "").strip()
                cat_id = item.get("categoryId", "root")
                if not value:
                    failed.append("(空值)")
                    continue
                if (value, cat_id) in existing:
                    failed.append(value)
                    continue
                new_prompt = {
                    "value": value,
                    "name": item.get("name") or value,
                    "alias": item.get("alias", ""),
                    "categoryId": cat_id,
                    "coverImageId": None,
                    "createdAt": int(_time.time() * 1000),
                }
                if target_file:
                    new_prompt["_source_file"] = target_file
                data["prompts"].append(new_prompt)
                success.append(new_prompt)
                existing.add((value, cat_id))
            self._write_data(data)
            print(f"[PromptStorage] Prompt 导入完成: 成功={len(success)}, 跳过={len(failed)}")
            return success, failed

    def update_prompt(self, category_id: str, old_value: str, **kwargs) -> bool:
        """
        更新Prompt信息（使用组合键）
        :param category_id: 分类 ID
        :param old_value: Prompt值（旧值）
        :param kwargs: 要更新的字段（value, name, alias, categoryId, coverImageId 等）
        :return: 是否更新成功
        :raises ValueError: 如果新值与同分类下其他Prompt重复
        """
        with self._lock:
            data = self._read_data()

            # 查找目标Prompt
            target_prompt = None
            target_index = -1
            for i, prompt in enumerate(data["prompts"]):
                if prompt.get("categoryId") == category_id and prompt.get("value") == old_value:
                    target_prompt = prompt
                    target_index = i
                    break

            if not target_prompt:
                return False

            # 如果要更新 value，需要检查同分类下重复
            if "value" in kwargs:
                new_value = kwargs["value"]
                for i, prompt in enumerate(data["prompts"]):
                    if (i != target_index and
                        prompt.get("categoryId") == category_id and
                        prompt.get("value") == new_value):
                        raise ValueError(f"分类 '{category_id}' 下Prompt值 '{new_value}' 已存在")

            # 更新字段
            for key, val in kwargs.items():
                if key in ["value", "name", "alias", "categoryId", "coverImageId"]:
                    target_prompt[key] = val
                elif key == "metadata":
                    if not isinstance(target_prompt.get("metadata"), dict):
                        target_prompt["metadata"] = {}
                    target_prompt["metadata"].update(val)

            self._write_data(data)
            return True

    def batch_move(self, keys: list, new_category_id: str) -> List[dict]:
        """
        批量移动 Prompt 到目标分类（一次锁和一次写入）。
        :param keys: [(categoryId, value), ...]
        :return: 被移动的 Prompt 列表
        """
        if not keys:
            return []
        key_set = set(keys)
        moved = []
        with self._lock:
            data = self._read_data()
            for prompt in data["prompts"]:
                key = (prompt.get("categoryId", "root"), prompt.get("value", ""))
                if key in key_set:
                    prompt["categoryId"] = new_category_id
                    moved.append(prompt)
            if moved:
                self._write_data(data)
            return moved

    def set_cover_batch(self, updates_by_value: Dict[str, str]) -> int:
        """
        批量回填 coverImageId（一次锁 + 一次读写），供封面回填迁移使用。
        :param updates_by_value: {prompt_value: coverImagePath}
        :return: 实际更新的 prompt 数量

        线程安全：与其它写入串行化（同一 _lock）。只更新 coverImageId 为空的 prompt，
        按 value 匹配（跨分类），避免覆盖用户已设置的封面。
        注意：_lock 不可重入，本方法只使用裸 _read_data/_write_data，不得调用其它加锁方法。
        """
        if not updates_by_value:
            return 0
        with self._lock:
            data = self._read_data()
            changed = 0
            for prompt in data["prompts"]:
                if prompt.get("coverImageId"):
                    continue
                value = prompt.get("value")
                if not value:
                    continue
                cover = updates_by_value.get(value)
                if cover:
                    prompt["coverImageId"] = cover
                    changed += 1
            if changed:
                self._write_data(data)
            return changed

    def set_cover_batch_by_key(self, updates_by_key: Dict[tuple, str]) -> int:
        """
        批量回填 coverImageId（按 categoryId + value 精确匹配）。
        :param updates_by_key: {(categoryId, value): coverImagePath}
        :return: 实际更新的 prompt 数量
        """
        if not updates_by_key:
            return 0
        with self._lock:
            data = self._read_data()
            changed = 0
            for prompt in data["prompts"]:
                if prompt.get("coverImageId"):
                    continue
                key = (prompt.get("categoryId", "root"), prompt.get("value", ""))
                cover = updates_by_key.get(key)
                if cover:
                    prompt["coverImageId"] = cover
                    changed += 1
            if changed:
                self._write_data(data)
            return changed

    def update_prompt_by_id(self, prompt_id: str, **kwargs) -> bool:
        """
        更新Prompt信息（使用 ID，兼容旧版本）
        :param prompt_id: Prompt ID
        :param kwargs: 要更新的字段
        :return: 是否更新成功
        """
        with self._lock:
            data = self._read_data()

            # 如果要更新 value，需要检查重复
            if "value" in kwargs:
                new_value = kwargs["value"]
                for prompt in data["prompts"]:
                    if prompt.get("id") != prompt_id and prompt.get("value") == new_value:
                        raise ValueError(f"Prompt值 '{new_value}' 已存在")

            for prompt in data["prompts"]:
                if prompt.get("id") == prompt_id:
                    for key, value in kwargs.items():
                        if key in ["value", "name", "alias", "categoryId", "coverImageId"]:
                            prompt[key] = value
                        elif key == "metadata":
                            if not isinstance(prompt.get("metadata"), dict):
                                prompt["metadata"] = {}
                            prompt["metadata"].update(value)
                    self._write_data(data)
                    return True
            return False

    def delete_prompt(self, category_id: str, value: str) -> bool:
        """
        删除Prompt（使用组合键）
        :param category_id: 分类 ID
        :param value: Prompt值
        :return: 是否删除成功
        """
        with self._lock:
            data = self._read_data()
            original_count = len(data["prompts"])
            data["prompts"] = [
                a for a in data["prompts"]
                if not (a.get("categoryId") == category_id and a.get("value") == value)
            ]

            if len(data["prompts"]) < original_count:
                self._write_data(data)
                return True
            return False

    def batch_delete_prompts(self, keys: list) -> int:
        """
        批量删除多个 Prompt（一次锁完成）
        :param keys: [(categoryId, value), ...] 列表
        :return: 删除数量
        """
        if not keys:
            return 0
        key_set = set(keys)
        with self._lock:
            data = self._read_data()
            original_count = len(data["prompts"])
            data["prompts"] = [
                a for a in data["prompts"]
                if (a.get("categoryId", "root"), a.get("value", "")) not in key_set
            ]
            deleted = original_count - len(data["prompts"])
            if deleted > 0:
                self._write_data(data)
            return deleted

    def update_image_count(self, category_id: str, value: str, delta: int = 1):
        """
        更新Prompt的图片数量（使用组合键）
        :param category_id: 分类 ID
        :param value: Prompt值
        :param delta: 增量（正数增加，负数减少）
        """
        return None

    def update_image_count_batch(self, deltas: dict):
        """
        批量更新图片计数（一次读写完成所有更新）
        :param deltas: {(categoryId, value): delta} 字典
        """
        return None

    def update_image_count_by_id(self, prompt_id: str, delta: int = 1):
        """
        更新Prompt的图片数量（使用 ID，兼容旧版本）
        :param prompt_id: Prompt ID
        :param delta: 增量（正数增加，负数减少）
        """
        return None
