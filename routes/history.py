"""
历史图片与分组图片 API
"""
import json
import re
import math
from datetime import datetime, timezone, timedelta
from collections import OrderedDict
from pathlib import Path
from aiohttp import web
import server
from ..storage import get_storage, get_custom_filter_storage, get_image_field_storage
from ._utils import is_remote_path


@server.PromptServer.instance.routes.get("/prompt_gallery/images_grouped")
async def get_images_grouped(request):
    """
    获取图片列表，按日期分组。
    支持 prompt 过滤和 prompt 内容搜索。

    Query params:
      prompt (可选): 按单个 prompt value 过滤
      prompts (可选): 逗号分隔的多个 prompt value，取交集（组合视图用）
      search (可选): 按 prompts[] 字段内容搜索
    """
    try:
        import folder_paths

        output_dir = Path(folder_paths.get_output_directory())

        prompt_filter = request.query.get("prompt", "").strip()
        prompts_param = request.query.get("prompts", "").strip()
        prompts_json_param = request.query.get("prompts_json", "").strip()
        search_query = request.query.get("search", "").strip().lower()
        filters_param = request.query.get("filters", "").strip()
        include_comfy_output = request.query.get("include_comfy_output", "").strip() == "1"
        group_by = request.query.get("group_by", "").strip()

        # 组合模式：多个 prompt 取交集。优先使用 JSON，避免 prompt value 中的逗号被拆坏。
        combination_prompts = None
        if prompts_json_param:
            try:
                parsed_prompts = json.loads(prompts_json_param)
                if isinstance(parsed_prompts, list):
                    combination_prompts = [str(p).strip() for p in parsed_prompts if str(p).strip()]
            except json.JSONDecodeError:
                combination_prompts = []
        elif prompts_param:
            combination_prompts = [p.strip() for p in prompts_param.split(",") if p.strip()]

        # 自定义筛查：解析 filters JSON 参数
        active_filters = []
        if filters_param:
            try:
                filters_list = json.loads(filters_param)
                if isinstance(filters_list, list) and filters_list:
                    filter_storage = get_custom_filter_storage()
                    for fi in filters_list:
                        flt = filter_storage.get_by_id(fi.get("id", ""))
                        if flt:
                            compiled_fn = _compile_custom_filter(flt["filterCode"])
                            if compiled_fn:
                                active_filters.append({
                                    "fn": compiled_fn,
                                    "value": fi.get("value", ""),
                                })
            except (json.JSONDecodeError, Exception):
                pass

        _, mapping_storage, _, _ = get_storage()
        mappings = mapping_storage.get_all_mappings()

        # comfy_output*.images.json 已在 storage glob 中排除（与 prompt 无关、不参与关联解析）。
        # 历史视图仅在显式请求时按需追加这些系统外导入的图片。
        if include_comfy_output:
            mappings = mappings + mapping_storage.get_comfy_output_mappings()

        # 预编译自定义字段分组函数（如果需要）
        group_extract_fn = None
        if group_by and group_by != "builtin_date":
            field_storage = get_image_field_storage()
            group_field = field_storage.get_by_id(group_by)
            if group_field and group_field.get("groupable", False):
                extract_code = group_field.get("extractCode", "").strip()
                if extract_code:
                    group_extract_fn = _compile_extract(extract_code)

        # 收集有效图片
        valid_items = []
        valid_raw_mappings = []  # 与 valid_items 平行，存储原始 mapping 供分组使用
        for mapping in mappings:
            image_path = mapping.get("imagePath")
            if not image_path:
                continue

            remote = is_remote_path(image_path, mapping.get("type", ""))

            if not remote:
                full_path = output_dir / image_path
                if not full_path.exists():
                    continue

            prompt_string = mapping.get("promptString", "")
            prompt_string_lower = prompt_string.lower()

            # 单个 prompt 过滤
            if prompt_filter and prompt_filter.lower() not in prompt_string_lower:
                continue

            # 组合模式：交集过滤（图片必须包含所有指定 prompt）
            if combination_prompts:
                if not all(p.lower() in prompt_string_lower for p in combination_prompts):
                    continue

            # search 过滤：检查 promptString 中是否有匹配项
            if search_query:
                if search_query not in prompt_string_lower:
                    continue

            # 自定义筛查：所有筛查项取交集
            if active_filters:
                skip = False
                for af in active_filters:
                    try:
                        if not af["fn"](mapping, af["value"]):
                            skip = True
                            break
                    except Exception:
                        skip = True
                        break
                if skip:
                    continue

            file_info = mapping.get("fileInfo", {})
            saved_at = file_info.get("createdAt", 0)
            size = file_info.get("size", 0)
            # 本地文件缺 createdAt 或 size 时 stat 一次补齐两者（避免二次 stat）
            stat = None
            if not remote and (not saved_at or not size):
                try:
                    stat = full_path.stat()
                except Exception:
                    if not saved_at:
                        continue  # 无法确定时间戳则跳过（与原逻辑一致）
                    stat = None
            if stat is not None:
                if not saved_at:
                    saved_at = int(stat.st_mtime * 1000)
                if not size:
                    size = stat.st_size

            valid_items.append({
                "path": image_path,
                "type": mapping.get("type", "local"),
                "savedAt": saved_at,
                # mtime 与 savedAt 同值，供前端按时间排序/选择使用（对齐旧 /prompt_images 字段）
                "mtime": saved_at,
                "size": size,
                "prompts": [],
                "promptString": prompt_string,
            })
            valid_raw_mappings.append(mapping)

        # 分组（按日期或自定义字段）
        groups_dict = OrderedDict()

        if group_extract_fn:
            # 按自定义字段分组
            for i, item in enumerate(valid_items):
                raw_mapping = valid_raw_mappings[i]
                try:
                    group_key = group_extract_fn(raw_mapping)
                    if group_key is None or group_key == "":
                        group_key = "未分类"
                    group_key = str(group_key)
                except Exception:
                    group_key = "未分类"

                if group_key not in groups_dict:
                    groups_dict[group_key] = {
                        "date": group_key,
                        "timestamp": 0,
                        "images": [],
                    }
                groups_dict[group_key]["images"].append(item)

            # 组内按时间降序
            for group in groups_dict.values():
                group["images"].sort(key=lambda x: x["savedAt"], reverse=True)
                group["count"] = len(group["images"])

            # 组按键名排序
            groups = sorted(groups_dict.values(), key=lambda g: g["date"])
            date_list = [g["date"] for g in groups]
        else:
            # 默认按日期分组
            for item in valid_items:
                dt = datetime.fromtimestamp(item["savedAt"] / 1000, tz=timezone.utc)
                date_key = dt.strftime("%Y-%m-%d")
                if date_key not in groups_dict:
                    groups_dict[date_key] = {
                        "date": date_key,
                        "timestamp": int(dt.replace(hour=0, minute=0, second=0, microsecond=0).timestamp() * 1000),
                        "images": [],
                    }
                groups_dict[date_key]["images"].append(item)

            # 组内按时间降序
            for group in groups_dict.values():
                group["images"].sort(key=lambda x: x["savedAt"], reverse=True)
                group["count"] = len(group["images"])

            # 组按日期降序
            groups = sorted(groups_dict.values(), key=lambda g: g["timestamp"], reverse=True)
            date_list = [g["date"] for g in groups]

        return web.json_response({
            "success": True,
            "groups": groups,
            "totalImages": len(valid_items),
            "dateList": date_list,
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.json_response({"success": False, "error": str(e)}, status=500)


_SAFE_BUILTINS = {
    "int": int, "str": str, "float": float, "len": len,
    "bool": bool, "isinstance": isinstance, "print": print,
    "True": True, "False": False, "None": None,
    "list": list, "dict": dict, "set": set, "tuple": tuple,
    "sorted": sorted, "enumerate": enumerate, "zip": zip,
    "map": map, "filter": filter, "any": any, "all": all,
    "min": min, "max": max, "sum": sum, "abs": abs,
    "range": range, "reversed": reversed,
    "hasattr": hasattr, "getattr": getattr, "type": type,
    "round": round, "pow": pow, "divmod": divmod,
    "ValueError": ValueError, "TypeError": TypeError,
    "KeyError": KeyError, "IndexError": IndexError,
    "Exception": Exception,
    # 常用模块
    "re": re, "json": json, "math": math,
    "datetime": datetime, "timezone": timezone, "timedelta": timedelta,
}


def _compile_custom_filter(code: str):
    """编译筛查函数，返回 filter_func 可调用对象"""
    namespace = {}
    exec(code, {"__builtins__": _SAFE_BUILTINS}, namespace)
    return namespace.get("filter_func")


def _compile_extract(code: str):
    """编译提取函数，返回 extract_func 可调用对象"""
    namespace = {}
    exec(code, {"__builtins__": _SAFE_BUILTINS}, namespace)
    return namespace.get("extract_func")
