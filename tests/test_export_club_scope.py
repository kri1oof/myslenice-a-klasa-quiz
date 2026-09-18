import json
from pathlib import Path

from myslenice_quiz.db import connect, init_db
from myslenice_quiz.export import export_questions
from myslenice_quiz.ingest.common import MatchRecord, PlayerSeasonStatRecord, save_matches, save_player_stats, upsert_source
from myslenice_quiz.questions import generate_all
from myslenice_quiz.questions.base import save_questions


def test_export_adds_club_scope(tmp_path: Path):
    db = tmp_path / "q.db"
    out = tmp_path / "questions.json"
    init_db(db)
    with connect(db) as conn:
        source_id = upsert_source(conn, "mzpn", "https://example.test/mzpn", "fixture")
        save_matches(conn, [
            MatchRecord("2024/25", 1, "CLAVIA", "TEMPO", 2, 1, confidence=1.0),
            MatchRecord("2024/25", 1, "RUDNIK", "BESKID", 3, 2, confidence=1.0),
        ], source_id)
        save_player_stats(conn, [
            PlayerSeasonStatRecord("2024/25", "CLAVIA", "Jan Kowalski", goals=7, confidence=1.0),
        ], source_id)
        save_questions(conn, generate_all(conn, 0.8))
        export_questions(conn, out, 0.8)

    payload = json.loads(out.read_text(encoding="utf-8"))
    canonical = "Clavia Świątniki Górne"
    match = next(q for q in payload["questions"] if q["type"] == "match_score" and canonical in q["question"])
    assert set(match["clubs"]) == {canonical, "TEMPO"}
    player = next(q for q in payload["questions"] if q["type"] == "player_season_goals")
    assert player["clubs"] == [canonical]


def test_export_excludes_numeric_club_from_metadata(tmp_path: Path):
    db = tmp_path / "q.db"
    out = tmp_path / "questions.json"
    init_db(db)
    with connect(db) as conn:
        source_id = upsert_source(conn, "lnp", "https://example.test/lnp", "fixture")
        save_matches(conn, [
            MatchRecord("2025/26", 1, "12", "CLAVIA", 0, 3, confidence=1.0),
        ], source_id)
        save_questions(conn, generate_all(conn, 0.8))
        export_questions(conn, out, 0.8)

    payload = json.loads(out.read_text(encoding="utf-8"))
    assert "12" not in payload["clubs"]
    assert "Clavia Świątniki Górne" in payload["clubs"]
