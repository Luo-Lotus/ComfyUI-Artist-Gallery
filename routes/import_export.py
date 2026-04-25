"""
Import/Export 端点
"""
import json
from pathlib import Path
from aiohttp import web
import server
from ..storage import get_storage


# ============ Import API ============

@server.PromptServer.instance.routes.post("/artist_gallery/import/batch")
async def import_images_batch(request):
    """
    批量导入图片到画廊
    支持单个画师导入和自定义规则批量导入
    """
    import asyncio
    import base64
    import time
    import random
    import folder_paths
    from io import BytesIO

    from ..import_handler import (
        save_image_with_metadata,
        parse_artist_info_from_filename
    )

    try:
        data = await request.json()
        mode = data.get("mode", "single")  # "single" | "custom"
        images = data.get("images", [])
        config = data.get("config", {})

        print(f"[ImportBatch] 收到导入请求")
        print(f"  mode: {mode}")
        print(f"  images数量: {len(images)}")
        print(f"  config: {config}")
        if images:
            print(f"  第一个文件名: {images[0].get('filename')}")

        if not images:
            return web.json_response({"error": "没有提供图片"}, status=400)

        # 获取存储实例
        artist_storage, mapping_storage, category_storage, _ = get_storage()

        # 准备输出目录
        output_dir = Path(folder_paths.get_output_directory())
        save_dir = output_dir / "artist_gallery"
        save_dir.mkdir(parents=True, exist_ok=True)

        # 并发控制（最多5个并发）
        semaphore = asyncio.Semaphore(5)

        async def import_single_image(image_data: dict):
            """导入单张图片"""
            async with semaphore:
                try:
                    # 1. 解码base64
                    image_bytes = base64.b64decode(image_data['data'])
                    filename = image_data['filename']

                    # 2. 解析画师信息
                    if mode == "single":
                        # 单个画师模式：直接使用配置中的画师信息
                        artist_name = config.get("artistName", "").strip()
                        display_name = config.get("displayName", artist_name)
                        category_id = config.get("categoryId", "root")
                        will_create_artist = False
                        error_msg = None
                    else:
                        # 自定义模式：从文件名解析
                        artist_name, display_name, error_msg, will_create_artist = \
                            parse_artist_info_from_filename(filename, config)
                        category_id = config.get("defaultCategoryId", "root")

                    if not artist_name:
                        return {
                            'filename': filename,
                            'success': False,
                            'error': error_msg or '无法解析画师名称'
                        }

                    # 3. 确保画师存在
                    artist = artist_storage.get_artist(category_id, artist_name)
                    if not artist and will_create_artist:
                        try:
                            artist = artist_storage.add_artist(
                                name=artist_name,
                                display_name=display_name,
                                category_id=category_id
                            )
                        except ValueError:
                            # 画师已存在（并发情况）
                            artist = artist_storage.get_artist(category_id, artist_name)

                    if not artist:
                        return {
                            'filename': filename,
                            'success': False,
                            'error': '画师不存在且未启用自动创建'
                        }

                    # 4. 生成唯一文件名
                    timestamp = int(time.time() * 1000)
                    counter = random.randint(0, 99999)
                    new_filename = f"AG_{timestamp}_{counter:05}.png"
                    save_path = save_dir / new_filename

                    # 5. 保存图片并嵌入metadata（一次性完成）
                    selected_artists = [{
                        "categoryId": category_id,
                        "name": artist_name,
                        "displayName": display_name
                    }]

                    success, metadata = save_image_with_metadata(
                        image_bytes=image_bytes,
                        save_path=save_path,
                        artist_names=[artist_name],
                        display_names=[display_name],
                        categories=[category_id],
                        selected_artists=selected_artists
                    )

                    if not success:
                        # 保存失败，删除文件（如果已创建）
                        if save_path.exists():
                            save_path.unlink()
                        return {
                            'filename': filename,
                            'success': False,
                            'error': '图片保存失败'
                        }

                    # 6. 创建映射关系
                    image_rel_path = f"artist_gallery/{new_filename}"
                    mapping_storage.add_mapping(
                        image_rel_path,
                        [artist_name],
                        metadata or {"width": 0, "height": 0}
                    )

                    # 7. 更新画师计数
                    artist_storage.update_image_count(category_id, artist_name, 1)

                    return {
                        'filename': filename,
                        'success': True,
                        'imagePath': image_rel_path,
                        'artistName': artist_name,
                        'displayName': display_name,
                        'categoryId': category_id
                    }

                except Exception as e:
                    import traceback
                    traceback.print_exc()
                    return {
                        'filename': image_data.get('filename', 'unknown'),
                        'success': False,
                        'error': str(e)
                    }

        # 并发处理所有图片
        tasks = [import_single_image(img) for img in images]
        results = await asyncio.gather(*tasks)

        # 统计结果
        imported = sum(1 for r in results if r['success'])
        failed = len(results) - imported

        # 收集创建的画师
        created_artists = [
            r for r in results
            if r['success'] and r.get('artistName')
        ]

        return web.json_response({
            'success': True,
            'imported': imported,
            'failed': failed,
            'results': results,
            'createdArtists': created_artists
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.json_response({'error': str(e)}, status=500)


@server.PromptServer.instance.routes.post("/artist_gallery/import/preview")
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

        from ..import_handler import parse_artist_info_from_filename

        preview = []

        for filename in filenames:
            artist_name, display_name, error_msg, will_create = \
                parse_artist_info_from_filename(filename, config)

            category_id = config.get("defaultCategoryId", "root")

            # 获取分类名称
            _, _, category_storage, _ = get_storage()
            category = category_storage.get_category_by_id(category_id)
            category_name = category.get("name", "unknown") if category else "unknown"

            # 检查画师是否存在
            artist_storage, _, _, _ = get_storage()
            artist_exists = artist_storage.get_artist(category_id, artist_name) is not None if artist_name else False

            preview.append({
                'filename': filename,
                'parsedArtist': artist_name,
                'displayName': display_name,
                'category': category_name,
                'categoryId': category_id,
                'willCreate': will_create and not artist_exists,
                'warnings': [] if artist_name else ['无法解析画师名称']
            })

        # 统计
        matched = sum(1 for p in preview if p['parsedArtist'])
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

@server.PromptServer.instance.routes.post("/artist_gallery/export")
async def export_artists(request):
    """导出画师（含图片）为 ZIP 文件"""
    import folder_paths
    import zipfile
    import io
    import time

    try:
        data = await request.json()
        artists_param = data.get("artists", [])
        include_images = data.get("includeImages", True)
        max_images = data.get("maxImagesPerArtist", 0)  # 0 = unlimited

        artist_storage, mapping_storage, _, _ = get_storage()
        output_dir = Path(folder_paths.get_output_directory())

        exported_images = {}
        manifest_artists = []

        for artist_key in artists_param:
            category_id = artist_key.get("categoryId")
            name = artist_key.get("name")

            artist = artist_storage.get_artist(category_id, name)
            if not artist:
                continue

            manifest_artists.append({
                "name": artist.get("name"),
                "displayName": artist.get("displayName"),
            })

            mappings = mapping_storage.get_mappings_by_artist(name)
            if max_images > 0:
                mappings = mappings[:max_images]

            for mapping in mappings:
                image_path = mapping.get("imagePath")
                if image_path not in exported_images:
                    filename = Path(image_path).name
                    zip_path = f"images/{filename}"
                    exported_images[image_path] = {"path": zip_path, "artistNames": [name]}
                else:
                    if name not in exported_images[image_path]["artistNames"]:
                        exported_images[image_path]["artistNames"].append(name)

        manifest_images = [
            {"path": info["path"], "artistNames": info["artistNames"]}
            for info in exported_images.values()
        ]

        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            manifest = {
                "version": 1,
                "exportedAt": int(time.time() * 1000),
                "artists": manifest_artists,
                "images": manifest_images if include_images else [],
            }
            zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))

            if include_images:
                for original_path, info in exported_images.items():
                    full_path = output_dir / original_path
                    if full_path.exists():
                        zf.write(full_path, info["path"])

        from datetime import datetime
        date_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"artists_export_{date_str}.zip"

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


