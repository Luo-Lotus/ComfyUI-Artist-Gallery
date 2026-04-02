"""
图片导入处理模块
处理文件名解析、metadata嵌入等导入相关功能
"""
import re
import json
from pathlib import Path
from typing import Optional, List, Dict, Tuple
from io import BytesIO
from PIL import Image, PngImagePlugin


class FilenameParser:
    """文件名解析器 - 支持3种解析策略"""

    # 现有的ARTIST_REGEX（从utils.py复制）
    ARTIST_REGEX = re.compile(r'^@([^,]+?)(?:,+\s*)?(?:_\d+)?\.(png|jpg|jpeg|webp)$', re.IGNORECASE)

    @staticmethod
    def parse_regex(filename: str, pattern: str) -> Optional[str]:
        """
        策略1: 自定义正则解析
        例: pattern="@([^,]+)," → "@akakura,_1.png" → "akakura"
             pattern="@([^_]+)" → "@artist_name_001.png" → "artist"

        :param filename: 文件名（不含路径）
        :param pattern: 正则表达式模式
        :return: 解析出的画师名称，或None
        """
        try:
            # 尝试从文件名中匹配（不包含扩展名）
            name_without_ext = Path(filename).stem

            print(f"[FilenameParser] 正则解析调试:")
            print(f"  原始文件名: {filename}")
            print(f"  不含扩展名: {name_without_ext}")
            print(f"  正则模式: {pattern}")

            match = re.search(pattern, name_without_ext)
            if match:
                print(f"  匹配成功: {match.group(0)}")
                # 如果正则有捕获组，返回第一个捕获组
                if match.groups():
                    result = match.group(1)
                    print(f"  捕获组: {result}")
                    return result
                # 否则返回整个匹配内容
                print(f"  返回整个匹配")
                return match.group(0)

            # 如果没匹配到，尝试对完整文件名进行匹配
            match = re.search(pattern, filename)
            if match:
                print(f"  完整文件名匹配成功: {match.group(0)}")
                if match.groups():
                    result = match.group(1)
                    print(f"  捕获组: {result}")
                    return result
                print(f"  返回整个匹配")
                return match.group(0)

            print(f"  匹配失败")
            return None
        except Exception as e:
            print(f"[FilenameParser] 正则解析异常: {e}, pattern={pattern}, filename={filename}")
            import traceback
            traceback.print_exc()
            return None

    @staticmethod
    def parse_auto_create(filename: str) -> Optional[str]:
        """
        策略2: 自动创建画师
        从文件名提取画师名，移除扩展名、数字后缀、特殊字符
        例: "artist-name_001.png" → "artist-name"

        :param filename: 文件名（不含路径）
        :return: 清理后的画师名称，或None
        """
        try:
            print(f"[FilenameParser] 自动创建解析调试:")
            print(f"  原始文件名: {filename}")

            # 获取文件名（不含扩展名）
            name = Path(filename).stem
            print(f"  不含扩展名: {name}")

            if not name:
                print(f"  结果为空")
                return None

            print(f"  最终结果: {name}")
            return name
        except Exception as e:
            print(f"[FilenameParser] 自动创建解析异常: {e}")
            import traceback
            traceback.print_exc()
            return None

    @staticmethod
    def parse_url_decode(filename: str) -> Optional[str]:
        """
        策略3: URL解码 + @artist格式提取
        例: "%40artist%20name.png" → "@artist name"

        :param filename: 文件名（不含路径）
        :return: 解码并提取的画师名称，或None
        """
        try:
            from urllib.parse import unquote

            # 多重解码（兼容双重编码）
            decoded = filename
            for _ in range(3):
                new_decoded = unquote(decoded)
                if new_decoded == decoded:
                    break
                decoded = new_decoded

            # 尝试@artist格式（使用现有的ARTIST_REGEX）
            match = FilenameParser.ARTIST_REGEX.match(decoded)
            if match:
                return match.group(1)

            # 如果没有匹配到@artist格式，使用文件名（去掉扩展名）
            name = Path(decoded).stem
            name = name.lstrip('@')
            return name if name else None

        except Exception as e:
            print(f"[FilenameParser] URL解码解析失败: {e}")
            return None


