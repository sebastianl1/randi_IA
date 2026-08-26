"""Tests del motor de compatibilidad RANDI (skills globales web+CLI)."""
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
BIN_LIB = ROOT / "bin" / "lib"
sys.path.insert(0, str(BIN_LIB))

from compat import (  # noqa: E402
    HardwareInfo, make_quants, evaluate_model, estimate_tokens_per_second,
    compute_score, score_to_grade, evaluate_model_best, active_params_billions,
)
from hardware import detect_hardware, to_dict, detect_platform  # noqa: E402
import recommend as recommend_mod  # noqa: E402


def test_make_quants_count_and_fields():
    quants = make_quants(7.0)
    assert len(quants) == 7
    names = [q["name"] for q in quants]
    assert names == ["Q2_K", "Q3_K_M", "Q4_K_M", "Q5_K_M", "Q6_K", "Q8_0", "F16"]
    for q in quants:
        assert q["bits"] > 0 and q["vramGB"] > 0 and q["diskGB"] > 0
        assert q["vramGB"] >= q["diskGB"]


def test_make_quants_monotonic():
    quants = make_quants(7.0)
    vrams = [q["vramGB"] for q in quants]
    assert vrams == sorted(vrams)


def test_evaluate_mobile():
    # 8GB movil -> usable = 0.55*8 = 4.4GB
    hw = HardwareInfo(platform="termux", ram_gb=8, is_mobile=True)
    assert evaluate_model(2.0, hw) == "can-run"      # 2.0 <= 4.4*0.7=3.08
    assert evaluate_model(4.0, hw) == "tight"        # 4.0 <= 4.4
    assert evaluate_model(9.0, hw) == "cannot-run"


def test_evaluate_desktop_gpu():
    hw = HardwareInfo(platform="linux", gpu_vram_gb=12, system_ram_gb=32, gpu_memory_bw=360)
    assert evaluate_model(6.0, hw) == "can-run"
    assert evaluate_model(13.0, hw) == "tight"
    assert evaluate_model(30.0, hw) == "can-run-slow"  # offload a RAM


def test_compute_score_and_grade():
    assert compute_score("cannot-run", None, 7) == 0
    sc = compute_score("can-run", 60, 7, 30)
    assert sc > 0
    assert score_to_grade(90, "can-run") == "S"
    assert score_to_grade(75, "can-run") == "A"
    assert score_to_grade(30, "can-run") == "D"
    assert score_to_grade(10, "cannot-run") == "F"


def test_tokens_per_second_null_without_bw():
    hw = HardwareInfo(platform="linux", gpu_memory_bw=None)
    assert estimate_tokens_per_second(5.0, hw) is None


def test_active_params_moe():
    model = {"architecture": "moe", "paramsBillions": 30, "activeParams": "3.3B active"}
    assert active_params_billions(model) == 3.3
    dense = {"architecture": "dense", "paramsBillions": 8}
    assert active_params_billions(dense) == 8


def test_evaluate_model_best_returns_grade():
    hw = HardwareInfo(platform="linux", gpu_vram_gb=24, system_ram_gb=64, gpu_memory_bw=1008)
    model = {"id": "qwen3:8b", "paramsBillions": 8, "architecture": "dense"}
    ev = evaluate_model_best(model, hw)
    assert ev.grade in "SABCDEF?"
    assert ev.status in ("can-run", "tight", "can-run-slow", "cannot-run", "unknown")


def test_hardware_detect_returns_dict():
    hw = detect_hardware()
    d = to_dict(hw)
    assert "platform" in d and "ram_gb" in d
    assert d["platform"] in ("termux", "linux", "macos", "windows", "wsl")


def test_detect_platform_detects_termux():
    # simulated: monkeypatch no; solo verifica que devuelve algo valido
    assert detect_platform() in ("termux", "linux", "macos", "windows", "wsl")


def test_catalog_has_enriched_fields():
    catalog = recommend_mod.load_catalog()
    models = recommend_mod.get_models(catalog)
    assert len(models) > 20
    sample = models[0]
    for field in ("paramsBillions", "provider", "license", "architecture", "useCase", "ollamaId"):
        assert field in sample, f"falta {field} en {sample.get('id')}"


def test_recommend_ranks_by_score():
    catalog = recommend_mod.load_catalog()
    hw = HardwareInfo(platform="linux", gpu_vram_gb=24, system_ram_gb=64, gpu_memory_bw=1008)
    recs = recommend_mod.rank_models(recommend_mod.get_models(catalog), hw, use_case="chat", limit=5)
    assert len(recs) <= 5
    scores = [r["evaluation"].score for r in recs]
    assert scores == sorted(scores, reverse=True)


def test_tier_list_contains_grades():
    catalog = recommend_mod.load_catalog()
    hw = HardwareInfo(platform="linux", gpu_vram_gb=24, system_ram_gb=64, gpu_memory_bw=1008)
    tiers = recommend_mod.tier_list(recommend_mod.get_models(catalog), hw)
    assert isinstance(tiers, dict)
    total = sum(len(v) for v in tiers.values())
    assert total == len(recommend_mod.get_models(catalog))


def test_required_hardware_for_too_heavy_model():
    from compat import required_hardware
    req = required_hardware({"paramsBillions": 70, "architecture": "dense"})
    assert req["vramRequiredGb"] > 10
    assert req["gpuVramRecommendedGb"] >= req["vramRequiredGb"]
    assert req["gpuClass"]
    # El modelo 70B no cabe en una 3060 de 12GB -> la clase debe ser mayor
    assert req["gpuVramRecommendedGb"] > 12 or "4090" in req["gpuClass"]


def test_notes_explain_insufficient():
    from compat import notes_for, evaluate_model_best, HardwareInfo
    model = {"id": "deepseek-r1:671b", "paramsBillions": 671, "architecture": "moe", "name": "DeepSeek R1", "activeParams": "37B active"}
    hw = HardwareInfo(platform="linux", ram_gb=8, is_mobile=True)
    ev = evaluate_model_best(model, hw)
    assert ev.status == "cannot-run"
    notes = notes_for(model, ev, hw)
    assert any("necesitas" in n for n in notes)


def test_status_to_canirun_mapping():
    from compat import status_to_canirun
    assert status_to_canirun("can-run") == "comfortable"
    assert status_to_canirun("cannot-run") == "insufficient"


def test_hardware_profile_and_device_class():
    from hardware import hardware_profile, device_class, detect_hardware
    hw = detect_hardware()
    prof = hardware_profile(hw)
    assert "class" in prof and "comfortableVramGb" in prof and "summary" in prof
    mobile = HardwareInfo(platform="termux", ram_gb=8, is_mobile=True)
    assert device_class(mobile) == "mobile"
    workstation = HardwareInfo(platform="linux", gpu_vram_gb=80, gpu_memory_bw=2039)
    assert device_class(workstation) == "workstation"
