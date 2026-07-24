"""
自定义筛查项 CRUD 接口
"""
import json
import re
import math
from datetime import datetime, timezone, timedelta
from aiohttp import web
import server
from ..storage import get_custom_filter_storage, get_storage


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


@server.PromptServer.instance.routes.get("/prompt_gallery/custom_filters")
async def get_custom_filters(request):
    try:
        storage = get_custom_filter_storage()
        filters = storage.get_all()
        return web.json_response({"success": True, "filters": filters})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/prompt_gallery/custom_filters")
async def create_custom_filter(request):
    try:
        data = await request.json()
        name = data.get("name", "").strip()
        filter_code = data.get("filterCode", "").strip()
        extract_code = data.get("extractCode", "").strip()
        placeholder = data.get("placeholder", "").strip()

        if not name:
            return web.json_response({"error": "名称不能为空"}, status=400)
        if not filter_code:
            return web.json_response({"error": "执行函数不能为空"}, status=400)

        # 验证代码语法
        try:
            compile(filter_code, '<filter>', 'exec')
        except SyntaxError as e:
            return web.json_response({"error": f"执行函数语法错误: {e}"}, status=400)

        if extract_code:
            try:
                compile(extract_code, '<extract>', 'exec')
            except SyntaxError as e:
                return web.json_response({"error": f"提取函数语法错误: {e}"}, status=400)

        storage = get_custom_filter_storage()
        item = storage.create(name, filter_code, extract_code, placeholder)
        return web.json_response({"success": True, "filter": item})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.put("/prompt_gallery/custom_filters/{id}")
async def update_custom_filter(request):
    try:
        filter_id = request.match_info["id"]
        data = await request.json()

        kwargs = {}
        if "name" in data:
            kwargs["name"] = data["name"].strip()
        if "placeholder" in data:
            kwargs["placeholder"] = data["placeholder"].strip()
        if "filterCode" in data:
            code = data["filterCode"].strip()
            try:
                compile(code, '<filter>', 'exec')
            except SyntaxError as e:
                return web.json_response({"error": f"执行函数语法错误: {e}"}, status=400)
            kwargs["filter_code"] = code
        if "extractCode" in data:
            code = data["extractCode"].strip()
            if code:
                try:
                    compile(code, '<extract>', 'exec')
                except SyntaxError as e:
                    return web.json_response({"error": f"提取函数语法错误: {e}"}, status=400)
            kwargs["extract_code"] = code
        if "options" in data:
            kwargs["options"] = data["options"]

        storage = get_custom_filter_storage()
        item = storage.update(filter_id, **kwargs)
        if not item:
            return web.json_response({"error": "筛查项不存在"}, status=404)
        return web.json_response({"success": True, "filter": item})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.delete("/prompt_gallery/custom_filters/{id}")
async def delete_custom_filter(request):
    try:
        filter_id = request.match_info["id"]
        storage = get_custom_filter_storage()
        existing = storage.get_by_id(filter_id)
        if not existing:
            return web.json_response({"error": "筛查项不存在"}, status=404)
        if existing.get("builtin", False):
            return web.json_response({"error": "内置筛选项不可删除"}, status=403)
        if storage.delete(filter_id):
            return web.json_response({"success": True})
        return web.json_response({"error": "删除失败"}, status=500)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/prompt_gallery/custom_filters/{id}/test")
async def test_custom_filter(request):
    """测试筛查函数：执行 filter_code，返回匹配数量和总数量"""
    try:
        filter_id = request.match_info["id"]
        data = await request.json()
        keywords = data.get("keywords", "")

        storage = get_custom_filter_storage()
        flt = storage.get_by_id(filter_id)
        if not flt:
            return web.json_response({"error": "筛查项不存在"}, status=404)

        _, mapping_storage, _ = get_storage()
        items = mapping_storage.get_all_mappings()
        filter_fn = _compile_filter(flt["filterCode"])
        if not filter_fn:
            return web.json_response({"error": "执行函数必须定义 filter_func"}, status=400)

        matched = 0
        total = len(items)
        errors = []
        for item in items:
            try:
                if filter_fn(item, keywords):
                    matched += 1
            except Exception as e:
                errors.append(str(e))
                if len(errors) >= 10:
                    break

        return web.json_response({
            "success": True,
            "matched": matched,
            "total": total,
            "errors": errors,
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/prompt_gallery/custom_filters/{id}/extract")
async def extract_filter_options(request):
    """执行 extract_code，提取所有不重复的选项值"""
    try:
        filter_id = request.match_info["id"]

        storage = get_custom_filter_storage()
        flt = storage.get_by_id(filter_id)
        if not flt:
            return web.json_response({"error": "筛查项不存在"}, status=404)

        extract_code = flt.get("extractCode", "").strip()
        if not extract_code:
            return web.json_response({"error": "未定义提取函数"}, status=400)

        extract_fn = _compile_extract(extract_code)
        if not extract_fn:
            return web.json_response({"error": "提取函数必须定义 extract_func"}, status=400)

        _, mapping_storage, _ = get_storage()
        items = mapping_storage.get_all_mappings()

        options_set = set()
        errors = []
        for item in items[:5000]:  # 限制提取数量
            try:
                val = extract_fn(item)
                if val is not None and val != "":
                    options_set.add(str(val))
            except Exception as e:
                errors.append(str(e))
                if len(errors) >= 5:
                    break

        options = sorted(options_set)
        storage.update(filter_id, options=options)

        return web.json_response({
            "success": True,
            "options": options,
            "total": len(items),
            "errorCount": len(errors),
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


def _compile_filter(code: str):
    """编译筛查函数代码，返回 filter_func 可调用对象"""
    namespace = {}
    exec(code, {"__builtins__": _SAFE_BUILTINS}, namespace)
    return namespace.get("filter_func")


def _compile_extract(code: str):
    """编译提取函数代码，返回 extract_func 可调用对象"""
    namespace = {}
    exec(code, {"__builtins__": _SAFE_BUILTINS}, namespace)
    return namespace.get("extract_func")
