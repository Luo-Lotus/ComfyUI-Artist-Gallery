"""
Artist Gallery - ComfyUI Custom Node
在 ComfyUI 中展示画师图库管理界面
"""

from .nodes import ArtistGallery

NODE_CLASS_MAPPINGS = {
    "ArtistGallery": ArtistGallery,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ArtistGallery": "🎨 画师图库"
}

WEB_DIRECTORY = "./web"

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']
