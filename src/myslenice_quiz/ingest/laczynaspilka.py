from __future__ import annotations

from collections import defaultdict
from datetime import datetime
import json
from pathlib import Path
import sqlite3

from ..db import get_or_create_club, get_or_create_player, get_or_create_season
from .common import (
    ClubProfileRecord,
    ClubSeasonStatRecord,
    MatchRecord,
    save_club_profiles,
    save_club_stats,
    save_matches,
    set_match_coverage,
    set_match_team_coverage,
    upsert_source,
)

SOURCE_TYPE = "pzpn_laczynaspilka"
SOURCE_ROOT = "https://www.laczynaspilka.pl/rozgrywki"
CONFIDENCE = 1.0


def _score(value: str | None) -> tuple[int | None, int | None]:
    if not value or ":" not in value:
        return None, None
    try:
        left, right = value.split(":", 1)
        return int(left.strip()), int(right.strip())
    except (TypeError, ValueError):
        return None, None


def _minute(value: str | None) -> tuple[int | None, int | None, int | None]:
    """Return (absolute, regulation, extra) for values such as 45+2'."""
    if not value:
        return None, None, None
    raw = value.replace("'", "").strip()
    if not raw:
        return None, None, None
    try:
        if "+" in raw:
            base_s, extra_s = raw.split("+", 1)
            base, extra = int(base_s), int(extra_s)
            return base + extra, base, extra
        base = int(raw)
        return base, base, None
    except ValueError:
        return None, None, None


def _player_name(player: dict) -> str:
    return " ".join(x.strip() for x in (player.get("firstname", ""), player.get("lastname", "")) if x and x.strip()).strip()


def _external_key(player_id: str | None) -> str | None:
    return f"lnp:{player_id}" if player_id else None


def _status(raw: str | None) -> str:
    value = (raw or "").casefold()
    if "walkower" in value:
        return "walkover"
    if "rozegran" in value:
        return "played"
    if "odwo" in value:
        return "cancelled"
    return "scheduled"


def _is_own_goal(event_type: str | None) -> bool:
    value = (event_type or "").casefold()
    return "own" in value or "samob" in value


def _is_penalty(event_type: str | None) -> bool:
    value = (event_type or "").casefold()
    return "penalt" in value or "karn" in value


def _card_type(event_type: str | None) -> str:
    value = (event_type or "").casefold()
    if "second" in value or "druga" in value:
        return "second_yellow_red"
    if "red" in value or "czer" in value:
        return "red"
    return "yellow"


