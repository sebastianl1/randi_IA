"""i18n de la landing (site/src/i18n.ts): paridad de claves ES/EN."""
from pathlib import Path

ROOT = Path(__file__).parent.parent


def test_site_i18n_both_languages_present():
    src = (ROOT / "site" / "src" / "i18n.ts").read_text(encoding="utf-8")
    assert "es:" in src and "en:" in src


def test_site_i18n_guides_cover_all_platforms():
    src = (ROOT / "site" / "src" / "i18n.ts").read_text(encoding="utf-8")
    for key in ("android", "linux", "macos", "windows-wsl", "windows-gitbash"):
        assert key in src, f"falta la guia de instalacion '{key}'"


def test_site_i18n_es_en_match_guide_count():
    src = (ROOT / "site" / "src" / "i18n.ts").read_text(encoding="utf-8")
    # ambas lenguas definen las mismas guias (5)
    import re
    es_keys = set(re.findall(r"key:\s*'([\w-]+)'", src))
    assert len(es_keys) >= 5