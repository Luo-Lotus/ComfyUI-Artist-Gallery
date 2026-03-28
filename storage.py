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

    def add_artist(self, name: str, display_name: Optional[str] = None, category_id: str = "root") -> dict:
        """
        添加画师
        :param name: 唯一标识符（无@符号）
        :param display_name: 显示名称（可选）
        :param category_id: 所属分类ID（默认为root）
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
            "categoryId": category_id,
            "coverImageId": None,
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
                    "categoryId": "root",
                    "coverImageId": None,
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
                        if key in ["name", "displayName", "imageCount", "categoryId", "coverImageId"]:
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

    def update_mapping(self, image_path: str, artist_ids: List[str], metadata: Optional[dict] = None) -> bool:
        """
        更新图片映射的画师列表
        :param image_path: 图片路径
        :param artist_ids: 新的画师 ID 列表
        :param metadata: 可选的元数据更新
        :return: 是否更新成功
        """
        with self._lock:
            data = self._read_data()

            # 查找并更新映射
            for mapping in data["mappings"]:
                if mapping.get("imagePath") == image_path:
                    mapping["artistIds"] = artist_ids
                    if metadata is not None:
                        mapping["metadata"] = {**mapping.get("metadata", {}), **metadata}
                    self._write_data(data)
                    return True

            return False


class CategoryStorage:
    """分类数据存储管理"""

    def __init__(self, storage_dir: Path):
        self.storage_dir = storage_dir
        self.categories_file = storage_dir / "categories.json"
        self._lock = threading.Lock()
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
        """读取数据文件"""
        try:
            with open(self.categories_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error reading categories file: {e}")
            return {"categories": []}

    def _write_data(self, data: dict):
        """写入数据文件"""
        try:
            with open(self.categories_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
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


def migrate_artist_data(artist_storage: ArtistStorage) -> bool:
    """
    迁移现有画师数据，添加新字段
    :param artist_storage: 画师存储实例
    :return: 是否进行了迁移
    """
    import time

    artists = artist_storage.get_all_artists()
    migrated = False

    for artist in artists:
        updated = False
        if "categoryId" not in artist:
            artist["categoryId"] = "root"
            updated = True
        if "coverImageId" not in artist:
            artist["coverImageId"] = None
            updated = True

        if updated:
            artist_storage.update_artist(
                artist["id"],
                categoryId=artist["categoryId"],
                coverImageId=artist["coverImageId"]
            )
            migrated = True

    return migrated


def get_storage() -> Tuple[ArtistStorage, ImageMappingStorage, CategoryStorage]:
    """获取存储实例"""
    # 获取插件根目录
    current_dir = Path(__file__).parent
    storage_dir = current_dir

    artist_storage = ArtistStorage(storage_dir)
    mapping_storage = ImageMappingStorage(storage_dir)
    category_storage = CategoryStorage(storage_dir)

    # 自动迁移现有画师数据
    try:
        migrate_artist_data(artist_storage)
    except Exception as e:
        print(f"Warning: Failed to migrate artist data: {e}")

    return artist_storage, mapping_storage, category_storage
