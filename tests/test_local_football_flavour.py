from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"


def test_local_flavour_is_loaded_after_arcade_engine():
    html = (WEB / "index.html").read_text(encoding="utf-8")
    arcade_pos = html.index('src="match-arcade.js"')
    flavour_pos = html.index('src="local-football-flavour.js"')
    front_pos = html.index('src="front-controller.js"')
    assert arcade_pos < flavour_pos < front_pos


def test_local_flavour_contains_signature_a_klasa_actions():
    source = (WEB / "local-football-flavour.js").read_text(encoding="utf-8")
    for phrase in [
        "LAGA NA DZIKA",
        "LAGA I DO PRZODU",
        "STRZAŁ ŻYCIA PO WIDŁACH",
        "Wrzutka na aferę",
        "Zaparkuj autobus",
        "Doskok jak po premię",
        "Panenka, bo czemu nie",
    ]:
        assert phrase in source


def test_local_flavour_does_not_change_action_difficulty_directly():
    source = (WEB / "local-football-flavour.js").read_text(encoding="utf-8")
    assert "dc:" not in source
    assert "costMomentum:" not in source
