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

    def update_artist(self, category_id: str, name: str, **kwargs) -> bool:
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
                if artist.get("categoryId") == category_id and artist.get("name") == name:
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


def migrate_to_composite_key(storage_dir: Path) -> dict:
    """
    将现有数据从 UUID 架构迁移到组合键架构
    :param storage_dir: 存储目录
    :return: 迁移结果 {success: bool, message: str, backup_dir: str}
    """
    import shutil
    from datetime import datetime

    try:
        # 1. 创建备份目录
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_dir = storage_dir / f"backup_{timestamp}"
        backup_dir.mkdir(exist_ok=True)

        # 备份文件
        artists_file = storage_dir / "artists.json"
        mappings_file = storage_dir / "image_artists.json"

        if artists_file.exists():
            shutil.copy2(artists_file, backup_dir / "artists.json")
        if mappings_file.exists():
            shutil.copy2(mappings_file, backup_dir / "image_artists.json")

        print(f"[Migration] 备份已创建: {backup_dir}")

        # 2. 迁移 artists.json（移除 id 字段，添加 metadata 字段）
        if artists_file.exists():
            with open(artists_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # 创建 id 到 name 的映射表
            id_to_name = {}
            for artist in data.get("artists", []):
                artist_id = artist.get("id")
                name = artist.get("name")
                if artist_id and name:
                    id_to_name[artist_id] = name

            # 移除 id 字段，添加 metadata 字段
            for artist in data.get("artists", []):
                # 移除 id
                if "id" in artist:
                    del artist["id"]

                # 添加 metadata 字段（如果不存在）
                if "metadata" not in artist:
                    artist["metadata"] = {
                        "description": "",
                        "tags": [],
                        "customFields": {}
                    }

            # 写回文件
            with open(artists_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

            print(f"[Migration] artists.json 迁移完成，处理了 {len(data.get('artists', []))} 个画师")
        else:
            id_to_name = {}
            print("[Migration] artists.json 不存在，跳过")

        # 3. 迁移 image_artists.json（artistIds → artistNames）
        if mappings_file.exists():
            with open(mappings_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # 转换 artistIds 到 artistNames
            for mapping in data.get("mappings", []):
                artist_ids = mapping.get("artistIds", [])
                if artist_ids:
                    # 将 UUID 列表转换为名称列表
                    artist_names = []
                    for artist_id in artist_ids:
                        name = id_to_name.get(artist_id)
                        if name:
                            artist_names.append(name)
                        else:
                            print(f"[Migration] 警告: 找不到 ID {artist_id} 对应的画师名称")

                    # 移除 artistIds，添加 artistNames
                    del mapping["artistIds"]
                    mapping["artistNames"] = artist_names

            # 写回文件
            with open(mappings_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

            print(f"[Migration] image_artists.json 迁移完成，处理了 {len(data.get('mappings', []))} 个映射")
        else:
            print("[Migration] image_artists.json 不存在，跳过")

        # 4. 验证迁移结果
        validation_result = validate_migration(storage_dir)
        if not validation_result["valid"]:
            raise ValueError(f"迁移验证失败: {validation_result['errors']}")

        return {
            "success": True,
            "message": "迁移成功完成",
            "backup_dir": str(backup_dir),
            "validation": validation_result
        }

    except Exception as e:
        # 迁移失败，尝试恢复备份
        print(f"[Migration] 迁移失败: {e}")
        if 'backup_dir' in locals() and backup_dir.exists():
            print(f"[Migration] 尝试从备份恢复...")
            try:
                if (backup_dir / "artists.json").exists():
                    shutil.copy2(backup_dir / "artists.json", artists_file)
                if (backup_dir / "image_artists.json").exists():
                    shutil.copy2(backup_dir / "image_artists.json", mappings_file)
                print("[Migration] 已从备份恢复")
            except Exception as restore_error:
                print(f"[Migration] 恢复备份失败: {restore_error}")

        return {
            "success": False,
            "message": f"迁移失败: {str(e)}",
            "backup_dir": str(backup_dir) if 'backup_dir' in locals() else None
        }


def validate_migration(storage_dir: Path) -> dict:
    """
    验证迁移后的数据结构
    :param storage_dir: 存储目录
    :return: {valid: bool, errors: list}
    """
    errors = []

    try:
        # 验证 artists.json
        artists_file = storage_dir / "artists.json"
        if artists_file.exists():
            with open(artists_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # 检查是否有画师包含 id 字段
            for artist in data.get("artists", []):
                if "id" in artist:
                    errors.append(f"画师 {artist.get('name')} 仍然包含 id 字段")

                # 检查必需字段
                if "name" not in artist:
                    errors.append("发现缺少 name 字段的画师")
                if "categoryId" not in artist:
                    errors.append(f"画师 {artist.get('name')} 缺少 categoryId 字段")
                if "metadata" not in artist:
                    errors.append(f"画师 {artist.get('name')} 缺少 metadata 字段")

            # 检查同分类下是否有重名
            category_artists = {}
            for artist in data.get("artists", []):
                cat_id = artist.get("categoryId")
                name = artist.get("name")
                key = f"{cat_id}:{name}"
                if key in category_artists:
                    errors.append(f"分类 {cat_id} 下存在重名画师: {name}")
                else:
                    category_artists[key] = True

        # 验证 image_artists.json
        mappings_file = storage_dir / "image_artists.json"
        if mappings_file.exists():
            with open(mappings_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # 检查是否有映射包含 artistIds 字段
            for mapping in data.get("mappings", []):
                if "artistIds" in mapping:
                    errors.append(f"图片 {mapping.get('imagePath')} 仍然包含 artistIds 字段")

                # 检查必需字段
                if "artistNames" not in mapping:
                    errors.append(f"图片 {mapping.get('imagePath')} 缺少 artistNames 字段")
                if "imagePath" not in mapping:
                    errors.append("发现缺少 imagePath 字段的映射")

        return {
            "valid": len(errors) == 0,
            "errors": errors
        }

    except Exception as e:
        return {
            "valid": False,
            "errors": [f"验证过程出错: {str(e)}"]
        }


def get_storage() -> Tuple[ArtistStorage, ImageMappingStorage, CategoryStorage]:
    """获取存储实例"""
    # 获取插件根目录
    current_dir = Path(__file__).parent
    storage_dir = current_dir

    artist_storage = ArtistStorage(storage_dir)
    mapping_storage = ImageMappingStorage(storage_dir)
    category_storage = CategoryStorage(storage_dir)

    # 自动迁移现有画师数据（旧版本兼容）
    try:
        migrate_artist_data(artist_storage)
    except Exception as e:
        print(f"Warning: Failed to migrate artist data: {e}")

    return artist_storage, mapping_storage, category_storage
