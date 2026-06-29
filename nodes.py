"""
Prompt Gallery Node - ComfyUI 节点定义

这个文件包含 Prompt Gallery 的三个核心节点类：
- PromptGallery: 画师图库管理面板
- PromptSelector: 画师选择器节点
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

# prompt_string 画师匹配缓存
_prompt_match_cache = None           # 按长度降序的名称列表
_prompt_match_names = None           # frozenset 指纹
_prompt_match_lookup = None          # name/alias -> [prompt, ...]
_blocked_category_cache = None       # 被禁止保存到画廊的分类 ID 集合
_blocked_category_fingerprint = None # 分类数据指纹


def _get_blocked_category_ids(category_storage):
    """获取被禁止保存到画廊的分类 ID 集合（带缓存）"""
    global _blocked_category_cache, _blocked_category_fingerprint
    all_categories = category_storage.get_all_categories()
    cat_fingerprint = frozenset(
        (c.get("id"), c.get("metadata", {}).get("blockGallerySave", False))
        for c in all_categories
    )
    if cat_fingerprint != _blocked_category_fingerprint:
        blocked_ids = set()
        for cat in all_categories:
            if cat.get("metadata", {}).get("blockGallerySave"):
                blocked_ids.update(category_storage.get_descendant_ids(cat["id"]))
        _blocked_category_cache = blocked_ids
        _blocked_category_fingerprint = cat_fingerprint
    return _blocked_category_cache


class PromptGallery:
    """画师图库节点 - 管理面板"""

    CATEGORY = "🎨 Prompt Gallery"
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
            print("[PromptGallery] 点击页面右下角的 🎨 按钮打开画廊")
        elif action == "刷新数据":
            print("[PromptGallery] 数据已刷新 - 请在画廊中查看")
        elif action == "统计信息":
            try:
                prompt_storage, _, _, _ = get_storage()
                prompts = prompt_storage.get_all_prompts()
                total_prompts = len(prompts)
                total_images = sum(a.get("imageCount", 0) for a in prompts)
                print(f"[PromptGallery] 统计: {total_prompts} 个画师, {total_images} 张图片")
            except Exception as e:
                print(f"[PromptGallery] 获取统计信息失败: {e}")
        return ()


class PromptSelector:
    """画师选择节点"""

    CATEGORY = "🎨 Prompt Gallery"
    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("prompts_string", "metadata_json")
    FUNCTION = "select_prompts"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # 隐藏字段，用于从前端接收选择的画师字符串
                "selected_prompts": ("STRING", {"default": "", "widget": "hidden"}),
            },
            "optional": {
                # 隐藏字段，用于从前端接收元数据
                "metadata": ("STRING", {"default": "{}", "widget": "hidden"}),
            }
        }

    def select_prompts(self, selected_prompts, metadata):
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

    def _resolve_category_to_prompts(self, category_id, all_prompts, category_storage):
        """解析分类及其所有子分类，收集所有画师名"""
        # 先获取所有后代分类ID（含自身），O(C)
        descendant_ids = set(category_storage.get_descendant_ids(category_id))
        # 再从 prompts 中过滤，O(P)
        names = []
        for prompt in all_prompts:
            if prompt.get('categoryId') in descendant_ids:
                name = prompt.get('value', '').strip()
                if name:
                    names.append(name)
        return names

    def _process_v1_metadata(self, metadata_dict, raw_metadata):
        """处理新版 v1 格式的 metadata，返回 (格式化结果, 富化后的 metadata JSON)"""

        try:
            prompt_storage, _, category_storage, combination_storage = get_storage()
            all_prompts = prompt_storage.get_all_prompts()
        except Exception as e:
            print(f"[PromptSelector] Failed to load storage: {e}")
            return ("", "{}")

        partitions = metadata_dict.get('partitions', [])
        prompt_weights = metadata_dict.get('promptWeights', {})
        if not partitions:
            return ("", "{}")

        formatted_results = []
        # 跨分区收集全部已解析画师（用于 SaveToGallery）
        all_resolved = []      # [{categoryId, value, saveToGallery}, ...]
        seen_keys = set()
        # 记录每个分区实际使用的画师名（考虑随机/循环后）
        partition_used_prompts = {}  # {partition_id: [name, ...]}
        partition_formats = {}  # {partition_id: format_string}

        def collect_prompt(cat_id, name, save_to_gallery=True):
            key = f"{cat_id}:{name}"
            if key not in seen_keys:
                seen_keys.add(key)
                all_resolved.append({
                    "categoryId": cat_id,
                    "value": name,
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
            prompt_entries = []  # [(cat_id, name), ...]
            combination_entries = []  # [(output_content, prompt_keys), ...]

            # 优先从 orderItems 读取（统一格式），否则 fallback 到旧格式
            order_items = partition.get('orderItems')
            if order_items is not None:
                for item in order_items:
                    item_type = item.get('type', '')
                    key = item.get('key', '')
                    if item_type == 'prompt':
                        parts = key.split(':', 1)
                        name = parts[-1].strip() if parts else ''
                        cat_id = parts[0] if len(parts) > 1 else ''
                        if name:
                            prompt_entries.append((cat_id, name))
                    elif item_type == 'category':
                        resolved = self._resolve_category_to_prompts(key, all_prompts, category_storage)
                        for n in resolved:
                            prompt_entries.append((key, n))
                    elif item_type == 'combination' and key.startswith('combination:'):
                        comb_id = key[len('combination:'):]
                        try:
                            combination = combination_storage.get_combination_by_id(comb_id)
                            if combination:
                                combination_entries.append((
                                    combination.get('outputContent', ''),
                                    combination.get('prompts', []),
                                ))
                        except Exception as e:
                            print(f"[PromptSelector] Failed to lookup combination {comb_id}: {e}")
            else:
                # 向后兼容旧格式
                for key in partition.get('promptKeys', []):
                    parts = key.split(':', 1)
                    name = parts[-1].strip() if parts else ''
                    cat_id = parts[0] if len(parts) > 1 else ''
                    if name:
                        prompt_entries.append((cat_id, name))

                for cat_id in partition.get('categoryIds', []):
                    resolved = self._resolve_category_to_prompts(cat_id, all_prompts, category_storage)
                    for n in resolved:
                        prompt_entries.append((cat_id, n))

                for comb_key in partition.get('combinationKeys', []):
                    if comb_key.startswith('combination:'):
                        comb_id = comb_key[len('combination:'):]
                        try:
                            combination = combination_storage.get_combination_by_id(comb_id)
                            if combination:
                                combination_entries.append((
                                    combination.get('outputContent', ''),
                                    combination.get('prompts', []),
                                ))
                        except Exception as e:
                            print(f"[PromptSelector] Failed to lookup combination {comb_id}: {e}")

            # 去重保序
            seen = set()
            unique_entries = []
            for entry in prompt_entries:
                key = f"{entry[0]}:{entry[1]}"
                if key not in seen:
                    seen.add(key)
                    unique_entries.append(entry)

            if not unique_entries and not combination_entries:
                continue

            # 将画师条目和组合条目合并为统一的工作列表
            # 每个条目是 ('prompt', cat_id, name) 或 ('combination', output_content, prompt_keys)
            working_items = []
            for cat_id, name in unique_entries:
                working_items.append(('prompt', cat_id, name))
            for content, prompt_keys in combination_entries:
                working_items.append(('combination', content, prompt_keys))

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
                    for prompt_name in (current_item[2] or []):
                        collect_prompt('', prompt_name, save_to_gallery)
                        if save_to_gallery:
                            pid = partition.get('id', 'default')
                            if pid not in partition_used_prompts:
                                partition_used_prompts[pid] = []
                            partition_used_prompts[pid].append(prompt_name)
                else:
                    formatted = self._apply_format(current_item[2], partition_format)
                    w_key = f"{current_item[1]}:{current_item[2]}"
                    formatted_results.append(self._apply_weight(formatted, prompt_weights.get(w_key)))
                    collect_prompt(current_item[1], current_item[2], save_to_gallery)
                    # 记录实际输出的画师名（用于自动创建组合）
                    if save_to_gallery and current_item[0] == 'prompt':
                        pid = partition.get('id', 'default')
                        if pid not in partition_used_prompts:
                            partition_used_prompts[pid] = []
                        partition_used_prompts[pid].append(current_item[2])
            else:
                working = working_items
                if random_mode and random_count > 0 and random_count < len(working):
                    working = random.sample(working, random_count)
                for item in working:
                    if item[0] == 'combination':
                        formatted_results.append(item[1])
                        # 组合的画师也要关联到保存的图片
                        for prompt_name in (item[2] or []):
                            collect_prompt('', prompt_name, save_to_gallery)
                            if save_to_gallery:
                                pid = partition.get('id', 'default')
                                if pid not in partition_used_prompts:
                                    partition_used_prompts[pid] = []
                                partition_used_prompts[pid].append(prompt_name)
                    else:
                        formatted = self._apply_format(item[2], partition_format)
                        w_key = f"{item[1]}:{item[2]}"
                        formatted_results.append(self._apply_weight(formatted, prompt_weights.get(w_key)))
                        collect_prompt(item[1], item[2], save_to_gallery)
                        # 记录实际输出的画师名（用于自动创建组合）
                        if save_to_gallery and item[0] == 'prompt':
                            pid = partition.get('id', 'default')
                            if pid not in partition_used_prompts:
                                partition_used_prompts[pid] = []
                            partition_used_prompts[pid].append(item[2])

        result = ','.join(formatted_results)

        # 自动创建组合（使用输出时实际选中的画师，而非全量）
        try:
            for partition in partitions:
                partition_name = partition.get('name', '默认')
                partition_config = partition.get('config', {})
                enabled = partition.get('enabled', True)
                auto_create = partition_config.get('autoCreateCombination', False)
                if not enabled or not auto_create:
                    continue

                # 使用输出循环中实际选中的画师（已考虑随机/循环）
                pid = partition.get('id', 'default')
                prompt_names = partition_used_prompts.get(pid, [])
                if not prompt_names:
                    continue

                p_format = partition_formats.get(pid, '{content}')
                formatted_parts = [self._apply_format(name, p_format) for name in prompt_names]
                output_content = ','.join(formatted_parts)
                comb_name = ','.join(prompt_names)

                # 查重
                existing = combination_storage.find_by_content(output_content)
                if existing:
                    print(f"[PromptSelector] Partition '{partition_name}': combination already exists (id={existing.get('id')}), skipping")
                else:
                    auto_save_cat_id = partition_config.get('autoSaveCombinationCategoryId', 'root') or 'root'
                    new_comb = combination_storage.add_combination(
                        name=comb_name,
                        category_id=auto_save_cat_id,
                        prompts=prompt_names,
                        output_content=output_content,
                    )
                    
        except Exception as e:
            print(f"[PromptSelector] Auto-create combination error: {e}")
            import traceback
            traceback.print_exc()

        # 构建富化 metadata：包含解析结果，供 SaveToGallery 直接使用
        enriched_metadata = json.dumps({
            "prompt_names": [a["value"] for a in all_resolved],
            "selected_prompts": all_resolved,
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

    def _apply_format(self, prompt_name, format_str):
        """应用格式字符串到画师名称"""
        # 替换 {content}
        result = format_str.replace('{content}', prompt_name)

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
                print(f"[PromptSelector] Error generating random number: {e}")
                return match.group(0)

        # 使用正则替换所有匹配
        pattern = r'\{random\(([^,]+),([^,]+),([^)]+)\)\}'
        result = re.sub(pattern, replace_random, result)

        return result

    def _get_prompt_info(self, metadata_dict, prompt_name):
        """从 metadata 中获取画师信息"""
        selected_prompts = metadata_dict.get('selected_prompts', [])
        for prompt_info in selected_prompts:
            if prompt_info.get('value') == prompt_name:
                return prompt_info
        return None


class SaveToGallery:
    """保存图片到画廊节点"""

    CATEGORY = "🎨 Prompt Gallery"
    RETURN_TYPES = ()
    FUNCTION = "save_image"
    OUTPUT_NODE = True

    @staticmethod
    def _match_prompts_from_prompt(prompt_string):
        """从 prompt_string 中匹配已知画师名，返回 [{categoryId, name, saveToGallery}, ...]"""
        global _prompt_match_cache, _prompt_match_names, _prompt_match_lookup

        if not prompt_string or not prompt_string.strip():
            return []

        prompt_storage, _, category_storage, _ = get_storage()
        all_prompts = prompt_storage.get_all_prompts()
        if not all_prompts:
            return []

        blocked_ids = _get_blocked_category_ids(category_storage)

        # 先计算轻量指纹，只有 Prompt/别名集合变化时才重建查找表。
        current_names = []
        for prompt in all_prompts:
            value = prompt.get("value", "").strip()
            if value:
                current_names.append((value, prompt.get("categoryId", "root"), prompt.get("value", "")))
            alias = prompt.get("alias", "").strip()
            if alias:
                for a in alias.split(","):
                    a = a.strip()
                    if a:
                        current_names.append((a, prompt.get("categoryId", "root"), prompt.get("value", "")))

        # 检查缓存是否需要重建
        current_fingerprint = frozenset(current_names)
        if current_fingerprint != _prompt_match_names:
            name_to_prompts = {}
            for prompt in all_prompts:
                value = prompt.get("value", "").strip()
                if value:
                    name_to_prompts.setdefault(value, []).append(prompt)
                alias = prompt.get("alias", "").strip()
                if alias:
                    for a in alias.split(","):
                        a = a.strip()
                        if a:
                            name_to_prompts.setdefault(a, []).append(prompt)
            # 按名称长度降序排列，确保贪心匹配（长名优先）
            _prompt_match_cache = sorted(name_to_prompts.keys(), key=len, reverse=True)
            _prompt_match_lookup = name_to_prompts
            _prompt_match_names = current_fingerprint

        # 循环匹配（CPython in 操作使用 C 级优化字符串搜索）
        prompt_lower = prompt_string.lower()
        result = []
        seen = set()
        seen_names = set()

        for name in _prompt_match_cache:
            if name.lower() in prompt_lower:
                if name not in seen_names:
                    seen_names.add(name)
                    for prompt in _prompt_match_lookup.get(name, []):
                        value = prompt.get("value")
                        cat_id = prompt.get("categoryId", "root")
                        if cat_id in blocked_ids:
                            continue
                        entry_key = f"{cat_id}:{value}"
                        if entry_key not in seen:
                            seen.add(entry_key)
                            result.append({
                                "categoryId": cat_id,
                                "value": value,
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
                "prefix": ("STRING", {"default": "prompt_gallery/AG"}),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            }
        }

    def save_image(self, images, metadata_json="{}", prefix="prompt_gallery/AG", prompt_string="", prompt=None, extra_pnginfo=None):
        """
        保存图片并创建映射关系
        支持两种输入源（合并使用，结果去重）：
        :param prefix: 保存路径前缀，支持 strftime 时间格式化（如 "gallery/%Y/%m/AG"）
        :param metadata_json: 由 PromptSelector 输出的 JSON
        :param prompt_string: 提示词字符串，自动匹配已知画师名（含别名）
        """
        import folder_paths
        import numpy as np
        from PIL import Image, PngImagePlugin
        import time
        import json
        import os

        # 解析 metadata_json
        try:
            metadata = json.loads(metadata_json) if metadata_json else {}
        except:
            metadata = {}

        # 一次性获取所有存储实例
        prompt_storage, mapping_storage, _, _ = get_storage()

        # 收集画师来源：metadata_json + prompt_string，合并去重
        prompt_names_from_meta = metadata.get("prompt_names", [])
        selected_prompts = metadata.get("selected_prompts", [])

        all_saveable_prompts = []

        # 来源 A: metadata_json（用户显式选择，不检查 blockGallerySave）
        if prompt_names_from_meta and selected_prompts:
            saveable_from_meta = [a for a in selected_prompts if a.get("saveToGallery", True)]
            all_saveable_prompts.extend(saveable_from_meta)

        # 来源 B: prompt_string（含别名匹配）
        if prompt_string and prompt_string.strip():
            saveable_from_string = self._match_prompts_from_prompt(prompt_string)
            if saveable_from_string:
                all_saveable_prompts.extend(saveable_from_string)

        if not all_saveable_prompts:
            print("[SaveToGallery] 未匹配到已知画师，图片仍将保存（无关联Prompt）")

        # 去重（按 categoryId:value）用于图片计数更新
        seen = set()
        saveable_prompts = []
        for p in all_saveable_prompts:
            key = f"{p.get('categoryId', 'root')}:{p.get('value', '')}"
            if key not in seen:
                seen.add(key)
                saveable_prompts.append(p)

        # 去重（按 value）用于映射和日志
        saveable_names = list(dict.fromkeys(a["value"] for a in saveable_prompts))

        # 解析 prefix：最后一个 / 分割为目录模板和文件名前缀
        prefix = prefix or "prompt_gallery/AG"
        now = time.time()
        now_struct = time.localtime(now)

        parts = prefix.rsplit("/", 1)
        if len(parts) == 2:
            dir_template, file_prefix = parts
        else:
            dir_template, file_prefix = "", parts[0]

        # 对目录和文件名前缀都应用 strftime 时间格式化
        dir_path = time.strftime(dir_template, now_struct) if dir_template else ""
        file_prefix = time.strftime(file_prefix, now_struct)

        output_dir = Path(folder_paths.get_output_directory())
        save_dir = output_dir / dir_path if dir_path else output_dir
        save_dir.mkdir(parents=True, exist_ok=True)

        # 预序列化 PNG 公共 metadata（循环内每张图内容相同）
        prompt_json = json.dumps(prompt) if prompt is not None else None
        gallery_json = json.dumps({
            "prompt_names": saveable_names,
            "selected_prompts": saveable_prompts,
            "promptString": prompt_string or "",
        })
        extra_pnginfo_items = []
        if extra_pnginfo is not None:
            for key, value in extra_pnginfo.items():
                extra_pnginfo_items.append((key, json.dumps(value) if isinstance(value, (dict, list)) else str(value)))

        # 批量转换 tensor → numpy（避免逐张 .cpu().numpy()）
        image_arrays = images.cpu().numpy()

        saved_count = 0
        results = []
        pending_mappings = []

        for idx in range(len(images)):
            img = Image.fromarray(np.clip(255. * image_arrays[idx], 0, 255).astype(np.uint8))

            timestamp = int(now * 1000)
            filename = f"{file_prefix}_{timestamp}_{idx:05}.png"
            save_path = save_dir / filename

            pnginfo = PngImagePlugin.PngInfo()
            if prompt_json is not None:
                pnginfo.add_text("prompt", prompt_json)
            pnginfo.add_text("prompt_gallery", gallery_json)
            for key, val_str in extra_pnginfo_items:
                pnginfo.add_text(key, val_str)

            try:
                img.save(save_path, format="PNG", pnginfo=pnginfo)
                saved_count += 1

                results.append({
                    "filename": filename,
                    "subfolder": dir_path,
                    "type": "output",
                })

                # 构建相对路径
                image_path = f"{dir_path}/{filename}" if dir_path else filename

                # 构建 fileInfo
                file_stat = save_path.stat()
                file_info = {
                    "createdAt": timestamp,
                    "size": file_stat.st_size,
                    "type": "image/png",
                    "width": img.width,
                    "height": img.height,
                }

                # 收集映射数据，循环结束后批量写入
                pending_mappings.append({
                    "image_path": image_path,
                    "prompt_values": saveable_names,
                    "file_info": file_info,
                    "prompt_string": prompt_string or "",
                    "generate_prompt": prompt,
                })

                print(f"[SaveToGallery] 已保存: {filename} -> Prompt: {', '.join(saveable_names)}")

            except Exception as e:
                print(f"[SaveToGallery] 保存图片失败: {e}")
                import traceback
                traceback.print_exc()

        # 批量写入映射关系（一次读写，而非每张图各一次）
        if pending_mappings:
            mapping_storage.add_mappings_batch(pending_mappings)

        # 批量更新画师图片计数（一次读写完成）
        if saved_count > 0:
            deltas = {}
            for prompt_info in saveable_prompts:
                category_id = prompt_info.get("categoryId", "root")
                value = prompt_info.get("value", "")
                if category_id and value:
                    key = (category_id, value)
                    deltas[key] = deltas.get(key, 0) + saved_count
            prompt_storage.update_image_count_batch(deltas)

        print(f"[SaveToGallery] 总共保存了 {saved_count} 张图片")
        return { "ui": { "images": results } }


class QuickSavePrompt:
    """快速保存Prompt节点 - 将传入的字符串保存为Prompt"""

    CATEGORY = "🎨 Prompt Gallery"
    RETURN_TYPES = ()
    FUNCTION = "save_prompt"
    OUTPUT_NODE = True

    @classmethod
    def INPUT_TYPES(cls):
        _, _, category_storage, _ = get_storage()
        categories = category_storage.get_all_categories()
        category_list = [cat["name"] for cat in categories]
        if not category_list:
            category_list = ["root"]

        return {
            "required": {
                "prompt_name": ("STRING", {"default": ""}),
                "category": (category_list,),
                "prompt_value": ("STRING", {"forceInput": True}),
            }
        }

    def save_prompt(self, prompt_name, category, prompt_value):
        if not prompt_name or not prompt_name.strip():
            print("[QuickSavePrompt] 错误: 请填写 prompt 名称")
            return ()

        if not prompt_value or not prompt_value.strip():
            print("[QuickSavePrompt] 错误: 传入的 prompt 内容为空")
            return ()

        prompt_name = prompt_name.strip()
        prompt_value = prompt_value.strip()

        prompt_storage, mapping_storage, category_storage, _ = get_storage()

        # 根据分类名称查找分类 ID
        categories = category_storage.get_all_categories()
        category_id = "root"
        for cat in categories:
            if cat["name"] == category:
                category_id = cat["id"]
                break

        # 检查同分类下是否已有同名 prompt
        existing = None
        for p in prompt_storage.get_all_prompts():
            if p.get("categoryId") == category_id and p.get("name") == prompt_name:
                existing = p
                break

        if existing:
            old_value = existing["value"]
            if old_value != prompt_value:
                prompt_storage.update_prompt(
                    category_id=category_id,
                    old_value=old_value,
                    value=prompt_value,
                )
                # 同步更新图片映射中的旧值
                mapping_storage.rename_prompt_in_mappings(old_value, prompt_value)
                print(f"[QuickSavePrompt] 已更新 prompt: {prompt_name} (value: {old_value} -> {prompt_value}, 分类: {category})")
            else:
                print(f"[QuickSavePrompt] prompt 未变化: {prompt_name} (value: {prompt_value}, 分类: {category})")
        else:
            prompt_storage.add_prompt(
                value=prompt_value,
                name=prompt_name,
                category_id=category_id,
            )
            print(f"[QuickSavePrompt] 已创建 prompt: {prompt_name} (value: {prompt_value}, 分类: {category})")

        return ()


def _flatten_categories(categories, tree):
    """将分类树扁平化为带缩进的名称列表，返回 (名称列表, 名称→ID映射)"""
    name_to_id = {}

    def walk(nodes, depth=0):
        for node in nodes:
            display = "  " * depth + node["name"]
            name_to_id[display] = node["id"]
            walk(node.get("children", []), depth + 1)

    walk(tree)
    return name_to_id


class PromptCategoryReader:
    """从分类读取Prompt节点"""

    CATEGORY = "🎨 Prompt Gallery"
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "read_prompts"

    @classmethod
    def INPUT_TYPES(cls):
        _, _, category_storage, _ = get_storage()
        categories = category_storage.get_all_categories()
        tree = category_storage.get_category_tree()
        name_to_id = _flatten_categories(categories, tree)
        category_list = ["全部"] + list(name_to_id.keys())
        cls._cat_name_to_id_map = {"全部": "root", **name_to_id}

        return {
            "required": {
                "category": (category_list, {"default": "全部"}),
                "property": (["value", "name"], {"default": "value"}),
                "mode": (["选取所有", "取最新N个", "随机取N个", "取最旧N个"], {"default": "选取所有"}),
                "count": ("INT", {"default": 10, "min": 1, "max": 9999, "step": 1}),
                "separator": ("STRING", {"default": ", "}),
            }
        }

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    def read_prompts(self, category, property, mode, count, separator):
        category_id = self.__class__._cat_name_to_id_map.get(category, "root")

        prompt_storage, _, category_storage, _ = get_storage()
        descendant_ids = set(category_storage.get_descendant_ids(category_id))
        all_prompts = prompt_storage.get_all_prompts()
        filtered = [p for p in all_prompts if p.get("categoryId") in descendant_ids]

        if not filtered:
            return ("",)

        if mode == "取最新N个":
            filtered.sort(key=lambda p: p.get("createdAt", 0), reverse=True)
            filtered = filtered[:count]
        elif mode == "取最旧N个":
            filtered.sort(key=lambda p: p.get("createdAt", 0))
            filtered = filtered[:count]
        elif mode == "随机取N个":
            filtered = random.sample(filtered, min(count, len(filtered)))

        key = "name" if property == "name" else "value"
        result = separator.join(p.get(key, "") for p in filtered)
        return (result,)
