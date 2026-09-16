from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import hashlib
import sqlite3
from typing import Iterable

import requests

from ..confidence import SOURCE_AUTHORITY
from ..db import get_or_create_club, get_or_create_player, get_or_create_season

USER_AGENT = "myslenice-a-klasa-quiz/0.1 (+research/quiz; polite fetcher)"


@dataclass(slots=True)
class MatchRecord:
    season: str
    round_no: int | None
    home: str
    away: str
    home_goals: int | None
    away_goals: int | None
    date: str | None = None
    home_ht: int | None = None
    away_ht: int | None = None
    venue: str | None = None
    status: str = "played"
    source_match_key: str | None = None
    confidence: float = 0.8


@dataclass(slots=True)
class GoalRecord:
    home: str
    away: str
    season: str
    scorer: str | None
    club: str
    minute: int | None = None
    minute_extra: int | None = None
    is_penalty: bool = False
    is_own_goal: bool = False
    confidence: float = 0.8


@dataclass(slots=True)
class AppearanceRecord:
    home: str
    away: str
    season: str
    club: str
    player: str
    starter: bool | None = None
    shirt_number: int | None = None
    is_captain: bool = False
    entered_minute: int | None = None
    left_minute: int | None = None
    confidence: float = 0.8


@dataclass(slots=True)
class ClubProfileRecord:
    club: str
    short_name: str | None = None
    city: str | None = None
    founded_year: int | None = None
    crest_path: str | None = None
    crest_remote_url: str | None = None
    crest_source_url: str | None = None
    website_url: str | None = None
    notes: str | None = None


@dataclass(slots=True)
class RosterMembershipRecord:
    season: str
    club: str
    player: str
    role: str | None = None
    external_key: str | None = None
    confidence: float = 0.8


@dataclass(slots=True)
class PlayerSeasonStatRecord:
    season: str
    club: str
    player: str
    goals: int | None = None
    appearances: int | None = None
    confidence: float = 0.8


@dataclass(slots=True)
class ClubSeasonStatRecord:
    season: str
    club: str
    position: int | None = None
    played: int | None = None
    points: int | None = None
    wins: int | None = None
    draws: int | None = None
    losses: int | None = None
    goals_for: int | None = None
    goals_against: int | None = None
    confidence: float = 0.8


def fetch(url: str, timeout: int = 20) -> tuple[str, dict[str, str]]:
    response = requests.get(url, timeout=timeout, headers={"User-Agent": USER_AGENT})
    response.raise_for_status()
    response.encoding = response.apparent_encoding or response.encoding
    return response.text, dict(response.headers)


def upsert_source(conn: sqlite3.Connection, source_type: str, url: str, html: str, notes: str | None = None) -> int:
    authority = SOURCE_AUTHORITY.get(source_type, 0.5)
    digest = hashlib.sha256(html.encode("utf-8", errors="ignore")).hexdigest()
    fetched_at = datetime.now(timezone.utc).isoformat()
    conn.execute(
        """
        INSERT INTO sources(source_type,url,fetched_at,content_hash,authority,notes)
        VALUES(?,?,?,?,?,?)
        ON CONFLICT(url) DO UPDATE SET
            source_type=excluded.source_type,
            fetched_at=excluded.fetched_at,
            content_hash=excluded.content_hash,
            authority=excluded.authority,
            notes=COALESCE(excluded.notes, sources.notes)
        """,
        (source_type, url, fetched_at, digest, authority, notes),
    )
    return int(conn.execute("SELECT id FROM sources WHERE url=?", (url,)).fetchone()[0])


