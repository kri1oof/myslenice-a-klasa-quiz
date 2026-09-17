from __future__ import annotations

import sqlite3

from myslenice_quiz.questions.lnp_questions import generate_lnp_profile_questions


def _question(observed_at: str):
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    try:
        conn.executescript(
            """
            CREATE TABLE seasons (id INTEGER PRIMARY KEY, label TEXT NOT NULL);
            CREATE TABLE players (id INTEGER PRIMARY KEY, display_name TEXT NOT NULL);
            CREATE TABLE sources (id INTEGER PRIMARY KEY, url TEXT NOT NULL);
            CREATE TABLE player_season_profiles (
                season_id INTEGER NOT NULL,
                player_id INTEGER NOT NULL,
                age INTEGER,
                citizenship TEXT,
                observed_at TEXT,
                source_id INTEGER,
                confidence REAL NOT NULL DEFAULT 1.0,
                PRIMARY KEY(season_id, player_id)
            );
            """
        )
        conn.execute("INSERT INTO seasons(id,label) VALUES(1,'2026/27')")
        conn.execute("INSERT INTO players(id,display_name) VALUES(7,'Jan Testowy')")
        conn.execute(
            "INSERT INTO sources(id,url) VALUES(3,'https://www.laczynaspilka.pl/test')"
        )
        conn.execute(
            """INSERT INTO player_season_profiles(
                   season_id,player_id,age,citizenship,observed_at,source_id,confidence
               ) VALUES(1,7,24,'POLSKIE',?,3,1.0)""",
            (observed_at,),
        )
        return generate_lnp_profile_questions(conn, 0.80)[0]
    finally:
        conn.close()


def test_player_age_question_identity_ignores_sync_time_within_day():
    first = _question("2026-09-17T12:00:00Z")
    second = _question("2026-09-17T12:07:00Z")

    assert first.id == second.id
    assert first.options == second.options
    assert first.prompt == second.prompt
    assert first.correct_answer == second.correct_answer == "24"


def test_player_age_question_identity_stays_stable_across_observation_days():
    first = _question("2026-09-17T12:00:00Z")
    second = _question("2026-09-18T12:00:00Z")

    assert first.id == second.id
    assert first.options == second.options
    assert first.prompt != second.prompt
