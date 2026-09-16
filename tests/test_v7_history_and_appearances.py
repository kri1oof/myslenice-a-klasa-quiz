from myslenice_quiz.ingest.ninetyminut import parse_club_history
from myslenice_quiz.db import connect, init_db
from myslenice_quiz.ingest.common import AppearanceRecord, MatchRecord, save_appearances, save_matches, upsert_source
from myslenice_quiz.questions import generate_all


def test_90minut_club_history_extracts_only_myslenice_a_class():
    html = """<html><head><title>Skarb - Pasternik Ochojno</title></head><body>
    2002/03 - Klasa A 2002/2003, grupa: Kraków IV - Myślenice
    2003/04 - Klasa A 2003/2004, grupa: Kraków IV - Myślenice
    2004/05 - Klasa A 2004/2005, grupa: Kraków IV (Myślenice)
    2005/06 - Puchar Polski 2005/2006, grupa: Małopolski ZPN - Kraków - Myślenice
    2009/10 - Klasa A 2009/2010, grupa: Wieliczka
    2021/22 - Klasa A 2021/2022, grupa: Myślenice
    </body></html>"""
    club, seasons = parse_club_history(html)
    assert club == "Pasternik Ochojno"
    assert seasons == ["2002/03", "2003/04", "2004/05", "2021/22"]


def test_positive_appearance_questions_do_not_require_full_lineup(tmp_path):
    db = tmp_path / "q.db"
    init_db(db)
    with connect(db) as conn:
        sid = upsert_source(conn, "futbolowo", "https://example.test/game/1", "fixture")
        save_matches(conn, [MatchRecord("2021/22", 1, "Clavia", "Dziecanovia", 0, 2, confidence=.9)], sid)
        save_appearances(conn, [
            AppearanceRecord("Clavia", "Dziecanovia", "2021/22", "Dziecanovia", "Jan Testowy", starter=True, confidence=.9),
        ], sid)
        # More season clubs are needed for four club-name options.
        save_matches(conn, [
            MatchRecord("2021/22", 1, "Tempo", "Beskid", 1, 1, confidence=.9),
            MatchRecord("2021/22", 1, "Rudnik", "Skalnik", 1, 0, confidence=.9),
        ], sid)
        qs = generate_all(conn, .8)
        assert any(q.question_type == "player_match_club" and q.correct_answer == "Dziecanovia" for q in qs)
        assert any(q.question_type == "player_match_role" and q.correct_answer == "Podstawowy skład" for q in qs)
