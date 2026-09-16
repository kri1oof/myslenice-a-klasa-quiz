from __future__ import annotations

import sqlite3
from pathlib import Path

from .normalize import canonical_club_name, normalize_text, slugify

SCHEMA_PATH = Path(__file__).with_name("schema.sql")


def connect(path: str | Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(path: str | Path) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with connect(path) as conn:
        conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))


def get_or_create_season(conn: sqlite3.Connection, label: str, competition_name: str = "Myślenice: Klasa A") -> int:
    parts = label.replace("/", " ").split()
    start_year = int(parts[0]) if parts and parts[0].isdigit() else None
    end_year = None
    if len(parts) > 1 and parts[1].isdigit():
        raw = int(parts[1])
        end_year = raw if raw > 1900 else ((start_year // 100) * 100 + raw if start_year else raw)
    conn.execute(
        "INSERT OR IGNORE INTO seasons(label, competition_name, start_year, end_year) VALUES(?,?,?,?)",
        (label, competition_name, start_year, end_year),
    )
    return int(conn.execute(
        "SELECT id FROM seasons WHERE label=? AND competition_name=?", (label, competition_name)
    ).fetchone()[0])


def get_or_create_club(conn: sqlite3.Connection, name: str) -> int:
    canonical = canonical_club_name(name)
    normalized = normalize_text(canonical)
    alias = conn.execute(
        "SELECT club_id FROM club_aliases WHERE normalized_alias=?", (normalized,)
    ).fetchone()
    if alias:
        return int(alias[0])
    slug = slugify(canonical)
    candidate = slug
    suffix = 2
    while conn.execute("SELECT 1 FROM clubs WHERE slug=? AND name<>?", (candidate, canonical)).fetchone():
        candidate = f"{slug}-{suffix}"
        suffix += 1
    conn.execute("INSERT OR IGNORE INTO clubs(name, slug) VALUES(?,?)", (canonical, candidate))
    row = conn.execute("SELECT id FROM clubs WHERE name=?", (canonical,)).fetchone()
    club_id = int(row[0])
    conn.execute(
        "INSERT OR IGNORE INTO club_aliases(club_id, alias, normalized_alias) VALUES(?,?,?)",
        (club_id, canonical, normalized),
    )
    return club_id


def get_or_create_player(conn: sqlite3.Connection, display_name: str, external_key: str | None = None) -> int:
    display_name = " ".join(display_name.split()).strip()
    normalized = normalize_text(display_name)
    if external_key:
        row = conn.execute("SELECT id FROM players WHERE external_key=?", (external_key,)).fetchone()
        if row:
            return int(row[0])
    row = conn.execute(
        "SELECT id FROM players WHERE normalized_name=? AND birth_date IS NULL AND external_key IS NULL",
        (normalized,),
    ).fetchone()
    if row:
        player_id = int(row[0])
        if external_key:
            conflict = conn.execute("SELECT id FROM players WHERE external_key=?", (external_key,)).fetchone()
            if not conflict:
                conn.execute("UPDATE players SET external_key=? WHERE id=? AND external_key IS NULL", (external_key, player_id))
        return player_id
    cur = conn.execute(
        "INSERT INTO players(display_name, normalized_name, external_key) VALUES(?,?,?)",
        (display_name, normalized, external_key),
    )
    player_id = int(cur.lastrowid)
    conn.execute(
        "INSERT OR IGNORE INTO player_aliases(player_id, alias, normalized_alias) VALUES(?,?,?)",
        (player_id, display_name, normalized),
    )
    return player_id
