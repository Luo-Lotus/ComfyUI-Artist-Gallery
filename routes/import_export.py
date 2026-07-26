"""
Import/Export 端点
"""
import json
from pathlib import Path
from aiohttp import web
import server
from ..storage import get_storage
from ..storage.import_cover import apply_import_covers


def _make_shard_targets(storage_dir: Path, separate: bool):
    """
    生成分离存储的目标文件路径。
    返回 dict: {"prompts": path|None, "images": path|None, "categories": path|None}
    """
    if not separate:
        return {"prompts": None, "images": None, "categories": None}
    from datetime import datetime
    prefix = datetime.now().strftime("import_%Y%m%d_%H%M%S")
    return {
        "prompts": str(storage_dir / f"{prefix}.prompts.json"),
        "images": str(storage_dir / f"{prefix}.images.json"),
        "categories": str(storage_dir / f"{prefix}.categories.json"),
    }




# ============ Import API ============

@server.PromptServer.instance.routes.post("/prompt_gallery/import/batch")
async def import_images_batch(request):
    """
    批量导入图片到画廊
    支持单个Prompt导入和自定义规则批量导入
    """
    import asyncio
    import base64
    import time
    import random
    import folder_paths
    from io import BytesIO

    from ..import_handler import (
        save_image_with_metadata,
        parse_prompt_info_from_filename
    )

    try:
        data = await request.json()
        mode = data.get("mode", "single")  # "single" | "custom"
        images = data.get("images", [])
        config = data.get("config", {})
        separate_storage = data.get("separateStorage", False)

        print(f"[ImportBatch] 收到导入请求")
        print(f"  mode: {mode}")
        print(f"  images数量: {len(images)}")
        print(f"  config: {config}")
        if images:
            print(f"  第一个文件名: {images[0].get('filename')}")

        if not images:
            return web.json_response({"error": "没有提供图片"}, status=400)

        # 获取存储实例
        prompt_storage, mapping_storage, category_storage = get_storage()
        shard_targets = _make_shard_targets(prompt_storage.storage_dir, separate_storage)

        # 准备输出目录
        output_dir = Path(folder_paths.get_output_directory())
        save_dir = output_dir / "prompt_gallery"
        save_dir.mkdir(parents=True, exist_ok=True)

        # 并发控制（最多5个并发）
        semaphore = asyncio.Semaphore(5)

        async def process_single_image(image_data: dict):
            """并发：解析 + 保存图片文件（不做存储写入）"""
            async with semaphore:
                try:
                    image_bytes = base64.b64decode(image_data['data'])
                    filename = image_data['filename']

                    # 解析Prompt信息
                    if mode == "single":
                        value = config.get("value", "").strip()
                        display_name = config.get("name", value)
                        category_id = config.get("categoryId", "root")
                        will_create_prompt = False
                        error_msg = None
                    else:
                        value, display_name, error_msg, will_create_prompt = \
                            parse_prompt_info_from_filename(filename, config)
                        category_id = config.get("defaultCategoryId", "root")

                    if not value:
                        return {'filename': filename, 'success': False,
                                'error': error_msg or '无法解析Prompt名称'}

                    # 生成唯一文件名并保存
                    timestamp = int(time.time() * 1000)
                    counter = random.randint(0, 99999)
                    new_filename = f"AG_{timestamp}_{counter:05}.png"
                    save_path = save_dir / new_filename

                    selected_prompts = [{"categoryId": category_id, "value": value, "name": display_name}]
                    success, metadata = save_image_with_metadata(
                        image_bytes=image_bytes,
                        save_path=save_path,
                        prompt_names=[value],
                        display_names=[display_name],
                        categories=[category_id],
                        selected_prompts=selected_prompts,
                    )

                    if not success:
                        if save_path.exists():
                            save_path.unlink()
                        return {'filename': filename, 'success': False, 'error': '图片保存失败'}

                    # 构建 file_info
                    file_info = {"createdAt": timestamp}
                    if metadata:
                        if "width" in metadata:
                            file_info["width"] = metadata["width"]
                        if "height" in metadata:
                            file_info["height"] = metadata["height"]

                    return {
                        'filename': filename,
                        'success': True,
                        'value': value,
                        'name': display_name,
                        'categoryId': category_id,
                        'willCreate': will_create_prompt,
                        'imagePath': f"prompt_gallery/{new_filename}",
                        'fileInfo': file_info,
                    }

                except Exception as e:
                    import traceback
                    traceback.print_exc()
                    return {'filename': image_data.get('filename', 'unknown'),
                            'success': False, 'error': str(e)}

        # 1. 并发保存所有图片文件
        results = await asyncio.gather(*[process_single_image(img) for img in images])

        # 2. 批量创建 Prompt（一次读写）
        prompt_specs = []
        for r in results:
            if r['success'] and r.get('willCreate'):
                prompt_specs.append({
                    "value": r["value"],
                    "name": r["name"],
                    "categoryId": r["categoryId"],
                })
        if prompt_specs:
            prompt_storage.add_prompts_import(prompt_specs, target_file=shard_targets["prompts"])

        # 3. 批量创建映射（一次读写）
        mapping_specs = []
        for r in results:
            if r['success']:
                mapping_specs.append({
                    "image_path": r["imagePath"],
                    "prompt_string": r["value"],
                    "file_info": r.get("fileInfo") or None,
                    "mapping_type": "local",
                })
        if mapping_specs:
            mapping_storage.add_mappings_import(mapping_specs, target_file=shard_targets["images"])
            cover_prompt_specs = [
                {"categoryId": r["categoryId"], "value": r["value"]}
                for r in results
                if r["success"] and r.get("value")
            ]
            apply_import_covers(prompt_storage, cover_prompt_specs, mapping_specs)

        imported = sum(1 for r in results if r['success'])
        failed = len(results) - imported
        created_prompts = [r for r in results if r['success'] and r.get('value')]

        return web.json_response({
            'success': True,
            'imported': imported,
            'failed': failed,
            'results': results,
            'createdPrompts': created_prompts,
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.json_response({'error': str(e)}, status=500)


@server.PromptServer.instance.routes.post("/prompt_gallery/import/preview")
async def import_preview(request):
    """
    预览导入结果
    显示文件名如何解析，不会实际导入
    """
    try:
        data = await request.json()
        filenames = data.get("filenames", [])
        config = data.get("config", {})

        if not filenames:
            return web.json_response({"error": "没有提供文件名"}, status=400)

        from ..import_handler import parse_prompt_info_from_filename

        # 预先获取存储实例（循环内复用）
        prompt_storage, _, category_storage = get_storage()

        preview = []

        for filename in filenames:
            value, display_name, error_msg, will_create = \
                parse_prompt_info_from_filename(filename, config)

            category_id = config.get("defaultCategoryId", "root")

            # 获取分类名称
            category = category_storage.get_category_by_id(category_id)
            category_name = category.get("name", "unknown") if category else "unknown"

            # 检查Prompt是否存在
            prompt_exists = prompt_storage.get_prompt(category_id, value) is not None if value else False

            preview.append({
                'filename': filename,
                'parsedPrompt': value,
                'name': display_name,
                'category': category_name,
                'categoryId': category_id,
                'willCreate': will_create and not prompt_exists,
                'warnings': [] if value else ['无法解析Prompt名称']
            })

        # 统计
        matched = sum(1 for p in preview if p['parsedPrompt'])
        unmatched = len(preview) - matched

        return web.json_response({
            'preview': preview,
            'totalFiles': len(filenames),
            'matchedFiles': matched,
            'unmatchedFiles': unmatched
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.json_response({'error': str(e)}, status=500)


# ============ 导出导入 API ============

@server.PromptServer.instance.routes.post("/prompt_gallery/export")
async def export_prompts(request):
    """导出Prompt（含图片）为 ZIP 文件"""
    import folder_paths
    import zipfile
    import io
    import time

    try:
        data = await request.json()
        prompts_param = data.get("prompts", [])
        include_images = data.get("includeImages", True)
        max_images = data.get("maxImagesPerPrompt", 0)  # 0 = unlimited

        prompt_storage, mapping_storage, _ = get_storage()
        output_dir = Path(folder_paths.get_output_directory())

        exported_images = {}
        manifest_prompts = []
        export_prompt_records = []

        for prompt_key in prompts_param:
            category_id = prompt_key.get("categoryId")
            value = prompt_key.get("value")

            prompt = prompt_storage.get_prompt(category_id, value)
            if not prompt:
                continue

            manifest_prompts.append({
                "value": prompt.get("value"),
                "name": prompt.get("name"),
                "alias": prompt.get("alias", ""),
            })
            export_prompt_records.append(prompt)

        # 单次遍历映射构建 Prompt → 图片索引，避免每个 Prompt 全量扫描（O(P×M)）
        prompt_mapping_index = mapping_storage.build_prompt_index_for_values(
            [p.get("value") for p in export_prompt_records if p.get("value")]
        )

        for prompt in export_prompt_records:
            value = prompt.get("value")
            mappings = prompt_mapping_index.get(value, [])
            if max_images > 0:
                mappings = mappings[:max_images]

            for mapping in mappings:
                image_path = mapping.get("imagePath")
                if image_path not in exported_images:
                    filename = Path(image_path).name
                    zip_path = f"images/{filename}"
                    exported_images[image_path] = {"path": zip_path, "promptString": mapping.get("promptString", value)}
                else:
                    existing = exported_images[image_path].get("promptString", "")
                    if value not in existing:
                        exported_images[image_path]["promptString"] = f"{existing}, {value}" if existing else value

        manifest_images = [
            {"path": info["path"], "promptString": info.get("promptString", "")}
            for info in exported_images.values()
        ]

        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            manifest = {
                "version": 1,
                "exportedAt": int(time.time() * 1000),
                "prompts": manifest_prompts,
                "images": manifest_images if include_images else [],
            }
            zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))

            if include_images:
                for original_path, info in exported_images.items():
                    full_path = Path(output_dir) / original_path
                    if full_path.exists():
                        zf.write(full_path, info["path"])

        from datetime import datetime
        date_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"prompts_export_{date_str}.zip"

        zip_buffer.seek(0)
        return web.Response(
            body=zip_buffer.read(),
            content_type='application/zip',
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"'
            }
        )
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/prompt_gallery/export-category")
async def export_category(request):
    """导出分类（递归包含子分类和 Prompt）为 ZIP 文件。"""
    import folder_paths
    import zipfile
    import io
    import time

    try:
        data = await request.json()
        category_id = data.get("categoryId", "root")
        include_images = data.get("includeImages", True)
        max_images = data.get("maxImagesPerPrompt", 0)  # 0 = unlimited

        prompt_storage, mapping_storage, category_storage = get_storage()
        output_dir = Path(folder_paths.get_output_directory())

        # 验证分类存在
        root_cat = category_storage.get_category_by_id(category_id)
        if not root_cat:
            return web.json_response({"error": "分类不存在"}, status=404)

        # 递归收集所有后代分类ID
        all_cat_ids = category_storage.get_descendant_ids(category_id)
        all_categories = category_storage.get_all_categories()
        export_categories = [c for c in all_categories if c["id"] in set(all_cat_ids)]

        # 收集这些分类下的所有Prompt
        all_prompts = prompt_storage.get_all_prompts()
        export_prompts_list = [a for a in all_prompts if a.get("categoryId") in set(all_cat_ids)]

        # 批量构建Prompt → 图片映射索引
        prompt_mapping_index = mapping_storage.build_prompt_index_for_values([p.get("value") for p in export_prompts_list if p.get("value")])

        # 收集所有相关图片
        exported_images = {}
        for prompt in export_prompts_list:
            value = prompt.get("value")
            mappings = prompt_mapping_index.get(value, [])
            if max_images > 0:
                mappings = mappings[:max_images]
            for mapping in mappings:
                image_path = mapping.get("imagePath")
                if image_path not in exported_images:
                    filename = Path(image_path).name
                    zip_path = f"images/{filename}"
                    exported_images[image_path] = {"path": zip_path, "promptString": mapping.get("promptString", value)}
                else:
                    existing = exported_images[image_path].get("promptString", "")
                    if value not in existing:
                        exported_images[image_path]["promptString"] = f"{existing}, {value}" if existing else value

        # 按拓扑顺序排列分类（父在前子在后）
        parent_map = {c["id"]: c.get("parentId") for c in export_categories}
        def get_depth(cat_id):
            depth = 0
            current = cat_id
            while current and current != category_id:
                current = parent_map.get(current)
                depth += 1
            return depth
        export_categories.sort(key=lambda c: get_depth(c["id"]))

        # 构建 manifest
        manifest_categories = [
            {
                "id": c.get("id"),
                "name": c.get("name"),
                "parentId": c.get("parentId"),
                "order": c.get("order", 0),
            }
            for c in export_categories
        ]

        manifest_prompts = [
            {
                "value": a.get("value"),
                "name": a.get("name"),
                "alias": a.get("alias", ""),
                "categoryId": a.get("categoryId"),
            }
            for a in export_prompts_list
        ]

        manifest_images = [
            {"path": info["path"], "promptString": info.get("promptString", "")}
            for info in exported_images.values()
        ]

        manifest = {
            "version": 2,
            "exportedAt": int(time.time() * 1000),
            "rootCategoryId": category_id,
            "rootCategoryName": root_cat.get("name"),
            "categories": manifest_categories,
            "prompts": manifest_prompts,
            "images": [] if not include_images else manifest_images,
        }

        # 写入 ZIP
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))

            if include_images:
                for original_path, info in exported_images.items():
                    full_path = Path(output_dir) / original_path
                    if full_path.exists():
                        zf.write(full_path, info["path"])

        from datetime import datetime
        from urllib.parse import quote
        date_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        cat_name = root_cat.get("name", "export")
        ascii_name = "".join(c for c in cat_name if c.isascii() and c.isalnum()) or "export"
        filename = f"category_{cat_name}_{date_str}.zip"
        ascii_filename = f"category_{ascii_name}_{date_str}.zip"

        zip_buffer.seek(0)
        return web.Response(
            body=zip_buffer.read(),
            content_type='application/zip',
            headers={
                'Content-Disposition':
                    f"attachment; filename=\"{ascii_filename}\"; filename*=UTF-8''{quote(filename)}"
            }
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/prompt_gallery/import")
async def import_unified(request):
    """统一导入（支持 v1 Prompt格式 和 v2 分类格式）"""
    import folder_paths
    import zipfile
    import io
    import time
    import random

    try:
        reader = await request.multipart()
        field = await reader.next()

        if not field or field.name != 'file':
            return web.json_response({"error": "未找到上传文件"}, status=400)

        zip_bytes = await field.read(decode=True)
        target_category_id = request.query.get("categoryId", "root")
        separate_storage = request.query.get("separate", "").lower() in ("1", "true", "yes")

        prompt_storage, mapping_storage, category_storage = get_storage()
        output_dir = Path(folder_paths.get_output_directory()) / "prompt_gallery"
        output_dir.mkdir(parents=True, exist_ok=True)

        buffer = io.BytesIO(zip_bytes)

        with zipfile.ZipFile(buffer, 'r') as zf:
            manifest_data = json.loads(zf.read("manifest.json"))
            version = manifest_data.get("version", 1)

            if version >= 2:
                # v2: 分类 + Prompt + 图片；旧包中的 combinations 字段直接忽略。
                return await _import_v2(
                    zf, manifest_data, target_category_id,
                    prompt_storage, mapping_storage, category_storage,
                    output_dir, separate_storage,
                )
            else:
                # v1: 仅Prompt+图片
                return await _import_v1(
                    zf, manifest_data, target_category_id,
                    prompt_storage, mapping_storage, output_dir, separate_storage,
                )

    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.json_response({"error": str(e)}, status=500)


async def _import_v1(zf, manifest_data, target_category_id, prompt_storage, mapping_storage, output_dir, separate_storage=False):
    """v1 导入：仅Prompt + 图片"""
    import time
    import random

    shard_targets = _make_shard_targets(prompt_storage.storage_dir, separate_storage)

    # 1. 批量导入 Prompt（一次读写）
    prompt_specs = []
    for prompt_info in manifest_data.get("prompts", []):
        value = (prompt_info.get("value") or prompt_info.get("name", "")).strip()
        if not value:
            continue
        prompt_specs.append({
            "value": value,
            "name": prompt_info.get("name") or prompt_info.get("displayName", value),
            "alias": prompt_info.get("alias", ""),
            "categoryId": target_category_id,
        })
    added_prompts_list, _ = prompt_storage.add_prompts_import(prompt_specs, target_file=shard_targets["prompts"])

    # 2. 提取图片文件 + 收集映射（一次读写）
    mapping_specs = []
    for img_info in manifest_data.get("images", []):
        img_path = img_info.get("path")
        img_type = img_info.get("type", "")
        prompt_names = img_info.get("prompts") or img_info.get("promptNames", [])
        prompt_string = img_info.get("promptString") or ", ".join(prompt_names)
        if not img_path:
            continue

        timestamp = int(time.time() * 1000)
        is_remote = img_type == "remote" or img_path.startswith("http://") or img_path.startswith("https://")

        if is_remote:
            mapping_specs.append({
                "image_path": img_path,
                "prompt_string": prompt_string,
                "file_info": {"createdAt": timestamp},
                "mapping_type": "remote",
            })
        else:
            if img_path not in zf.namelist():
                continue
            rand_num = random.randint(0, 99999)
            new_filename = f"AG_{timestamp}_{rand_num:05d}.png"
            new_path = output_dir / new_filename
            with open(new_path, 'wb') as f:
                f.write(zf.read(img_path))
            mapping_specs.append({
                "image_path": f"prompt_gallery/{new_filename}",
                "prompt_string": prompt_string,
                "file_info": {"createdAt": timestamp},
                "mapping_type": "local",
            })

    mapping_storage.add_mappings_import(mapping_specs, target_file=shard_targets["images"])
    apply_import_covers(prompt_storage, prompt_specs, mapping_specs)

    return web.json_response({
        "success": True,
        "addedPrompts": len(added_prompts_list),
        "addedImages": len(mapping_specs),
        "addedCategories": 0,
        "prompts": [p["value"] for p in added_prompts_list],
    })


async def _import_v2(zf, manifest_data, target_category_id,
                     prompt_storage, mapping_storage, category_storage, output_dir,
                     separate_storage=False):
    """v2 导入：分类树 + Prompt + 图片。"""
    import time
    import random

    shard_targets = _make_shard_targets(prompt_storage.storage_dir, separate_storage)

    print(f"[ImportV2] 开始导入...")
    print(f"  分类: {len(manifest_data.get('categories', []))}")
    print(f"  Prompt: {len(manifest_data.get('prompts', []))}")
    print(f"  图片: {len(manifest_data.get('images', []))}")

    # A. 重建分类树（批量，一次读写）
    old_to_new_cat = {}  # old_category_id -> new_category_id
    root_old_id = manifest_data.get("rootCategoryId")
    root_cat_name = manifest_data.get("rootCategoryName", "")

    # 按拓扑排序：根分类排前面，子分类排后面
    manifest_cats = manifest_data.get("categories", [])
    cat_specs = []  # 待创建的分类规格
    cat_spec_map = {}  # old_id -> index in cat_specs

    # 先加入根分类
    if root_old_id and root_cat_name:
        cat_spec_map[root_old_id] = len(cat_specs)
        cat_specs.append({
            "oldId": root_old_id,
            "name": root_cat_name,
            "oldParentId": None,
            "order": 0,
        })

    # 再加入子分类
    for cat_info in manifest_cats:
        old_id = cat_info.get("id")
        name = cat_info.get("name", "")
        if not old_id or not name or old_id == root_old_id:
            continue
        cat_spec_map[old_id] = len(cat_specs)
        cat_specs.append({
            "oldId": old_id,
            "name": name,
            "oldParentId": cat_info.get("parentId"),
            "order": cat_info.get("order", 0),
        })

    # 批量创建（一次加锁、一次读写）
    batch_specs = []
    for spec in cat_specs:
        batch_specs.append({
            "name": spec["name"],
            "parentId": target_category_id,  # 临时，后面修正
            "order": spec["order"],
        })
    print(f"[ImportV2] 批量创建 {len(batch_specs)} 个分类...")
    created_cats = category_storage.add_categories_batch(batch_specs, target_file=shard_targets["categories"])
    print(f"[ImportV2] 分类创建完成: {len(created_cats)} 个")

    # 构建 old_to_new 映射，并修正 parentId
    for i, spec in enumerate(cat_specs):
        old_to_new_cat[spec["oldId"]] = created_cats[i]["id"]

    # 修正 parentId（子分类指向新的父分类）
    updates = []
    for i, spec in enumerate(cat_specs):
        old_parent = spec.get("oldParentId")
        if old_parent and old_parent in old_to_new_cat:
            new_parent = old_to_new_cat[old_parent]
            if created_cats[i]["parentId"] != new_parent:
                updates.append((created_cats[i]["id"], new_parent))

    if updates:
        with category_storage._lock:
            data = category_storage._read_data()
            id_to_cat = {c["id"]: c for c in data["categories"]}
            for cat_id, new_parent in updates:
                if cat_id in id_to_cat:
                    id_to_cat[cat_id]["parentId"] = new_parent
            category_storage._write_data(data)

    added_categories = len(created_cats)

    # B. 批量导入Prompt（一次读写）
    prompt_specs = []
    for prompt_info in manifest_data.get("prompts", []):
        value = (prompt_info.get("value") or prompt_info.get("name", "")).strip()
        if not value:
            continue
        old_cat_id = prompt_info.get("categoryId")
        new_cat_id = old_to_new_cat.get(old_cat_id, target_category_id)
        prompt_specs.append({
            "value": value,
            "name": prompt_info.get("name") or prompt_info.get("displayName", value),
            "alias": prompt_info.get("alias", ""),
            "categoryId": new_cat_id,
        })
    print(f"[ImportV2] 批量导入 {len(prompt_specs)} 个 Prompt...")
    added_prompts_list, _ = prompt_storage.add_prompts_import(prompt_specs, target_file=shard_targets["prompts"])
    print(f"[ImportV2] Prompt 导入完成: {len(added_prompts_list)} 个")

    # C. 批量导入图片映射（先提取文件，再一次写入）
    mapping_specs = []
    for img_info in manifest_data.get("images", []):
        img_path = img_info.get("path")
        img_type = img_info.get("type", "")
        prompt_names = img_info.get("prompts") or img_info.get("promptNames", [])
        prompt_string = img_info.get("promptString") or ", ".join(prompt_names)
        if not img_path:
            continue

        timestamp = int(time.time() * 1000)
        is_remote = img_type == "remote" or img_path.startswith("http://") or img_path.startswith("https://")

        if is_remote:
            mapping_specs.append({
                "image_path": img_path,
                "prompt_string": prompt_string,
                "file_info": {"createdAt": timestamp},
                "mapping_type": "remote",
            })
        else:
            if img_path not in zf.namelist():
                continue
            rand_num = random.randint(0, 99999)
            new_filename = f"AG_{timestamp}_{rand_num:05d}.png"
            new_path = output_dir / new_filename
            with open(new_path, 'wb') as f:
                f.write(zf.read(img_path))
            mapping_specs.append({
                "image_path": f"prompt_gallery/{new_filename}",
                "prompt_string": prompt_string,
                "file_info": {"createdAt": timestamp},
                "mapping_type": "local",
            })

    print(f"[ImportV2] 批量导入 {len(mapping_specs)} 个图片映射...")
    mapping_storage.add_mappings_import(mapping_specs, target_file=shard_targets["images"])
    cover_result = apply_import_covers(prompt_storage, prompt_specs, mapping_specs)
    if cover_result["prompts"]:
        print(f"[ImportV2] 封面补齐: Prompt={cover_result['prompts']}")
    print(f"[ImportV2] 导入完成! 分类={added_categories}, Prompt={len(added_prompts_list)}, 图片={len(mapping_specs)}")

    return web.json_response({
        "success": True,
        "addedCategories": added_categories,
        "addedPrompts": len(added_prompts_list),
        "addedImages": len(mapping_specs),
        "prompts": [p["value"] for p in added_prompts_list],
    })


@server.PromptServer.instance.routes.post("/prompt_gallery/import-prompts")
async def import_prompts_legacy(request):
    """旧版导入端点（兼容）"""
    return await import_unified(request)