@server.PromptServer.instance.routes.post("/artist_gallery/export-category")
async def export_category(request):
    """导出分类（递归包含子分类、画师、组合）为 ZIP 文件"""
    import folder_paths
    import zipfile
    import io
    import time

    try:
        data = await request.json()
        category_id = data.get("categoryId", "root")
        include_images = data.get("includeImages", True)
        max_images = data.get("maxImagesPerArtist", 0)  # 0 = unlimited

        artist_storage, mapping_storage, category_storage, combination_storage = get_storage()
        output_dir = Path(folder_paths.get_output_directory())

        # 验证分类存在
        root_cat = category_storage.get_category_by_id(category_id)
        if not root_cat:
            return web.json_response({"error": "分类不存在"}, status=404)

        # 递归收集所有后代分类ID
        all_cat_ids = category_storage.get_descendant_ids(category_id)
        all_categories = category_storage.get_all_categories()
        export_categories = [c for c in all_categories if c["id"] in set(all_cat_ids)]

        # 收集这些分类下的所有画师
        all_artists = artist_storage.get_all_artists()
        export_artists_list = [a for a in all_artists if a.get("categoryId") in set(all_cat_ids)]

        # 收集这些分类下的所有组合
        all_combinations = combination_storage.get_all_combinations()
        export_combinations = [c for c in all_combinations if c.get("categoryId") in set(all_cat_ids)]

        # 批量构建画师 → 图片映射索引
        artist_mapping_index = mapping_storage.build_artist_index()

        # 收集所有相关图片
        exported_images = {}
        for artist in export_artists_list:
            name = artist.get("name")
            mappings = artist_mapping_index.get(name, [])
            if max_images > 0:
                mappings = mappings[:max_images]
            for mapping in mappings:
                image_path = mapping.get("imagePath")
                if image_path not in exported_images:
                    filename = Path(image_path).name
                    zip_path = f"images/{filename}"
                    exported_images[image_path] = {"path": zip_path, "artistNames": [name]}
                else:
                    if name not in exported_images[image_path]["artistNames"]:
                        exported_images[image_path]["artistNames"].append(name)

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

        manifest_artists = [
            {
                "name": a.get("name"),
                "displayName": a.get("displayName"),
                "categoryId": a.get("categoryId"),
            }
            for a in export_artists_list
        ]

        manifest_combinations = [
            {
                "name": c.get("name"),
                "categoryId": c.get("categoryId"),
                "artistKeys": c.get("artistKeys", []),
                "outputContent": c.get("outputContent", ""),
            }
            for c in export_combinations
        ]

        manifest_images = [
            {"path": info["path"], "artistNames": info["artistNames"]}
            for info in exported_images.values()
        ]

        manifest = {
            "version": 2,
            "exportedAt": int(time.time() * 1000),
            "rootCategoryId": category_id,
            "rootCategoryName": root_cat.get("name"),
            "categories": manifest_categories,
            "artists": manifest_artists,
            "combinations": manifest_combinations,
            "images": [] if not include_images else manifest_images,
        }

        # 写入 ZIP
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))

            if include_images:
                for original_path, info in exported_images.items():
                    full_path = output_dir / original_path
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


