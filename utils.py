"""
Artist Gallery 工具函数
文件名解析和目录扫描功能
"""
import re
from pathlib import Path

# 画师名称解析正则
ARTIST_REGEX = re.compile(r'^@([^,]+?)(?:,+\s*)?(?:_\d+)?\.(png|jpg|jpeg|webp)$', re.IGNORECASE)


def decode_filename(filename):
    """URL 解码文件名（支持多重编码）

    Args:
        filename: 可能URL编码的文件名

    Returns:
        解码后的文件名
    """
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
    """解析文件名获取画师名称

    Args:
        filename: 图片文件名

    Returns:
        画师名称，如果不匹配模式则返回 None
    """
    decoded_filename = decode_filename(filename)
    match = ARTIST_REGEX.match(decoded_filename)
    return match.group(1) if match else None


def scan_output_directory(output_dir):
    """扫描 output 目录获取画师数据

    Args:
        output_dir: ComfyUI 输出目录路径

    Returns:
        包含画师列表和统计信息的字典
    """
    output_path = Path(output_dir)

    if not output_path.exists():
        return {"artists": [], "totalCount": 0, "error": "目录不存在"}

    artists = {}

    # 扫描所有图片文件
    for ext in ['*.png', '*.jpg', '*.jpeg', '*.webp']:
        for img_file in output_path.glob(ext):
            filename = img_file.name
            artist_name = parse_artist_name(filename)

            if artist_name:
                # 获取文件修改时间
                mtime = img_file.stat().st_mtime

                if artist_name not in artists:
                    artists[artist_name] = {
                        "name": artist_name,
                        "displayName": artist_name,
                        "images": []
                    }

                # 添加图片信息
                artists[artist_name]["images"].append({
                    "path": str(img_file.relative_to(output_path.parent)),
                    "filename": filename,
                    "mtime": mtime
                })

    # 转换为列表并计算图片数量
    artist_list = list(artists.values())
    for artist in artist_list:
        artist["imageCount"] = len(artist["images"])
        # 按修改时间排序图片
        artist["images"].sort(key=lambda x: x["mtime"], reverse=True)

    return {
        "artists": artist_list,
        "totalCount": len(artist_list),
        "totalImages": sum(a["imageCount"] for a in artist_list)
    }
