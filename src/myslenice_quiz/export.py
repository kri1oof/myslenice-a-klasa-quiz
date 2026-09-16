from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path

from .normalize import canonical_club_name, normalize_text


_INVALID_CLUB_NAMES = {"za artyzm nie ma punktow"}

_CLUB_TEXT_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\bClavia\b(?!\s+(?:Świątniki|Swiatniki))", re.I), "Clavia Świątniki Górne"),
    (re.compile(r"Clavia\s+Swiatniki(?:\s+Gorne)?", re.I), "Clavia Świątniki Górne"),
    (re.compile(r"Zielonka\s+Gamar(?:\s+(?:Wrząsowice|Wrzasowice))?", re.I), "Zielonka Wrząsowice"),
    (re.compile(r"\bZielonka\b(?!\s+(?:Wrząsowice|Wrzasowice))", re.I), "Zielonka Wrząsowice"),
    (re.compile(r"Wroblowianka\s+Wroblowice(?:\s*\(Krakow\))?", re.I), "Wróblowianka Wróblowice (Kraków)"),
    (re.compile(r"Wróblowianka\s+Wróblowice(?:\s*\(Kraków\))?", re.I), "Wróblowianka Wróblowice (Kraków)"),
    (re.compile(r"\bWroblowianka\b(?!\s+Wroblowice)", re.I), "Wróblowianka Wróblowice (Kraków)"),
    (re.compile(r"\bWróblowianka\b(?!\s+Wróblowice)", re.I), "Wróblowianka Wróblowice (Kraków)"),
    (re.compile(r"Opatkowianka\s+Opatkowice", re.I), "Opatkowianka"),
)


def _is_invalid_club_text(value: object) -> bool:
    return isinstance(value, str) and any(key in normalize_text(value) for key in _INVALID_CLUB_NAMES)


def _clean_club_name(value: str | None) -> str | None:
    if not value:
        return None
    canonical = canonical_club_name(value)
    if normalize_text(canonical) in _INVALID_CLUB_NAMES:
        return None
    return canonical


def _clean_public_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value
    for pattern, replacement in _CLUB_TEXT_PATTERNS:
        cleaned = pattern.sub(replacement, cleaned)
    return cleaned


def _clean_public_answer(value: object) -> object:
    if not isinstance(value, str):
        return value
    club = _clean_club_name(value)
    if club and club != value:
        return club
    return _clean_public_text(value)


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
    """Return canonical clubs materially involved in a question."""
    season_id = row["season_id"]
    if season_id is None:
        return []
    text = " ".join(
        str(_clean_public_text(value or "") or "")
        for value in (row["prompt"], row["correct_answer"], row["explanation"])
    ).casefold()

    clubs: set[str] = set()
    for raw_club, canonical in _season_club_pairs(conn, season_id):
        if raw_club.casefold() in text or canonical.casefold() in text:
            clubs.add(canonical)

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
        raw_options = json.loads(r["options_json"])
        visible_values = [r["prompt"], r["correct_answer"], r["explanation"], *raw_options]
        if any(_is_invalid_club_text(value) for value in visible_values):
            continue

        answer = _clean_public_answer(r["correct_answer"])
        options: list[object] = []
        for option in raw_options:
            cleaned = _clean_public_answer(option)
            if cleaned not in options:
                options.append(cleaned)
        if answer not in options:
            options.append(answer)
        if len(options) < 2:
            continue

        payload.append({
            "id": r["id"],
            "type": r["question_type"],
            "difficulty": r["difficulty"],
            "question": _clean_public_text(r["prompt"]),
            "answer": answer,
            "options": options,
            "explanation": _clean_public_text(r["explanation"]),
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
            for key, value in incoming.items():
                if value and not clubs[name].get(key):
                    clubs[name][key] = value

    output.write_text(
        json.dumps({"version": 4, "count": len(payload), "clubs": clubs, "questions": payload}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return len(payload)
