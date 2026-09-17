from pathlib import Path

from myslenice_quiz.db import connect, init_db
from myslenice_quiz.ingest.common import MatchRecord, PlayerSeasonStatRecord, save_matches, save_player_stats, upsert_source
from myslenice_quiz.questions.social_story_questions import generate_social_story_questions


def _seed_match_with_players(conn):
    source_id = upsert_source(conn, "social_test", "https://example.test/story", "fixture")
    save_matches(
        conn,
        [MatchRecord("2026/27", 1, "Beskid Tokarnia", "Pasternik Ochojno", 1, 2, confidence=1.0)],
        source_id,
    )
    save_player_stats(
        conn,
        [
            PlayerSeasonStatRecord("2026/27", "Beskid Tokarnia", "Adam Piosek", goals=2, confidence=1.0),
            PlayerSeasonStatRecord("2026/27", "Beskid Tokarnia", "Michał Hanusiak", goals=1, confidence=1.0),
            PlayerSeasonStatRecord("2026/27", "Pasternik Ochojno", "Jan Testowy", goals=3, confidence=1.0),
        ],
        source_id,
    )
    match_id = conn.execute(
        """SELECT m.id FROM matches m JOIN seasons s ON s.id=m.season_id
           WHERE s.label='2026/27' LIMIT 1"""
    ).fetchone()[0]
    club_id = conn.execute("SELECT id FROM clubs WHERE name='Beskid Tokarnia'").fetchone()[0]
    return source_id, match_id, club_id


def test_opening_scorer_uses_real_season_players_as_distractors(tmp_path: Path):
    db = tmp_path / "story.db"
    init_db(db)
    with connect(db) as conn:
        source_id, match_id, club_id = _seed_match_with_players(conn)
        conn.execute(
            """INSERT INTO match_context_facts(
                   match_id,club_id,source_id,fact_type,value,confidence,verified,notes
               ) VALUES(?,?,?,?,?,0.95,1,?)""",
            (match_id, club_id, source_id, "opening_scorer", "Makusek", "verified story fixture"),
        )
        questions = generate_social_story_questions(conn, 0.80)
        question = next(q for q in questions if q.question_type == "social_opening_scorer")
        assert question.correct_answer == "Makusek"
        assert len(question.options) == 4
        assert "Makusek" in question.options
        assert set(question.options) - {"Makusek"} <= {"Adam Piosek", "Michał Hanusiak", "Jan Testowy"}


def test_photo_report_source_question_has_verified_source_choices(tmp_path: Path):
    db = tmp_path / "photo.db"
    init_db(db)
    with connect(db) as conn:
        source_id, match_id, club_id = _seed_match_with_players(conn)
        conn.execute(
            """INSERT INTO match_context_facts(
                   match_id,club_id,source_id,fact_type,value,confidence,verified,notes
               ) VALUES(?,?,?,?,?,0.98,1,?)""",
            (
                match_id,
                club_id,
                source_id,
                "photo_report_source",
                "Fotopstryki (Grzegorz Jania)",
                "verified photo fixture",
            ),
        )
        questions = generate_social_story_questions(conn, 0.80)
        question = next(q for q in questions if q.question_type == "social_photo_report_source")
        assert question.correct_answer == "Fotopstryki (Grzegorz Jania)"
        assert len(question.options) == 4
        assert "Koneserzy Życia" in question.options
        assert "ZatrzymajCzas photography" in question.options


def test_static_source_questions_respect_min_confidence(tmp_path: Path):
    db = tmp_path / "static.db"
    init_db(db)
    with connect(db) as conn:
        assert any(q.question_type == "social_source_profile" for q in generate_social_story_questions(conn, 0.90))
        assert not any(q.question_type == "social_source_profile" for q in generate_social_story_questions(conn, 0.91))
