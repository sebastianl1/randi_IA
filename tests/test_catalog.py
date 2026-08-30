import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "bin" / "lib"))

from catalog import get_models, load_catalog, model_info  # noqa: E402


def test_catalog_loads():
    data = load_catalog()
    assert data["version"]
    assert data["ollama"]
    assert data["webgpu"]


def test_no_duplicate_ids():
    ids = [m["id"] for m in get_models()]
    assert len(ids) == len(set(ids))


def test_required_fields():
    for m in get_models():
        assert m["id"]
        assert m.get("size")
        assert m.get("ram")
        assert m.get("ctx")
        assert m.get("type")
        assert m.get("desc")


def test_webgpu_required_fields():
    for m in load_catalog()["webgpu"]:
        assert m["id"]
        assert m.get("name")
        assert m.get("context")


def test_model_info_match():
    info = model_info("qwen3:8b")
    assert info is not None
    assert info["id"] == "qwen3:8b"


def test_model_info_prefix():
    info = model_info("deepseek-r1:7b")
    assert info and info["type"] == "reasoning"


def test_media_section():
    from catalog import get_media_models, get_categories
    media = get_media_models()
    assert media, "models.json debe incluir generacion de imagen/video"
    for m in media:
        assert m["id"] and m.get("category") in ("image", "video")
        assert m.get("installer"), f"media {m['id']} sin installer"
    cats = get_categories()
    assert cats["image"] and cats["video"] and cats["llm"]


def test_v2_enriched_fields():
    for m in get_models():
        for field in ("paramsBillions", "provider", "license", "architecture", "useCase", "ollamaId", "installer", "category"):
            assert field in m, f"falta {field} en {m.get('id')}"
        assert m["installer"] == "ollama"
        m["architecture"] in ("dense", "moe")
        if m["architecture"] == "moe":
            assert m.get("activeParams"), f"MoE sin activeParams: {m['id']}"
