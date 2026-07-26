"""
自定义筛查/字段提取代码的受限执行环境（history / custom_filters / image_fields 共用）。
注意：白名单里刻意不提供 getattr/hasattr/type，避免通过属性反射逃逸沙箱。
"""
import json
import math
import re
from datetime import datetime, timezone, timedelta


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
    "round": round, "pow": pow, "divmod": divmod,
    "ValueError": ValueError, "TypeError": TypeError,
    "KeyError": KeyError, "IndexError": IndexError,
    "Exception": Exception,
    # 常用模块
    "re": re, "json": json, "math": math,
    "datetime": datetime, "timezone": timezone, "timedelta": timedelta,
    "__import__": _safe_import,
}


def compile_filter(code: str):
    """编译筛查函数代码，返回 filter_func 可调用对象"""
    namespace = {}
    exec(code, {"__builtins__": _SAFE_BUILTINS}, namespace)
    return namespace.get("filter_func")


def compile_extract(code: str):
    """编译提取函数代码，返回 extract_func 可调用对象"""
    namespace = {}
    exec(code, {"__builtins__": _SAFE_BUILTINS}, namespace)
    return namespace.get("extract_func")
