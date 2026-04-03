import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import threading


class ImageMappingStorage:
    """图片-画师映射关系管理"""

    def __init__(self, storage_dir: Path):
        self.storage_dir = storage_dir
        self.mappings_file = storage_dir / "image_artists.json"
        self._lock = threading.Lock()
        self._cache = None
        self._ensure_storage_dir()

    def _ensure_storage_dir(self):
        """确保存储目录存在"""
        self.storage_dir.mkdir(parents=True, exist_ok=True)

        # 初始化 image_artists.json
        if not self.mappings_file.exists():
            self._write_data({"mappings": []})

    def _read_data(self) -> dict:
        """读取数据文件（带缓存）"""
        if self._cache is not None:
            return self._cache
        try:
            with open(self.mappings_file, 'r', encoding='utf-8') as f:
                self._cache = json.load(f)
            return self._cache
        except Exception as e:
            print(f"Error reading mappings file: {e}")
            self._cache = {"mappings": []}
            return self._cache

    def _write_data(self, data: dict):
        """写入数据文件（同时更新缓存）"""
        try:
            with open(self.mappings_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            self._cache = data
        except Exception as e:
            self._cache = None
            print(f"Error writing mappings file: {e}")
            raise

    def get_all_mappings(self) -> List[dict]:
        """获取所有映射关系"""
        with self._lock:
            data = self._read_data()
            return data.get("mappings", [])

    def add_mapping(self, image_path: str, artist_names: List[str], metadata: Optional[dict] = None):
        """
        添加图片-画师映射
        :param image_path: 图片相对路径（如 "artist_gallery/1719123456789.png"）
        :param artist_names: 关联的画师名称列表
        :param metadata: 图片元数据（宽高等）
        """
        import time

        with self._lock:
            mapping = {
                "imagePath": image_path,
                "artistNames": artist_names,
                "savedAt": int(time.time() * 1000),
                "metadata": metadata or {}
            }

            data = self._read_data()
            data["mappings"].append(mapping)
            self._write_data(data)

            return mapping

    def get_mappings_by_artist(self, artist_name: str) -> List[dict]:
        """
        获取指定画师的所有图片映射（使用画师名称）
        :param artist_name: 画师名称
        :return: 图片映射列表
        """
        mappings = self.get_all_mappings()
        return [
            m for m in mappings
            if artist_name in m.get("artistNames", [])
        ]

    def get_first_mapping_by_artist(self, artist_name: str) -> Optional[dict]:
        """获取画师的第一张图片映射（用于封面图）"""
        with self._lock:
            data = self._read_data()
            for m in data.get("mappings", []):
                if artist_name in m.get("artistNames", []):
                    return m
            return None

    def get_mappings_by_artist_id(self, artist_id: str) -> List[dict]:
        """
        获取指定画师的所有图片映射（使用 ID，兼容旧版本）
        注意：此方法仅用于迁移期间的兼容性
        """
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

    def remove_artist_from_mappings(self, artist_name: str) -> List[str]:
        """
        从所有映射中移除指定画师（使用画师名称）
        :param artist_name: 画师名称
        :return: 被完全移除的图片路径列表（没有其他画师关联的图片）
        """
        with self._lock:
            data = self._read_data()
            orphan_images = []

            # 过滤掉包含该画师的映射，或从映射中移除该画师
            new_mappings = []
            for mapping in data["mappings"]:
                artist_names = mapping.get("artistNames", [])

                if artist_name in artist_names:
                    # 移除该画师
                    artist_names.remove(artist_name)

                    if artist_names:
                        # 还有其他画师，保留映射
                        mapping["artistNames"] = artist_names
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

    def update_mapping(self, image_path: str, artist_names: List[str], metadata: Optional[dict] = None) -> bool:
        """
        更新图片映射的画师列表
        :param image_path: 图片路径
        :param artist_names: 新的画师名称列表
        :param metadata: 可选的元数据更新
        :return: 是否更新成功
        """
        with self._lock:
            data = self._read_data()

            # 查找并更新映射
            for mapping in data["mappings"]:
                if mapping.get("imagePath") == image_path:
                    mapping["artistNames"] = artist_names
                    if metadata is not None:
                        mapping["metadata"] = {**mapping.get("metadata", {}), **metadata}
                    self._write_data(data)
                    return True

            return False

    def rename_artist_in_mappings(self, old_name: str, new_name: str) -> int:
        """
        在所有映射中重命名画师
        :param old_name: 旧名称
        :param new_name: 新名称
        :return: 更新的映射数量
        """
        with self._lock:
            data = self._read_data()
            updated_count = 0

            for mapping in data["mappings"]:
                artist_names = mapping.get("artistNames", [])
                if old_name in artist_names:
                    # 替换画师名称
                    new_artist_names = [new_name if name == old_name else name for name in artist_names]
                    mapping["artistNames"] = new_artist_names
                    updated_count += 1

            if updated_count > 0:
                self._write_data(data)

            return updated_count

    def get_all_mappings_for_artist(self, artist_name: str) -> List[dict]:
        """
        获取指定画师的所有映射（用于重命名时显示预览）
        :param artist_name: 画师名称
        :return: 映射列表
        """
        mappings = self.get_all_mappings()
        return [
            {**m, "matched": True}
            for m in mappings
            if artist_name in m.get("artistNames", [])
        ]

    def build_artist_index(self) -> Dict[str, List[dict]]:
        """
        一次性构建 artist_name → [mapping, ...] 索引。
        用于批量查询场景，消除 N+1 问题。
        """
        with self._lock:
            data = self._read_data()
            index: Dict[str, List[dict]] = {}
            for m in data.get("mappings", []):
                for name in m.get("artistNames", []):
                    index.setdefault(name, []).append(m)
            return index