def _ensure_profile_table(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS player_season_profiles (
            season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
            player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
            age INTEGER,
            citizenship TEXT,
            observed_at TEXT,
            source_id INTEGER REFERENCES sources(id) ON DELETE SET NULL,
            confidence REAL NOT NULL DEFAULT 1.0 CHECK(confidence BETWEEN 0 AND 1),
            PRIMARY KEY(season_id, player_id)
        );
        CREATE INDEX IF NOT EXISTS idx_player_season_profiles_age
            ON player_season_profiles(season_id, age);
        """
    )


def _find_match_id(conn: sqlite3.Connection, source_id: int, match_key: str) -> int | None:
    row = conn.execute(
        "SELECT match_id FROM match_evidence WHERE source_id=? AND source_match_key=? LIMIT 1",
        (source_id, match_key),
    ).fetchone()
    return int(row[0]) if row else None


def _upsert_roster(conn: sqlite3.Connection, season_id: int, club_id: int, player_id: int, source_id: int) -> None:
    conn.execute(
        """INSERT INTO player_roster_memberships(season_id,club_id,player_id,role,confidence)
           VALUES(?,?,?,NULL,1.0) ON CONFLICT(season_id,club_id,player_id) DO UPDATE SET
           confidence=MAX(player_roster_memberships.confidence,excluded.confidence)""",
        (season_id, club_id, player_id),
    )
    conn.execute(
        """INSERT INTO player_roster_membership_evidence(season_id,club_id,player_id,source_id,confidence)
           VALUES(?,?,?,?,1.0) ON CONFLICT(season_id,club_id,player_id,source_id) DO UPDATE SET
           confidence=MAX(player_roster_membership_evidence.confidence,excluded.confidence)""",
        (season_id, club_id, player_id, source_id),
    )


def _upsert_appearance(
    conn: sqlite3.Connection,
    match_id: int,
    club_id: int,
    player_id: int,
    player: dict,
    source_id: int,
) -> tuple[int, int | None, int | None, bool]:
    subs = player.get("substitutions") or []
    sub_in = next((x for x in subs if (x.get("type") or "").casefold() == "in"), None)
    sub_out = next((x for x in subs if (x.get("type") or "").casefold() == "out"), None)
    entered = _minute(sub_in.get("minute") if sub_in else None)[0]
    left = _minute(sub_out.get("minute") if sub_out else None)[0]
    starter = (player.get("type") or "").casefold() == "starter"
    conn.execute(
        """INSERT INTO appearances(match_id,club_id,player_id,starter,entered_minute,left_minute,confidence)
           VALUES(?,?,?,?,?,?,1.0) ON CONFLICT(match_id,player_id,club_id) DO UPDATE SET
           starter=excluded.starter,
           entered_minute=COALESCE(excluded.entered_minute,appearances.entered_minute),
           left_minute=COALESCE(excluded.left_minute,appearances.left_minute),
           confidence=MAX(appearances.confidence,excluded.confidence)""",
        (match_id, club_id, player_id, int(starter), entered, left),
    )
    appearance_id = int(conn.execute(
        "SELECT id FROM appearances WHERE match_id=? AND club_id=? AND player_id=?",
        (match_id, club_id, player_id),
    ).fetchone()[0])
    conn.execute(
        """INSERT INTO appearance_evidence(appearance_id,source_id,confidence) VALUES(?,?,1.0)
           ON CONFLICT(appearance_id,source_id) DO UPDATE SET confidence=1.0""",
        (appearance_id, source_id),
    )
    conn.execute(
        """INSERT INTO appearance_details(appearance_id,shirt_number,is_captain,role)
           VALUES(?,?,?,?) ON CONFLICT(appearance_id) DO UPDATE SET
           shirt_number=COALESCE(excluded.shirt_number,appearance_details.shirt_number),
           is_captain=excluded.is_captain,
           role=excluded.role""",
        (appearance_id, player.get("number"), int(bool(player.get("isCaptain"))), "starter" if starter else "bench"),
    )
    return appearance_id, entered, left, starter


def _upsert_goal(
    conn: sqlite3.Connection,
    match_id: int,
    goal_club_id: int,
    player_id: int,
    event: dict,
    source_id: int,
) -> None:
    _, base, extra = _minute(event.get("minute"))
    own = _is_own_goal(event.get("type"))
    penalty = _is_penalty(event.get("type"))
    row = conn.execute(
        """SELECT id FROM goals WHERE match_id=? AND club_id=? AND player_id=? AND minute IS ? AND minute_extra IS ?
           AND is_penalty=? AND is_own_goal=? LIMIT 1""",
        (match_id, goal_club_id, player_id, base, extra, int(penalty), int(own)),
    ).fetchone()
    if row:
        goal_id = int(row[0])
        conn.execute("UPDATE goals SET confidence=1.0 WHERE id=?", (goal_id,))
    else:
        cur = conn.execute(
            """INSERT INTO goals(match_id,club_id,player_id,minute,minute_extra,is_penalty,is_own_goal,confidence)
               VALUES(?,?,?,?,?,?,?,1.0)""",
            (match_id, goal_club_id, player_id, base, extra, int(penalty), int(own)),
        )
        goal_id = int(cur.lastrowid)
    conn.execute(
        """INSERT INTO goal_evidence(goal_id,source_id,confidence) VALUES(?,?,1.0)
           ON CONFLICT(goal_id,source_id) DO UPDATE SET confidence=1.0""",
        (goal_id, source_id),
    )


def _insert_card(conn: sqlite3.Connection, match_id: int, club_id: int, player_id: int, event: dict) -> None:
    absolute, _, _ = _minute(event.get("minute"))
    card_type = _card_type(event.get("type"))
    exists = conn.execute(
        """SELECT id FROM cards WHERE match_id=? AND club_id=? AND player_id=? AND minute IS ? AND card_type=? LIMIT 1""",
        (match_id, club_id, player_id, absolute, card_type),
    ).fetchone()
    if not exists:
        conn.execute(
            "INSERT INTO cards(match_id,club_id,player_id,minute,card_type,confidence) VALUES(?,?,?,?,?,1.0)",
            (match_id, club_id, player_id, absolute, card_type),
        )


def import_payload(conn: sqlite3.Connection, payload: dict) -> dict[str, int]:
    _ensure_profile_table(conn)
    totals: defaultdict[str, int] = defaultdict(int)
    fetched_at = payload.get("fetchedAt")

    for season_label, data in (payload.get("seasons") or {}).items():
        if not isinstance(data, dict):
            continue
        season_id = get_or_create_season(conn, season_label)
        play_id = data.get("playId")
        source_url = f"{SOURCE_ROOT}?season={data.get('seasonId','')}&group={play_id or ''}&genderType=Male"
        source_id = upsert_source(
            conn,
            SOURCE_TYPE,
            source_url,
            json.dumps(data, ensure_ascii=False, separators=(",", ":")),
            f"Oficjalne dane PZPN Łączy Nas Piłka: {data.get('playName') or 'Myślenice Klasa A'}",
        )

        table = data.get("table") or {}
        rows = table.get("rows") or []
        club_stats: list[ClubSeasonStatRecord] = []
        profiles: list[ClubProfileRecord] = []
        for row in rows:
            team = row.get("team") or {}
            name = team.get("name")
            all_stats = row.get("all") or {}
            if not name:
                continue
            club_stats.append(ClubSeasonStatRecord(
                season=season_label,
                club=name,
                position=row.get("index"),
                played=all_stats.get("matchesCount"),
                points=all_stats.get("points"),
                wins=all_stats.get("winsCount"),
                draws=all_stats.get("drawsCount"),
                losses=all_stats.get("losesCount"),
                goals_for=all_stats.get("goalsCount"),
                goals_against=all_stats.get("lostGoalsCount"),
                confidence=CONFIDENCE,
            ))
        if club_stats:
            totals["club_stats"] += save_club_stats(conn, club_stats, source_id)

        matches_raw = data.get("matches") or []
        match_records: list[MatchRecord] = []
        team_meta: dict[str, dict] = {}
        for match in matches_raw:
            host, guest = match.get("host") or {}, match.get("guest") or {}
            home, away = host.get("name"), guest.get("name")
            if not home or not away:
                continue
            hg, ag = _score((match.get("scores") or {}).get("final") or (match.get("scores") or {}).get("fullTime"))
            hh, ah = _score((match.get("scores") or {}).get("half"))
            state = _status(match.get("state"))
            if state == "scheduled":
                hg = ag = hh = ah = None
            match_records.append(MatchRecord(
                season=season_label,
                round_no=match.get("queue"),
                home=home,
                away=away,
                home_goals=hg,
                away_goals=ag,
                date=match.get("dateTime"),
                home_ht=hh,
                away_ht=ah,
                venue=match.get("stadium"),
                status=state,
                source_match_key=match.get("matchId"),
                confidence=CONFIDENCE,
            ))
            team_meta[home] = host
            team_meta[away] = guest
        totals["matches"] += save_matches(conn, match_records, source_id)

        for club, meta in team_meta.items():
            profiles.append(ClubProfileRecord(
                club=club,
                short_name=meta.get("abbreviation") or None,
                crest_remote_url=meta.get("logo") or None,
                crest_source_url=source_url,
                notes="Herb/nazwa z oficjalnego protokołu Łączy Nas Piłka",
            ))
        if profiles:
            totals["club_profiles"] += save_club_profiles(conn, profiles)

        raw_profiles = data.get("players") or {}
        events_by_match = data.get("events") or {}
        season_appearance_counts: defaultdict[tuple[int, int], int] = defaultdict(int)
        season_goal_counts: defaultdict[tuple[int, int], int] = defaultdict(int)
        seen_profile_players: set[int] = set()

        for match in matches_raw:
            match_key = match.get("matchId")
            events = events_by_match.get(match_key)
            if not match_key or not events:
                continue
            match_id = _find_match_id(conn, source_id, match_key)
            if match_id is None:
                continue
            host, guest = match.get("host") or {}, match.get("guest") or {}
            home, away = host.get("name"), guest.get("name")
            if not home or not away:
                continue
            home_id, away_id = get_or_create_club(conn, home), get_or_create_club(conn, away)
            goal_counts = {home_id: 0, away_id: 0}
            starters = {home_id: 0, away_id: 0}
            squad_counts = {home_id: 0, away_id: 0}

            for side_name, club_id, opponent_id in (("host", home_id, away_id), ("guest", away_id, home_id)):
                squad = ((events.get(side_name) or {}).get("squad") or [])
                squad_counts[club_id] = len(squad)
                for player in squad:
                    name = _player_name(player)
                    ext = _external_key(player.get("id"))
                    if not name:
                        continue
                    player_id = get_or_create_player(conn, name, ext)
                    _upsert_roster(conn, season_id, club_id, player_id, source_id)
                    totals["roster_memberships"] += 1
                    _, entered, _, starter = _upsert_appearance(conn, match_id, club_id, player_id, player, source_id)
                    totals["appearances"] += 1
                    if starter:
                        starters[club_id] += 1
                    if starter or entered is not None:
                        season_appearance_counts[(club_id, player_id)] += 1

                    for goal in player.get("goals") or []:
                        own = _is_own_goal(goal.get("type"))
                        goal_club_id = opponent_id if own else club_id
                        _upsert_goal(conn, match_id, goal_club_id, player_id, goal, source_id)
                        goal_counts[goal_club_id] += 1
                        totals["goals"] += 1
                        if not own:
                            season_goal_counts[(club_id, player_id)] += 1
                    for card in player.get("cards") or []:
                        _insert_card(conn, match_id, club_id, player_id, card)
                        totals["cards"] += 1

                    profile = raw_profiles.get(player.get("id")) or {}
                    if profile and player_id not in seen_profile_players:
                        age = profile.get("age")
                        try:
                            age = int(age) if age is not None else None
                        except (TypeError, ValueError):
                            age = None
                        conn.execute(
                            """INSERT INTO player_season_profiles(season_id,player_id,age,citizenship,observed_at,source_id,confidence)
                               VALUES(?,?,?,?,?,?,1.0) ON CONFLICT(season_id,player_id) DO UPDATE SET
                               age=COALESCE(excluded.age,player_season_profiles.age),
                               citizenship=COALESCE(excluded.citizenship,player_season_profiles.citizenship),
                               observed_at=COALESCE(excluded.observed_at,player_season_profiles.observed_at),
                               source_id=excluded.source_id,confidence=1.0""",
                            (season_id, player_id, age, profile.get("citizenship"), fetched_at, source_id),
                        )
                        seen_profile_players.add(player_id)
                        totals["player_profiles"] += 1

            final_home, final_away = _score((match.get("scores") or {}).get("final") or (match.get("scores") or {}).get("fullTime"))
            goals_complete = (
                final_home is not None and final_away is not None
                and goal_counts[home_id] == final_home and goal_counts[away_id] == final_away
            )
            lineups_complete = (
                squad_counts[home_id] >= 11 and squad_counts[away_id] >= 11
                and starters[home_id] == 11 and starters[away_id] == 11
            )
            set_match_coverage(conn, season_label, home, away, "goals", goals_complete,
                               f"ŁNP: zdarzenia bramkowe {goal_counts[home_id]}:{goal_counts[away_id]} / wynik {final_home}:{final_away}")
            set_match_coverage(conn, season_label, home, away, "lineups", lineups_complete,
                               f"ŁNP: starterzy {starters[home_id]}:{starters[away_id]}, kadra {squad_counts[home_id]}:{squad_counts[away_id]}")
            set_match_team_coverage(conn, season_label, home, away, home, "scorers", goals_complete,
                                    "Oficjalny protokół ŁNP")
            set_match_team_coverage(conn, season_label, home, away, away, "scorers", goals_complete,
                                    "Oficjalny protokół ŁNP")

        for (club_id, player_id), apps in season_appearance_counts.items():
            goals = season_goal_counts.get((club_id, player_id), 0)
            conn.execute(
                """INSERT INTO player_season_stats(season_id,club_id,player_id,appearances,goals,confidence)
                   VALUES(?,?,?,?,?,1.0) ON CONFLICT(season_id,club_id,player_id) DO UPDATE SET
                   appearances=excluded.appearances,goals=excluded.goals,confidence=1.0""",
                (season_id, club_id, player_id, apps, goals),
            )
            stat_id = int(conn.execute(
                "SELECT id FROM player_season_stats WHERE season_id=? AND club_id=? AND player_id=?",
                (season_id, club_id, player_id),
            ).fetchone()[0])
            conn.execute(
                """INSERT INTO player_season_stat_evidence(stat_id,source_id,confidence) VALUES(?,?,1.0)
                   ON CONFLICT(stat_id,source_id) DO UPDATE SET confidence=1.0""",
                (stat_id, source_id),
            )
            totals["player_stats"] += 1

        nclubs = len(rows)
        expected_matches = nclubs * (nclubs - 1) if nclubs > 1 else 0
        played_count = sum(1 for m in matches_raw if _status(m.get("state")) in {"played", "walkover"})
        finished = bool(expected_matches and played_count == expected_matches)
        conn.execute("UPDATE seasons SET is_complete=? WHERE id=?", (int(finished), season_id))
        for dataset, complete, note in (
            ("standings", finished, f"ŁNP: tabela {nclubs} drużyn; rozegrano {played_count}/{expected_matches or '?'}"),
            ("matches", bool(expected_matches and len(matches_raw) == expected_matches), f"ŁNP: terminarz {len(matches_raw)}/{expected_matches or '?'}"),
            ("club_memberships", bool(nclubs), f"ŁNP: tabela zawiera {nclubs} klubów"),
        ):
            conn.execute(
                """INSERT INTO season_coverage(season_id,dataset,is_complete,notes) VALUES(?,?,?,?)
                   ON CONFLICT(season_id,dataset) DO UPDATE SET is_complete=excluded.is_complete,notes=excluded.notes""",
                (season_id, dataset, int(complete), note),
            )

    return dict(totals)


def import_file(conn: sqlite3.Connection, path: str | Path) -> dict[str, int]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    return import_payload(conn, payload)
