import re
from pathlib import Path

ROOT = Path(__file__).parent.parent


def keys_of(fn):
    src = fn.read_text(encoding="utf-8")
    return set(re.findall(r'^\s*"([\w.]+)":', src, re.M))


def test_i18n_keys_complete():
    base = keys_of(ROOT / "docs" / "lang" / "en.js")
    for lang in ("de", "fr", "pt", "zh"):
        lang_keys = keys_of(ROOT / "docs" / "lang" / f"{lang}.js")
        missing = base - lang_keys
        assert not missing, f"{lang}.js no tiene las claves: {sorted(missing)}"


def test_lang_files_have_supported_languages():
    for lang in ("de", "fr", "pt", "zh"):
        assert (ROOT / "docs" / "lang" / f"{lang}.js").is_file()
