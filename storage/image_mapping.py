import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from ._json_store import SplitJsonStorage


class ImageMappingStorage(SplitJsonStorage):
    """图片-Prompt映射关系管理"""

    item_key = "mappings"
    file_attr = "mappings_file"
    glob_pattern = "*.images.json"

    def __init__(self, storage_dir: Path):
        super().__init__(storage_dir)
        self.storage_dir = storage_dir
        self.mappings_file = storage_dir / "images.json"
        self._idx_by_path = None  # imagePath -> mapping
        self._idx_by_prompt = None  # prompt value -> [mapping, ...]
        self._ensure_storage_dir()

    def _ensure_storage_dir(self):
        """确保存储目录存在"""
        self.storage_dir.mkdir(parents=True, exist_ok=True)

        if not self.mappings_file.exists() and not self._has_split_files():
            self._write_data({"mappings": []})

    def _invalidate_cache(self):
        super()._invalidate_cache()
        self._idx_by_path = None
        self._idx_by_prompt = None

    def get_all_mappings(self) -> List[dict]:
        """获取所有映射关系"""
        with self._lock:
            data = self._read_data()
            return data.get("mappings", [])

    def add_mapping(self, image_path: str, prompt_values: List[str],
                    file_info: Optional[dict] = None, prompt_string: str = "",
                    generate_prompt=None, mapping_type: str = "local",
                    target_file: Optional[str] = None):
        """
        添加图片-Prompt映射
        :param image_path: 图片相对路径或远程URL
        :param prompt_values: 关联的Prompt值列表
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
                "prompts": prompt_values,
            }

            if file_info:
                mapping["fileInfo"] = file_info
            else:
                mapping["fileInfo"] = {}

            if prompt_string:
                mapping["promptString"] = prompt_string

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
        :param items: [{"image_path": str, "prompt_values": list, "file_info": dict, "mapping_type": str}, ...]
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
                    "prompts": item["prompt_values"],
                    "fileInfo": item.get("file_info") or {},
                }
                if item.get("prompt_string"):
                    mapping["promptString"] = item["prompt_string"]
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
        :param items: [{"image_path", "prompt_values", "file_info", "prompt_string", "generate_prompt"}, ...]
        :return: 成功添加数量
        """
        with self._lock:
            data = self._read_data()
            count = 0
            for item in items:
                mapping = {
                    "type": "local",
                    "imagePath": item["image_path"],
                    "prompts": item["prompt_values"],
                    "fileInfo": item.get("file_info") or {},
                }
                if item.get("prompt_string"):
                    mapping["promptString"] = item["prompt_string"]
                if item.get("generate_prompt") is not None:
                    gp = item["generate_prompt"]
                    mapping["generatePrompt"] = json.dumps(gp, ensure_ascii=False) if isinstance(gp, (dict, list)) else gp
                data["mappings"].append(mapping)
                count += 1
            self._write_data(data)
            return count

    def get_mappings_by_prompt(self, prompt_value: str) -> List[dict]:
        """
        获取指定Prompt的所有图片映射
        :param prompt_value: Prompt值
        :return: 图片映射列表
        """
        with self._lock:
            if self._idx_by_prompt is None:
                self._build_prompt_index()
            return list(self._idx_by_prompt.get(prompt_value, []))

    def get_first_mapping_by_prompt(self, prompt_value: str) -> Optional[dict]:
        """获取Prompt的第一张图片映射（用于封面图）"""
        with self._lock:
            if self._idx_by_prompt is None:
                self._build_prompt_index()
            mappings = self._idx_by_prompt.get(prompt_value, [])
            return mappings[0] if mappings else None

    def get_mappings_by_prompt_id(self, prompt_id: str) -> List[dict]:
        """
        获取指定Prompt的所有图片映射（使用 ID，兼容旧版本）
        注意：此方法仅用于迁移期间的兼容性
        """
        mappings = self.get_all_mappings()
        return [
            m for m in mappings
            if prompt_id in m.get("promptIds", [])
        ]

    def _build_path_index(self):
        """构建 imagePath 索引（懒加载）"""
        data = self._read_data()
        self._idx_by_path = {}
        for m in data.get("mappings", []):
            path = m.get("imagePath")
            if path:
                self._idx_by_path[path] = m

    def _build_prompt_index(self):
        """构建 prompt_value -> [mapping, ...] 索引（懒加载）"""
        data = self._read_data()
        self._idx_by_prompt = {}
        for m in data.get("mappings", []):
            for value in m.get("prompts", []):
                self._idx_by_prompt.setdefault(value, []).append(m)

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
        with self._lock:
            data = self._read_data()
            orphan_images = []

            new_mappings = []
            for mapping in data["mappings"]:
                prompts = mapping.get("prompts", [])

                if prompt_value in prompts:
                    prompts.remove(prompt_value)

                    if prompts:
                        mapping["prompts"] = prompts
                        new_mappings.append(mapping)
                    else:
                        orphan_images.append(mapping.get("imagePath"))
                else:
                    new_mappings.append(mapping)

            data["mappings"] = new_mappings
            self._write_data(data)

            return orphan_images

    def batch_remove_prompt_links(self, prompt_values: List[str]) -> dict:
        """
        批量从所有映射中移除多个 prompt 关联（一次锁完成）。
        :param prompt_values: 要移除的 prompt value 列表
        :return: {"orphan_images": [{"path": ..., "type": ...}], "updated_paths": [...]}
        """
        if not prompt_values:
            return {"orphan_images": [], "updated_paths": []}
        prompt_set = set(prompt_values)
        with self._lock:
            data = self._read_data()
            orphan_images = []
            updated_paths = []
            new_mappings = []

            for mapping in data["mappings"]:
                prompts = list(mapping.get("prompts", []))
                matched = prompt_set & set(prompts)
                if matched:
                    remaining = [p for p in prompts if p not in prompt_set]
                    if remaining:
                        mapping["prompts"] = remaining
                        new_mappings.append(mapping)
                        updated_paths.append(mapping.get("imagePath"))
                    else:
                        orphan_images.append({
                            "path": mapping.get("imagePath"),
                            "type": mapping.get("type", ""),
                        })
                else:
                    new_mappings.append(mapping)

            data["mappings"] = new_mappings
            self._write_data(data)
            return {"orphan_images": orphan_images, "updated_paths": updated_paths}

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

    def update_mapping(self, image_path: str, prompt_values: List[str],
                       file_info: Optional[dict] = None, prompt_string: Optional[str] = None) -> bool:
        """
        更新图片映射
        :param image_path: 图片路径
        :param prompt_values: 新的Prompt值列表
        :param file_info: 可选的文件信息更新（合并）
        :param prompt_string: 可选的prompt_string更新
        :return: 是否更新成功
        """
        with self._lock:
            data = self._read_data()

            for mapping in data["mappings"]:
                if mapping.get("imagePath") == image_path:
                    mapping["prompts"] = prompt_values
                    if file_info is not None:
                        mapping.setdefault("fileInfo", {})
                        mapping["fileInfo"] = {**mapping["fileInfo"], **file_info}
                    if prompt_string is not None:
                        mapping["promptString"] = prompt_string
                    self._write_data(data)
                    return True

            return False

    def rename_prompt_in_mappings(self, old_value: str, new_value: str) -> int:
        """
        在所有映射中重命名Prompt
        :param old_value: 旧值
        :param new_value: 新值
        :return: 更新的映射数量
        """
        with self._lock:
            data = self._read_data()
            updated_count = 0

            for mapping in data["mappings"]:
                prompts = mapping.get("prompts", [])
                if old_value in prompts:
                    new_prompts = [new_value if v == old_value else v for v in prompts]
                    mapping["prompts"] = new_prompts
                    updated_count += 1

            if updated_count > 0:
                self._write_data(data)

            return updated_count

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
            if prompt_value in m.get("prompts", [])
        ]

    def build_prompt_index(self) -> Dict[str, List[dict]]:
        """
        一次性构建 prompt_value → [mapping, ...] 索引。
        用于批量查询场景，消除 N+1 问题。
        """
        with self._lock:
            if self._idx_by_prompt is None:
                self._build_prompt_index()
            return {key: list(value) for key, value in self._idx_by_prompt.items()}
