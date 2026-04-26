"""
Artist Gallery Node - ComfyUI 节点定义

这个文件包含 Artist Gallery 的三个核心节点类：
- ArtistGallery: 画师图库管理面板
- ArtistSelector: 画师选择器节点
- SaveToGallery: 保存图片到画廊节点

相关功能已拆分到以下模块：
- utils.py: 文件名解析和目录扫描工具函数
- routes/: HTTP API 端点处理
- storage/: 数据持久化层
"""
import json
import re
import random
from pathlib import Path
from .storage import get_storage
from .utils import decode_filename

# 导入所有 API 路由（注册 HTTP 端点）
from . import routes

# 全局循环状态存储
_cycle_states = {}

# prompt_string 画师匹配正则缓存
_artist_regex_cache = None
_artist_regex_names = None  # frozenset 指纹，用于检测画师列表是否变化


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
                artist_storage, _, _, _ = get_storage()
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
        根据分区配置处理输出
        """
        # 解析 metadata
        try:
            metadata_dict = json.loads(metadata) if metadata else {}
        except:
            metadata_dict = {}

        if metadata_dict.get('version') != 1:
            return ("", "{}")

        return self._process_v1_metadata(metadata_dict, metadata)

    def _resolve_category_to_artists(self, category_id, all_artists, all_categories, visited=None):
        """递归解析分类，收集所有画师名"""
        if visited is None:
            visited = set()
        if category_id in visited:
            return []
        visited.add(category_id)

        names = []

        # 递归获取子分类
        for cat in all_categories:
            if cat.get('parentId') == category_id:
                names.extend(self._resolve_category_to_artists(
                    cat['id'], all_artists, all_categories, visited
                ))

        # 获取当前分类下的画师
        for artist in all_artists:
            if artist.get('categoryId') == category_id:
                name = artist.get('name', '').strip()
                if name:
                    names.append(name)

        return names

    def _process_v1_metadata(self, metadata_dict, raw_metadata):
        """处理新版 v1 格式的 metadata，返回 (格式化结果, 富化后的 metadata JSON)"""
        print(f"[ArtistSelector] Raw metadata: {raw_metadata[:500] if raw_metadata else 'None'}")
        print(f"[ArtistSelector] globalConfig from metadata: {metadata_dict.get('globalConfig', {})}")
        try:
            artist_storage, _, category_storage, combination_storage = get_storage()
            all_artists = artist_storage.get_all_artists()
            all_categories = category_storage.get_all_categories()
        except Exception as e:
            print(f"[ArtistSelector] Failed to load storage: {e}")
            return ("", "{}")

        partitions = metadata_dict.get('partitions', [])
        artist_weights = metadata_dict.get('artistWeights', {})
        if not partitions:
            return ("", "{}")

        formatted_results = []
        # 跨分区收集全部已解析画师（用于 SaveToGallery）
        all_resolved = []      # [{categoryId, name, saveToGallery}, ...]
        seen_keys = set()
        # 记录每个分区实际使用的画师名（考虑随机/循环后）
        partition_used_artists = {}  # {partition_id: [name, ...]}
        partition_formats = {}  # {partition_id: format_string}

        def collect_artist(cat_id, name, save_to_gallery=True):
            key = f"{cat_id}:{name}"
            if key not in seen_keys:
                seen_keys.add(key)
                all_resolved.append({
                    "categoryId": cat_id,
                    "name": name,
                    "saveToGallery": save_to_gallery,
                })

        for partition in partitions:
            if not partition.get('enabled', True):
                continue

            config = partition.get('config', {})
            partition_format = config.get('format', '{content}')
            random_mode = config.get('randomMode', False)
            # 记录该分区的格式（用于自动创建组合）
            pid = partition.get('id', 'default')
            partition_formats[pid] = partition_format
            random_count = config.get('randomCount', 1)
            cycle_mode = config.get('cycleMode', False)
            save_to_gallery = config.get('saveToGallery', True)

            # 收集画师名：直接选择 + 分类递归解析
            artist_entries = []  # [(cat_id, name), ...]

            # 从 artistKeys 提取画师名（格式 "categoryId:artistName"）
            for key in partition.get('artistKeys', []):
                parts = key.split(':', 1)
                name = parts[-1].strip() if parts else ''
                cat_id = parts[0] if len(parts) > 1 else ''
                if name:
                    artist_entries.append((cat_id, name))

            # 从 categoryIds 递归解析画师
            for cat_id in partition.get('categoryIds', []):
                resolved = self._resolve_category_to_artists(cat_id, all_artists, all_categories)
                for n in resolved:
                    artist_entries.append((cat_id, n))

            # 从 combinationKeys 提取组合（格式 "combination:{uuid}"）
            combination_entries = []  # [(output_content, artist_keys), ...]
            for comb_key in partition.get('combinationKeys', []):
                if comb_key.startswith('combination:'):
                    comb_id = comb_key[len('combination:'):]
                    try:
                        combination = combination_storage.get_combination_by_id(comb_id)
                        if combination:
                            combination_entries.append((
                                combination.get('outputContent', ''),
                                combination.get('artistKeys', []),
                            ))
                    except Exception as e:
                        print(f"[ArtistSelector] Failed to lookup combination {comb_id}: {e}")

            # 去重保序
            seen = set()
            unique_entries = []
            for entry in artist_entries:
                key = f"{entry[0]}:{entry[1]}"
                if key not in seen:
                    seen.add(key)
                    unique_entries.append(entry)

            if not unique_entries and not combination_entries:
                continue

            # 将画师条目和组合条目合并为统一的工作列表
            # 每个条目是 ('artist', cat_id, name) 或 ('combination', output_content, artist_keys)
            working_items = []
            for cat_id, name in unique_entries:
                working_items.append(('artist', cat_id, name))
            for content, artist_keys in combination_entries:
                working_items.append(('combination', content, artist_keys))

            # 处理循环模式
            if cycle_mode:
                node_id = id(self)
                partition_id = partition.get('id', 'default')
                cycle_key = f"{node_id}_{partition_id}"
                cycle_index = _cycle_states.get(cycle_key, 0)
                current_item = working_items[cycle_index % len(working_items)]
                _cycle_states[cycle_key] = (cycle_index + 1) % len(working_items)
                if current_item[0] == 'combination':
                    formatted_results.append(current_item[1])
                    # 组合的画师也要关联到保存的图片
                    for artist_name in (current_item[2] or []):
                        collect_artist('', artist_name, save_to_gallery)
                        if save_to_gallery:
                            pid = partition.get('id', 'default')
                            if pid not in partition_used_artists:
                                partition_used_artists[pid] = []
                            partition_used_artists[pid].append(artist_name)
                else:
                    formatted = self._apply_format(current_item[2], partition_format)
                    w_key = f"{current_item[1]}:{current_item[2]}"
                    formatted_results.append(self._apply_weight(formatted, artist_weights.get(w_key)))
                    collect_artist(current_item[1], current_item[2], save_to_gallery)
                    # 记录实际输出的画师名（用于自动创建组合）
                    if save_to_gallery and current_item[0] == 'artist':
                        pid = partition.get('id', 'default')
                        if pid not in partition_used_artists:
                            partition_used_artists[pid] = []
                        partition_used_artists[pid].append(current_item[2])
            else:
                working = working_items
                if random_mode and random_count > 0 and random_count < len(working):
                    working = random.sample(working, random_count)
                for item in working:
                    if item[0] == 'combination':
                        formatted_results.append(item[1])
                        # 组合的画师也要关联到保存的图片
                        for artist_name in (item[2] or []):
                            collect_artist('', artist_name, save_to_gallery)
                            if save_to_gallery:
                                pid = partition.get('id', 'default')
                                if pid not in partition_used_artists:
                                    partition_used_artists[pid] = []
                                partition_used_artists[pid].append(artist_name)
                    else:
                        formatted = self._apply_format(item[2], partition_format)
                        w_key = f"{item[1]}:{item[2]}"
                        formatted_results.append(self._apply_weight(formatted, artist_weights.get(w_key)))
                        collect_artist(item[1], item[2], save_to_gallery)
                        # 记录实际输出的画师名（用于自动创建组合）
                        if save_to_gallery and item[0] == 'artist':
                            pid = partition.get('id', 'default')
                            if pid not in partition_used_artists:
                                partition_used_artists[pid] = []
                            partition_used_artists[pid].append(item[2])

        result = ','.join(formatted_results)

        # 自动创建组合（使用输出时实际选中的画师，而非全量）
        try:
            for partition in partitions:
                partition_name = partition.get('name', '默认')
                partition_config = partition.get('config', {})
                enabled = partition.get('enabled', True)
                auto_create = partition_config.get('autoCreateCombination', False)
                print(f"[ArtistSelector] Partition '{partition_name}': enabled={enabled}, autoCreateCombination={auto_create}")
                if not enabled or not auto_create:
                    continue

                # 使用输出循环中实际选中的画师（已考虑随机/循环）
                pid = partition.get('id', 'default')
                artist_names = partition_used_artists.get(pid, [])
                if not artist_names:
                    print(f"[ArtistSelector] Partition '{partition_name}': no artists used in output, skipping")
                    continue

                p_format = partition_formats.get(pid, '{content}')
                formatted_parts = [self._apply_format(name, p_format) for name in artist_names]
                output_content = ','.join(formatted_parts)
                comb_name = ','.join(artist_names)
                print(f"[ArtistSelector] Partition '{partition_name}': output_content='{output_content}', formatted_parts={formatted_parts}")

                # 查重
                existing = combination_storage.find_by_content(output_content)
                if existing:
                    print(f"[ArtistSelector] Partition '{partition_name}': combination already exists (id={existing.get('id')}), skipping")
                else:
                    new_comb = combination_storage.add_combination(
                        name=comb_name,
                        category_id="root",
                        artist_keys=artist_names,
                        output_content=output_content,
                    )
                    print(f"[ArtistSelector] Partition '{partition_name}': created combination id={new_comb.get('id')}")
        except Exception as e:
            print(f"[ArtistSelector] Auto-create combination error: {e}")
            import traceback
            traceback.print_exc()

        # 构建富化 metadata：包含解析结果，供 SaveToGallery 直接使用
        enriched_metadata = json.dumps({
            "artist_names": [a["name"] for a in all_resolved],
            "selected_artists": all_resolved,
            "formatted_result": result,
        })

        return (result, enriched_metadata)

    def _apply_weight(self, formatted_str, weight):
        """对格式化后的字符串应用 SD 权重包裹"""
        if weight is None or abs(weight - 1.0) < 0.001:
            return formatted_str
        if weight == int(weight):
            weight_str = str(int(weight))
        else:
            weight_str = f"{weight:.1f}".rstrip('0').rstrip('.')
        return f"({formatted_str}:{weight_str})"

    def _apply_format(self, artist_name, format_str):
        """应用格式字符串到画师名称"""
        # 替换 {content}
        result = format_str.replace('{content}', artist_name)

        # 处理 {random(min,max,step)}
        # 使用迭代替换函数
        def replace_random(match):
            try:
                min_val = float(match.group(1))
                max_val = float(match.group(2))
                step = float(match.group(3))

                # 生成随机数
                steps = int((max_val - min_val) / step)
                random_step = random.randint(0, steps)
                random_value = min_val + (random_step * step)

                # 格式化数值（避免浮点精度问题）
                if step == int(step):
                    random_value = int(round(random_value))
                else:
                    random_value = round(random_value, 10)

                return str(random_value)
            except Exception as e:
                print(f"[ArtistSelector] Error generating random number: {e}")
                return match.group(0)

        # 使用正则替换所有匹配
        pattern = r'\{random\(([^,]+),([^,]+),([^)]+)\)\}'
        result = re.sub(pattern, replace_random, result)

        return result

    def _get_artist_info(self, metadata_dict, artist_name):
        """从 metadata 中获取画师信息"""
        selected_artists = metadata_dict.get('selected_artists', [])
        for artist_info in selected_artists:
            if artist_info.get('name') == artist_name:
                return artist_info
        return None


class SaveToGallery:
    """保存图片到画廊节点"""

    CATEGORY = "🎨 Artist Gallery"
    RETURN_TYPES = ()
    FUNCTION = "save_image"
    OUTPUT_NODE = True

    @staticmethod
    def _match_artists_from_prompt(prompt_string):
        """从 prompt_string 中匹配已知画师名，返回 [{categoryId, name, saveToGallery}, ...]"""
        global _artist_regex_cache, _artist_regex_names

        if not prompt_string or not prompt_string.strip():
            return []

        artist_storage = get_storage()[0]
        all_artists = artist_storage.get_all_artists()
        if not all_artists:
            return []

        # 构建 name → [artist, ...] 查找表（同名画师可属于不同分类）
        name_to_artists = {}
        lower_to_canonical = {}  # 小写 → 原始大小写 key，用于 IGNORECASE 匹配后还原
        for artist in all_artists:
            name = artist.get("name", "").strip()
            if name:
                name_to_artists.setdefault(name, []).append(artist)
                lower_to_canonical[name.lower()] = name

        # 检查缓存是否需要重建
        current_names = frozenset(name_to_artists.keys())
        if current_names != _artist_regex_names:
            # 按名称长度降序排列，确保贪心匹配（长名优先）
            sorted_names = sorted(name_to_artists.keys(), key=len, reverse=True)
            escaped = [re.escape(n) for n in sorted_names]
            _artist_regex_cache = re.compile('|'.join(escaped), re.IGNORECASE)
            _artist_regex_names = current_names

        # 单次扫描匹配所有画师名
        matches = _artist_regex_cache.findall(prompt_string)

        # 去重保序，查找每个匹配名对应的所有画师
        result = []
        seen = set()
        for name in matches:
            matched_key = lower_to_canonical.get(name.lower())
            if matched_key and matched_key not in seen:
                seen.add(matched_key)
                for artist in name_to_artists[matched_key]:
                    result.append({
                        "categoryId": artist.get("categoryId", "root"),
                        "name": artist.get("name"),
                        "saveToGallery": True,
                    })

        return result

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
            },
            "optional": {
                "metadata_json": ("STRING", {"default": "{}", "forceInput": True}),
                "prompt_string": ("STRING", {"default": "", "forceInput": True}),
                "filename_prefix": ("STRING", {"default": "AG"}),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            }
        }

    def save_image(self, images, metadata_json="{}", filename_prefix="AG", prompt_string="", prompt=None, extra_pnginfo=None):
        """
        保存图片到 output/artist_gallery/ 并创建映射关系
        支持两种输入源（优先级：metadata_json > prompt_string）：
        :param metadata_json: 由 ArtistSelector 输出的 JSON（优先）
        :param prompt_string: 提示词字符串，自动匹配已知画师名（备选）
        """
        import folder_paths
        import numpy as np
        from PIL import Image, PngImagePlugin
        import time
        import json

        # 解析 metadata_json
        try:
            metadata = json.loads(metadata_json) if metadata_json else {}
        except:
            metadata = {}

        # 三路优先级：metadata_json（有效）> prompt_string > 报错
        artist_names_from_meta = metadata.get("artist_names", [])
        selected_artists = metadata.get("selected_artists", [])

        if artist_names_from_meta and selected_artists:
            # Path A: metadata_json 有效，使用现有逻辑
            saveable_artists = [a for a in selected_artists if a.get("saveToGallery", True)]
            saveable_names = [a["name"] for a in saveable_artists]
        elif prompt_string and prompt_string.strip():
            # Path B: 从 prompt_string 匹配画师
            saveable_artists = self._match_artists_from_prompt(prompt_string)
            saveable_names = [a["name"] for a in saveable_artists]
            if not saveable_names:
                print("[SaveToGallery] 错误: prompt_string 中未匹配到已知画师")
                return ()
            print(f"[SaveToGallery] 从 prompt_string 匹配到画师: {', '.join(saveable_names)}")
        else:
            # Path C: 都没有有效内容
            print("[SaveToGallery] 错误: 请提供 metadata_json 或 prompt_string")
            return ()

        output_dir = Path(folder_paths.get_output_directory())
        save_dir = output_dir / "artist_gallery"
        save_dir.mkdir(parents=True, exist_ok=True)

        saved_count = 0
        for idx, image_tensor in enumerate(images):
            i = 255. * image_tensor.cpu().numpy()
            img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))

            timestamp = int(time.time() * 1000)
            filename = f"{filename_prefix}_{timestamp}_{idx:05}.png"
            save_path = save_dir / filename

            pnginfo = PngImagePlugin.PngInfo()
            if prompt is not None:
                pnginfo.add_text("prompt", json.dumps(prompt))

            pnginfo.add_text("artist_gallery", json.dumps({
                "artist_names": saveable_names,
                "selected_artists": saveable_artists,
                "prompt_string": prompt_string or "",
            }))

            if extra_pnginfo is not None:
                for key, value in extra_pnginfo.items():
                    pnginfo.add_text(key, json.dumps(value) if isinstance(value, (dict, list)) else str(value))

            try:
                img.save(save_path, format="PNG", pnginfo=pnginfo)
                saved_count += 1

                # 创建映射关系（仅 saveToGallery=true 的画师）
                image_path = f"artist_gallery/{filename}"
                mapping_storage = get_storage()[1]
                mapping_storage.add_mapping(
                    image_path,
                    saveable_names,
                    {"width": img.width, "height": img.height, "prompt_string": prompt_string or ""}
                )

                # 更新画师图片计数（仅 saveToGallery=true 的画师）
                artist_storage = get_storage()[0]
                for artist_info in saveable_artists:
                    category_id = artist_info.get("categoryId", "root")
                    name = artist_info.get("name", "")
                    if category_id and name:
                        artist_storage.update_image_count(category_id, name, 1)

                print(f"[SaveToGallery] 已保存: {filename} -> 画师: {', '.join(saveable_names)}")

            except Exception as e:
                print(f"[SaveToGallery] 保存图片失败: {e}")
                import traceback
                traceback.print_exc()

        print(f"[SaveToGallery] 总共保存了 {saved_count} 张图片")
        return ()

