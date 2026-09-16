from __future__ import annotations

import json
import sqlite3
from pathlib import Path


def _season_clubs(conn: sqlite3.Connection, season_id: int | None) -> list[str]:
    if season_id is None:
        return []
    rows = conn.execute(
        """SELECT DISTINCT c.name
           FROM clubs c
           JOIN (
               SELECT home_club_id AS club_id FROM matches WHERE season_id=?
               UNION SELECT away_club_id FROM matches WHERE season_id=?
               UNION SELECT club_id FROM club_season_stats WHERE season_id=?
               UNION SELECT club_id FROM player_season_stats WHERE season_id=?
               UNION SELECT club_id FROM club_season_memberships WHERE season_id=?
           ) x ON x.club_id=c.id
           ORDER BY LENGTH(c.name) DESC, c.name""",
        (season_id, season_id, season_id, season_id, season_id),
    ).fetchall()
    return [r[0] for r in rows]


def _player_clubs(conn: sqlite3.Connection, season_id: int | None) -> list[tuple[str, str]]:
    if season_id is None:
        return []
    rows = conn.execute(
        """SELECT DISTINCT p.display_name player, c.name club
           FROM player_season_stats pss
           JOIN players p ON p.id=pss.player_id
           JOIN clubs c ON c.id=pss.club_id
           WHERE pss.season_id=?
           UNION
           SELECT DISTINCT p.display_name player, c.name club
           FROM goals g
           JOIN matches m ON m.id=g.match_id
           JOIN players p ON p.id=g.player_id
           JOIN clubs c ON c.id=g.club_id
           WHERE m.season_id=? AND g.player_id IS NOT NULL
           UNION
           SELECT DISTINCT p.display_name player, c.name club
           FROM appearances a
           JOIN matches m ON m.id=a.match_id
           JOIN players p ON p.id=a.player_id
           JOIN clubs c ON c.id=a.club_id
           WHERE m.season_id=?
           ORDER BY player""",
        (season_id, season_id, season_id),
    ).fetchall()
    return [(r[0], r[1]) for r in rows]


def _question_clubs(conn: sqlite3.Connection, row: sqlite3.Row) -> list[str]:
    """Return canonical clubs materially involved in a question.

    We intentionally inspect the prompt, correct answer and explanation, but not
    distractor options. This prevents a club from entering fan mode merely
    because it appeared as a wrong answer.
    """
    season_id = row["season_id"]
    if season_id is None:
        return []
    text = " ".join(
        str(value or "")
        for value in (row["prompt"], row["correct_answer"], row["explanation"])
    ).casefold()

    clubs: set[str] = set()
    for club in _season_clubs(conn, season_id):
        if club.casefold() in text:
            clubs.add(club)

    # Some player comparison questions do not spell out the players' clubs.
    # Map every player explicitly named in the question back to their club(s)
    # in that season so the fan filter still behaves as expected.
    for player, club in _player_clubs(conn, season_id):
        if player.casefold() in text:
            clubs.add(club)

    return sorted(clubs)


def export_questions(conn: sqlite3.Connection, output: str | Path, min_confidence: float = 0.80) -> int:
    rows = conn.execute(
        """SELECT q.*,s.label season FROM question_bank q LEFT JOIN seasons s ON s.id=q.season_id
           WHERE q.enabled=1 AND q.confidence>=? ORDER BY q.question_type,q.id""", (min_confidence,)
    ).fetchall()
    payload = []
    for r in rows:
        payload.append({
            "id": r["id"],
            "type": r["question_type"],
            "difficulty": r["difficulty"],
            "question": r["prompt"],
            "answer": r["correct_answer"],
            "options": json.loads(r["options_json"]),
            "explanation": r["explanation"],
            "season": r["season"],
            "confidence": r["confidence"],
            "clubs": _question_clubs(conn, r),
            "sources": json.loads(r["provenance_json"]),
        })
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    club_rows = conn.execute(
        """SELECT c.name,c.slug,cp.short_name,cp.city,cp.crest_path,cp.crest_remote_url,cp.crest_source_url
           FROM clubs c LEFT JOIN club_profiles cp ON cp.club_id=c.id ORDER BY c.name"""
    ).fetchall()
    clubs = {
        r["name"]: {
            "slug": r["slug"],
            "short_name": r["short_name"],
            "city": r["city"],
            "crest": r["crest_path"],
            "crest_remote_url": r["crest_remote_url"],
            "crest_source_url": r["crest_source_url"],
        } for r in club_rows
    }
    output.write_text(
        json.dumps({"version": 3, "count": len(payload), "clubs": clubs, "questions": payload}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return len(payload)
