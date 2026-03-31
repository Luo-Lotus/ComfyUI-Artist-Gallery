import json
import shutil
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from .artist import ArtistStorage


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
