import json
import uuid
import time
from pathlib import Path
from typing import Dict, List, Optional
import threading

from ._config import get_disabled_files


class CombinationStorage:
    """组合数据存储管理"""

    def __init__(self, storage_dir: Path):
        self.storage_dir = storage_dir
        self.combinations_file = storage_dir / "combinations.json"
        self._glob_pattern = "*.combinations.json"
        self._lock = threading.Lock()
        self._cache = None
        self._ensure_storage_dir()

    def _ensure_storage_dir(self):
        """确保存储目录存在并初始化"""
        self.storage_dir.mkdir(parents=True, exist_ok=True)

        if not self.combinations_file.exists():
            split_files = [f for f in self.storage_dir.glob(self._glob_pattern)
                           if f.resolve() != self.combinations_file.resolve()]
            if not split_files:
                self._write_data({"combinations": []})

    def _glob_source_files(self) -> list:
        """查找所有源文件：主文件 + glob 匹配的分片文件（排除已禁用）"""
        disabled = get_disabled_files(self.storage_dir)
        sources = []
        if self.combinations_file.exists():
            sources.append(self.combinations_file)
        for f in sorted(self.storage_dir.glob(self._glob_pattern)):
            if f.resolve() != self.combinations_file.resolve():
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
                for item in file_data.get("combinations", []):
                    item["_source_file"] = str(source_file)
                    merged_items.append(item)
            except Exception as e:
                print(f"Error reading {source_file.name}: {e}")
        self._cache = {"combinations": merged_items}
        return self._cache

    def _write_data(self, data: dict):
        """按来源文件分组回写，新数据写入主文件"""
        try:
            groups: Dict[str, list] = {}
            for item in data.get("combinations", []):
                source = item.pop("_source_file", None) or str(self.combinations_file)
                groups.setdefault(source, []).append(item)

            main_key = str(self.combinations_file)
            if main_key not in groups and len(groups) > 0:
                groups[main_key] = []

            for file_path_str, items in groups.items():
                file_path = Path(file_path_str)
                file_path.parent.mkdir(parents=True, exist_ok=True)
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump({"combinations": items}, f, ensure_ascii=False, indent=2)

            self._cache = None
        except Exception as e:
            self._cache = None
            print(f"Error writing combinations files: {e}")
            raise

    def get_all_combinations(self) -> List[dict]:
        """获取所有组合"""
        with self._lock:
            data = self._read_data()
            return data.get("combinations", [])

    def get_combinations_by_category(self, category_id: str) -> List[dict]:
        """获取指定分类下的组合"""
        combinations = self.get_all_combinations()
        return [c for c in combinations if c.get("categoryId") == category_id]

    def get_combination_by_id(self, combination_id: str) -> Optional[dict]:
        """根据ID获取组合"""
        combinations = self.get_all_combinations()
        for c in combinations:
            if c.get("id") == combination_id:
                return c
        return None

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

    def duplicate_combination(self, combination_id: str, new_name: str = None) -> Optional[dict]:
        """复制组合（独立副本）"""
        with self._lock:
            data = self._read_data()

            source = None
            for c in data["combinations"]:
                if c.get("id") == combination_id:
                    source = c
                    break

            if not source:
                return None

            new_combination = {
                **source,
                "id": str(uuid.uuid4()),
                "name": new_name or f"{source['name']} (副本)",
                "createdAt": int(time.time() * 1000),
            }

            data["combinations"].append(new_combination)
            self._write_data(data)
            return new_combination

    def move_combination(self, combination_id: str, new_category_id: str) -> bool:
        """移动组合到新分类"""
        result = self.update_combination(combination_id, categoryId=new_category_id)
        return result is not None

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
