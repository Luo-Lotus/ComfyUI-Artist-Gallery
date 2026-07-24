import json
import shutil
from pathlib import Path
from typing import Dict, List, Optional, Tuple


def _write_json_atomic(file_path: Path, data: dict) -> None:
    """Write JSON through a sibling temporary file to avoid partial migration output."""
    file_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = file_path.with_name(f".{file_path.name}.tmp")
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    temp_path.replace(file_path)


def migrate_combinations_to_prompts(storage_dir: Path) -> dict:
    """Convert legacy combination records into normal Prompt records."""
    main_combinations = storage_dir / "combinations.json"
    combination_files = []
    if main_combinations.exists():
        combination_files.append(main_combinations)
    combination_files.extend(
        file_path
        for file_path in sorted(storage_dir.glob("*.combinations.json"))
        if file_path.resolve() != main_combinations.resolve()
    )
    if not combination_files:
        return {"success": True, "created": 0, "merged": 0, "skipped": 0, "files": 0}

    main_prompts = storage_dir / "prompts.json"
    prompt_files = []
    if main_prompts.exists():
        prompt_files.append(main_prompts)
    prompt_files.extend(
        file_path
        for file_path in sorted(storage_dir.glob("*.prompts.json"))
        if file_path.resolve() != main_prompts.resolve()
    )

    prompt_data_by_path = {}
    prompt_index = {}
    prompt_source_by_id = {}
    for file_path in prompt_files:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        data.setdefault("prompts", [])
        prompt_data_by_path[file_path] = data
        for prompt in data["prompts"]:
            key = (prompt.get("categoryId", "root"), prompt.get("value", ""))
            prompt_index.setdefault(key, prompt)
            prompt_source_by_id[id(prompt)] = file_path

    def target_prompt_file(combination_file: Path) -> Path:
        if combination_file.resolve() == main_combinations.resolve():
            return main_prompts
        prefix = combination_file.name.removesuffix(".combinations.json")
        return storage_dir / f"{prefix}.prompts.json"

    created = 0
    merged = 0
    skipped = 0
    touched_prompt_files = set()

    for combination_file in combination_files:
        with open(combination_file, "r", encoding="utf-8") as f:
            combination_data = json.load(f)
        prompt_file = target_prompt_file(combination_file)
        target_data = prompt_data_by_path.setdefault(prompt_file, {"prompts": []})

        for combination in combination_data.get("combinations", []):
            value = str(combination.get("outputContent") or "").strip()
            if not value:
                members = combination.get("prompts") or combination.get("artistKeys") or []
                if not isinstance(members, (list, tuple)):
                    members = [members]
                value = ",".join(
                    str(member).strip()
                    for member in members
                    if member is not None and str(member).strip()
                )
            if not value:
                skipped += 1
                continue

            category_id = combination.get("categoryId") or "root"
            cover_image_id = combination.get("coverImageId")
            if isinstance(cover_image_id, str) and cover_image_id.startswith("artist_gallery/"):
                cover_image_id = cover_image_id.replace("artist_gallery/", "prompt_gallery/", 1)
            key = (category_id, value)
            existing = prompt_index.get(key)
            if existing is not None:
                if not existing.get("coverImageId") and cover_image_id:
                    existing["coverImageId"] = cover_image_id
                    touched_prompt_files.add(prompt_source_by_id[id(existing)])
                merged += 1
                continue

            metadata = combination.get("metadata")
            if not isinstance(metadata, dict):
                metadata = {}
            prompt = {
                "value": value,
                "name": str(combination.get("name") or value).strip() or value,
                "alias": "",
                "categoryId": category_id,
                "coverImageId": cover_image_id,
                "createdAt": combination.get("createdAt", 0),
                "metadata": metadata,
            }
            target_data["prompts"].append(prompt)
            prompt_index[key] = prompt
            prompt_source_by_id[id(prompt)] = prompt_file
            touched_prompt_files.add(prompt_file)
            created += 1

    for file_path in touched_prompt_files:
        _write_json_atomic(file_path, prompt_data_by_path[file_path])

    config_path = storage_dir / "storage_config.json"
    if config_path.exists():
        with open(config_path, "r", encoding="utf-8") as f:
            config = json.load(f)
        disabled = set(config.get("disabled_files", []))
        changed = False
        for combination_file in combination_files:
            if combination_file.name not in disabled:
                continue
            disabled.discard(combination_file.name)
            disabled.add(target_prompt_file(combination_file).name)
            changed = True
        if changed:
            config["disabled_files"] = sorted(disabled)
            _write_json_atomic(config_path, config)

    for combination_file in combination_files:
        combination_file.unlink()

    print(
        "[Migration-Combination] converted to Prompt: "
        f"created={created}, merged={merged}, skipped={skipped}, files={len(combination_files)}"
    )
    return {
        "success": True,
        "created": created,
        "merged": merged,
        "skipped": skipped,
        "files": len(combination_files),
    }


