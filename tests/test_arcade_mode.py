from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_arcade_layer_is_loaded_after_rpg_and_before_front_controller():
    html = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
    assert 'href="match-arcade.css"' in html
    assert 'src="match-arcade.js"' in html
    assert 'src="arcade-front.js"' in html
    assert html.index('src="match-rpg.js"') < html.index('src="match-arcade.js"')
    assert html.index('src="match-arcade.js"') < html.index('src="front-controller.js"')
    assert html.index('src="front-controller.js"') < html.index('src="arcade-front.js"')


def test_arcade_mode_contains_core_gameplay_systems():
    js = (ROOT / "web" / "match-arcade.js").read_text(encoding="utf-8")
    required_markers = [
        "rpgMomentum",
        "rpgCombo",
        "rpgOpponentStyle",
        "PERFECT BUILD-UP",
        "arcade_quick_counter",
        "arcade_laser",
        "arcade_bomb",
        "arcade_golden",
        "arcade_gegenpress",
        "arcade_bus",
        "corner",
        "free_kick",
        "penalty",
        "counter_3v2",
        "high_press",
        "compact",
        "chaos",
    ]
    for marker in required_markers:
        assert marker in js


def test_arcade_release_is_version_030():
    pyproject = (ROOT / "pyproject.toml").read_text(encoding="utf-8")
    front = (ROOT / "web" / "arcade-front.js").read_text(encoding="utf-8")
    assert 'version = "0.3.0"' in pyproject
    assert "v0.3" in front
