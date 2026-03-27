"""
Artist Gallery Node - 扫描并管理画师图片
"""
import os
import re
import json
from pathlib import Path
from aiohttp import web
import server
from .storage import get_storage

# 画师名称解析正则
ARTIST_REGEX = re.compile(r'^@([^,]+?)(?:,+\s*)?(?:_\d+)?\.(png|jpg|jpeg|webp)$', re.IGNORECASE)


def decode_filename(filename):
    """URL 解码文件名（支持多重编码）"""
    import urllib.parse
    decoded = filename
    max_iterations = 5
    iteration = 0
    previous = ''
    while decoded != previous and iteration < max_iterations:
        previous = decoded
        try:
            decoded = urllib.parse.unquote(previous)
        except Exception:
            break
        iteration += 1
    return decoded


def parse_artist_name(filename):
    """解析文件名获取画师名称"""
    decoded_filename = decode_filename(filename)
    match = ARTIST_REGEX.match(decoded_filename)
    return match.group(1) if match else None


def scan_output_directory(output_dir):
    """扫描 output 目录获取画师数据"""
    output_path = Path(output_dir)

    if not output_path.exists():
        return {"artists": [], "totalCount": 0, "error": "目录不存在"}

    artists = {}

    # 扫描所有图片文件
    for ext in ['*.png', '*.jpg', '*.jpeg', '*.webp']:
        for img_path in output_path.rglob(ext):
            filename = img_path.name
            artist_name = parse_artist_name(filename)

            if not artist_name:
                continue

            # 获取相对于 output 目录的路径（用于 /view 端点）
            try:
                rel_path = str(img_path.relative_to(output_path))
            except ValueError:
                # 如果图片不在 output 目录下，跳过
                continue

            if artist_name not in artists:
                artists[artist_name] = {
                    "name": artist_name,
                    "displayName": f"@{artist_name}",
                    "imageCount": 0,
                    "images": []
                }

            try:
                stat = img_path.stat()
                artists[artist_name]["images"].append({
                    "path": rel_path,
                    "size": stat.st_size,
                    "mtime": stat.st_mtime * 1000  # 转换为毫秒
                })
            except Exception as e:
                print(f"Error reading file {img_path}: {e}")
                continue

    # 排序图片
    for artist in artists.values():
        artist["images"].sort(key=lambda x: decode_filename(x["path"]))
        artist["imageCount"] = len(artist["images"])

    # 排序画师
    sorted_artists = sorted(artists.values(), key=lambda x: x["name"].lower())

    return {
        "artists": sorted_artists,
        "totalCount": len(sorted_artists),
        "generatedAt": None
    }


class ArtistGallery:
    """画师图库节点 - 管理面板"""

    CATEGORY = "🎨 Artist Gallery"
    RETURN_TYPES = ()
    FUNCTION = "gallery"
    OUTPUT_NODE = True

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "action": (["打开画廊", "刷新数据", "统计信息"], {"default": "打开画廊"}),
            }
        }

    def gallery(self, action="打开画廊"):
        """画师图库管理功能"""
        if action == "打开画廊":
            print("[ArtistGallery] 点击页面右下角的 🎨 按钮打开画廊")
        elif action == "刷新数据":
            print("[ArtistGallery] 数据已刷新 - 请在画廊中查看")
        elif action == "统计信息":
            try:
                artist_storage, _ = get_storage()
                artists = artist_storage.get_all_artists()
                total_artists = len(artists)
                total_images = sum(a.get("imageCount", 0) for a in artists)
                print(f"[ArtistGallery] 统计: {total_artists} 个画师, {total_images} 张图片")
            except Exception as e:
                print(f"[ArtistGallery] 获取统计信息失败: {e}")
        return ()


class ArtistSelector:
    """画师选择节点"""

    CATEGORY = "🎨 Artist Gallery"
    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("artists_string", "metadata_json")
    FUNCTION = "select_artists"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # 隐藏字段，用于从前端接收选择的画师字符串
                "selected_artists": ("STRING", {"default": "", "widget": "hidden"}),
            },
            "optional": {
                # 隐藏字段，用于从前端接收元数据
                "metadata": ("STRING", {"default": "{}", "widget": "hidden"}),
            }
        }

    def select_artists(self, selected_artists, metadata):
        """
        返回选择的画师信息
        从 kwargs 中读取前端设置的数据
        """
        artists_string = selected_artists if selected_artists else ""
        return (artists_string, metadata)


