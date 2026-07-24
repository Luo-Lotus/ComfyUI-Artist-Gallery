def _mapping_score(mapping_spec, index):
    file_info = mapping_spec.get("file_info") or {}
    return (file_info.get("createdAt") or 0, index)


def _best_imported_covers_by_value(prompt_values, mapping_specs):
    values = [v for v in dict.fromkeys(prompt_values) if v]
    best = {}
    if not values:
        return best

    try:
        import ahocorasick
    except ImportError:
        ahocorasick = None

    if ahocorasick is not None:
        lowered_to_values = {}
        for value in values:
            lowered_to_values.setdefault(value.lower(), []).append(value)
        automaton = ahocorasick.Automaton()
        for query in lowered_to_values:
            automaton.add_word(query, query)
        automaton.make_automaton()

        for index, mapping_spec in enumerate(mapping_specs):
            image_path = mapping_spec.get("image_path")
            prompt_string = (mapping_spec.get("prompt_string") or "").lower()
            if not image_path or not prompt_string:
                continue
            score = _mapping_score(mapping_spec, index)
            seen = set()
            for _end, query in automaton.iter(prompt_string):
                if query in seen:
                    continue
                seen.add(query)
                for value in lowered_to_values[query]:
                    current = best.get(value)
                    if current is None or score > current["score"]:
                        best[value] = {"imagePath": image_path, "score": score}
        return best

    lowered = [(v, v.lower()) for v in values]
    for index, mapping_spec in enumerate(mapping_specs):
        image_path = mapping_spec.get("image_path")
        prompt_string = (mapping_spec.get("prompt_string") or "").lower()
        if not image_path or not prompt_string:
            continue
        score = _mapping_score(mapping_spec, index)
        for value, query in lowered:
            if query not in prompt_string:
                continue
            current = best.get(value)
            if current is None or score > current["score"]:
                best[value] = {"imagePath": image_path, "score": score}

    return best


def apply_import_covers(prompt_storage, prompt_specs, mapping_specs):
    """
    为本次导入的数据批量补封面。

    只基于本次导入的 mapping_specs 做 promptString 匹配，避免每个 Prompt 都扫描全量映射。
    Prompt 只补空 coverImageId。
    """
    if not prompt_specs or not mapping_specs:
        return {"prompts": 0}

    prompt_values = [spec.get("value") for spec in prompt_specs if spec.get("value")]
    best_by_value = _best_imported_covers_by_value(prompt_values, mapping_specs)

    prompt_updates = {}
    for spec in prompt_specs:
        value = spec.get("value")
        if not value:
            continue
        match = best_by_value.get(value)
        if match:
            prompt_updates[(spec.get("categoryId", "root"), value)] = match["imagePath"]

    changed_prompts = prompt_storage.set_cover_batch_by_key(prompt_updates)

    return {"prompts": changed_prompts}
