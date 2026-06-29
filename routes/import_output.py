"""
ComfyUI Output Images Import Endpoint
扫描 ComfyUI output 目录，导入图片并读取 PNG prompt 元数据
"""
import asyncio
import json
import os
from pathlib import Path
from aiohttp import web
import server
from ..storage import get_storage


IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp'}
COMFY_OUTPUT_SHARD = "comfy_output.images.json"


@server.PromptServer.instance.routes.post("/prompt_gallery/import_output")
async def import_comfy_output(request):
    """
    扫描 ComfyUI output 目录，按白名单/黑名单过滤文件夹，
    读取图片元数据，批量写入映射。
    """
    try:
        import folder_paths

        data = await request.json()
        filter_mode = data.get("filterMode", "whitelist")
        folders = [f.strip() for f in data.get("folders", []) if f.strip()]

        output_dir = Path(folder_paths.get_output_directory())
        _, mapping_storage, _, _ = get_storage()
        storage_dir = Path(mapping_storage.storage_dir)
        target_file = str(storage_dir / COMFY_OUTPUT_SHARD)

        # 阶段0：加载已有映射，构建去重集合
        existing_paths = set()
        for m in mapping_storage.get_all_mappings():
            p = m.get("imagePath")
            if p:
                existing_paths.add(p)

        # 构建过滤路径集合
        allowed_dirs = set()
        blocked_dirs = set()
        target_set = allowed_dirs if filter_mode == "whitelist" else blocked_dirs
        for folder in folders:
            resolved = (output_dir / folder).resolve()
            target_set.add(resolved)

        # 阶段1：收集图片文件，过滤 + 去重
        image_files = []
        duplicated = 0
        for dirpath, rel_path, fname in _walk_output(output_dir, filter_mode, allowed_dirs, blocked_dirs):
            ext = os.path.splitext(fname)[1].lower()
            if ext not in IMAGE_EXTENSIONS:
                continue
            # 构建相对于 output_dir 的路径
            if rel_path:
                img_rel = f"{rel_path}/{fname}"
            else:
                img_rel = fname
            # 去重检查
            if img_rel in existing_paths:
                duplicated += 1
                continue
            full_path = os.path.join(dirpath, fname)
            image_files.append((full_path, img_rel))

        if not image_files:
            return web.json_response({
                "success": True,
                "totalScanned": duplicated,
                "imported": 0,
                "duplicated": duplicated,
                "errorCount": 0,
            })

        # 阶段2：并发读取元数据
        semaphore = asyncio.Semaphore(10)

        async def read_metadata(full_path, rel_path):
            async with semaphore:
                try:
                    loop = asyncio.get_event_loop()
                    return await loop.run_in_executor(
                        None, _extract_metadata, full_path, rel_path
                    )
                except Exception as e:
                    return {"error": str(e), "path": rel_path}

        results = await asyncio.gather(*[
            read_metadata(fp, rp) for fp, rp in image_files
        ])

        # 阶段3：构建映射项，批量写入
        mapping_items = []
        errors = []

        for r in results:
            if "error" in r:
                errors.append(r)
                continue
            mapping_items.append(r)

        if mapping_items:
            mapping_storage.add_mappings_import(mapping_items, target_file=target_file)

        return web.json_response({
            "success": True,
            "totalScanned": len(image_files) + duplicated,
            "imported": len(mapping_items),
            "duplicated": duplicated,
            "errorCount": len(errors),
            "errors": errors[:20],
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.json_response({"error": str(e)}, status=500)


def _walk_output(output_dir, filter_mode, allowed_dirs, blocked_dirs):
    """
    递归遍历 output 目录，应用白名单/黑名单过滤。
    使用 os.scandir 提高性能。
    Yields: (dirpath, relative_path, filename)
    """
    output_resolved = output_dir.resolve()

    def is_dir_allowed(dir_path):
        """检查目录是否通过白名单/黑名单过滤"""
        resolved = Path(dir_path).resolve()
        if filter_mode == "whitelist":
            if not allowed_dirs:
                return False
            return any(
                str(resolved).startswith(str(a) + os.sep) or resolved == a
                for a in allowed_dirs
            )
        else:
            return not any(
                str(resolved).startswith(str(b) + os.sep) or resolved == b
                for b in blocked_dirs
            )

    def _scan_recursive(current_dir, rel_prefix):
        try:
            entries = list(os.scandir(current_dir))
        except (PermissionError, OSError):
            return
        subdirs = []
        for entry in entries:
            if entry.is_dir(follow_symlinks=False):
                subdirs.append(entry.name)
            elif entry.is_file(follow_symlinks=False):
                # 只在通过过滤的目录下收集文件
                if is_dir_allowed(current_dir):
                    yield (current_dir, rel_prefix, entry.name)
        for d in subdirs:
            new_prefix = f"{rel_prefix}/{d}" if rel_prefix else d
            yield from _scan_recursive(os.path.join(current_dir, d), new_prefix)

    yield from _scan_recursive(str(output_dir), "")


def _extract_metadata(full_path, rel_path):
    """
    提取图片文件信息和 PNG prompt 元数据。
    在线程池中执行（阻塞 IO）。
    """
    from PIL import Image

    stat = os.stat(full_path)
    file_info = {
        "createdAt": int(stat.st_mtime * 1000),
        "size": stat.st_size,
    }

    generate_prompt = None

    try:
        with Image.open(full_path) as img:
            file_info["width"] = img.width
            file_info["height"] = img.height
            ext = os.path.splitext(full_path)[1].lower()
            mime_map = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp'}
            file_info["type"] = mime_map.get(ext, f"image/{ext.lstrip('.')}")

            if hasattr(img, 'text') and 'prompt' in img.text:
                generate_prompt = img.text['prompt']
    except Exception:
        pass

    item = {
        "image_path": rel_path,
        "prompt_string": generate_prompt or "",
        "file_info": file_info,
        "mapping_type": "local",
    }
    if generate_prompt:
        item["generate_prompt"] = generate_prompt

    return item
