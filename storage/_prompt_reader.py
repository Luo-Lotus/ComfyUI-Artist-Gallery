"""从分类读取 Prompt 节点使用的筛选和输出工具。"""
import random


def filter_prompts_by_search(prompts: list, search: str) -> list:
    """按 search 筛选 Prompt，支持单一 OR (|) 或 AND (&) 表达式。"""
    query = (search or "").strip()
    if not query:
        return list(prompts)

    has_or = "|" in query
    has_and = "&" in query
    if has_or and has_and:
        raise ValueError("搜索条件不能混用 | 和 &")

    operator = "|" if has_or else "&" if has_and else None
    terms = [term.strip().lower() for term in query.split(operator) if term.strip()] if operator else [query.lower()]
    if not terms:
        return list(prompts)

    def matches_term(prompt: dict, term: str) -> bool:
        fields = (
            prompt.get("value") or "",
            prompt.get("name") or "",
            prompt.get("alias") or "",
        )
        return any(term in str(field).lower() for field in fields)

    matches = any if operator == "|" else all
    return [
        prompt for prompt in prompts
        if matches(matches_term(prompt, term) for term in terms)
    ]


def select_prompt_records(prompts: list, mode: str, count: int, offset: int) -> list:
    """按节点模式应用排序、offset 和数量限制。随机模式忽略 offset。"""
    selected = list(prompts)
    limit = max(0, int(count))

    if mode == "随机取N个":
        return random.sample(selected, min(limit, len(selected)))

    if mode == "取最新N个":
        selected.sort(key=lambda prompt: prompt.get("createdAt", 0), reverse=True)
    elif mode == "取最旧N个":
        selected.sort(key=lambda prompt: prompt.get("createdAt", 0))

    selected = selected[max(0, int(offset)):]
    if mode in ("取最新N个", "取最旧N个"):
        selected = selected[:limit]
    return selected


def format_prompt_record(prompt: dict, property_name: str) -> str:
    """按节点 property 选项格式化单条 Prompt。"""
    if property_name == "name:value":
        return f"{prompt.get('name') or ''}:{prompt.get('value') or ''}"
    key = "name" if property_name == "name" else "value"
    return prompt.get(key, "") or ""
