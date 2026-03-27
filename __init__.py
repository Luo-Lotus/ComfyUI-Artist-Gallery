"""
Artist Gallery - ComfyUI Custom Node
在 ComfyUI 中展示画师图库管理界面
"""

from .nodes import ArtistGallery, ArtistSelector, SaveToGallery

NODE_CLASS_MAPPINGS = {
    "ArtistGallery": ArtistGallery,
    "ArtistSelector": ArtistSelector,
    "SaveToGallery": SaveToGallery,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ArtistGallery": "🎨 画师图库",
    "ArtistSelector": "🎨 画师选择",
    "SaveToGallery": "🎨 保存到画廊"
}

WEB_DIRECTORY = "./web"

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']
