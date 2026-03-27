"""
Artist Gallery Storage
管理画师数据和图片-画师映射关系
"""
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
        self._ensure_storage_dir()

    def _ensure_storage_dir(self):
        """确保存储目录存在"""
        self.storage_dir.mkdir(parents=True, exist_ok=True)

        # 初始化 artists.json
        if not self.artists_file.exists():
            self._write_data({"artists": []})

    def _read_data(self) -> dict:
        """读取数据文件"""
        try:
            with open(self.artists_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error reading artists file: {e}")
            return {"artists": []}

    def _write_data(self, data: dict):
        """写入数据文件"""
        try:
            with open(self.artists_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Error writing artists file: {e}")
            raise

    def get_all_artists(self) -> List[dict]:
        """获取所有画师"""
        with self._lock:
            data = self._read_data()
            return data.get("artists", [])

    def get_artist_by_id(self, artist_id: str) -> Optional[dict]:
        """根据 ID 获取画师"""
        artists = self.get_all_artists()
        for artist in artists:
            if artist.get("id") == artist_id:
                return artist
        return None

    def get_artist_by_name(self, name: str) -> Optional[dict]:
        """根据 name 获取画师"""
        artists = self.get_all_artists()
        for artist in artists:
            if artist.get("name") == name:
                return artist
        return None

    def add_artist(self, name: str, display_name: Optional[str] = None) -> dict:
        """
        添加画师
        :param name: 唯一标识符（无@符号）
        :param display_name: 显示名称（可选）
        :return: 新创建的画师对象
        :raises ValueError: 如果 name 已存在
        """
        # 先检查 name 是否已存在（不持有锁）
        data = self._read_data()
        existing_names = {a.get("name") for a in data.get("artists", [])}
        if name in existing_names:
            raise ValueError(f"画师名称 '{name}' 已存在")

        # 如果未提供 display_name，使用 name
        if not display_name:
            display_name = name

        new_artist = {
            "id": str(uuid.uuid4()),
            "name": name,
            "displayName": display_name,
            "createdAt": int(__import__('time').time() * 1000),
            "imageCount": 0
        }

        # 获取锁并写入
        with self._lock:
            data = self._read_data()
            data["artists"].append(new_artist)
            self._write_data(data)

            return new_artist

    def add_artists_batch(self, artists_data: List[dict]) -> Tuple[List[dict], List[str]]:
        """
        批量添加画师
        :param artists_data: 画师数据列表，每个元素包含 {"name": str, "displayName": str(可选)}
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
                    "createdAt": int(__import__('time').time() * 1000),
                    "imageCount": 0
                }

                data["artists"].append(new_artist)
                success_artists.append(new_artist)
                existing_names.add(name)

            self._write_data(data)
            return success_artists, failed_names

    def update_artist(self, artist_id: str, **kwargs) -> bool:
        """
        更新画师信息
        :param artist_id: 画师 ID
        :param kwargs: 要更新的字段（name, displayName, imageCount 等）
        :return: 是否更新成功
        :raises ValueError: 如果新 name 与其他画师重名
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
                        if key in ["name", "displayName", "imageCount"]:
                            artist[key] = value
                    self._write_data(data)
                    return True
            return False

    def delete_artist(self, artist_id: str) -> bool:
        """
        删除画师
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

    def update_image_count(self, artist_id: str, delta: int = 1):
        """
        更新画师的图片数量
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


class ImageMappingStorage:
    """图片-画师映射关系管理"""

    def __init__(self, storage_dir: Path):
        self.storage_dir = storage_dir
        self.mappings_file = storage_dir / "image_artists.json"
        self._lock = threading.Lock()
        self._ensure_storage_dir()

    def _ensure_storage_dir(self):
        """确保存储目录存在"""
        self.storage_dir.mkdir(parents=True, exist_ok=True)

        # 初始化 image_artists.json
        if not self.mappings_file.exists():
            self._write_data({"mappings": []})

    def _read_data(self) -> dict:
        """读取数据文件"""
        try:
            with open(self.mappings_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error reading mappings file: {e}")
            return {"mappings": []}

    def _write_data(self, data: dict):
        """写入数据文件"""
        try:
            with open(self.mappings_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Error writing mappings file: {e}")
            raise

    def get_all_mappings(self) -> List[dict]:
        """获取所有映射关系"""
        with self._lock:
            data = self._read_data()
            return data.get("mappings", [])

    def add_mapping(self, image_path: str, artist_ids: List[str], metadata: Optional[dict] = None):
        """
        添加图片-画师映射
        :param image_path: 图片相对路径（如 "artist_gallery/1719123456789.png"）
        :param artist_ids: 关联的画师 ID 列表
        :param metadata: 图片元数据（宽高等）
        """
        import time

        with self._lock:
            mapping = {
                "imagePath": image_path,
                "artistIds": artist_ids,
                "savedAt": int(time.time() * 1000),
                "metadata": metadata or {}
            }

            data = self._read_data()
            data["mappings"].append(mapping)
            self._write_data(data)

            return mapping

    def get_mappings_by_artist(self, artist_id: str) -> List[dict]:
        """获取指定画师的所有图片映射"""
        mappings = self.get_all_mappings()
        return [
            m for m in mappings
            if artist_id in m.get("artistIds", [])
        ]

    def get_mappings_by_image(self, image_path: str) -> Optional[dict]:
        """根据图片路径获取映射"""
        mappings = self.get_all_mappings()
        for mapping in mappings:
            if mapping.get("imagePath") == image_path:
                return mapping
        return None

    def remove_artist_from_mappings(self, artist_id: str) -> List[str]:
        """
        从所有映射中移除指定画师
        :param artist_id: 画师 ID
        :return: 被完全移除的图片路径列表（没有其他画师关联的图片）
        """
        with self._lock:
            data = self._read_data()
            orphan_images = []

            # 过滤掉包含该画师的映射，或从映射中移除该画师
            new_mappings = []
            for mapping in data["mappings"]:
                artist_ids = mapping.get("artistIds", [])

                if artist_id in artist_ids:
                    # 移除该画师
                    artist_ids.remove(artist_id)

                    if artist_ids:
                        # 还有其他画师，保留映射
                        mapping["artistIds"] = artist_ids
                        new_mappings.append(mapping)
                    else:
                        # 没有其他画师，记录为孤儿图片
                        orphan_images.append(mapping.get("imagePath"))
                else:
                    new_mappings.append(mapping)

            data["mappings"] = new_mappings
            self._write_data(data)

            return orphan_images

    def delete_mapping_by_image(self, image_path: str) -> bool:
        """根据图片路径删除映射"""
        with self._lock:
            data = self._read_data()
            original_count = len(data["mappings"])
            data["mappings"] = [
                m for m in data["mappings"]
                if m.get("imagePath") != image_path
            ]

            if len(data["mappings"]) < original_count:
                self._write_data(data)
                return True
            return False


def get_storage() -> Tuple[ArtistStorage, ImageMappingStorage]:
    """获取存储实例"""
    # 获取插件根目录
    current_dir = Path(__file__).parent
    storage_dir = current_dir

    artist_storage = ArtistStorage(storage_dir)
    mapping_storage = ImageMappingStorage(storage_dir)

    return artist_storage, mapping_storage