def embed_image_metadata(
    image_path: Path,
    artist_names: List[str],
    display_names: List[str],
    categories: List[str],
    selected_artists: List[Dict],
    prompt: Optional[Dict] = None,
    extra_pnginfo: Optional[Dict] = None
) -> bool:
    """
    为已保存的图片嵌入metadata
    100%复用SaveToGallery的嵌入逻辑，确保数据一致性

    :param image_path: 图片文件路径
    :param artist_names: 画师名称列表
    :param display_names: 显示名称列表
    :param categories: 分类ID列表
    :param selected_artists: 选中的画师信息列表
    :param prompt: ComfyUI工作流（可选）
    :param extra_pnginfo: 额外的PNG元数据（可选）
    :return: 是否成功
    """
    try:
        # 读取图片
        with Image.open(image_path) as img:
            # 创建新的PNG info
            pnginfo = PngImagePlugin.PngInfo()

            # 添加 ComfyUI 工作流（如果提供）
            if prompt is not None:
                pnginfo.add_text("prompt", json.dumps(prompt))

            # 嵌入画师metadata（核心逻辑，与SaveToGallery完全一致）
            pnginfo.add_text("artist_gallery", json.dumps({
                "artist_names": artist_names,
                "display_names": display_names,
                "selected_categories": categories,
                "selected_artists": selected_artists
            }))

            # 添加额外的 PNG 元数据（如果提供）
            if extra_pnginfo is not None:
                for key, value in extra_pnginfo.items():
                    pnginfo.add_text(
                        key,
                        json.dumps(value) if isinstance(value, (dict, list)) else str(value)
                    )

            # 写入内存
            buffer = BytesIO()
            img.save(buffer, format="PNG", pnginfo=pnginfo)
            buffer.seek(0)

            # 写回文件
            with open(image_path, 'wb') as f:
                f.write(buffer.getvalue())

            return True

    except Exception as e:
        print(f"[EmbedMetadata] 失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def save_image_with_metadata(
    image_bytes: bytes,
    save_path: Path,
    artist_names: List[str],
    display_names: List[str],
    categories: List[str],
    selected_artists: List[Dict],
    prompt: Optional[Dict] = None,
    extra_pnginfo: Optional[Dict] = None
) -> Tuple[bool, Optional[Dict]]:
    """
    保存图片并嵌入metadata（一次性完成）
    用于导入功能，避免两次文件IO

    :param image_bytes: 图片字节数据
    :param save_path: 保存路径
    :param artist_names: 画师名称列表
    :param display_names: 显示名称列表
    :param categories: 分类ID列表
    :param selected_artists: 选中的画师信息列表
    :param prompt: ComfyUI工作流（可选）
    :param extra_pnginfo: 额外的PNG元数据（可选）
    :return: (是否成功, 图片元数据{"width", "height"})
    """
    try:
        # 从字节数据打开图片
        img = Image.open(BytesIO(image_bytes))

        # 创建 PNG 元数据
        pnginfo = PngImagePlugin.PngInfo()

        # 添加 ComfyUI 工作流（如果提供）
        if prompt is not None:
            pnginfo.add_text("prompt", json.dumps(prompt))

        # 添加画师元数据（核心逻辑，与SaveToGallery完全一致）
        pnginfo.add_text("artist_gallery", json.dumps({
            "artist_names": artist_names,
            "display_names": display_names,
            "selected_categories": categories,
            "selected_artists": selected_artists
        }))

        # 添加额外的 PNG 元数据（如果提供）
        if extra_pnginfo is not None:
            for key, value in extra_pnginfo.items():
                pnginfo.add_text(
                    key,
                    json.dumps(value) if isinstance(value, (dict, list)) else str(value)
                )

        # 保存图片文件（带元数据）
        img.save(save_path, format="PNG", pnginfo=pnginfo)

        # 返回图片元数据
        return True, {"width": img.width, "height": img.height}

    except Exception as e:
        print(f"[SaveImageWithMetadata] 失败: {e}")
        import traceback
        traceback.print_exc()
        return False, None


def parse_artist_info_from_filename(
    filename: str,
    config: Dict
) -> Tuple[Optional[str], Optional[str], Optional[str], bool]:
    """
    根据配置从文件名解析画师信息

    :param filename: 文件名
    :param config: 配置字典，包含:
        - parseStrategy: "regex" | "auto_create"
        - regexPattern: 正则模式（仅regex策略）
        - autoCreateArtist: 是否自动创建画师
        - urlDecode: 是否URL解码（适用于所有策略）
    :return: (artist_name, display_name, error_message, will_create_artist)
    """
    print(f"[ParseArtist] 开始解析画师信息")
    print(f"  原始文件名: {filename}")
    print(f"  配置: {config}")

    parser = FilenameParser()
    strategy = config.get("parseStrategy", "auto_create")
    url_decode = config.get("urlDecode", False)

    print(f"  解析策略: {strategy}")

    # 如果启用了URL解码，先解码文件名
    if url_decode:
        try:
            from urllib.parse import unquote
            # 多重解码（兼容双重编码）
            decoded = filename
            for _ in range(3):
                new_decoded = unquote(decoded)
                if new_decoded == decoded:
                    break
                decoded = new_decoded
            filename = decoded
            print(f"  URL解码后: {filename}")
        except Exception as e:
            print(f"[ParseArtist] URL解码失败: {e}")

    # 解析画师名称
    if strategy == "regex":
        pattern = config.get("regexPattern", r"@([^,]+),")
        print(f"  使用正则策略，模式: {pattern}")
        artist_name = parser.parse_regex(filename, pattern)
    elif strategy == "auto_create":
        print(f"  使用自动创建策略")
        artist_name = parser.parse_auto_create(filename)
    else:
        error_msg = f"不支持的解析策略: {strategy}"
        print(f"  {error_msg}")
        return None, None, error_msg, False

    if not artist_name:
        error_msg = f"无法从文件名解析画师: {filename}"
        print(f"  {error_msg}")
        return None, None, error_msg, False

    print(f"  解析出的画师名: {artist_name}")

    # 不自动添加@符号，严格使用正则的返回值
    # 如果名称不以@开头，也不自动添加
    # 如果用户想要@，应该在正则中包含它

    # display_name默认与artist_name相同
    display_name = artist_name

    # 是否需要创建画师
    will_create = config.get("autoCreateArtist", True)

    print(f"[ParseArtist] 解析成功: {artist_name}, will_create={will_create}")
    return artist_name, display_name, None, will_create