def _fix_image_path_prefix(mappings_file: Path):
    """修复 image_prompts.json 中的旧 imagePath 前缀 artist_gallery/ → prompt_gallery/"""
    if not mappings_file.exists():
        return
    try:
        with open(mappings_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        changed = False
        for mapping in data.get("mappings", []):
            img_path = mapping.get("imagePath", "")
            if img_path.startswith("artist_gallery/"):
                mapping["imagePath"] = img_path.replace("artist_gallery/", "prompt_gallery/", 1)
                changed = True

        if changed:
            with open(mappings_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"[Migration-PromptSchema] 修复 imagePath 前缀: {mappings_file}")
    except Exception as e:
        print(f"[Migration-PromptSchema] 修复 imagePath 失败: {e}")


def _rename_output_subdir():
    """将 output 目录下的 artist_gallery/ 物理文件夹重命名为 prompt_gallery/"""
    try:
        import folder_paths
        output_dir = Path(folder_paths.get_output_directory())
    except Exception:
        return

    old_dir = output_dir / "artist_gallery"
    new_dir = output_dir / "prompt_gallery"

    if not old_dir.exists():
        return

    if new_dir.exists():
        # 两个都存在，合并：把旧目录文件移到新目录
        for item in old_dir.iterdir():
            target = new_dir / item.name
            if not target.exists():
                shutil.move(str(item), str(target))
        # 清理旧目录（如果为空）
        try:
            old_dir.rmdir()
            print(f"[Migration-PromptSchema] 已合并并删除旧目录: {old_dir}")
        except OSError:
            print(f"[Migration-PromptSchema] 旧目录非空，保留: {old_dir}")
    else:
        shutil.move(str(old_dir), str(new_dir))
        print(f"[Migration-PromptSchema] 物理目录重命名: {old_dir} → {new_dir}")


def _fix_cover_image_paths(storage_dir: Path):
    """修复 prompts.json 中 coverImageId 的旧路径前缀。"""
    prompts_file = storage_dir / "prompts.json"

    # 修复 prompts.json
    if prompts_file.exists():
        try:
            with open(prompts_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            changed = False
            for prompt in data.get("prompts", []):
                cover = prompt.get("coverImageId", "")
                if cover and cover.startswith("artist_gallery/"):
                    prompt["coverImageId"] = cover.replace("artist_gallery/", "prompt_gallery/", 1)
                    changed = True

            if changed:
                with open(prompts_file, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                print(f"[Migration-PromptSchema] 修复 prompts.json coverImageId 前缀")
        except Exception as e:
            print(f"[Migration-PromptSchema] 修复 prompts.json coverImageId 失败: {e}")

def migrate_to_prompt_schema(storage_dir: Path) -> dict:
    """
    迁移数据从旧字段命名到新 prompt schema：
    - artists.json → prompts.json: name→value, displayName→name, 新增 alias
    - image_artists.json → image_prompts.json: artistNames→prompts
    """
    from datetime import datetime

    old_artists_file = storage_dir / "artists.json"
    new_artists_file = storage_dir / "prompts.json"
    old_mappings_file = storage_dir / "image_artists.json"
    new_mappings_file = storage_dir / "image_prompts.json"

    # 如果新文件已存在且有数据，说明 prompt 结构已迁移
    # 但仍需检查 imagePath 前缀是否需要修复
    prompts_migrated = False
    if new_artists_file.exists():
        try:
            with open(new_artists_file, 'r', encoding='utf-8') as f:
                existing = json.load(f)
            if existing.get("prompts"):
                prompts_migrated = True
            else:
                # 空文件但旧数据存在 → 删除空文件继续迁移
                if old_artists_file.exists():
                    new_artists_file.unlink()
                else:
                    return {"success": True, "message": "无旧数据", "migrated": False}
        except Exception:
            pass

    # 修复 imagePath 前缀 + 封面图路径 + 重命名物理目录（无论 prompt 是否已迁移）
    _fix_image_path_prefix(new_mappings_file)
    _fix_cover_image_paths(storage_dir)
    _rename_output_subdir()

    if prompts_migrated:
        return {"success": True, "message": "已是新格式，无需迁移", "migrated": False}

    # 如果旧文件不存在，也无需迁移
    if not old_artists_file.exists():
        return {"success": True, "message": "无旧数据", "migrated": False}

    backup_dir = None

    try:
        # 1. 创建备份
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_dir = storage_dir / f"backup_prompt_schema_{timestamp}"
        backup_dir.mkdir(exist_ok=True)

        files_to_backup = [old_artists_file, old_mappings_file]
        for f in files_to_backup:
            if f.exists():
                shutil.copy2(f, backup_dir / f.name)

        print(f"[Migration-PromptSchema] 备份已创建: {backup_dir}")

        # 2. 迁移 artists.json → prompts.json
        with open(old_artists_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        migrated_count = 0
        old_artists = data.get("artists", [])
        for artist in old_artists:
            old_name = artist.get("name", "")
            old_display = artist.get("displayName", old_name)
            artist["value"] = old_name
            artist["name"] = old_display
            artist["alias"] = ""
            if "displayName" in artist:
                del artist["displayName"]
            migrated_count += 1

        # 写入新文件，key 从 "artists" 改为 "prompts"
        new_data = {"prompts": old_artists}
        with open(new_artists_file, 'w', encoding='utf-8') as f:
            json.dump(new_data, f, ensure_ascii=False, indent=2)

        # 删除旧文件
        old_artists_file.unlink()
        print(f"[Migration-PromptSchema] artists.json → prompts.json: {migrated_count} 条记录")

        # 3. 迁移 image_artists.json → image_prompts.json
        # 如果之前创建了空文件，先删除
        if new_mappings_file.exists() and old_mappings_file.exists():
            new_mappings_file.unlink()
        if old_mappings_file.exists():
            with open(old_mappings_file, 'r', encoding='utf-8') as f:
                mapping_data = json.load(f)

            for mapping in mapping_data.get("mappings", []):
                old_names = mapping.get("artistNames", [])
                mapping["prompts"] = old_names
                if "artistNames" in mapping:
                    del mapping["artistNames"]
                # 更新 imagePath 前缀 artist_gallery → prompt_gallery
                img_path = mapping.get("imagePath", "")
                if img_path.startswith("artist_gallery/"):
                    mapping["imagePath"] = img_path.replace("artist_gallery/", "prompt_gallery/", 1)

            with open(new_mappings_file, 'w', encoding='utf-8') as f:
                json.dump(mapping_data, f, ensure_ascii=False, indent=2)

            old_mappings_file.unlink()
            print(f"[Migration-PromptSchema] image_artists.json → image_prompts.json: {len(mapping_data.get('mappings', []))} 条映射")

        return {
            "success": True,
            "message": f"迁移完成: {migrated_count} 条prompt",
            "backup_dir": str(backup_dir),
            "migrated": True,
        }

    except Exception as e:
        print(f"[Migration-PromptSchema] 迁移失败: {e}")
        # 回滚
        if backup_dir and backup_dir.exists():
            try:
                if (backup_dir / "artists.json").exists() and not old_artists_file.exists():
                    shutil.copy2(backup_dir / "artists.json", old_artists_file)
                if (backup_dir / "image_artists.json").exists() and not old_mappings_file.exists():
                    shutil.copy2(backup_dir / "image_artists.json", old_mappings_file)
                # 清理可能创建的新文件
                if new_artists_file.exists():
                    new_artists_file.unlink()
                if new_mappings_file.exists():
                    new_mappings_file.unlink()
                print("[Migration-PromptSchema] 已从备份恢复")
            except Exception as restore_error:
                print(f"[Migration-PromptSchema] 恢复备份失败: {restore_error}")

        return {
            "success": False,
            "message": f"迁移失败: {str(e)}",
            "migrated": False,
        }


def migrate_prompt_data(prompt_storage) -> bool:
    """
    迁移现有Prompt数据，添加新字段
    :param prompt_storage: Prompt存储实例
    :return: 是否进行了迁移
    """
    with prompt_storage._lock:
        data = prompt_storage._read_data()
        migrated = False
        for prompt in data.get("prompts", []):
            if "categoryId" not in prompt:
                prompt["categoryId"] = "root"
                migrated = True
            if "coverImageId" not in prompt:
                prompt["coverImageId"] = None
                migrated = True
        if migrated:
            prompt_storage._write_data(data)
        return migrated


def migrate_to_composite_key(storage_dir: Path) -> dict:
    """
    将现有数据从 UUID 架构迁移到复合键架构
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

            print(f"[Migration] artists.json 迁移完成，处理了 {len(data.get('artists', []))} 个Prompt")
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
                            print(f"[Migration] 警告: 找不到 ID {artist_id} 对应的Prompt名称")

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

            # 检查是否有Prompt包含 id 字段
            for artist in data.get("artists", []):
                if "id" in artist:
                    errors.append(f"Prompt {artist.get('name')} 仍然包含 id 字段")

                # 检查必需字段
                if "name" not in artist:
                    errors.append("发现缺少 name 字段的Prompt")
                if "categoryId" not in artist:
                    errors.append(f"Prompt {artist.get('name')} 缺少 categoryId 字段")
                if "metadata" not in artist:
                    errors.append(f"Prompt {artist.get('name')} 缺少 metadata 字段")

            # 检查同分类下是否有重名
            category_artists = {}
            for artist in data.get("artists", []):
                cat_id = artist.get("categoryId")
                name = artist.get("name")
                key = f"{cat_id}:{name}"
                if key in category_artists:
                    errors.append(f"分类 {cat_id} 下存在重名Prompt: {name}")
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


def migrate_image_schema(storage_dir: Path) -> dict:
    """
    迁移图片映射存储结构：
    - image_prompts.json → images.json（含 glob 分片文件）
    - 字段重构：savedAt → fileInfo.createdAt，metadata → fileInfo + prompt_string + generate_prompt
    - 新增 type 字段（local/remote）
    """
    from datetime import datetime

    old_main_file = storage_dir / "image_prompts.json"
    new_main_file = storage_dir / "images.json"

    # 如果新文件已存在且有数据，说明已迁移
    if new_main_file.exists():
        try:
            with open(new_main_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            if data.get("mappings"):
                return {"success": True, "message": "images.json 已存在，无需迁移", "migrated": False}
        except Exception:
            pass

    # 收集所有旧文件（主文件 + glob 分片）
    old_files = []
    if old_main_file.exists():
        old_files.append(old_main_file)
    for f in sorted(storage_dir.glob("*.image_prompts.json")):
        if f.resolve() != old_main_file.resolve():
            old_files.append(f)

    if not old_files:
        return {"success": True, "message": "无旧图片映射数据", "migrated": False}

    backup_dir = None

    try:
        # 1. 创建备份
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_dir = storage_dir / f"backup_image_schema_{timestamp}"
        backup_dir.mkdir(exist_ok=True)

        for f in old_files:
            shutil.copy2(f, backup_dir / f.name)
        print(f"[Migration-ImageSchema] 备份已创建: {backup_dir}")

        # 2. 读取并合并所有旧文件
        all_mappings = []
        for old_file in old_files:
            try:
                with open(old_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                all_mappings.extend(data.get("mappings", []))
            except Exception as e:
                print(f"[Migration-ImageSchema] 读取 {old_file.name} 失败: {e}")

        # 3. 转换每条映射到新格式
        import time
        migrated_mappings = []
        for mapping in all_mappings:
            new_mapping = {
                "type": "local",
                "imagePath": mapping.get("imagePath", ""),
            }

            # 构建 fileInfo
            file_info = {}
            old_saved_at = mapping.get("savedAt")
            if old_saved_at:
                file_info["createdAt"] = old_saved_at

            old_metadata = mapping.get("metadata", {})
            if "width" in old_metadata:
                file_info["width"] = old_metadata["width"]
            if "height" in old_metadata:
                file_info["height"] = old_metadata["height"]

            # 尝试从文件读取 size 和 type
            image_path = mapping.get("imagePath", "")
            if image_path:
                try:
                    import folder_paths
                    output_dir = Path(folder_paths.get_output_directory())
                    full_path = output_dir / image_path
                    if full_path.exists():
                        stat = full_path.stat()
                        file_info["size"] = stat.st_size
                        # 从扩展名推断 type
                        ext = full_path.suffix.lower()
                        type_map = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}
                        file_info["type"] = type_map.get(ext, "image/png")
                except Exception:
                    pass

            if file_info:
                new_mapping["fileInfo"] = file_info
            else:
                new_mapping["fileInfo"] = {}

            # prompt_string 从 metadata 中提取到顶层
            if "prompt_string" in old_metadata:
                new_mapping["promptString"] = old_metadata["prompt_string"]
            elif mapping.get("prompts"):
                new_mapping["promptString"] = ", ".join(mapping.get("prompts", []))

            migrated_mappings.append(new_mapping)

        # 4. 写入新文件
        with open(new_main_file, 'w', encoding='utf-8') as f:
            json.dump({"mappings": migrated_mappings}, f, ensure_ascii=False, indent=2)

        # 5. 删除旧文件
        for old_file in old_files:
            old_file.unlink()
        print(f"[Migration-ImageSchema] 迁移完成: {len(migrated_mappings)} 条映射")

        return {
            "success": True,
            "message": f"迁移完成: {len(migrated_mappings)} 条映射",
            "backup_dir": str(backup_dir),
            "migrated": True,
        }

    except Exception as e:
        print(f"[Migration-ImageSchema] 迁移失败: {e}")
        # 回滚
        if backup_dir and backup_dir.exists():
            try:
                # 恢复旧文件
                for backup_file in backup_dir.iterdir():
                    target = storage_dir / backup_file.name
                    if not target.exists():
                        shutil.copy2(backup_file, target)
                # 删除可能创建的新文件
                if new_main_file.exists():
                    new_main_file.unlink()
                print("[Migration-ImageSchema] 已从备份恢复")
            except Exception as restore_error:
                print(f"[Migration-ImageSchema] 恢复备份失败: {restore_error}")

        return {
            "success": False,
            "message": f"迁移失败: {str(e)}",
            "migrated": False,
        }


def migrate_prompt_string_image_index(storage_dir: Path) -> dict:
    """
    迁移到 promptString 派生关联：
    - images*.json 中没有 promptString 但有 prompts/promptIds 时，用逗号分隔填充 promptString
    - 移除图片记录中的 prompts/promptIds
    """
    changed_files = 0
    changed_items = 0

    image_files = []
    main_images = storage_dir / "images.json"
    if main_images.exists():
        image_files.append(main_images)
    for f in sorted(storage_dir.glob("*.images.json")):
        if f.resolve() != main_images.resolve():
            image_files.append(f)

    for file_path in image_files:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            changed = False
            for item in data.get("mappings", []):
                old_values = item.get("prompts") or item.get("promptIds") or []
                if not item.get("promptString") and old_values:
                    item["promptString"] = ", ".join(str(v) for v in old_values if v)
                    changed = True
                    changed_items += 1
                if "prompts" in item:
                    del item["prompts"]
                    changed = True
                if "promptIds" in item:
                    del item["promptIds"]
                    changed = True
            if changed:
                with open(file_path, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                changed_files += 1
        except Exception as e:
            print(f"[Migration-PromptStringIndex] 处理 {file_path.name} 失败: {e}")

    return {
        "success": True,
        "message": f"promptString 图片索引迁移完成: files={changed_files}, items={changed_items}",
        "migrated": changed_files > 0,
    }


def _migration_image_exists(mapping: dict, output_dir: Path | None) -> bool:
    image_path = mapping.get("imagePath", "")
    mapping_type = mapping.get("type", "")
    if not image_path:
        return False
    if mapping_type == "remote" or image_path.startswith(("http://", "https://")):
        return True
    if output_dir is None:
        return True
    return (output_dir / image_path).exists()


def _migrate_covers_legacy(storage_dir: Path, output_dir: Path | None = None) -> dict:
    """
    [legacy] O(P×M) 封面回填——仅在 ahocorasick 不可用时作为兜底。
    为没有 coverImageId 的 Prompt 补封面：
    - Prompt 从 images*.json 的 promptString 按字符串包含匹配 Prompt value
    - 取 fileInfo.createdAt 最大的图片作为 coverImageId
    - 已有封面的记录不修改
    """
    mappings = []
    main_images = storage_dir / "images.json"
    image_files = []
    if main_images.exists():
        image_files.append(main_images)
    for f in sorted(storage_dir.glob("*.images.json")):
        if f.resolve() != main_images.resolve():
            image_files.append(f)

    for file_path in image_files:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            for mapping in data.get("mappings", []):
                prompt_string = mapping.get("promptString") or ""
                if prompt_string and _migration_image_exists(mapping, output_dir):
                    mappings.append(mapping)
        except Exception as e:
            print(f"[Migration-PromptCover] 读取 {file_path.name} 失败: {e}")

    if not mappings:
        return {
            "success": True,
            "message": "Prompt 封面迁移完成: files=0, prompts=0",
            "migrated": False,
        }

    def sort_key(mapping):
        return (mapping.get("fileInfo") or {}).get("createdAt") or 0

    def latest_cover_for_values(values):
        queries = [str(v).lower() for v in values if v]
        if not queries:
            return None
        matched = []
        for mapping in mappings:
            prompt_string = (mapping.get("promptString") or "").lower()
            if any(query in prompt_string for query in queries):
                matched.append(mapping)
        if not matched:
            return None
        return max(matched, key=sort_key).get("imagePath")

    prompt_files = []
    main_prompts = storage_dir / "prompts.json"
    if main_prompts.exists():
        prompt_files.append(main_prompts)
    for f in sorted(storage_dir.glob("*.prompts.json")):
        if f.resolve() != main_prompts.resolve():
            prompt_files.append(f)

    changed_files = 0
    changed_prompts = 0

    for file_path in prompt_files:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            changed = False
            for prompt in data.get("prompts", []):
                if prompt.get("coverImageId"):
                    continue
                value = prompt.get("value")
                if not value:
                    continue
                cover_path = latest_cover_for_values([value])
                if cover_path:
                    prompt["coverImageId"] = cover_path
                    changed = True
                    changed_prompts += 1
            if changed:
                with open(file_path, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                changed_files += 1
        except Exception as e:
            print(f"[Migration-PromptCover] 处理 {file_path.name} 失败: {e}")

    return {
        "success": True,
        "message": f"Prompt 封面迁移完成: files={changed_files}, prompts={changed_prompts}",
        "migrated": changed_files > 0,
    }


def _collect_cover_image_mappings(storage_dir: Path, output_dir: Path | None) -> list:
    """读取 images*.json 中的映射（排除 comfy_output*.images.json 与不存在/无 promptString 的图片）。"""
    main_images = storage_dir / "images.json"
    image_files = []
    if main_images.exists():
        image_files.append(main_images)
    for f in sorted(storage_dir.glob("*.images.json")):
        if f.resolve() == main_images.resolve():
            continue
        if f.name.startswith("comfy_output"):  # 与 storage glob 一致：忽略系统外导入文件
            continue
        image_files.append(f)

    mappings = []
    for file_path in image_files:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            for mapping in data.get("mappings", []):
                if (mapping.get("promptString") or "") and _migration_image_exists(mapping, output_dir):
                    mappings.append(mapping)
        except Exception as e:
            print(f"[Migration-PromptCover] 读取 {file_path.name} 失败: {e}")
    return mappings


def _collect_coverless_prompt_values(storage_dir: Path) -> set:
    """收集所有没有 coverImageId 的 prompt value（去重）。"""
    values = set()
    main_prompts = storage_dir / "prompts.json"
    prompt_files = []
    if main_prompts.exists():
        prompt_files.append(main_prompts)
    for f in sorted(storage_dir.glob("*.prompts.json")):
        if f.resolve() != main_prompts.resolve():
            prompt_files.append(f)
    for file_path in prompt_files:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            for prompt in data.get("prompts", []):
                if prompt.get("coverImageId"):
                    continue
                value = prompt.get("value")
                if value:
                    values.add(value)
        except Exception as e:
            print(f"[Migration-PromptCover] 读取 {file_path.name} 失败: {e}")
    return values


def migrate_prompt_covers_from_prompt_string(
    storage_dir: Path,
    output_dir: Path | None = None,
    *,
    allow_legacy_fallback: bool = True,
    prompt_storage=None,
) -> dict:
    """
    为没有 coverImageId 的 Prompt 补封面（高性能版）。

    用 ahocorasick 在所有图片 promptString 上单次扫描，匹配「无封面 prompt value」，
    取 fileInfo.createdAt 最大的图片作为 coverImageId，经 PromptStorage.set_cover_batch
    一次写回。复杂度 O(总文本长度)，较旧 O(P×M) 实现快数万倍。
    已有封面的记录不修改。ahocorasick 不可用时，手动调用默认回退到 legacy；
    启动后台回填会关闭 fallback，避免大数据环境偷偷跑 O(P×M)。
    """
    try:
        import ahocorasick
    except ImportError:
        if allow_legacy_fallback:
            print("[Migration-PromptCover] ahocorasick 不可用，回退到 O(P×M) 实现")
            return _migrate_covers_legacy(storage_dir, output_dir)
        return {
            "success": True,
            "message": "Prompt 封面迁移已跳过: 缺少 pyahocorasick，请安装 requirements.txt 后重启",
            "migrated": False,
            "skipped": True,
        }

    mappings = _collect_cover_image_mappings(storage_dir, output_dir)
    coverless_values = _collect_coverless_prompt_values(storage_dir)

    if not mappings or not coverless_values:
        return {
            "success": True,
            "message": f"Prompt 封面迁移完成: prompts=0 (mappings={len(mappings)}, coverless={len(coverless_values)})",
            "migrated": False,
        }

    # 1. 用无封面 value 建自动机（小写、长度>=2，避免单字符误匹配几乎每条 promptString）
    automaton = ahocorasick.Automaton()
    for value in coverless_values:
        v_low = value.lower()
        if len(v_low) >= 2:
            automaton.add_word(v_low, value)
    automaton.make_automaton()

    # 2. 单次扫描所有映射，按 createdAt 跟踪每个 value 的最新封面
    def sort_key(m):
        return (m.get("fileInfo") or {}).get("createdAt") or 0

    best_by_value: dict = {}
    for mapping in mappings:
        ps = (mapping.get("promptString") or "").lower()
        if not ps:
            continue
        seen_here = set()
        for _end, value in automaton.iter(ps):
            if value in seen_here:
                continue
            seen_here.add(value)
            cur = best_by_value.get(value)
            if cur is None or sort_key(mapping) > sort_key(cur):
                best_by_value[value] = mapping

    covers_by_value = {v: m.get("imagePath") for v, m in best_by_value.items() if m.get("imagePath")}

    # 3. 写回封面。后台启动路径会传入 singleton storage，保证锁/缓存一致；
    # 手动迁移和测试路径默认按 storage_dir 创建独立 storage。
    if prompt_storage is None:
        from .prompt import PromptStorage
        prompt_storage = PromptStorage(storage_dir)
    changed_prompts = prompt_storage.set_cover_batch(covers_by_value) if covers_by_value else 0

    return {
        "success": True,
        "message": f"Prompt 封面迁移完成: prompts={changed_prompts}",
        "migrated": changed_prompts > 0,
    }
