from pathlib import Path

from myslenice_quiz.db import connect, init_db
from myslenice_quiz.ingest.common import MatchRecord, PlayerSeasonStatRecord, ClubSeasonStatRecord, save_matches, save_player_stats, save_club_stats, upsert_source
from myslenice_quiz.questions import generate_all


def test_generates_basic_questions(tmp_path: Path):
    db = tmp_path / "q.db"
    init_db(db)
    with connect(db) as conn:
        sid = upsert_source(conn, "mzpn", "https://example.test/mzpn", "fixture")
        save_matches(conn, [
            MatchRecord("2024/25", 1, "CLAVIA", "TEMPO", 2, 1, confidence=1.0),
            MatchRecord("2024/25", 1, "PASTERNIK", "TOPÓR", 0, 0, confidence=1.0),
            MatchRecord("2024/25", 1, "RUDNIK", "BESKID", 3, 2, confidence=1.0),
            MatchRecord("2024/25", 1, "JORDAN", "SKALNIK", 1, 4, confidence=1.0),
        ], sid)
        save_club_stats(conn, [
            ClubSeasonStatRecord("2024/25", "CLAVIA", position=1, played=4, points=10, wins=3, draws=1, losses=0, goals_for=8, goals_against=3, confidence=1.0),
            ClubSeasonStatRecord("2024/25", "TEMPO", position=2, played=4, points=9, wins=3, draws=0, losses=1, goals_for=7, goals_against=4, confidence=1.0),
            ClubSeasonStatRecord("2024/25", "PASTERNIK", position=3, played=4, points=7, wins=2, draws=1, losses=1, goals_for=6, goals_against=4, confidence=1.0),
            ClubSeasonStatRecord("2024/25", "TOPÓR", position=4, played=4, points=5, wins=1, draws=2, losses=1, goals_for=5, goals_against=5, confidence=1.0),
        ], sid)
        save_player_stats(conn, [
            PlayerSeasonStatRecord("2024/25", "CLAVIA", "Jan Kowalski", goals=7, confidence=1.0),
            PlayerSeasonStatRecord("2024/25", "CLAVIA", "Piotr Nowak", goals=5, confidence=1.0),
            PlayerSeasonStatRecord("2024/25", "CLAVIA", "Adam Wiśnia", goals=3, confidence=1.0),
            PlayerSeasonStatRecord("2024/25", "CLAVIA", "Marek Lis", goals=1, confidence=1.0),
        ], sid)
        qs = generate_all(conn, 0.8)
        types = {q.question_type for q in qs}
        assert "match_score" in types
        assert "round_opponent" in types
        assert "final_position" in types
        assert "player_season_goals" in types
        assert "club_top_scorer" in types
        assert all(len(q.options) == 4 for q in qs)
        assert all(q.correct_answer in q.options for q in qs)


def test_conflict_blocks_match_questions(tmp_path: Path):
    db = tmp_path / "q.db"
    init_db(db)
    with connect(db) as conn:
        s1 = upsert_source(conn, "mzpn", "https://example.test/a", "a")
        s2 = upsert_source(conn, "90minut", "https://example.test/b", "b")
        save_matches(conn, [MatchRecord("2024/25", 1, "A", "B", 2, 1, confidence=1.0)], s1)
        save_matches(conn, [MatchRecord("2024/25", 1, "A", "B", 3, 1, confidence=0.92)], s2)
        qs = generate_all(conn, 0.8)
        assert not any(q.question_type == "match_score" for q in qs)
        assert conn.execute("SELECT COUNT(*) FROM data_conflicts WHERE resolved=0").fetchone()[0] == 1


def test_extended_questions_for_complete_season(tmp_path: Path):
    db = tmp_path / "extended.db"
    init_db(db)
    with connect(db) as conn:
        sid = upsert_source(conn, "mzpn", "https://example.test/complete", "fixture")
        save_matches(conn, [
            MatchRecord("2024/25", 1, "A", "B", 2, 0, confidence=1.0),
            MatchRecord("2024/25", 1, "C", "D", 1, 1, confidence=1.0),
            MatchRecord("2024/25", 2, "B", "A", 0, 1, confidence=1.0),
            MatchRecord("2024/25", 2, "D", "C", 3, 2, confidence=1.0),
        ], sid)
        conn.execute("UPDATE seasons SET is_complete=1 WHERE label='2024/25'")
        qs = generate_all(conn, 0.8)
        types = {q.question_type for q in qs}
        assert "club_home_points" in types
        assert "club_away_points" in types
        assert "longest_unbeaten_streak" in types
        assert "h2h_season_points" in types
        assert "season_zero_zero_matches" in types
        assert all(len(q.options) == 4 for q in qs)
        assert all(q.correct_answer in q.options for q in qs)


def test_walkover_does_not_generate_actual_goal_count_questions(tmp_path: Path):
    db = tmp_path / "walkover.db"
    init_db(db)
    with connect(db) as conn:
        sid = upsert_source(conn, "sportowetempo", "https://example.test/wo", "fixture")
        save_matches(conn, [MatchRecord("2009/10", 14, "A", "B", 0, 3, status="walkover", confidence=1.0)], sid)
        qs = generate_all(conn, 0.8)
        types = {q.question_type for q in qs}
        assert "match_score" in types
        assert "match_winner" in types
        assert "match_total_goals" not in types
        assert "club_match_goals" not in types
        score_q = next(q for q in qs if q.question_type == "match_score")
        assert "oficjalny wynik" in score_q.prompt.lower()
