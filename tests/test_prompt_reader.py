import pytest

from storage._prompt_reader import (
    filter_prompts_by_search,
    format_prompt_record,
    select_prompt_records,
)


PROMPTS = [
    {"value": "Watercolor cat", "name": "Cat", "alias": "aqua", "createdAt": 30},
    {"value": "Ink dog", "name": "Dog", "alias": "sketch", "createdAt": 10},
    {"value": "Digital cat", "name": "Feline", "alias": "pixel", "createdAt": 20},
]


def test_search_matches_value_name_and_alias_case_insensitively():
    assert [p["name"] for p in filter_prompts_by_search(PROMPTS, "WATERCOLOR")] == ["Cat"]
    assert [p["name"] for p in filter_prompts_by_search(PROMPTS, "dog")] == ["Dog"]
    assert [p["name"] for p in filter_prompts_by_search(PROMPTS, "PIXEL")] == ["Feline"]


def test_search_supports_or_and_and_ignores_empty_terms():
    assert [p["name"] for p in filter_prompts_by_search(PROMPTS, "aqua | pixel ||")] == [
        "Cat", "Feline",
    ]
    assert [p["name"] for p in filter_prompts_by_search(PROMPTS, "cat & watercolor")] == ["Cat"]


def test_search_rejects_mixed_operators():
    with pytest.raises(ValueError, match=r"不能混用 \| 和 &"):
        filter_prompts_by_search(PROMPTS, "cat|dog&ink")


def test_selection_applies_offset_after_sorting_and_before_count():
    assert [p["name"] for p in select_prompt_records(PROMPTS, "取最新N个", 1, 1)] == ["Feline"]
    assert [p["name"] for p in select_prompt_records(PROMPTS, "取最旧N个", 2, 1)] == [
        "Feline", "Cat",
    ]
    assert [p["name"] for p in select_prompt_records(PROMPTS, "选取所有", 1, 1)] == [
        "Dog", "Feline",
    ]


def test_random_selection_ignores_offset(monkeypatch):
    monkeypatch.setattr("storage._prompt_reader.random.sample", lambda values, count: values[:count])

    assert [p["name"] for p in select_prompt_records(PROMPTS, "随机取N个", 2, 99)] == [
        "Cat", "Dog",
    ]


def test_prompt_output_formats():
    prompt = PROMPTS[0]

    assert format_prompt_record(prompt, "value") == "Watercolor cat"
    assert format_prompt_record(prompt, "name") == "Cat"
    assert format_prompt_record(prompt, "name:value") == "Cat:Watercolor cat"
