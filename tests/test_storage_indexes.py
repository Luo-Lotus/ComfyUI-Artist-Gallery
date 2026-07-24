import json

from storage.category import CategoryStorage
from storage._resolve import _run_startup_migrations
from storage.image_mapping import ImageMappingStorage
from storage.import_cover import apply_import_covers
from storage.migration import (
    migrate_combinations_to_prompts,
    migrate_prompt_covers_from_prompt_string,
    migrate_prompt_string_image_index,
)
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


def test_category_indexes_invalidate_after_write(tmp_path):
    categories = CategoryStorage(tmp_path)
    child = categories.add_category("Child", parent_id="root")

    assert categories.get_category_by_id(child["id"])["name"] == "Child"
    assert [c["id"] for c in categories.get_children("root")] == [child["id"]]


def test_image_mapping_prompt_index_invalidates_after_write(tmp_path):
    storage = ImageMappingStorage(tmp_path)

    assert storage.get_mappings_by_prompt("a") == []

    storage.add_mapping("one.png", ["a", "b"])
    storage.add_mapping("two.png", ["b"])

    assert [m["imagePath"] for m in storage.get_mappings_by_prompt("a")] == ["one.png"]
    prompt_index = storage.build_prompt_index_for_values(["b"])
    assert [m["imagePath"] for m in prompt_index["b"]] == ["one.png", "two.png"]


def test_cleanup_missing_local_image_mappings_preserves_existing_remote_and_shards(tmp_path):
    output_dir = tmp_path / "output"
    output_dir.mkdir()
    (output_dir / "prompt_gallery").mkdir()
    (output_dir / "prompt_gallery" / "kept.png").write_bytes(b"ok")
    (output_dir / "prompt_gallery" / "shard-kept.png").write_bytes(b"ok")

    write_json(tmp_path / "images.json", {
        "mappings": [
            {"imagePath": "prompt_gallery/kept.png", "type": "local"},
            {"imagePath": "prompt_gallery/missing.png", "type": "local"},
            {"imagePath": "https://example.com/remote.png", "type": "remote"},
        ],
    })
    write_json(tmp_path / "extra.images.json", {
        "mappings": [
            {"imagePath": "prompt_gallery/shard-kept.png", "type": "local"},
            {"imagePath": "prompt_gallery/shard-missing.png", "type": "local"},
        ],
    })

    storage = ImageMappingStorage(tmp_path)
    result = storage.cleanup_missing_local_mappings(output_dir)

    assert result["removed"] == 2
    assert result["scanned"] == 4
    assert result["bySource"] == {"images.json": 1, "extra.images.json": 1}
    assert [m["imagePath"] for m in storage.get_all_mappings()] == [
        "prompt_gallery/kept.png",
        "https://example.com/remote.png",
        "prompt_gallery/shard-kept.png",
    ]
    assert json.loads((tmp_path / "images.json").read_text(encoding="utf-8"))["mappings"] == [
        {"imagePath": "prompt_gallery/kept.png", "type": "local"},
        {"imagePath": "https://example.com/remote.png", "type": "remote"},
    ]
    assert json.loads((tmp_path / "extra.images.json").read_text(encoding="utf-8"))["mappings"] == [
        {"imagePath": "prompt_gallery/shard-kept.png", "type": "local"},
    ]


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


def test_prompt_string_migration_removes_old_mapping_fields_and_keeps_prompt_data(tmp_path):
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
    assert migrated_prompts == [{"value": "alpha", "imageCount": 10}]


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
    result = migrate_prompt_covers_from_prompt_string(tmp_path)

    assert result["success"] is True
    migrated_prompts = json.loads((tmp_path / "prompts.json").read_text(encoding="utf-8"))["prompts"]
    assert migrated_prompts == [
        {"value": "alpha", "categoryId": "root", "coverImageId": "new.png"},
        {"value": "beta", "categoryId": "root", "coverImageId": "manual.png"},
        {"value": "missing", "categoryId": "root", "coverImageId": None},
    ]

