import json
import uuid
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import threading


class ArtistStorage:
    """画师数据存储管理"""

    def __init__(self, storage_dir: Path):
        self.storage_dir = storage_dir
        self.artists_file = storage_dir / "artists.json"
        self._lock = threading.Lock()
        self._cache = None
        self._ensure_storage_dir()

    def _ensure_storage_dir(self):
        """确保存储目录存在"""
        self.storage_dir.mkdir(parents=True, exist_ok=True)

        # 初始化 artists.json
        if not self.artists_file.exists():
            self._write_data({"artists": []})

    def _read_data(self) -> dict:
        """读取数据文件（带缓存）"""
        if self._cache is not None:
            return self._cache
        try:
            with open(self.artists_file, 'r', encoding='utf-8') as f:
                self._cache = json.load(f)
            return self._cache
        except Exception as e:
            print(f"Error reading artists file: {e}")
            self._cache = {"artists": []}
            return self._cache

    def _write_data(self, data: dict):
        """写入数据文件（同时更新缓存）"""
        try:
            with open(self.artists_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            self._cache = data
        except Exception as e:
            self._cache = None  # 写入失败，清除缓存
            print(f"Error writing artists file: {e}")
            raise

    def get_all_artists(self) -> List[dict]:
        """获取所有画师"""
        with self._lock:
            data = self._read_data()
            return data.get("artists", [])

    def get_artist_by_id(self, artist_id: str) -> Optional[dict]:
        """根据 ID 获取画师（兼容旧版本，建议使用 get_artist）"""
        artists = self.get_all_artists()
        for artist in artists:
            if artist.get("id") == artist_id:
                return artist
        return None

    def get_artist(self, category_id: str, name: str) -> Optional[dict]:
        """
        根据分类ID和名称获取画师（组合键）
        :param category_id: 分类 ID
        :param name: 画师名称
        :return: 画师对象或 None
        """
        artists = self.get_all_artists()
        for artist in artists:
            if artist.get("categoryId") == category_id and artist.get("name") == name:
                return artist
        return None

    def get_artist_by_name(self, name: str) -> Optional[dict]:
        """
        根据名称获取画师（返回第一个匹配的画师）
        注意：如果存在多个同名画师（不同分类），只返回第一个
        建议使用 get_artist(category_id, name) 精确查询
        """
        artists = self.get_all_artists()
        for artist in artists:
            if artist.get("name") == name:
                return artist
        return None

    def add_artist(self, name: str, display_name: Optional[str] = None, category_id: str = "root") -> dict:
        """
        添加画师
        :param name: 画师名称（同一分类下唯一）
        :param display_name: 显示名称（可选）
        :param category_id: 所属分类ID（默认为root）
        :return: 新创建的画师对象
        :raises ValueError: 如果同一分类下 name 已存在
        """
        # 先检查同一分类下 name 是否已存在（不持有锁）
        data = self._read_data()
        existing_names_in_category = {
            a.get("name") for a in data.get("artists", [])
            if a.get("categoryId") == category_id
        }
        if name in existing_names_in_category:
            raise ValueError(f"分类 '{category_id}' 下画师名称 '{name}' 已存在")

        # 如果未提供 display_name，使用 name
        if not display_name:
            display_name = name

        new_artist = {
            "name": name,
            "displayName": display_name,
            "categoryId": category_id,
            "coverImageId": None,
            "createdAt": int(__import__('time').time() * 1000),
            "imageCount": 0,
            "metadata": {
                "description": "",
                "tags": [],
                "customFields": {}
            }
        }

        # 获取锁并写入
        with self._lock:
            data = self._read_data()
            data["artists"].append(new_artist)
            self._write_data(data)

            return new_artist

    def add_artists_batch(self, artists_data: List[dict], category_id: str = "root") -> Tuple[List[dict], List[str]]:
        """
        批量添加画师
        :param artists_data: 画师数据列表，每个元素包含 {"name": str, "displayName": str(可选)}
        :param category_id: 所属分类ID，默认为root
        :return: (成功添加的画师列表, 失败的名称列表)
        """
        with self._lock:
            success_artists = []
            failed_names = []

            data = self._read_data()
            existing_names = {a.get("name") for a in data["artists"]}

            for artist_data in artists_data:
                name = artist_data.get("name", "").strip()
                if not name:
                    failed_names.append(f"空名称")
                    continue

                if name in existing_names:
                    failed_names.append(name)
                    continue

                display_name = artist_data.get("displayName") or name

                new_artist = {
                    "id": str(uuid.uuid4()),
                    "name": name,
                    "displayName": display_name,
                    "categoryId": category_id,
                    "coverImageId": None,
                    "createdAt": int(__import__('time').time() * 1000),
                    "imageCount": 0
                }

                data["artists"].append(new_artist)
                success_artists.append(new_artist)
                existing_names.add(name)

            self._write_data(data)
            return success_artists, failed_names

    def update_artist(self, category_id: str, old_name: str, **kwargs) -> bool:
        """
        更新画师信息（使用组合键）
        :param category_id: 分类 ID
        :param name: 画师名称
        :param kwargs: 要更新的字段（displayName, imageCount, categoryId, coverImageId 等）
        :return: 是否更新成功
        :raises ValueError: 如果新名称与同分类下其他画师重名
        """
        with self._lock:
            data = self._read_data()

            # 查找目标画师
            target_artist = None
            target_index = -1
            for i, artist in enumerate(data["artists"]):
                if artist.get("categoryId") == category_id and artist.get("name") == old_name:
                    target_artist = artist
                    target_index = i
                    break

            if not target_artist:
                return False

            # 如果要更新 name，需要检查同分类下重名
            if "name" in kwargs:
                new_name = kwargs["name"]
                for i, artist in enumerate(data["artists"]):
                    if (i != target_index and
                        artist.get("categoryId") == category_id and
                        artist.get("name") == new_name):
                        raise ValueError(f"分类 '{category_id}' 下画师名称 '{new_name}' 已存在")

            # 更新字段
            for key, value in kwargs.items():
                if key in ["name", "displayName", "imageCount", "categoryId", "coverImageId"]:
                    target_artist[key] = value

            self._write_data(data)
            return True

    def update_artist_by_id(self, artist_id: str, **kwargs) -> bool:
        """
        更新画师信息（使用 ID，兼容旧版本）
        :param artist_id: 画师 ID
        :param kwargs: 要更新的字段
        :return: 是否更新成功
        """
        with self._lock:
            data = self._read_data()

            # 如果要更新 name，需要检查重名
            if "name" in kwargs:
                new_name = kwargs["name"]
                for artist in data["artists"]:
                    if artist.get("id") != artist_id and artist.get("name") == new_name:
                        raise ValueError(f"画师名称 '{new_name}' 已存在")

            for artist in data["artists"]:
                if artist.get("id") == artist_id:
                    for key, value in kwargs.items():
                        if key in ["name", "displayName", "imageCount", "categoryId", "coverImageId"]:
                            artist[key] = value
                    self._write_data(data)
                    return True
            return False

    def delete_artist(self, category_id: str, name: str) -> bool:
        """
        删除画师（使用组合键）
        :param category_id: 分类 ID
        :param name: 画师名称
        :return: 是否删除成功
        """
        with self._lock:
            data = self._read_data()
            original_count = len(data["artists"])
            data["artists"] = [
                a for a in data["artists"]
                if not (a.get("categoryId") == category_id and a.get("name") == name)
            ]

            if len(data["artists"]) < original_count:
                self._write_data(data)
                return True
            return False

    def delete_artist_by_id(self, artist_id: str) -> bool:
        """
        删除画师（使用 ID，兼容旧版本）
        :param artist_id: 画师 ID
        :return: 是否删除成功
        """
        with self._lock:
            data = self._read_data()
            original_count = len(data["artists"])
            data["artists"] = [a for a in data["artists"] if a.get("id") != artist_id]

            if len(data["artists"]) < original_count:
                self._write_data(data)
                return True
            return False

    def update_image_count(self, category_id: str, name: str, delta: int = 1):
        """
        更新画师的图片数量（使用组合键）
        :param category_id: 分类 ID
        :param name: 画师名称
        :param delta: 增量（正数增加，负数减少）
        """
        with self._lock:
            data = self._read_data()
            for artist in data["artists"]:
                if artist.get("categoryId") == category_id and artist.get("name") == name:
                    current_count = artist.get("imageCount", 0)
                    artist["imageCount"] = max(0, current_count + delta)
                    self._write_data(data)
                    return

    def update_image_count_by_id(self, artist_id: str, delta: int = 1):
        """
        更新画师的图片数量（使用 ID，兼容旧版本）
        :param artist_id: 画师 ID
        :param delta: 增量（正数增加，负数减少）
        """
        with self._lock:
            data = self._read_data()
            for artist in data["artists"]:
                if artist.get("id") == artist_id:
                    current_count = artist.get("imageCount", 0)
                    artist["imageCount"] = max(0, current_count + delta)
                    self._write_data(data)
                    return
