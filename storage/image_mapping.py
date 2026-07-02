import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from ._json_store import SplitJsonStorage


class ImageMappingStorage(SplitJsonStorage):
    """图片索引存储。Prompt 关联由 promptString 运行时匹配推导。"""

    item_key = "mappings"
    file_attr = "mappings_file"
    glob_pattern = "*.images.json"

    def __init__(self, storage_dir: Path):
        super().__init__(storage_dir)
        self.storage_dir = storage_dir
        self.mappings_file = storage_dir / "images.json"
        self._idx_by_path = None  # imagePath -> mapping
        self._ensure_storage_dir()

    def _ensure_storage_dir(self):
        """确保存储目录存在"""
        self.storage_dir.mkdir(parents=True, exist_ok=True)

        if not self.mappings_file.exists() and not self._has_split_files():
            self._write_data({"mappings": []})

    def _invalidate_cache(self):
        super()._invalidate_cache()
        self._idx_by_path = None

    def get_all_mappings(self) -> List[dict]:
        """获取所有映射关系"""
        with self._lock:
            data = self._read_data()
            return data.get("mappings", [])

    def get_comfy_output_mappings(self) -> List[dict]:
        """
        读取 comfy_output*.images.json 中的映射（系统外导入、仅历史视图用）。

        这些文件在 _glob_source_files 中被排除，不参与 prompt 关联/封面解析，
        因此不会被 get_all_mappings / _read_data 读到。历史视图通过此方法按需读取，
        独立于 _cache，每次现读（避免常驻数百 MB 缓存）。
        """
        results = []
        for f in sorted(self.storage_dir.glob("comfy_output*.images.json")):
            try:
                with open(f, "r", encoding="utf-8") as fh:
                    data = json.load(fh)
                for m in data.get(self.item_key, []):
                    m["_source_file"] = str(f)
                    results.append(m)
            except Exception as e:
                print(f"[ImageMapping] 读取 {f.name} 失败: {e}")
        return results

    def add_mapping(self, image_path: str, prompt_values: Optional[List[str]] = None,
                    file_info: Optional[dict] = None, prompt_string: str = "",
                    generate_prompt=None, mapping_type: str = "local",
                    target_file: Optional[str] = None):
        """
        添加图片索引记录。prompt_values 仅兼容旧调用，用于 promptString 兜底。
        :param image_path: 图片相对路径或远程URL
        :param prompt_values: 旧关联Prompt值列表；不再持久化为 prompts
        :param file_info: 文件信息 {createdAt, size, type, width, height}
        :param prompt_string: 提示词字符串
        :param generate_prompt: 生成时的prompt dict
        :param mapping_type: 'local' 或 'remote'
        """
        import time

        with self._lock:
            mapping = {
                "type": mapping_type,
                "imagePath": image_path,
            }

            if file_info:
                mapping["fileInfo"] = file_info
            else:
                mapping["fileInfo"] = {}

            final_prompt_string = prompt_string or ", ".join(prompt_values or [])
            if final_prompt_string:
                mapping["promptString"] = final_prompt_string

            if generate_prompt is not None:
                mapping["generatePrompt"] = json.dumps(generate_prompt, ensure_ascii=False) if isinstance(generate_prompt, (dict, list)) else generate_prompt

            if target_file:
                mapping["_source_file"] = target_file

            data = self._read_data()
            data["mappings"].append(mapping)
            self._write_data(data)

            return mapping

    def add_mappings_import(self, items: List[dict], target_file: Optional[str] = None) -> int:
        """
        导入批量添加映射（一次读写）
        :param items: [{"image_path": str, "prompt_string": str, "file_info": dict, "mapping_type": str}, ...]
        :param target_file: 分离存储目标文件
        :return: 成功添加数量
        """
        print(f"[ImageMapping] 批量导入 {len(items)} 个映射...")
        with self._lock:
            data = self._read_data()
            count = 0
            for item in items:
                mapping = {
                    "type": item.get("mapping_type", "local"),
                    "imagePath": item["image_path"],
                    "fileInfo": item.get("file_info") or {},
                }
                prompt_string = item.get("prompt_string") or ", ".join(item.get("prompt_values") or [])
                if prompt_string:
                    mapping["promptString"] = prompt_string
                if item.get("generate_prompt") is not None:
                    gp = item["generate_prompt"]
                    mapping["generatePrompt"] = json.dumps(gp, ensure_ascii=False) if isinstance(gp, (dict, list)) else gp
                if target_file:
                    mapping["_source_file"] = target_file
                data["mappings"].append(mapping)
                count += 1
            self._write_data(data)
            print(f"[ImageMapping] 映射导入完成: {count} 个")
            return count

    def add_mappings_batch(self, items: List[dict]) -> int:
        """
        批量添加映射（一次读写），用于 SaveToGallery 多图保存
        :param items: [{"image_path", "file_info", "prompt_string", "generate_prompt"}, ...]
        :return: 成功添加数量
        """
        with self._lock:
            data = self._read_data()
            count = 0
            for item in items:
                mapping = {
                    "type": "local",
                    "imagePath": item["image_path"],
                    "fileInfo": item.get("file_info") or {},
                }
                prompt_string = item.get("prompt_string") or ", ".join(item.get("prompt_values") or [])
                if prompt_string:
                    mapping["promptString"] = prompt_string
                if item.get("generate_prompt") is not None:
                    gp = item["generate_prompt"]
                    mapping["generatePrompt"] = json.dumps(gp, ensure_ascii=False) if isinstance(gp, (dict, list)) else gp
                data["mappings"].append(mapping)
                count += 1
            self._write_data(data)
            return count

    def get_mappings_by_prompt(self, prompt_value: str) -> List[dict]:
        """
        获取 promptString 中包含指定Prompt值的所有图片索引。
        :param prompt_value: Prompt值
        :return: 图片索引列表
        """
        query = (prompt_value or "").lower()
        if not query:
            return []
        mappings = self.get_all_mappings()
        return [
            m for m in mappings
            if query in (m.get("promptString") or "").lower()
        ]

    def get_first_mapping_by_prompt(self, prompt_value: str) -> Optional[dict]:
        """获取Prompt的第一张图片映射（用于封面图）"""
        mappings = self.get_mappings_by_prompt(prompt_value)
        return mappings[0] if mappings else None

    def get_mappings_by_prompt_id(self, prompt_id: str) -> List[dict]:
        """
        获取指定Prompt的所有图片映射（使用 ID，兼容旧版本）
        注意：此方法仅用于迁移期间的兼容性
        """
        return self.get_mappings_by_prompt(prompt_id)

    def _build_path_index(self):
        """构建 imagePath 索引（懒加载）"""
        data = self._read_data()
        self._idx_by_path = {}
        for m in data.get("mappings", []):
            path = m.get("imagePath")
            if path:
                self._idx_by_path[path] = m

    def get_mappings_by_image(self, image_path: str) -> Optional[dict]:
        """根据图片路径获取映射（O(1) 索引查找）"""
        with self._lock:
            if self._idx_by_path is None:
                self._build_path_index()
            return self._idx_by_path.get(image_path)

    def remove_prompt_from_mappings(self, prompt_value: str) -> List[str]:
        """
        从所有映射中移除指定Prompt
        :param prompt_value: Prompt值
        :return: 被完全移除的图片路径列表（没有其他Prompt关联的图片）
        """
        return []

    def batch_remove_prompt_links(self, prompt_values: List[str]) -> dict:
        """
        批量从所有映射中移除多个 prompt 关联（一次锁完成）。
        :param prompt_values: 要移除的 prompt value 列表
        :return: {"orphan_images": [{"path": ..., "type": ...}], "updated_paths": [...]}
        """
        return {"orphan_images": [], "updated_paths": []}

    def delete_mapping_by_image(self, image_path: str) -> bool:
        """根据图片路径删除映射"""
        with self._lock:
            data = self._read_data()
            original_count = len(data["mappings"])
            data["mappings"] = [
                m for m in data["mappings"]
                if m.get("imagePath") != image_path
            ]

            if len(data["mappings"]) < original_count:
                self._write_data(data)
                return True
            return False

    def cleanup_missing_local_mappings(self, output_dir: Path, sample_limit: int = 20) -> dict:
        """
        删除本地文件已不存在的图片映射。远程图片映射不会被处理。
        :return: {"removed": int, "scanned": int, "samples": [imagePath, ...], "bySource": {filename: count}}
        """
        def is_remote(mapping: dict) -> bool:
            image_path = mapping.get("imagePath") or ""
            mapping_type = mapping.get("type", "")
            return mapping_type == "remote" or image_path.startswith("http://") or image_path.startswith("https://")

        with self._lock:
            data = self._read_data()
            mappings = data.get("mappings", [])
            kept = []
            removed = 0
            scanned = 0
            samples = []
            by_source = {}

            for mapping in mappings:
                image_path = mapping.get("imagePath") or ""
                source_file = mapping.get("_source_file") or str(self.primary_file)

                if is_remote(mapping):
                    kept.append(mapping)
                    continue

                scanned += 1
                exists = bool(image_path) and (Path(output_dir) / image_path).exists()
                if exists:
                    kept.append(mapping)
                    continue

                removed += 1
                source_name = Path(source_file).name
                by_source[source_name] = by_source.get(source_name, 0) + 1
                if len(samples) < sample_limit:
                    samples.append(image_path or "(empty imagePath)")

            if removed:
                data["mappings"] = kept
                self._write_data(data)

            return {
                "removed": removed,
                "scanned": scanned,
                "samples": samples,
                "bySource": by_source,
            }

    def update_mapping(self, image_path: str, prompt_values: Optional[List[str]] = None,
                       file_info: Optional[dict] = None, prompt_string: Optional[str] = None) -> bool:
        """
        更新图片映射
        :param image_path: 图片路径
        :param prompt_values: 旧接口兼容参数；不再写入 prompts
        :param file_info: 可选的文件信息更新（合并）
        :param prompt_string: 可选的prompt_string更新
        :return: 是否更新成功
        """
        with self._lock:
            data = self._read_data()

            for mapping in data["mappings"]:
                if mapping.get("imagePath") == image_path:
                    if file_info is not None:
                        mapping.setdefault("fileInfo", {})
                        mapping["fileInfo"] = {**mapping["fileInfo"], **file_info}
                    if prompt_string is not None:
                        mapping["promptString"] = prompt_string
                    elif prompt_values is not None:
                        mapping["promptString"] = ", ".join(prompt_values)
                    self._write_data(data)
                    return True

            return False

    def rename_prompt_in_mappings(self, old_value: str, new_value: str) -> int:
        """
        兼容旧接口：不再维护强映射，因此不修改图片索引。
        :param old_value: 旧值
        :param new_value: 新值
        :return: 更新的映射数量
        """
        return 0

    def get_all_mappings_for_prompt(self, prompt_value: str) -> List[dict]:
        """
        获取指定Prompt的所有映射（用于重命名时显示预览）
        :param prompt_value: Prompt值
        :return: 映射列表
        """
        mappings = self.get_all_mappings()
        return [
            {**m, "matched": True}
            for m in mappings
            if (prompt_value or "").lower() in (m.get("promptString") or "").lower()
        ]

    def build_prompt_index(self) -> Dict[str, List[dict]]:
        """
        根据 promptString 动态构建 prompt_value → [mapping, ...] 索引。
        只对调用方传入的完整 prompt 列表更可靠；无 prompt 列表时保留空实现。
        """
        return {}

    def build_prompt_index_for_values(self, prompt_values: List[str]) -> Dict[str, List[dict]]:
        """为指定 prompt value 列表按 promptString 包含关系构建索引。"""
        values = [v for v in prompt_values if v]
        lowered = [(v, v.lower()) for v in values]
        index: Dict[str, List[dict]] = {v: [] for v in values}
        for mapping in self.get_all_mappings():
            prompt_string = (mapping.get("promptString") or "").lower()
            if not prompt_string:
                continue
            for value, query in lowered:
                if query in prompt_string:
                    index[value].append(mapping)
        return index
