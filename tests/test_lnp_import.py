from myslenice_quiz.ingest.laczynaspilka import _status


def test_lnp_walkover_state_is_finished_match():
    assert _status("Walkover") == "walkover"
    assert _status("walkower") == "walkover"