class SaveToGallery:
    """保存图片到画廊节点"""

    CATEGORY = "🎨 Artist Gallery"
    RETURN_TYPES = ()
    FUNCTION = "save_image"
    OUTPUT_NODE = True

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
                "metadata_json": ("STRING",),
            },
            "optional": {
                "filename_prefix": ("STRING", {"default": "AG"}),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            }
        }

    def save_image(self, images, metadata_json, filename_prefix="AG", prompt=None, extra_pnginfo=None):
        """
        保存图片到 output/artist_gallery/ 并创建映射关系
        :param images: ComfyUI 图片张量
        :param metadata_json: 画师元数据 JSON 字符串 {"artist_ids": [...], "artist_names": [...], "display_names": [...]}
        :param filename_prefix: 文件名前缀
        :param prompt: ComfyUI 工作流提示词（自动传入）
        :param extra_pnginfo: 额外的 PNG 元数据（自动传入）
        """
        import folder_paths
        import numpy as np
        from PIL import Image, PngImagePlugin
        import time
        import json

        # 解析元数据 JSON 字符串
        try:
            metadata = json.loads(metadata_json) if metadata_json else {}
        except:
            metadata = {}

        artist_ids = metadata.get("artist_ids", [])
        artist_names = metadata.get("artist_names", [])

        if not artist_ids:
            print("[SaveToGallery] 错误: 未选择画师")
            return ()

        # 获取输出目录
        output_dir = Path(folder_paths.get_output_directory())
        save_dir = output_dir / "artist_gallery"
        save_dir.mkdir(parents=True, exist_ok=True)

        # 保存图片
        saved_count = 0
        for idx, image_tensor in enumerate(images):
            # 转换图片张量为 PIL Image
            i = 255. * image_tensor.cpu().numpy()
            img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))

            # 生成文件名
            timestamp = int(time.time() * 1000)
            counter = idx
            filename = f"{filename_prefix}_{timestamp}_{counter:05}.png"
            save_path = save_dir / filename

            # 创建 PNG 元数据
            pnginfo = PngImagePlugin.PngInfo()

            # 添加 ComfyUI 工作流（如果提供）
            if prompt is not None:
                pnginfo.add_text("prompt", json.dumps(prompt))

            # 添加画师元数据
            pnginfo.add_text("artist_gallery", json.dumps({
                "artist_ids": artist_ids,
                "artist_names": artist_names,
                "display_names": metadata.get("display_names", [])
            }))

            # 添加额外的 PNG 元数据（如果提供）
            if extra_pnginfo is not None:
                for key, value in extra_pnginfo.items():
                    pnginfo.add_text(key, json.dumps(value) if isinstance(value, (dict, list)) else str(value))

            # 保存图片文件（带元数据）
            try:
                img.save(save_path, format="PNG", pnginfo=pnginfo)
                saved_count += 1

                # 创建映射关系
                image_path = f"artist_gallery/{filename}"
                mapping_storage = get_storage()[1]
                mapping_storage.add_mapping(
                    image_path,
                    artist_ids,
                    {"width": img.width, "height": img.height}
                )

                # 更新画师的图片计数
                artist_storage = get_storage()[0]
                for artist_id in artist_ids:
                    artist_storage.update_image_count(artist_id, 1)

                print(f"[SaveToGallery] 已保存: {filename} -> 画师: {', '.join(artist_names)}")

            except Exception as e:
                print(f"[SaveToGallery] 保存图片失败: {e}")
                import traceback
                traceback.print_exc()

        print(f"[SaveToGallery] 总共保存了 {saved_count} 张图片")
        return ()


# HTTP 路由处理
@server.PromptServer.instance.routes.get("/artist_gallery/data")
async def get_gallery_data(request):
    """获取画师图库数据 API（适配新结构）"""
    import folder_paths
    output_dir = folder_paths.get_output_directory()

    try:
        artist_storage, mapping_storage = get_storage()

        # 获取所有画师
        artists_data = artist_storage.get_all_artists()

        # 构建结果列表
        result_artists = []

        for artist in artists_data:
            artist_id = artist.get("id")

            # 从映射关系中获取该画师的图片
            mappings = mapping_storage.get_mappings_by_artist(artist_id)

            images = []
            for mapping in mappings:
                image_path = mapping.get("imagePath")

                # 获取文件信息
                full_path = Path(output_dir) / image_path
                if full_path.exists():
                    try:
                        stat = full_path.stat()
                        images.append({
                            "path": image_path,
                            "size": stat.st_size,
                            "mtime": stat.st_mtime * 1000
                        })
                    except Exception as e:
                        print(f"Error reading file {image_path}: {e}")

            # 排序图片
            images.sort(key=lambda x: decode_filename(x["path"]))

            # 构建画师对象
            result_artist = {
                "id": artist.get("id"),
                "name": artist.get("name"),
                "displayName": artist.get("displayName"),
                "imageCount": len(images),
                "images": images,
                "createdAt": artist.get("createdAt", 0)
            }

            result_artists.append(result_artist)

        # 排序画师
        result_artists.sort(key=lambda x: x["name"].lower())

        return web.json_response({
            "artists": result_artists,
            "totalCount": len(result_artists),
            "generatedAt": int(__import__('time').time() * 1000)
        })

    except Exception as e:
        print(f"Error getting gallery data: {e}")
        # 降级到旧的扫描方式
        data = scan_output_directory(output_dir)
        return web.json_response(data)


