import json

from storage.category import CategoryStorage
from storage.combination import CombinationStorage
from storage.image_mapping import ImageMappingStorage
from storage.prompt import PromptStorage


def write_json(path, data):
    path.write_text(json.dumps(data), encoding="utf-8")


def test_prompt_storage_reads_enabled_shards_and_category_index(tmp_path):
    write_json(tmp_path / "prompts.json", {
        "prompts": [
            {"value": "root-a", "name": "Root A", "categoryId": "root"},
        ],
    })
    write_json(tmp_path / "extra.prompts.json", {
        "prompts": [
            {"value": "cat-a", "name": "Cat A", "categoryId": "cat-1"},
        ],
    })
    write_json(tmp_path / "skip.prompts.json", {
        "prompts": [
            {"value": "skip-a", "name": "Skip A", "categoryId": "cat-1"},
        ],
    })
    write_json(tmp_path / "storage_config.json", {"disabled_files": ["skip.prompts.json"]})

    storage = PromptStorage(tmp_path)

    assert [p["value"] for p in storage.get_all_prompts()] == ["root-a", "cat-a"]
    assert [p["value"] for p in storage.get_prompts_by_category("cat-1")] == ["cat-a"]


def test_prompt_category_index_invalidates_after_write(tmp_path):
    storage = PromptStorage(tmp_path)

    assert storage.get_prompts_by_category("root") == []

    storage.add_prompt("new-value", category_id="root")

    assert [p["value"] for p in storage.get_prompts_by_category("root")] == ["new-value"]


def test_category_and_combination_indexes_invalidate_after_write(tmp_path):
    categories = CategoryStorage(tmp_path)
    child = categories.add_category("Child", parent_id="root")

    assert categories.get_category_by_id(child["id"])["name"] == "Child"
    assert [c["id"] for c in categories.get_children("root")] == [child["id"]]

    combinations = CombinationStorage(tmp_path)
    created = combinations.add_combination("Combo", "root", ["new-value"])

    assert combinations.get_combination_by_id(created["id"])["name"] == "Combo"
    assert [c["id"] for c in combinations.get_combinations_by_category("root")] == [created["id"]]


def test_image_mapping_prompt_index_invalidates_after_write(tmp_path):
    storage = ImageMappingStorage(tmp_path)

    assert storage.get_mappings_by_prompt("a") == []

    storage.add_mapping("one.png", ["a", "b"])
    storage.add_mapping("two.png", ["b"])

    assert [m["imagePath"] for m in storage.get_mappings_by_prompt("a")] == ["one.png"]
    assert [m["imagePath"] for m in storage.build_prompt_index()["b"]] == ["one.png", "two.png"]


def test_batch_move_updates_indexes(tmp_path):
    prompts = PromptStorage(tmp_path)
    prompts.add_prompt("a", category_id="root")
    prompts.add_prompt("b", category_id="root")
    moved_prompts = prompts.batch_move([("root", "a"), ("root", "b")], "cat-2")
    assert [p["value"] for p in moved_prompts] == ["a", "b"]
    assert prompts.get_prompts_by_category("root") == []
    assert [p["value"] for p in prompts.get_prompts_by_category("cat-2")] == ["a", "b"]

    categories = CategoryStorage(tmp_path)
    child = categories.add_category("Move Me", parent_id="root")
    categories.batch_move([{"id": child["id"], "parentId": None}])
    assert categories.get_category_by_id(child["id"])["parentId"] is None
    assert child["id"] not in [c["id"] for c in categories.get_children("root")]

    combinations = CombinationStorage(tmp_path)
    combination = combinations.add_combination("Combo", "root", ["a"])
    combinations.batch_move([combination["id"]], "cat-2")
    assert combinations.get_combination_by_id(combination["id"])["categoryId"] == "cat-2"
    assert combinations.get_combinations_by_category("root") == []
    assert [c["id"] for c in combinations.get_combinations_by_category("cat-2")] == [combination["id"]]