@server.PromptServer.instance.routes.post("/artist_gallery/import")
async def import_unified(request):
    """统一导入（支持 v1 画师格式 和 v2 分类格式）"""
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

        artist_storage, mapping_storage, category_storage, combination_storage = get_storage()
        output_dir = Path(folder_paths.get_output_directory()) / "artist_gallery"
        output_dir.mkdir(parents=True, exist_ok=True)

        buffer = io.BytesIO(zip_bytes)

        with zipfile.ZipFile(buffer, 'r') as zf:
            manifest_data = json.loads(zf.read("manifest.json"))
            version = manifest_data.get("version", 1)

            if version >= 2:
                # v2: 分类+画师+组合+图片
                return await _import_v2(
                    zf, manifest_data, target_category_id,
                    artist_storage, mapping_storage, category_storage, combination_storage,
                    output_dir,
                )
            else:
                # v1: 仅画师+图片
                return await _import_v1(
                    zf, manifest_data, target_category_id,
                    artist_storage, mapping_storage, output_dir,
                )

    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.json_response({"error": str(e)}, status=500)


async def _import_v1(zf, manifest_data, target_category_id, artist_storage, mapping_storage, output_dir):
    """v1 导入：仅画师 + 图片"""
    import time
    import random

    added_artists = []
    added_images = 0

    for artist_info in manifest_data.get("artists", []):
        name = artist_info.get("name", "").strip()
        if not name:
            continue
        existing = artist_storage.get_artist(target_category_id, name)
        if not existing:
            try:
                artist_storage.add_artist(
                    name=name,
                    display_name=artist_info.get("displayName", name),
                    category_id=target_category_id,
                )
                added_artists.append(name)
            except ValueError:
                pass

    for img_info in manifest_data.get("images", []):
        zip_img_path = img_info.get("path")
        artist_names = img_info.get("artistNames", [])
        if not zip_img_path or zip_img_path not in zf.namelist():
            continue

        timestamp = int(time.time() * 1000)
        rand_num = random.randint(0, 99999)
        new_filename = f"AG_{timestamp}_{rand_num:05d}.png"
        new_path = output_dir / new_filename

        with open(new_path, 'wb') as f:
            f.write(zf.read(zip_img_path))

        relative_path = f"artist_gallery/{new_filename}"
        mapping_storage.add_mapping(
            image_path=relative_path,
            artist_names=artist_names,
        )
        added_images += 1

    return web.json_response({
        "success": True,
        "addedArtists": len(added_artists),
        "addedCombinations": 0,
        "addedImages": added_images,
        "addedCategories": 0,
        "artists": added_artists,
    })


