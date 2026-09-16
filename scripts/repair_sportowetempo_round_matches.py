from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from myslenice_quiz.db import connect, get_or_create_club, get_or_create_season, init_db
from myslenice_quiz.ingest.common import fetch, upsert_source
from myslenice_quiz.ingest import sportowetempo
from myslenice_quiz.normalize import canonical_club_name, normalize_text

DB = ROOT / "data" / "quiz.db"
ARCHIVES = [
    ("2009/10", "https://www.sportowetempo.pl/pn_malopolska_a_klasa_myslenice/50"),
    ("2010/11", "https://www.sportowetempo.pl/pn_malopolska_a_klasa_myslenice_11/50"),
    ("2011/12", "https://www.sportowetempo.pl/pn_malopolska_a_klasa_myslenice_12/50"),
    ("2012/13", "https://www.sportowetempo.pl/pn_malopolska_a_klasa_myslenice_13/50"),
]


def club_key(value: str) -> str:
    return normalize_text(canonical_club_name(value))


def main() -> None:
    init_db(DB)
    with connect(DB) as conn:
        for season, url in ARCHIVES:
            html, _ = fetch(url, timeout=20)
            source_id = upsert_source(
                conn,
                "sportowetempo",
                url,
                html,
                f"SportoweTempo A-klasa Myślenice {season}; naprawa identyfikacji meczów po kolejce",
            )
            records, _, _ = sportowetempo.parse_season(html, season, url)
            season_id = get_or_create_season(conn, season)
            inserted = updated = 0

            expected_keys: set[tuple[int | None, str, str]] = set()
            for rec in records:
                expected_keys.add((rec.round_no, club_key(rec.home), club_key(rec.away)))
                home_id = get_or_create_club(conn, rec.home)
                away_id = get_or_create_club(conn, rec.away)
                exact = conn.execute(
                    """SELECT id FROM matches
                       WHERE season_id=? AND home_club_id=? AND away_club_id=? AND round_no IS ?
                       ORDER BY id LIMIT 1""",
                    (season_id, home_id, away_id, rec.round_no),
                ).fetchone()
                if exact:
                    match_id = int(exact[0])
                    conn.execute(
                        """UPDATE matches SET
                           match_date=COALESCE(match_date,?), home_goals=COALESCE(home_goals,?),
                           away_goals=COALESCE(away_goals,?), home_ht=COALESCE(home_ht,?),
                           away_ht=COALESCE(away_ht,?), venue=COALESCE(venue,?),
                           confidence=MAX(confidence,?) WHERE id=?""",
                        (rec.date, rec.home_goals, rec.away_goals, rec.home_ht, rec.away_ht,
                         rec.venue, rec.confidence, match_id),
                    )
                    updated += 1
                else:
                    cur = conn.execute(
                        """INSERT INTO matches(season_id,round_no,match_date,home_club_id,away_club_id,
                           home_goals,away_goals,home_ht,away_ht,status,venue,confidence)
                           VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                        (season_id, rec.round_no, rec.date, home_id, away_id, rec.home_goals,
                         rec.away_goals, rec.home_ht, rec.away_ht, rec.status, rec.venue, rec.confidence),
                    )
                    match_id = int(cur.lastrowid)
                    inserted += 1

                conn.execute(
                    """INSERT INTO match_evidence(match_id,source_id,source_match_key,confidence)
                       VALUES(?,?,?,?) ON CONFLICT(match_id,source_id) DO UPDATE SET
                       source_match_key=COALESCE(excluded.source_match_key,match_evidence.source_match_key),
                       confidence=MAX(match_evidence.confidence,excluded.confidence)""",
                    (match_id, source_id, rec.source_match_key, rec.confidence),
                )

            db_rows = conn.execute(
                """SELECT m.id,m.round_no,m.match_date,h.name home,a.name away,m.home_goals,m.away_goals
                   FROM matches m JOIN clubs h ON h.id=m.home_club_id JOIN clubs a ON a.id=m.away_club_id
                   WHERE m.season_id=? ORDER BY COALESCE(m.round_no,999),m.match_date,m.id""",
                (season_id,),
            ).fetchall()
            extras = [
                row for row in db_rows
                if (row["round_no"], club_key(row["home"]), club_key(row["away"])) not in expected_keys
            ]

            print(
                f"{season}: źródło={len(records)}, baza={len(db_rows)}, "
                f"dodano={inserted}, zaktualizowano={updated}, poza terminarzem źródłowym={len(extras)}"
            )
            for row in extras:
                print(
                    f"  EXTRA id={row['id']} kolejka={row['round_no']} data={row['match_date']} "
                    f"{row['home']} - {row['away']} {row['home_goals']}:{row['away_goals']}"
                )


if __name__ == "__main__":
    main()
