import json

from storage.category import CategoryStorage
from storage.combination import CombinationStorage
from storage.image_mapping import ImageMappingStorage
from storage.migration import migrate_prompt_covers_from_prompt_string, migrate_prompt_string_image_index
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
    assert storage.build_prompt_index() == {}
    prompt_index = storage.build_prompt_index_for_values(["b"])
    assert [m["imagePath"] for m in prompt_index["b"]] == ["one.png", "two.png"]


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


def test_prompt_string_migration_removes_old_mapping_fields_and_image_count(tmp_path):
    write_json(tmp_path / "images.json", {
        "mappings": [
            {"imagePath": "one.png", "prompts": ["alpha", "beta"]},
            {"imagePath": "two.png", "promptIds": ["legacy-id"]},
            {"imagePath": "three.png", "promptString": "kept", "prompts": ["ignored"]},
        ],
    })
    write_json(tmp_path / "prompts.json", {
        "prompts": [
            {"value": "alpha", "imageCount": 10},
        ],
    })

    result = migrate_prompt_string_image_index(tmp_path)

    assert result["success"] is True
    migrated_images = json.loads((tmp_path / "images.json").read_text(encoding="utf-8"))["mappings"]
    assert migrated_images == [
        {"imagePath": "one.png", "promptString": "alpha, beta"},
        {"imagePath": "two.png", "promptString": "legacy-id"},
        {"imagePath": "three.png", "promptString": "kept"},
    ]
    migrated_prompts = json.loads((tmp_path / "prompts.json").read_text(encoding="utf-8"))["prompts"]
    assert migrated_prompts == [{"value": "alpha"}]


def test_prompt_cover_migration_uses_latest_matching_prompt_string_image(tmp_path):
    write_json(tmp_path / "images.json", {
        "mappings": [
            {"imagePath": "old.png", "promptString": "alpha", "fileInfo": {"createdAt": 100}},
            {"imagePath": "new.png", "promptString": "alpha, beta", "fileInfo": {"createdAt": 200}},
            {"imagePath": "other.png", "promptString": "gamma", "fileInfo": {"createdAt": 300}},
        ],
    })
    write_json(tmp_path / "prompts.json", {
        "prompts": [
            {"value": "alpha", "categoryId": "root", "coverImageId": None},
            {"value": "beta", "categoryId": "root", "coverImageId": "manual.png"},
            {"value": "missing", "categoryId": "root", "coverImageId": None},
        ],
    })
    write_json(tmp_path / "combinations.json", {
        "combinations": [
            {"name": "alpha beta", "prompts": ["alpha", "beta"], "coverImageId": None},
            {"name": "manual", "prompts": ["gamma"], "coverImageId": "comb-manual.png"},
            {"name": "missing", "prompts": ["missing"], "coverImageId": None},
        ],
    })

    result = migrate_prompt_covers_from_prompt_string(tmp_path)

    assert result["success"] is True
    migrated_prompts = json.loads((tmp_path / "prompts.json").read_text(encoding="utf-8"))["prompts"]
    assert migrated_prompts == [
        {"value": "alpha", "categoryId": "root", "coverImageId": "new.png"},
        {"value": "beta", "categoryId": "root", "coverImageId": "manual.png"},
        {"value": "missing", "categoryId": "root", "coverImageId": None},
    ]
    migrated_combinations = json.loads((tmp_path / "combinations.json").read_text(encoding="utf-8"))["combinations"]
    assert migrated_combinations == [
        {"name": "alpha beta", "prompts": ["alpha", "beta"], "coverImageId": "new.png"},
        {"name": "manual", "prompts": ["gamma"], "coverImageId": "comb-manual.png"},
        {"name": "missing", "prompts": ["missing"], "coverImageId": None},
    ]
