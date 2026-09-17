from __future__ import annotations

from collections import defaultdict
from datetime import datetime
import sqlite3

from .base import Question, deterministic_shuffle, name_options, numeric_options, question_id


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone() is not None


def _season_clubs(conn: sqlite3.Connection, season_id: int) -> list[str]:
    return [r[0] for r in conn.execute(
        """SELECT DISTINCT c.name FROM club_season_memberships csm
           JOIN clubs c ON c.id=csm.club_id WHERE csm.season_id=? ORDER BY c.name""",
        (season_id,),
    )]


def _membership_sources(conn: sqlite3.Connection, season_id: int, club_id: int, player_id: int) -> list[str]:
    return [r[0] for r in conn.execute(
        """SELECT s.url FROM player_roster_membership_evidence e
           JOIN sources s ON s.id=e.source_id
           WHERE e.season_id=? AND e.club_id=? AND e.player_id=? AND s.source_type='pzpn_laczynaspilka'
           ORDER BY s.id""",
        (season_id, club_id, player_id),
    )]


def _profile_sources(conn: sqlite3.Connection, source_id: int | None) -> list[str]:
    if source_id is None:
        return []
    row = conn.execute("SELECT url FROM sources WHERE id=?", (source_id,)).fetchone()
    return [row[0]] if row else []


def _match_sources(conn: sqlite3.Connection, match_id: int) -> list[str]:
    return [r[0] for r in conn.execute(
        """SELECT s.url FROM match_evidence me JOIN sources s ON s.id=me.source_id
           WHERE me.match_id=? AND s.source_type='pzpn_laczynaspilka' ORDER BY s.id""",
        (match_id,),
    )]


def _display_observed(value: str | None) -> str:
    if not value:
        return "ostatniej aktualizacji"
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).strftime("%d.%m.%Y")
    except ValueError:
        return value[:10]


def generate_lnp_profile_questions(conn: sqlite3.Connection, min_confidence: float) -> list[Question]:
    if not _table_exists(conn, "player_season_profiles"):
        return []
    rows = conn.execute(
        """SELECT psp.*,p.display_name,s.label season
           FROM player_season_profiles psp
           JOIN players p ON p.id=psp.player_id JOIN seasons s ON s.id=psp.season_id
           WHERE psp.age IS NOT NULL AND psp.confidence>=? AND psp.age BETWEEN 15 AND 60
           ORDER BY p.id,s.label DESC""",
        (min_confidence,),
    ).fetchall()
    latest_by_player: dict[int, sqlite3.Row] = {}
    for row in rows:
        latest_by_player.setdefault(int(row["player_id"]), row)

    questions: list[Question] = []
    for row in latest_by_player.values():
        age = int(row["age"])
        observed = _display_observed(row["observed_at"])
        # The observation timestamp is the sync time, not a stable profile version.
        # Keep the question identity tied to the player so identical official data
        # produces the same ID and option order across repeated builds.
        qid = question_id("lnp_player_age", row["player_id"])
        questions.append(Question(
            qid,
            "lnp_player_age",
            4,
            f'Ile lat ma {row["display_name"]} według profilu PZPN/Łączy Nas Piłka pobranego {observed}?',
            str(age),
            deterministic_shuffle(numeric_options(age, minimum=15), qid),
            f'Profil Łączy Nas Piłka podawał wiek {age} lat przy aktualizacji {observed}.',
            row["season_id"],
            row["confidence"],
            _profile_sources(conn, row["source_id"]),
        ))
    return questions


