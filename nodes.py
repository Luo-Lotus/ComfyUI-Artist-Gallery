"""
Artist Gallery Node - ComfyUI 节点定义

这个文件包含 Artist Gallery 的三个核心节点类：
- ArtistGallery: 画师图库管理面板
- ArtistSelector: 画师选择器节点
- SaveToGallery: 保存图片到画廊节点

相关功能已拆分到以下模块：
- utils.py: 文件名解析和目录扫描工具函数
- api_routes.py: HTTP API 端点处理
- storage.py: 数据持久化层
"""
import json
from pathlib import Path
from .storage import get_storage
from .utils import decode_filename

# 导入所有 API 路由（注册 HTTP 端点）
from . import api_routes


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

