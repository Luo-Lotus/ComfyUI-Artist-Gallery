"""
图片自定义字段 CRUD 接口
"""
import json
import re
import math
from datetime import datetime, timezone, timedelta
from pathlib import Path
from aiohttp import web
import server
from ..storage import get_image_field_storage, get_storage
from ._utils import is_remote_path


def _safe_import(name, globals=None, locals=None, fromlist=(), level=0):
    allowed = {"datetime", "re", "json", "math", "time"}
    root_name = name.split(".", 1)[0]
    if root_name not in allowed:
        raise ImportError(f"Import '{name}' is not allowed")
    return __import__(name, globals, locals, fromlist, level)


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
    "__import__": _safe_import,
}


def _compile_extract(code: str):
    """编译提取函数代码，返回 extract_func 可调用对象"""
    namespace = {}
    exec(code, {"__builtins__": _SAFE_BUILTINS}, namespace)
    return namespace.get("extract_func")


@server.PromptServer.instance.routes.get("/prompt_gallery/image_fields")
async def get_image_fields(request):
    try:
        storage = get_image_field_storage()
        fields = storage.get_all()
        return web.json_response({"success": True, "fields": fields})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/prompt_gallery/image_fields")
async def create_image_field(request):
    try:
        data = await request.json()
        name = data.get("name", "").strip()
        extract_code = data.get("extractCode", "").strip()
        groupable = bool(data.get("groupable", False))

        if not name:
            return web.json_response({"error": "名称不能为空"}, status=400)
        if not extract_code:
            return web.json_response({"error": "提取代码不能为空"}, status=400)

        # 验证代码语法
        try:
            compile(extract_code, '<extract>', 'exec')
        except SyntaxError as e:
            return web.json_response({"error": f"提取代码语法错误: {e}"}, status=400)

        storage = get_image_field_storage()
        item = storage.create(name, extract_code, groupable)
        return web.json_response({"success": True, "field": item})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.put("/prompt_gallery/image_fields/{id}")
async def update_image_field(request):
    try:
        field_id = request.match_info["id"]
        data = await request.json()

        storage = get_image_field_storage()
        existing = storage.get_by_id(field_id)
        if not existing:
            return web.json_response({"error": "字段不存在"}, status=404)

        kwargs = {}
        if "name" in data:
            kwargs["name"] = data["name"].strip()
        if "extractCode" in data:
            code = data["extractCode"].strip()
            if code:
                try:
                    compile(code, '<extract>', 'exec')
                except SyntaxError as e:
                    return web.json_response({"error": f"提取代码语法错误: {e}"}, status=400)
            kwargs["extract_code"] = code
        if "groupable" in data:
            kwargs["groupable"] = bool(data["groupable"])
        if "options" in data:
            kwargs["options"] = data["options"]

        item = storage.update(field_id, **kwargs)
        if not item:
            return web.json_response({"error": "字段不存在"}, status=404)
        return web.json_response({"success": True, "field": item})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.delete("/prompt_gallery/image_fields/{id}")
async def delete_image_field(request):
    try:
        field_id = request.match_info["id"]
        storage = get_image_field_storage()
        existing = storage.get_by_id(field_id)
        if not existing:
            return web.json_response({"error": "字段不存在"}, status=404)
        if existing.get("builtin", False):
            return web.json_response({"error": "内置字段不可删除"}, status=403)
        if storage.delete(field_id):
            return web.json_response({"success": True})
        return web.json_response({"error": "删除失败"}, status=500)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/prompt_gallery/image_fields/reorder")
async def reorder_image_fields(request):
    try:
        data = await request.json()
        field_ids = data.get("fieldIds", [])
        if not field_ids:
            return web.json_response({"error": "fieldIds 不能为空"}, status=400)
        storage = get_image_field_storage()
        fields = storage.reorder(field_ids)
        return web.json_response({"success": True, "fields": fields})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/prompt_gallery/image_fields/{id}/extract")
async def extract_field_options(request):
    """执行 extract_code，提取所有不重复的选项值"""
    try:
        field_id = request.match_info["id"]

        storage = get_image_field_storage()
        field = storage.get_by_id(field_id)
        if not field:
            return web.json_response({"error": "字段不存在"}, status=404)

        extract_code = field.get("extractCode", "").strip()
        if not extract_code:
            return web.json_response({"error": "未定义提取函数"}, status=400)

        extract_fn = _compile_extract(extract_code)
        if not extract_fn:
            return web.json_response({"error": "提取函数必须定义 extract_func"}, status=400)

        _, mapping_storage, _, _ = get_storage()
        items = mapping_storage.get_all_mappings()

        options_set = set()
        errors = []
        for item in items:
            try:
                val = extract_fn(item)
                if val is not None and val != "":
                    options_set.add(str(val))
            except Exception as e:
                errors.append(str(e))
                if len(errors) >= 10:
                    break

        options = sorted(options_set)
        storage.update(field_id, options=options)

        return web.json_response({
            "success": True,
            "options": options,
            "total": len(items),
            "errorCount": len(errors),
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/prompt_gallery/image_fields/evaluate")
async def evaluate_fields(request):
    """批量评估：对单张图片运行多个字段的提取函数"""
    try:
        data = await request.json()
        field_ids = data.get("fieldIds", [])
        image_path = data.get("imagePath", "")

        if not field_ids or not image_path:
            return web.json_response({"error": "参数不完整"}, status=400)

        storage = get_image_field_storage()
        _, mapping_storage, _, _ = get_storage()

        # 查找目标图片的 mapping（O(1) 索引）
        target_mapping = mapping_storage.get_mappings_by_image(image_path)
        if target_mapping is None:
            # comfy_output*.images.json 被排除在全局读取之外（超大分片，仅历史视图用，
            # 见 _json_store._glob_source_files），单图 evaluate 按需回退查找
            for m in mapping_storage.get_comfy_output_mappings():
                if m.get("imagePath") == image_path:
                    target_mapping = m
                    break

        if not target_mapping:
            return web.json_response({"success": True, "values": {}})

        values = {}
        for fid in field_ids:
            field = storage.get_by_id(fid)
            if not field:
                continue
            extract_code = field.get("extractCode", "").strip()
            if not extract_code:
                continue
            try:
                extract_fn = _compile_extract(extract_code)
                if extract_fn:
                    val = extract_fn(target_mapping)
                    if val is not None and val != "":
                        values[fid] = str(val)
            except Exception:
                pass

        return web.json_response({"success": True, "values": values})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
