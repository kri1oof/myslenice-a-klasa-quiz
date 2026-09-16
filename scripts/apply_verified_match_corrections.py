from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from myslenice_quiz.db import connect, get_or_create_club, init_db
from myslenice_quiz.ingest.common import upsert_source


def _rows(path: Path):
    with path.open(newline="", encoding="utf-8-sig") as handle:
        yield from csv.DictReader(handle)


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply explicitly verified match-score corrections")
    parser.add_argument("--db", default="data/quiz.db")
    parser.add_argument("--corrections", default="data/reference/verified_match_corrections.csv")
    args = parser.parse_args()

    corrections_path = Path(args.corrections)
    if not corrections_path.exists():
        raise SystemExit(f"Brak pliku korekt: {corrections_path}")

    init_db(args.db)
    applied = already_ok = skipped = 0

    with connect(args.db) as conn:
        for row in _rows(corrections_path):
            season = row["season"].strip()
            round_no = int(row["round_no"]) if row.get("round_no") else None
            home = row["home"].strip()
            away = row["away"].strip()
            correct_home = int(row["home_goals"])
            correct_away = int(row["away_goals"])
            confidence = float(row.get("confidence") or 0.95)
            source_urls = [x.strip() for x in (row.get("source_urls") or "").split(";") if x.strip()]
            notes = (row.get("notes") or "").strip()

            season_row = conn.execute("SELECT id FROM seasons WHERE label=?", (season,)).fetchone()
            if not season_row:
                print(f"SKIP {season} {home} - {away}: brak sezonu w bazie")
                skipped += 1
                continue
            season_id = int(season_row[0])
            home_id = get_or_create_club(conn, home)
            away_id = get_or_create_club(conn, away)
            match = conn.execute(
                """SELECT * FROM matches
                   WHERE season_id=? AND home_club_id=? AND away_club_id=?
                   ORDER BY CASE WHEN round_no IS ? THEN 0 ELSE 1 END,id LIMIT 1""",
                (season_id, home_id, away_id, round_no),
            ).fetchone()
            if not match:
                print(f"SKIP {season} {home} - {away}: brak meczu w bazie")
                skipped += 1
                continue

            match_id = int(match["id"])
            detailed_goals = conn.execute("SELECT COUNT(*) FROM goals WHERE match_id=?", (match_id,)).fetchone()[0]
            current = (match["home_goals"], match["away_goals"])
            correct = (correct_home, correct_away)

            # A manual correction must not silently contradict already imported
            # detailed goal events. If such data exists, stop and inspect it first.
            if current != correct and detailed_goals:
                print(
                    f"SKIP {season} {home} - {away}: wynik {current[0]}:{current[1]} -> "
                    f"{correct_home}:{correct_away}, ale istnieje {detailed_goals} zdarzeń bramkowych"
                )
                skipped += 1
                continue

            source_ids: list[int] = []
            for url in source_urls:
                source_ids.append(
                    upsert_source(
                        conn,
                        "verified_correction",
                        url,
                        f"{season}|{round_no}|{home}|{away}|{correct_home}:{correct_away}|{notes}",
                        notes or "Zweryfikowana korekta wyniku meczu",
                    )
                )

            if current == correct:
                already_ok += 1
                conn.execute("UPDATE matches SET confidence=MAX(confidence,?) WHERE id=?", (confidence, match_id))
                status = "OK"
            else:
                conn.execute(
                    """INSERT INTO data_conflicts(entity_type,entity_id,field_name,existing_value,incoming_value,source_id)
                       VALUES('match',?,'verified_score_correction',?,?,?)""",
                    (match_id, f"{current[0]}:{current[1]}", f"{correct_home}:{correct_away}", source_ids[0] if source_ids else None),
                )
                conn.execute(
                    """UPDATE matches SET round_no=COALESCE(round_no,?),home_goals=?,away_goals=?,confidence=?
                       WHERE id=?""",
                    (round_no, correct_home, correct_away, confidence, match_id),
                )
                applied += 1
                status = "POPRAWIONO"

            for source_id in source_ids:
                conn.execute(
                    """INSERT INTO match_evidence(match_id,source_id,confidence)
                       VALUES(?,?,?) ON CONFLICT(match_id,source_id) DO UPDATE SET
                       confidence=MAX(match_evidence.confidence,excluded.confidence)""",
                    (match_id, source_id, confidence),
                )

            print(
                f"{status} {season} kolejka {round_no}: {home} - {away} "
                f"{correct_home}:{correct_away} (źródła={len(source_ids)})"
            )

    print(f"Korekty wyników: poprawiono={applied}, już poprawne={already_ok}, pominięte={skipped}")


if __name__ == "__main__":
    main()