def test_apply_import_covers_updates_prompts_without_global_scan(tmp_path):
    prompt_storage = PromptStorage(tmp_path)
    prompt_storage.add_prompt("alpha", category_id="root")
    prompt_storage.add_prompt("beta", category_id="root")
    prompt_storage.add_prompt("manual", category_id="root")
    prompt_storage.update_prompt("root", "manual", coverImageId="manual.png")

    prompt_specs = [
        {"categoryId": "root", "value": "alpha"},
        {"categoryId": "root", "value": "beta"},
        {"categoryId": "root", "value": "manual"},
    ]
    mapping_specs = [
        {"image_path": "old.png", "prompt_string": "alpha", "file_info": {"createdAt": 100}},
        {"image_path": "new.png", "prompt_string": "alpha, beta", "file_info": {"createdAt": 200}},
        {"image_path": "manual-new.png", "prompt_string": "manual", "file_info": {"createdAt": 300}},
    ]

    result = apply_import_covers(prompt_storage, prompt_specs, mapping_specs)

    assert result == {"prompts": 2}
    assert prompt_storage.get_prompt("root", "alpha")["coverImageId"] == "new.png"
    assert prompt_storage.get_prompt("root", "beta")["coverImageId"] == "new.png"
    assert prompt_storage.get_prompt("root", "manual")["coverImageId"] == "manual.png"


def test_combination_migration_converts_and_merges_prompts(tmp_path):
    write_json(tmp_path / "prompts.json", {
        "prompts": [
            {"value": "@alpha,@beta", "name": "Existing", "categoryId": "root", "coverImageId": None},
        ],
    })
    write_json(tmp_path / "combinations.json", {
        "combinations": [
            {
                "id": "merge",
                "name": "Merged Combo",
                "categoryId": "root",
                "prompts": ["alpha", "beta"],
                "outputContent": "@alpha,@beta",
                "coverImageId": "merged.png",
            },
            {
                "id": "new",
                "name": "New Combo",
                "categoryId": "cat-1",
                "prompts": ["alpha", "beta"],
                "outputContent": "custom output",
                "coverImageId": "artist_gallery/new.png",
                "createdAt": 123,
                "metadata": {"pinned": True},
            },
            {
                "id": "fallback",
                "name": "Fallback Combo",
                "categoryId": "root",
                "prompts": ["one", None, "", "two"],
                "outputContent": "",
            },
        ],
    })

    result = migrate_combinations_to_prompts(tmp_path)

    assert result == {"success": True, "created": 2, "merged": 1, "skipped": 0, "files": 1}
    assert not (tmp_path / "combinations.json").exists()
    prompts = json.loads((tmp_path / "prompts.json").read_text(encoding="utf-8"))["prompts"]
    assert prompts[0]["name"] == "Existing"
    assert prompts[0]["coverImageId"] == "merged.png"
    assert prompts[1] == {
        "value": "custom output",
        "name": "New Combo",
        "alias": "",
        "categoryId": "cat-1",
        "coverImageId": "prompt_gallery/new.png",
        "createdAt": 123,
        "metadata": {"pinned": True},
    }
    assert prompts[2]["value"] == "one,two"
    assert migrate_combinations_to_prompts(tmp_path)["created"] == 0


def test_combination_migration_preserves_shard_disabled_state(tmp_path):
    write_json(tmp_path / "dataset.prompts.json", {
        "prompts": [{"value": "existing", "name": "Existing", "categoryId": "root"}],
    })
    write_json(tmp_path / "dataset.combinations.json", {
        "combinations": [
            {"name": "Imported", "categoryId": "root", "outputContent": "imported", "prompts": []},
        ],
    })
    write_json(tmp_path / "storage_config.json", {
        "disabled_files": ["dataset.prompts.json", "dataset.combinations.json"],
    })

    result = migrate_combinations_to_prompts(tmp_path)

    assert result["created"] == 1
    assert not (tmp_path / "dataset.combinations.json").exists()
    prompts = json.loads((tmp_path / "dataset.prompts.json").read_text(encoding="utf-8"))["prompts"]
    assert [prompt["value"] for prompt in prompts] == ["existing", "imported"]
    config = json.loads((tmp_path / "storage_config.json").read_text(encoding="utf-8"))
    assert config["disabled_files"] == ["dataset.prompts.json"]


def test_startup_migration_converts_artists_before_legacy_groups(tmp_path):
    write_json(tmp_path / "artists.json", {
        "artists": [
            {"name": "artist value", "displayName": "Artist Name", "categoryId": "root"},
        ],
    })
    write_json(tmp_path / "combinations.json", {
        "combinations": [
            {"name": "Group Name", "categoryId": "root", "outputContent": "group output"},
        ],
    })

    _run_startup_migrations(tmp_path)

    prompts = json.loads((tmp_path / "prompts.json").read_text(encoding="utf-8"))["prompts"]
    assert [(prompt["value"], prompt["name"]) for prompt in prompts] == [
        ("artist value", "Artist Name"),
        ("group output", "Group Name"),
    ]
    assert not (tmp_path / "artists.json").exists()
    assert not (tmp_path / "combinations.json").exists()
