from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from .normalize import canonical_club_name, normalize_text


_INVALID_CLUB_NAMES = {"za artyzm nie ma punktow"}


def _clean_club_name(value: str | None) -> str | None:
    if not value:
        return None
    canonical = canonical_club_name(value)
    if normalize_text(canonical) in _INVALID_CLUB_NAMES:
        return None
    return canonical


def _season_club_pairs(conn: sqlite3.Connection, season_id: int | None) -> list[tuple[str, str]]:
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
    pairs: list[tuple[str, str]] = []
    for row in rows:
        raw = row[0]
        canonical = _clean_club_name(raw)
        if canonical:
            pairs.append((raw, canonical))
    return pairs


def _season_clubs(conn: sqlite3.Connection, season_id: int | None) -> list[str]:
    return sorted({canonical for _, canonical in _season_club_pairs(conn, season_id)})


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
    result: list[tuple[str, str]] = []
    for row in rows:
        club = _clean_club_name(row[1])
        if club:
            result.append((row[0], club))
    return result


def _question_clubs(conn: sqlite3.Connection, row: sqlite3.Row) -> list[str]:
    """Return canonical clubs materially involved in a question.

    We intentionally inspect the prompt, correct answer and explanation, but not
    distractor options. This prevents a club from entering fan mode merely
    because it appeared as a wrong answer. Raw historical aliases are matched
    against the text and then collapsed to the current canonical club name.
    """
    season_id = row["season_id"]
    if season_id is None:
        return []
    text = " ".join(
        str(value or "")
        for value in (row["prompt"], row["correct_answer"], row["explanation"])
    ).casefold()

    clubs: set[str] = set()
    for raw_club, canonical in _season_club_pairs(conn, season_id):
        if raw_club.casefold() in text or canonical.casefold() in text:
            clubs.add(canonical)

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
    clubs: dict[str, dict[str, str | None]] = {}
    for r in club_rows:
        name = _clean_club_name(r["name"])
        if not name:
            continue
        incoming = {
            "slug": r["slug"],
            "short_name": r["short_name"],
            "city": r["city"],
            "crest": r["crest_path"],
            "crest_remote_url": r["crest_remote_url"],
            "crest_source_url": r["crest_source_url"],
        }
        if name not in clubs:
            clubs[name] = incoming
        else:
            # Preserve the most complete metadata when several historical aliases
            # collapse to one canonical club.
            for key, value in incoming.items():
                if value and not clubs[name].get(key):
                    clubs[name][key] = value

    output.write_text(
        json.dumps({"version": 4, "count": len(payload), "clubs": clubs, "questions": payload}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return len(payload)