async def _import_v2(zf, manifest_data, target_category_id,
                     artist_storage, mapping_storage, category_storage, combination_storage, output_dir):
    """v2 导入：分类树 + 画师 + 组合 + 图片"""
    import time
    import random

    # A. 重建分类树
    old_to_new_cat = {}  # old_category_id -> new_category_id
    root_old_id = manifest_data.get("rootCategoryId")
    root_cat_name = manifest_data.get("rootCategoryName", "")

    # 先创建根分类（作为目标分类的子分类）
    if root_old_id and root_cat_name:
        final_name = root_cat_name
        suffix = 2
        while True:
            try:
                new_cat = category_storage.add_category(name=final_name, parent_id=target_category_id)
                break
            except ValueError:
                final_name = f"{root_cat_name} ({suffix})"
                suffix += 1
        old_to_new_cat[root_old_id] = new_cat["id"]
        added_categories = 1

    # 创建子分类（跳过根分类）
    for cat_info in manifest_data.get("categories", []):
        old_id = cat_info.get("id")
        old_parent_id = cat_info.get("parentId")
        name = cat_info.get("name", "")

        if not old_id or not name:
            continue

        # 跳过根分类（已创建）
        if old_id == root_old_id:
            continue

        # 确定新的父分类ID
        new_parent_id = old_to_new_cat.get(old_parent_id, target_category_id)

        # 创建分类，处理名称冲突
        final_name = name
        suffix = 2
        while True:
            try:
                new_cat = category_storage.add_category(name=final_name, parent_id=new_parent_id)
                break
            except ValueError:
                final_name = f"{name} ({suffix})"
                suffix += 1

        old_to_new_cat[old_id] = new_cat["id"]
        added_categories += 1

    # B. 导入画师
    added_artists = []
    for artist_info in manifest_data.get("artists", []):
        name = artist_info.get("name", "").strip()
        if not name:
            continue
        old_cat_id = artist_info.get("categoryId")
        new_cat_id = old_to_new_cat.get(old_cat_id, target_category_id)

        existing = artist_storage.get_artist(new_cat_id, name)
        if not existing:
            try:
                artist_storage.add_artist(
                    name=name,
                    display_name=artist_info.get("displayName", name),
                    category_id=new_cat_id,
                )
                added_artists.append(name)
            except ValueError:
                pass

    # C. 导入组合
    added_combinations = 0
    for comb_info in manifest_data.get("combinations", []):
        name = comb_info.get("name", "").strip()
        if not name:
            continue
        old_cat_id = comb_info.get("categoryId")
        new_cat_id = old_to_new_cat.get(old_cat_id, target_category_id)
        artist_keys = comb_info.get("artistKeys", [])
        output_content = comb_info.get("outputContent", "")

        try:
            combination_storage.add_combination(
                name=name,
                category_id=new_cat_id,
                artist_keys=artist_keys,
                output_content=output_content,
            )
            added_combinations += 1
        except Exception:
            pass

    # D. 导入图片文件
    added_images = 0
    for img_info in manifest_data.get("images", []):
        zip_img_path = img_info.get("path")
        artist_names = img_info.get("artistNames", [])
        if not zip_img_path or zip_img_path not in zf.namelist():
            continue

        timestamp = int(time.time() * 1000)
        rand_num = random.randint(0, 99999)
        new_filename = f"AG_{timestamp}_{rand_num:05d}.png"
        new_path = output_dir / new_filename

        with open(new_path, 'wb') as f:
            f.write(zf.read(zip_img_path))

        relative_path = f"artist_gallery/{new_filename}"
        mapping_storage.add_mapping(
            image_path=relative_path,
            artist_names=artist_names,
        )
        added_images += 1

    return web.json_response({
        "success": True,
        "addedCategories": added_categories,
        "addedArtists": len(added_artists),
        "addedCombinations": added_combinations,
        "addedImages": added_images,
        "artists": added_artists,
    })


@server.PromptServer.instance.routes.post("/artist_gallery/import-artists")
async def import_artists_legacy(request):
    """旧版导入端点（兼容）"""
    return await import_unified(request)