@server.PromptServer.instance.routes.get("/artist_gallery/html")
async def get_gallery_html(request):
    """返回图库 HTML 页面"""
    html_path = Path(__file__).parent / "web" / "gallery.html"
    if html_path.exists():
        with open(html_path, 'r', encoding='utf-8') as f:
            html_content = f.read()
        return web.Response(text=html_content, content_type='text/html')
    else:
        return web.Response(text="Gallery HTML not found", status=404)


# ============ 新增 API 路由 ============

@server.PromptServer.instance.routes.get("/artist_gallery/artists")
async def get_artists(request):
    """获取所有画师列表"""
    try:
        artist_storage, _ = get_storage()
        artists = artist_storage.get_all_artists()
        return web.json_response({"artists": artists, "totalCount": len(artists)})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/artist_gallery/artists")
async def add_artist(request):
    """添加画师（单个）"""
    try:
        data = await request.json()
        name = data.get("name", "").strip()
        display_name = data.get("displayName", "").strip() or None

        if not name:
            return web.json_response({"error": "画师名称不能为空"}, status=400)

        # 不再强制去掉 @ 符号，保留用户输入的原始名称
        artist_storage, _ = get_storage()
        artist = artist_storage.add_artist(name, display_name)

        return web.json_response({"artist": artist, "success": True})
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/artist_gallery/artists/batch")
async def add_artists_batch(request):
    """批量添加画师"""
    try:
        data = await request.json()
        artists_data = data.get("artists", [])

        if not artists_data:
            return web.json_response({"error": "画师列表不能为空"}, status=400)

        artist_storage, _ = get_storage()
        success_artists, failed_names = artist_storage.add_artists_batch(artists_data)

        return web.json_response({
            "success": True,
            "addedCount": len(success_artists),
            "failedCount": len(failed_names),
            "artists": success_artists,
            "failedNames": failed_names
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.delete("/artist_gallery/artists/{artist_id}")
async def delete_artist(request):
    """删除画师（包括关联的图片文件）"""
    try:
        artist_id = request.match_info['artist_id']

        artist_storage, mapping_storage = get_storage()

        # 获取画师信息
        artist = artist_storage.get_artist_by_id(artist_id)
        if not artist:
            return web.json_response({"error": "画师不存在"}, status=404)

        # 获取该画师关联的图片
        mappings = mapping_storage.get_mappings_by_artist(artist_id)

        # 移除映射关系，获取孤儿图片（没有其他画师关联的图片）
        orphan_images = mapping_storage.remove_artist_from_mappings(artist_id)

        # 删除孤儿图片文件
        import folder_paths
        output_dir = Path(folder_paths.get_output_directory())
        deleted_files = []
        for image_path in orphan_images:
            full_path = output_dir / image_path
            try:
                if full_path.exists():
                    full_path.unlink()
                    deleted_files.append(image_path)
            except Exception as e:
                print(f"Error deleting file {image_path}: {e}")

        # 删除画师记录
        artist_storage.delete_artist(artist_id)

        return web.json_response({
            "success": True,
            "deletedFiles": deleted_files,
            "message": f"已删除画师 '{artist.get('displayName')}'"
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.put("/artist_gallery/artists/{artist_id}")
async def update_artist(request):
    """更新画师信息"""
    try:
        artist_id = request.match_info['artist_id']
        data = await request.json()

        artist_storage, _ = get_storage()

        # 更新字段
        kwargs = {}
        if "name" in data:
            kwargs["name"] = data["name"]
        if "displayName" in data:
            kwargs["displayName"] = data["displayName"]

        success = artist_storage.update_artist(artist_id, **kwargs)

        if success:
            artist = artist_storage.get_artist_by_id(artist_id)
            return web.json_response({"artist": artist, "success": True})
        else:
            return web.json_response({"error": "画师不存在"}, status=404)
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.get("/artist_gallery/artist/{artist_id}/images")
async def get_artist_images(request):
    """获取画师关联的图片（通过映射查询）"""
    try:
        artist_id = request.match_info['artist_id']

        _, mapping_storage = get_storage()
        mappings = mapping_storage.get_mappings_by_artist(artist_id)

        # 构建图片信息
        images = []
        for mapping in mappings:
            images.append({
                "path": mapping.get("imagePath"),
                "savedAt": mapping.get("savedAt"),
                "metadata": mapping.get("metadata", {})
            })

        # 按时间倒序排序
        images.sort(key=lambda x: x.get("savedAt", 0), reverse=True)

        return web.json_response({"images": images, "totalCount": len(images)})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.get("/artist_gallery/image/{filename:.+}/artists")
async def get_image_artists(request):
    """获取图片关联的画师列表"""
    try:
        filename = request.match_info['filename']
        # 构建完整的图片路径
        image_path = f"artist_gallery/{filename}"

        _, mapping_storage = get_storage()
        mapping = mapping_storage.get_mappings_by_image(image_path)

        if not mapping:
            return web.json_response({"artists": [], "totalCount": 0})

        artist_storage, _ = get_storage()
        artist_ids = mapping.get("artistIds", [])

        artists = []
        for artist_id in artist_ids:
            artist = artist_storage.get_artist_by_id(artist_id)
            if artist:
                artists.append(artist)

        return web.json_response({"artists": artists, "totalCount": len(artists)})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/artist_gallery/save")
async def save_to_gallery(request):
    """保存图片到画廊并创建映射关系"""
    try:
        data = await request.json()
        image_filename = data.get("imageFilename")  # 如 "1719123456789.png"
        artist_ids = data.get("artistIds", [])
        metadata = data.get("metadata", {})

        if not image_filename:
            return web.json_response({"error": "图片文件名不能为空"}, status=400)

        if not artist_ids:
            return web.json_response({"error": "必须选择至少一个画师"}, status=400)

        # 构建图片路径
        image_path = f"artist_gallery/{image_filename}"

        # 创建映射关系
        _, mapping_storage = get_storage()
        mapping = mapping_storage.add_mapping(image_path, artist_ids, metadata)

        # 更新画师的图片计数
        artist_storage, _ = get_storage()
        for artist_id in artist_ids:
            artist_storage.update_image_count(artist_id, 1)

        return web.json_response({
            "success": True,
            "mapping": mapping
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/artist_gallery/restore_from_metadata")
async def restore_from_metadata(request):
    """从图片的 PNG 元数据中恢复画师映射关系"""
    try:
        import folder_paths
        from PIL import Image

        data = await request.json()
        filenames = data.get("filenames", [])  # 要恢复的文件名列表

        if not filenames:
            return web.json_response({"error": "没有提供文件名"}, status=400)

        output_dir = Path(folder_paths.get_output_directory())
        gallery_dir = output_dir / "artist_gallery"

        restored_count = 0
        errors = []

        for filename in filenames:
            image_path = gallery_dir / filename
            if not image_path.exists():
                errors.append(f"{filename}: 文件不存在")
                continue

            try:
                # 从 PNG 元数据中读取画师信息
                with Image.open(image_path) as img:
                    # 读取 PNG tEXt 块
                    from PIL import PngImagePlugin
                    if hasattr(img, 'text') and 'artist_gallery' in img.text:
                        # 解析画师元数据
                        artist_metadata = json.loads(img.text['artist_gallery'])
                        artist_ids = artist_metadata.get("artist_ids", [])
                        artist_names = artist_metadata.get("artist_names", [])

                        if artist_ids:
                            # 创建映射关系
                            image_rel_path = f"artist_gallery/{filename}"
                            mapping_storage = get_storage()[1]
                            mapping_storage.add_mapping(
                                image_rel_path,
                                artist_ids,
                                {"width": img.width, "height": img.height}
                            )

                            # 更新画师的图片计数
                            artist_storage = get_storage()[0]
                            for artist_id in artist_ids:
                                artist_storage.update_image_count(artist_id, 1)

                            restored_count += 1
                            print(f"[Restore] 恢复映射: {filename} -> {', '.join(artist_names)}")
                        else:
                            errors.append(f"{filename}: 元数据中没有画师信息")
                    else:
                        errors.append(f"{filename}: 没有找到画师元数据")

            except json.JSONDecodeError as e:
                errors.append(f"{filename}: 元数据解析失败")
            except Exception as e:
                errors.append(f"{filename}: {str(e)}")

        return web.json_response({
            "success": True,
            "restored_count": restored_count,
            "total_count": len(filenames),
            "errors": errors
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

