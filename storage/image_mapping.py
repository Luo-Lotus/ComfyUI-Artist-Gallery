import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import threading

from ._config import get_disabled_files


class ImageMappingStorage:
    """图片-Prompt映射关系管理"""

    def __init__(self, storage_dir: Path):
        self.storage_dir = storage_dir
        self.mappings_file = storage_dir / "images.json"
        self._glob_pattern = "*.images.json"
        self._lock = threading.Lock()
        self._cache = None
        self._idx_by_path = None  # imagePath -> mapping
        self._ensure_storage_dir()

    def _ensure_storage_dir(self):
        """确保存储目录存在"""
        self.storage_dir.mkdir(parents=True, exist_ok=True)

        if not self.mappings_file.exists():
            split_files = [f for f in self.storage_dir.glob(self._glob_pattern)
                           if f.resolve() != self.mappings_file.resolve()]
            if not split_files:
                self._write_data({"mappings": []})

    def _glob_source_files(self) -> list:
        """查找所有源文件：主文件 + glob 匹配的分片文件（排除已禁用）"""
        disabled = get_disabled_files(self.storage_dir)
        sources = []
        if self.mappings_file.exists():
            sources.append(self.mappings_file)
        for f in sorted(self.storage_dir.glob(self._glob_pattern)):
            if f.resolve() != self.mappings_file.resolve():
                if f.name not in disabled:
                    sources.append(f)
        return sources

    def _read_data(self) -> dict:
        """读取并合并所有源文件（带缓存）"""
        if self._cache is not None:
            return self._cache
        merged_items = []
        for source_file in self._glob_source_files():
            try:
                with open(source_file, 'r', encoding='utf-8') as f:
                    file_data = json.load(f)
                for item in file_data.get("mappings", []):
                    item["_source_file"] = str(source_file)
                    merged_items.append(item)
            except Exception as e:
                print(f"Error reading {source_file.name}: {e}")
        self._cache = {"mappings": merged_items}
        return self._cache

    def _write_data(self, data: dict):
        """按来源文件分组回写，新数据写入主文件"""
        try:
            groups: Dict[str, list] = {}
            for item in data.get("mappings", []):
                source = item.pop("_source_file", None) or str(self.mappings_file)
                groups.setdefault(source, []).append(item)

            main_key = str(self.mappings_file)
            if main_key not in groups and len(groups) > 0:
                groups[main_key] = []

            for file_path_str, items in groups.items():
                file_path = Path(file_path_str)
                file_path.parent.mkdir(parents=True, exist_ok=True)
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump({"mappings": items}, f, ensure_ascii=False, indent=2)

            self._cache = None
            self._idx_by_path = None
        except Exception as e:
            self._cache = None
            self._idx_by_path = None
            print(f"Error writing mappings files: {e}")
            raise

    def get_all_mappings(self) -> List[dict]:
        """获取所有映射关系"""
        with self._lock:
            data = self._read_data()
            return data.get("mappings", [])

    def get_all_image_paths(self) -> set:
        """获取所有已登记图片路径，用于导入去重。"""
        with self._lock:
            data = self._read_data()
            return {
                mapping.get("imagePath")
                for mapping in data.get("mappings", [])
                if mapping.get("imagePath")
            }

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
        mappings = self.get_all_mappings()
        return [
            m for m in mappings
            if prompt_value in m.get("prompts", [])
        ]

    def get_first_mapping_by_prompt(self, prompt_value: str) -> Optional[dict]:
        """获取Prompt的第一张图片映射（用于封面图）"""
        with self._lock:
            data = self._read_data()
            for m in data.get("mappings", []):
                if prompt_value in m.get("prompts", []):
                    return m
            return None

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

    def batch_delete_by_images(self, image_paths: List[str]) -> List[dict]:
        """
        批量根据图片路径删除映射（一次锁和一次写入）。
        :return: 被删除的映射列表
        """
        path_set = {path for path in image_paths if path}
        if not path_set:
            return []

        with self._lock:
            data = self._read_data()
            removed = []
            kept = []

            for mapping in data["mappings"]:
                if mapping.get("imagePath") in path_set:
                    removed.append(mapping)
                else:
                    kept.append(mapping)

            if removed:
                data["mappings"] = kept
                self._write_data(data)

            return removed

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
            data = self._read_data()
            index: Dict[str, List[dict]] = {}
            for m in data.get("mappings", []):
                for value in m.get("prompts", []):
                    index.setdefault(value, []).append(m)
            return index
