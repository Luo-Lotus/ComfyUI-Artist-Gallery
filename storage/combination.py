import json
import uuid
import time
from pathlib import Path
from typing import Dict, List, Optional
import threading


class CombinationStorage:
    """组合数据存储管理"""

    def __init__(self, storage_dir: Path):
        self.storage_dir = storage_dir
        self.combinations_file = storage_dir / "combinations.json"
        self._lock = threading.Lock()
        self._cache = None
        self._ensure_storage_dir()

    def _ensure_storage_dir(self):
        """确保存储目录存在并初始化"""
        self.storage_dir.mkdir(parents=True, exist_ok=True)

        if not self.combinations_file.exists():
            self._write_data({"combinations": []})

    def _read_data(self) -> dict:
        """读取数据文件（带缓存）"""
        if self._cache is not None:
            return self._cache
        try:
            with open(self.combinations_file, 'r', encoding='utf-8') as f:
                self._cache = json.load(f)
            return self._cache
        except Exception as e:
            print(f"Error reading combinations file: {e}")
            self._cache = {"combinations": []}
            return self._cache

    def _write_data(self, data: dict):
        """写入数据文件（同时更新缓存）"""
        try:
            with open(self.combinations_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            self._cache = data
        except Exception as e:
            self._cache = None
            print(f"Error writing combinations file: {e}")
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

    def add_combination(self, name: str, category_id: str, artist_keys: List[str],
                        output_content: str = "") -> dict:
        """
        添加组合
        :param name: 组合名称
        :param category_id: 所属分类
        :param artist_keys: 成员画师名称列表（仅名称）
        :param output_content: 自定义输出内容，为空时自动生成为逗号连接
        """
        if not output_content:
            output_content = ",".join(artist_keys)

        new_combination = {
            "id": str(uuid.uuid4()),
            "name": name,
            "categoryId": category_id,
            "artistKeys": artist_keys,
            "outputContent": output_content,
            "createdAt": int(time.time() * 1000),
        }

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
                        if key in ("name", "artistKeys", "outputContent", "categoryId", "coverImageId"):
                            c[key] = value
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

    def remove_artist_from_all(self, artist_name: str) -> int:
        """
        从所有组合中移除指定画师名称
        :return: 受影响的组合数量
        """
        with self._lock:
            data = self._read_data()
            affected = 0

            for c in data["combinations"]:
                keys = c.get("artistKeys", [])
                if artist_name in keys:
                    keys.remove(artist_name)
                    c["artistKeys"] = keys
                    # 更新 outputContent（如果未自定义，重新生成）
                    if not c.get("outputContent") or c["outputContent"] == ",".join(keys + [artist_name]):
                        c["outputContent"] = ",".join(keys)
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