def save_matches(conn: sqlite3.Connection, records: Iterable[MatchRecord], source_id: int) -> int:
    count = 0
    for rec in records:
        season_id = get_or_create_season(conn, rec.season)
        home_id = get_or_create_club(conn, rec.home)
        away_id = get_or_create_club(conn, rec.away)
        existing = conn.execute(
            """SELECT id, confidence FROM matches
               WHERE season_id=? AND home_club_id=? AND away_club_id=?
               ORDER BY CASE WHEN round_no IS ? THEN 0 WHEN round_no IS NULL OR ? IS NULL THEN 1 ELSE 2 END, id
               LIMIT 1""",
            (season_id, home_id, away_id, rec.round_no, rec.round_no),
        ).fetchone()
        if existing:
            match_id = int(existing[0])
            current = conn.execute("SELECT * FROM matches WHERE id=?", (match_id,)).fetchone()
            conflicts = []
            for field, incoming in (("home_goals", rec.home_goals), ("away_goals", rec.away_goals),
                                    ("home_ht", rec.home_ht), ("away_ht", rec.away_ht)):
                existing_value = current[field]
                if incoming is not None and existing_value is not None and incoming != existing_value:
                    conflicts.append((field, existing_value, incoming))
            if conflicts:
                for field, old_value, new_value in conflicts:
                    conn.execute(
                        """INSERT INTO data_conflicts(entity_type,entity_id,field_name,existing_value,incoming_value,source_id)
                           VALUES('match',?,?,?,?,?)""",
                        (match_id, field, str(old_value), str(new_value), source_id),
                    )
                conn.execute("UPDATE matches SET confidence=MIN(confidence,0.49) WHERE id=?", (match_id,))
            else:
                conn.execute(
                    """UPDATE matches SET round_no=COALESCE(round_no,?), match_date=COALESCE(?,match_date),
                       home_goals=COALESCE(home_goals,?), away_goals=COALESCE(away_goals,?),
                       home_ht=COALESCE(home_ht,?), away_ht=COALESCE(away_ht,?),
                       venue=COALESCE(venue,?), status=CASE WHEN status='played' AND ?<>'played' THEN ? ELSE status END, confidence=MAX(confidence,?) WHERE id=?""",
                    (rec.round_no, rec.date, rec.home_goals, rec.away_goals, rec.home_ht, rec.away_ht, rec.venue, rec.status, rec.status, rec.confidence, match_id),
                )
        else:
            cur = conn.execute(
                """INSERT INTO matches(season_id,round_no,match_date,home_club_id,away_club_id,
                   home_goals,away_goals,home_ht,away_ht,status,venue,confidence)
                   VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                (season_id, rec.round_no, rec.date, home_id, away_id, rec.home_goals, rec.away_goals,
                 rec.home_ht, rec.away_ht, rec.status, rec.venue, rec.confidence),
            )
            match_id = int(cur.lastrowid)
        conn.execute(
            """INSERT INTO match_evidence(match_id,source_id,source_match_key,confidence)
               VALUES(?,?,?,?) ON CONFLICT(match_id,source_id) DO UPDATE SET
               source_match_key=COALESCE(excluded.source_match_key,match_evidence.source_match_key),
               confidence=MAX(match_evidence.confidence,excluded.confidence)""",
            (match_id, source_id, rec.source_match_key, rec.confidence),
        )
        count += 1
    return count


def _find_match_id(conn: sqlite3.Connection, season: str, home: str, away: str) -> int | None:
    row = conn.execute(
        """SELECT m.id FROM matches m
           JOIN seasons s ON s.id=m.season_id
           JOIN clubs h ON h.id=m.home_club_id
           JOIN clubs a ON a.id=m.away_club_id
           WHERE s.label=? AND h.id=? AND a.id=? ORDER BY m.id DESC LIMIT 1""",
        (season, get_or_create_club(conn, home), get_or_create_club(conn, away)),
    ).fetchone()
    return int(row[0]) if row else None


def save_goals(conn: sqlite3.Connection, records: Iterable[GoalRecord], source_id: int) -> int:
    count = 0
    for rec in records:
        match_id = _find_match_id(conn, rec.season, rec.home, rec.away)
        if match_id is None:
            continue
        club_id = get_or_create_club(conn, rec.club)
        player_id = None
        if rec.scorer and "nieznany" not in rec.scorer.lower():
            player_id = get_or_create_player(conn, rec.scorer)
        existing = conn.execute(
            """SELECT id FROM goals WHERE match_id=? AND club_id=? AND player_id IS ?
               AND minute IS ? AND minute_extra IS ? AND is_penalty=? AND is_own_goal=?
               ORDER BY id LIMIT 1""",
            (match_id, club_id, player_id, rec.minute, rec.minute_extra, int(rec.is_penalty), int(rec.is_own_goal)),
        ).fetchone()
        if existing:
            goal_id = int(existing[0])
            conn.execute("UPDATE goals SET confidence=MAX(confidence,?) WHERE id=?", (rec.confidence, goal_id))
        else:
            cur = conn.execute(
                """INSERT INTO goals(match_id,club_id,player_id,minute,minute_extra,is_penalty,is_own_goal,confidence)
                   VALUES(?,?,?,?,?,?,?,?)""",
                (match_id, club_id, player_id, rec.minute, rec.minute_extra, int(rec.is_penalty), int(rec.is_own_goal), rec.confidence),
            )
            goal_id = int(cur.lastrowid)
        conn.execute(
            "INSERT OR REPLACE INTO goal_evidence(goal_id,source_id,confidence) VALUES(?,?,?)",
            (goal_id, source_id, rec.confidence),
        )
        count += 1
    return count


def save_player_stats(conn: sqlite3.Connection, records: Iterable[PlayerSeasonStatRecord], source_id: int) -> int:
    count = 0
    for rec in records:
        season_id = get_or_create_season(conn, rec.season)
        club_id = get_or_create_club(conn, rec.club)
        player_id = get_or_create_player(conn, rec.player)
        conn.execute(
            """INSERT INTO player_season_stats(season_id,club_id,player_id,appearances,goals,confidence)
               VALUES(?,?,?,?,?,?) ON CONFLICT(season_id,club_id,player_id) DO UPDATE SET
               appearances=COALESCE(excluded.appearances,player_season_stats.appearances),
               goals=COALESCE(excluded.goals,player_season_stats.goals),
               confidence=MAX(player_season_stats.confidence,excluded.confidence)""",
            (season_id, club_id, player_id, rec.appearances, rec.goals, rec.confidence),
        )
        stat_id = int(conn.execute(
            "SELECT id FROM player_season_stats WHERE season_id=? AND club_id=? AND player_id=?",
            (season_id, club_id, player_id),
        ).fetchone()[0])
        conn.execute(
            "INSERT OR REPLACE INTO player_season_stat_evidence(stat_id,source_id,confidence) VALUES(?,?,?)",
            (stat_id, source_id, rec.confidence),
        )
        count += 1
    return count


def save_roster_memberships(conn: sqlite3.Connection, records: Iterable[RosterMembershipRecord], source_id: int, mark_complete: bool = False, notes: str | None = None) -> int:
    count = 0
    touched: set[tuple[int, int]] = set()
    for rec in records:
        season_id = get_or_create_season(conn, rec.season)
        club_id = get_or_create_club(conn, rec.club)
        player_id = get_or_create_player(conn, rec.player, rec.external_key)
        conn.execute(
            """INSERT INTO player_roster_memberships(season_id,club_id,player_id,role,confidence)
               VALUES(?,?,?,?,?) ON CONFLICT(season_id,club_id,player_id) DO UPDATE SET
               role=COALESCE(excluded.role,player_roster_memberships.role),
               confidence=MAX(player_roster_memberships.confidence,excluded.confidence)""",
            (season_id, club_id, player_id, rec.role, rec.confidence),
        )
        conn.execute(
            """INSERT INTO player_roster_membership_evidence(season_id,club_id,player_id,source_id,confidence)
               VALUES(?,?,?,?,?) ON CONFLICT(season_id,club_id,player_id,source_id) DO UPDATE SET
               confidence=MAX(player_roster_membership_evidence.confidence,excluded.confidence)""",
            (season_id, club_id, player_id, source_id, rec.confidence),
        )
        touched.add((season_id, club_id))
        count += 1
    if mark_complete:
        for season_id, club_id in touched:
            total = conn.execute(
                "SELECT COUNT(*) FROM player_roster_memberships WHERE season_id=? AND club_id=?",
                (season_id, club_id),
            ).fetchone()[0]
            conn.execute(
                """INSERT INTO club_season_coverage(season_id,club_id,dataset,is_complete,notes) VALUES(?,?,'roster',1,?)
                   ON CONFLICT(season_id,club_id,dataset) DO UPDATE SET is_complete=1,notes=excluded.notes""",
                (season_id, club_id, notes or f"Archiwalna kadra źródłowa: {total} zawodników"),
            )
    return count


def save_club_stats(conn: sqlite3.Connection, records: Iterable[ClubSeasonStatRecord], source_id: int) -> int:
    count = 0
    for rec in records:
        season_id = get_or_create_season(conn, rec.season)
        club_id = get_or_create_club(conn, rec.club)
        conn.execute(
            """INSERT INTO club_season_stats(season_id,club_id,position,played,points,wins,draws,losses,goals_for,goals_against,confidence)
               VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(season_id,club_id) DO UPDATE SET
               position=COALESCE(excluded.position,club_season_stats.position),
               played=COALESCE(excluded.played,club_season_stats.played), points=COALESCE(excluded.points,club_season_stats.points),
               wins=COALESCE(excluded.wins,club_season_stats.wins), draws=COALESCE(excluded.draws,club_season_stats.draws),
               losses=COALESCE(excluded.losses,club_season_stats.losses), goals_for=COALESCE(excluded.goals_for,club_season_stats.goals_for),
               goals_against=COALESCE(excluded.goals_against,club_season_stats.goals_against),
               confidence=MAX(club_season_stats.confidence,excluded.confidence)""",
            (season_id, club_id, rec.position, rec.played, rec.points, rec.wins, rec.draws, rec.losses,
             rec.goals_for, rec.goals_against, rec.confidence),
        )
        stat_id = int(conn.execute(
            "SELECT id FROM club_season_stats WHERE season_id=? AND club_id=?",
            (season_id, club_id),
        ).fetchone()[0])
        conn.execute(
            "INSERT OR REPLACE INTO club_season_stat_evidence(stat_id,source_id,confidence) VALUES(?,?,?)",
            (stat_id, source_id, rec.confidence),
        )
        conn.execute(
            """INSERT INTO club_season_memberships(season_id,club_id,source_id,confidence) VALUES(?,?,?,?)
               ON CONFLICT(season_id,club_id) DO UPDATE SET source_id=COALESCE(excluded.source_id,club_season_memberships.source_id),
               confidence=MAX(club_season_memberships.confidence,excluded.confidence)""",
            (season_id, club_id, source_id, rec.confidence),
        )
        count += 1
    return count


def save_appearances(conn: sqlite3.Connection, records: Iterable[AppearanceRecord], source_id: int) -> int:
    count = 0
    for rec in records:
        match_id = _find_match_id(conn, rec.season, rec.home, rec.away)
        if match_id is None:
            continue
        club_id = get_or_create_club(conn, rec.club)
        player_id = get_or_create_player(conn, rec.player)
        conn.execute(
            """INSERT INTO appearances(match_id,club_id,player_id,starter,entered_minute,left_minute,confidence)
               VALUES(?,?,?,?,?,?,?) ON CONFLICT(match_id,player_id,club_id) DO UPDATE SET
               starter=COALESCE(excluded.starter,appearances.starter),
               entered_minute=COALESCE(excluded.entered_minute,appearances.entered_minute),
               left_minute=COALESCE(excluded.left_minute,appearances.left_minute),
               confidence=MAX(appearances.confidence,excluded.confidence)""",
            (match_id, club_id, player_id, None if rec.starter is None else int(rec.starter),
             rec.entered_minute, rec.left_minute, rec.confidence),
        )
        appearance_id = int(conn.execute(
            "SELECT id FROM appearances WHERE match_id=? AND club_id=? AND player_id=?",
            (match_id, club_id, player_id),
        ).fetchone()[0])
        conn.execute(
            "INSERT OR REPLACE INTO appearance_evidence(appearance_id,source_id,confidence) VALUES(?,?,?)",
            (appearance_id, source_id, rec.confidence),
        )
        conn.execute(
            """INSERT INTO appearance_details(appearance_id,shirt_number,is_captain,role) VALUES(?,?,?,?)
               ON CONFLICT(appearance_id) DO UPDATE SET
               shirt_number=COALESCE(excluded.shirt_number,appearance_details.shirt_number),
               is_captain=MAX(appearance_details.is_captain,excluded.is_captain),
               role=COALESCE(excluded.role,appearance_details.role)""",
            (appearance_id, rec.shirt_number, int(rec.is_captain),
             'starter' if rec.starter else ('bench' if rec.starter is False else None)),
        )
        count += 1
    return count


def save_club_profiles(conn: sqlite3.Connection, records: Iterable[ClubProfileRecord]) -> int:
    count = 0
    for rec in records:
        club_id = get_or_create_club(conn, rec.club)
        conn.execute(
            """INSERT INTO club_profiles(club_id,short_name,city,founded_year,crest_path,crest_remote_url,crest_source_url,website_url,notes)
               VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(club_id) DO UPDATE SET
               short_name=COALESCE(excluded.short_name,club_profiles.short_name),
               city=COALESCE(excluded.city,club_profiles.city),
               founded_year=COALESCE(excluded.founded_year,club_profiles.founded_year),
               crest_path=COALESCE(excluded.crest_path,club_profiles.crest_path),
               crest_remote_url=COALESCE(excluded.crest_remote_url,club_profiles.crest_remote_url),
               crest_source_url=COALESCE(excluded.crest_source_url,club_profiles.crest_source_url),
               website_url=COALESCE(excluded.website_url,club_profiles.website_url),
               notes=COALESCE(excluded.notes,club_profiles.notes)""",
            (club_id, rec.short_name, rec.city, rec.founded_year, rec.crest_path, rec.crest_remote_url,
             rec.crest_source_url, rec.website_url, rec.notes),
        )
        count += 1
    return count


def save_memberships_from_stats(conn: sqlite3.Connection, records: Iterable[ClubSeasonStatRecord], source_id: int) -> int:
    count = 0
    for rec in records:
        season_id = get_or_create_season(conn, rec.season)
        club_id = get_or_create_club(conn, rec.club)
        conn.execute(
            """INSERT INTO club_season_memberships(season_id,club_id,source_id,confidence) VALUES(?,?,?,?)
               ON CONFLICT(season_id,club_id) DO UPDATE SET
               source_id=COALESCE(excluded.source_id,club_season_memberships.source_id),
               confidence=MAX(club_season_memberships.confidence,excluded.confidence)""",
            (season_id, club_id, source_id, rec.confidence),
        )
        count += 1
    return count


def set_match_coverage(conn: sqlite3.Connection, season: str, home: str, away: str, dataset: str, complete: bool, notes: str | None = None) -> None:
    match_id = _find_match_id(conn, season, home, away)
    if match_id is None:
        return
    conn.execute(
        """INSERT INTO match_coverage(match_id,dataset,is_complete,notes) VALUES(?,?,?,?)
           ON CONFLICT(match_id,dataset) DO UPDATE SET is_complete=excluded.is_complete,notes=excluded.notes""",
        (match_id, dataset, int(complete), notes),
    )


def set_match_team_coverage(conn: sqlite3.Connection, season: str, home: str, away: str, club: str, dataset: str, complete: bool, notes: str | None = None) -> None:
    match_id = _find_match_id(conn, season, home, away)
    if match_id is None:
        return
    club_id = get_or_create_club(conn, club)
    conn.execute(
        """INSERT INTO match_team_coverage(match_id,club_id,dataset,is_complete,notes) VALUES(?,?,?,?,?)
           ON CONFLICT(match_id,club_id,dataset) DO UPDATE SET is_complete=excluded.is_complete,notes=excluded.notes""",
        (match_id, club_id, dataset, int(complete), notes),
    )