def generate_lnp_club_change_questions(conn: sqlite3.Connection, min_confidence: float) -> list[Question]:
    rows = conn.execute(
        """WITH a AS (
               SELECT prm.player_id,MIN(prm.club_id) club_id,COUNT(DISTINCT prm.club_id) clubs
               FROM player_roster_memberships prm JOIN seasons s ON s.id=prm.season_id
               WHERE s.label='2025/26' AND prm.confidence>=? GROUP BY prm.player_id
           ), b AS (
               SELECT prm.player_id,MIN(prm.club_id) club_id,COUNT(DISTINCT prm.club_id) clubs
               FROM player_roster_memberships prm JOIN seasons s ON s.id=prm.season_id
               WHERE s.label='2026/27' AND prm.confidence>=? GROUP BY prm.player_id
           )
           SELECT p.id player_id,p.display_name,a.club_id old_club_id,b.club_id new_club_id,
                  ca.name old_club,cb.name new_club,sa.id old_season_id,sb.id new_season_id
           FROM a JOIN b ON b.player_id=a.player_id
           JOIN players p ON p.id=a.player_id
           JOIN clubs ca ON ca.id=a.club_id JOIN clubs cb ON cb.id=b.club_id
           JOIN seasons sa ON sa.label='2025/26' JOIN seasons sb ON sb.label='2026/27'
           WHERE a.clubs=1 AND b.clubs=1 AND a.club_id<>b.club_id
           ORDER BY p.display_name""",
        (min_confidence, min_confidence),
    ).fetchall()
    questions: list[Question] = []
    for row in rows:
        peers = [x for x in _season_clubs(conn, row["new_season_id"]) if x != row["new_club"]]
        options = name_options(row["new_club"], peers)
        if len(options) < 4:
            continue
        sources = list(dict.fromkeys(
            _membership_sources(conn, row["old_season_id"], row["old_club_id"], row["player_id"])
            + _membership_sources(conn, row["new_season_id"], row["new_club_id"], row["player_id"])
        ))
        if not sources:
            continue
        qid = question_id("lnp_season_club_change", row["player_id"], row["old_club_id"], row["new_club_id"])
        questions.append(Question(
            qid,
            "lnp_season_club_change",
            5,
            f'{row["display_name"]} pojawiał się w oficjalnych protokołach A-klasy Myślenice 2025/26 jako zawodnik {row["old_club"]}. W barwach którego klubu występuje w protokołach sezonu 2026/27?',
            row["new_club"],
            deterministic_shuffle(options, qid),
            f'Ten sam identyfikator zawodnika PZPN występuje w 2025/26 przy {row["old_club"]}, a w 2026/27 przy {row["new_club"]}.',
            row["new_season_id"],
            1.0,
            sources,
        ))
    return questions


def generate_lnp_card_questions(conn: sqlite3.Connection, min_confidence: float) -> list[Question]:
    rows = conn.execute(
        """SELECT ca.*,p.display_name player,c.name club,m.id match_id,m.season_id,
                  h.name home,a.name away
           FROM cards ca
           JOIN players p ON p.id=ca.player_id JOIN clubs c ON c.id=ca.club_id
           JOIN matches m ON m.id=ca.match_id
           JOIN clubs h ON h.id=m.home_club_id JOIN clubs a ON a.id=m.away_club_id
           WHERE ca.confidence>=?
             AND EXISTS (SELECT 1 FROM match_evidence me JOIN sources s ON s.id=me.source_id
                         WHERE me.match_id=m.id AND s.source_type='pzpn_laczynaspilka')
           ORDER BY m.id,p.display_name,ca.minute""",
        (min_confidence,),
    ).fetchall()
    grouped: defaultdict[tuple[int, int], list[sqlite3.Row]] = defaultdict(list)
    for row in rows:
        grouped[(int(row["match_id"]), int(row["player_id"]))].append(row)

    labels = {
        "yellow": "Żółtą",
        "red": "Czerwoną",
        "second_yellow_red": "Drugą żółtą i w konsekwencji czerwoną",
    }
    questions: list[Question] = []
    for (match_id, player_id), cards in grouped.items():
        if len(cards) != 1 or cards[0]["card_type"] not in labels:
            continue
        row = cards[0]
        answer = labels[row["card_type"]]
        choices = ["Żółtą", "Czerwoną", "Drugą żółtą i w konsekwencji czerwoną", "Nie otrzymał kartki"]
        qid = question_id("lnp_match_card", match_id, player_id, row["minute"])
        minute_text = f' w {row["minute"]}. minucie' if row["minute"] is not None else ''
        questions.append(Question(
            qid,
            "lnp_match_card",
            5,
            f'Jaką kartkę otrzymał {row["player"]} w meczu {row["home"]} – {row["away"]}?',
            answer,
            deterministic_shuffle(choices, qid),
            f'Oficjalny protokół ŁNP zapisuje: {answer.lower()}{minute_text}.',
            row["season_id"],
            row["confidence"],
            _match_sources(conn, match_id),
        ))
    return questions


def generate_lnp_questions(conn: sqlite3.Connection, min_confidence: float = 0.80) -> list[Question]:
    questions: list[Question] = []
    questions.extend(generate_lnp_profile_questions(conn, min_confidence))
    questions.extend(generate_lnp_club_change_questions(conn, min_confidence))
    questions.extend(generate_lnp_card_questions(conn, min_confidence))
    return questions
