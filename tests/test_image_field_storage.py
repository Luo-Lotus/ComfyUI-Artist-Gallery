import json

from storage.image_field import ImageFieldStorage


EXTRACT_CODE = "def extract_func(item):\n    return item.get('promptString', '')"


def test_legacy_fields_default_to_plain_text(tmp_path):
    fields_file = tmp_path / "image_fields.json"
    fields_file.write_text(json.dumps({
        "fields": [{
            "id": "legacy-field",
            "name": "Legacy",
            "extractCode": EXTRACT_CODE,
            "builtin": False,
            "groupable": False,
            "createdAt": 1,
            "options": [],
        }],
    }), encoding="utf-8")

    storage = ImageFieldStorage(tmp_path)
    legacy = storage.get_by_id("legacy-field")

    assert legacy["renderHtml"] is False
    persisted = json.loads(fields_file.read_text(encoding="utf-8"))
    persisted_legacy = next(field for field in persisted["fields"] if field["id"] == "legacy-field")
    assert persisted_legacy["renderHtml"] is False


def test_create_and_update_html_rendering_option(tmp_path):
    storage = ImageFieldStorage(tmp_path)

    plain_field = storage.create("Plain", EXTRACT_CODE)
    html_field = storage.create("Rich", EXTRACT_CODE, render_html=True)

    assert plain_field["renderHtml"] is False
    assert html_field["renderHtml"] is True

    updated = storage.update(html_field["id"], render_html=False)

    assert updated["renderHtml"] is False
    reloaded = ImageFieldStorage(tmp_path)
    assert reloaded.get_by_id(html_field["id"])["renderHtml"] is False


def test_builtin_fields_have_expected_render_modes(tmp_path):
    storage = ImageFieldStorage(tmp_path)

    builtin_fields = [field for field in storage.get_all() if field["builtin"]]
    field_map = {field["id"]: field for field in builtin_fields}

    assert builtin_fields
    assert field_map["builtin_ksampler"]["renderHtml"] is True
    assert all(
        field["renderHtml"] is False
        for field in builtin_fields
        if field["id"] != "builtin_ksampler"
    )


def test_builtin_ksampler_renders_all_sampler_nodes(tmp_path):
    storage = ImageFieldStorage(tmp_path)
    field = storage.get_by_id("builtin_ksampler")
    namespace = {}
    exec(field["extractCode"], {"json": json}, namespace)

    prompt = {
        "seed-source": {
            "class_type": "easy seed",
            "inputs": {"seed": 123456},
        },
        "19": {
            "class_type": "KSampler",
            "_meta": {"title": "主采样器"},
            "inputs": {
                "seed": ["seed-source", 0],
                "steps": 20,
                "cfg": 7.5,
                "sampler_name": "euler_ancestral",
                "scheduler": "normal",
                "denoise": 1,
            },
        },
        "42": {
            "class_type": "KSamplerAdvanced",
            "inputs": {
                "noise_seed": 987654,
                "steps": 30,
                "cfg": 5,
                "sampler_name": "dpmpp_2m",
                "scheduler": "karras",
                "start_at_step": 4,
                "end_at_step": 24,
                "add_noise": "enable",
            },
        },
        "selector": {
            "class_type": "KSamplerSelect",
            "inputs": {"sampler_name": "euler"},
        },
    }

    html = namespace["extract_func"]({"generatePrompt": json.dumps(prompt)})

    assert html.count(">采样器 ") == 2
    assert 'style="display:flex;flex-direction:column;gap:10px"' in html
    assert "节点 #19 · KSampler · 主采样器" in html
    assert "euler_ancestral" in html
    assert "123456" in html
    assert "节点 #42 · KSamplerAdvanced" in html
    assert "dpmpp_2m" in html
    assert "987654" in html
    assert "起始步数" not in html
    assert "结束步数" not in html
    assert "添加噪声" not in html
    assert "保留剩余噪声" not in html


def test_builtin_ksampler_returns_empty_without_sampler_nodes(tmp_path):
    storage = ImageFieldStorage(tmp_path)
    field = storage.get_by_id("builtin_ksampler")
    namespace = {}
    exec(field["extractCode"], {"json": json}, namespace)

    result = namespace["extract_func"]({
        "generatePrompt": json.dumps({
            "1": {"class_type": "CLIPTextEncode", "inputs": {"text": "hello"}},
        }),
    })

    assert result == ""
