from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_arcade_layer_is_loaded_after_rpg_and_before_front_controller():
    html = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
    assert 'href="match-arcade.css"' in html
    assert 'src="match-arcade.js"' in html
    assert 'src="local-football-flavour.js"' in html
    assert 'src="local-football-chaos.js"' in html
    assert 'src="local-media-events.js"' in html
    assert 'src="arcade-front.js"' in html
    assert html.index('src="match-rpg.js"') < html.index('src="match-arcade.js"')
    assert html.index('src="match-arcade.js"') < html.index('src="local-football-flavour.js"')
    assert html.index('src="local-football-flavour.js"') < html.index('src="local-football-chaos.js"')
    assert html.index('src="local-football-chaos.js"') < html.index('src="local-media-events.js"')
    assert html.index('src="local-media-events.js"') < html.index('src="front-controller.js"')
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


def test_local_media_layer_contains_requested_sources_and_effects():
    js = (ROOT / "web" / "local-media-events.js").read_text(encoding="utf-8")
    required_markers = [
        "Koneserzy Życia",
        "Fotopstryki",
        "ZatrzymajCzas photography",
        "Futmal.pl",
        "rpgMediaNextAttackDc",
        "rpgMediaNextDefenseDc",
        "rpgMediaNextShotDc",
        "LOCAL_MEDIA_PREMATCH_FUTMAL_CHANCE",
        "maybeTriggerLocalMediaEvent",
    ]
    for marker in required_markers:
        assert marker in js


def test_arcade_release_is_version_032():
    pyproject = (ROOT / "pyproject.toml").read_text(encoding="utf-8")
    package = (ROOT / "src" / "myslenice_quiz" / "__init__.py").read_text(encoding="utf-8")
    front = (ROOT / "web" / "arcade-front.js").read_text(encoding="utf-8")
    assert 'version = "0.3.2"' in pyproject
    assert '__version__ = "0.3.2"' in package
    assert "v0.3.2" in front
