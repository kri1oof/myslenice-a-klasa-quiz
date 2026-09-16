from __future__ import annotations

from collections import defaultdict
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from myslenice_quiz.db import connect, get_or_create_season, init_db
from myslenice_quiz.ingest.common import save_club_stats, save_matches, upsert_source
from myslenice_quiz.ingest.csv_import import import_club_stats_csv, import_matches_csv

DB = ROOT / "data" / "quiz.db"
MATCHES_CSV = ROOT / "data" / "reference" / "matches_2019_20_ktowygral.csv"
STANDINGS_CSV = ROOT / "data" / "reference" / "standings_2019_20_ktowygral.csv"
SOURCE_URL = "https://www.ktowygral.info/liga/klasa-a-myslenice/2019-2020"
SEASON = "2019/20"


def _validate_reference(matches, standings) -> None:
    if len(matches) != 91:
        raise RuntimeError(f"2019/20: oczekiwano 91 rozegranych meczów, jest {len(matches)}")
    if len(standings) != 14:
        raise RuntimeError(f"2019/20: oczekiwano 14 drużyn w tabeli, jest {len(standings)}")

    rounds: dict[int, int] = defaultdict(int)
    calc: dict[str, dict[str, int]] = defaultdict(
        lambda: {"played": 0, "points": 0, "wins": 0, "draws": 0, "losses": 0, "gf": 0, "ga": 0}
    )

    seen = set()
    for match in matches:
        key = (match.round_no, match.home, match.away)
        if key in seen:
            raise RuntimeError(f"Duplikat meczu: {key}")
        seen.add(key)
        if match.round_no is None or match.home_goals is None or match.away_goals is None:
            raise RuntimeError(f"Niepełny mecz w referencji: {match}")
        rounds[match.round_no] += 1

        h = calc[match.home]
        a = calc[match.away]
        h["played"] += 1
        a["played"] += 1
        h["gf"] += match.home_goals
        h["ga"] += match.away_goals
        a["gf"] += match.away_goals
        a["ga"] += match.home_goals
        if match.home_goals > match.away_goals:
            h["wins"] += 1
            h["points"] += 3
            a["losses"] += 1
        elif match.home_goals < match.away_goals:
            a["wins"] += 1
            a["points"] += 3
            h["losses"] += 1
        else:
            h["draws"] += 1
            a["draws"] += 1
            h["points"] += 1
            a["points"] += 1

    if sorted(rounds) != list(range(1, 14)) or any(rounds[n] != 7 for n in range(1, 14)):
        raise RuntimeError(f"Niepełne kolejki 2019/20: {dict(sorted(rounds.items()))}")

    by_club = {row.club: row for row in standings}
    if set(calc) != set(by_club):
        raise RuntimeError(
            "Lista klubów w meczach i tabeli różni się: "
            f"mecze={sorted(calc)}, tabela={sorted(by_club)}"
        )

    for club, actual in calc.items():
        row = by_club[club]
        expected = {
            "played": row.played,
            "points": row.points,
            "wins": row.wins,
            "draws": row.draws,
            "losses": row.losses,
            "gf": row.goals_for,
            "ga": row.goals_against,
        }
        if actual != expected:
            raise RuntimeError(f"Bilans {club} nie zgadza się z tabelą: mecze={actual}, tabela={expected}")


def main() -> None:
    matches = import_matches_csv(MATCHES_CSV)
    standings = import_club_stats_csv(STANDINGS_CSV)
    _validate_reference(matches, standings)

    init_db(DB)
    reference_payload = MATCHES_CSV.read_text(encoding="utf-8") + "\n" + STANDINGS_CSV.read_text(encoding="utf-8")
    with connect(DB) as conn:
        source_id = upsert_source(
            conn,
            "ktowygral",
            SOURCE_URL,
            reference_payload,
            "Zweryfikowany komplet 91 rozegranych meczów i końcowa tabela A-klasy Myślenice 2019/20; sezon przerwany po 13 kolejkach.",
        )
        match_rows = save_matches(conn, matches, source_id)
        table_rows = save_club_stats(conn, standings, source_id)
        season_id = get_or_create_season(conn, SEASON)

        notes = {
            "matches": "KtoWygral: komplet 91 rozegranych meczów (13 kolejek po 7); sezon przerwany po rundzie jesiennej.",
            "dates": "KtoWygral: data i godzina dla wszystkich 91 rozegranych meczów.",
            "standings": "KtoWygral: końcowa tabela 14 drużyn po 13 rozegranych meczach każdej drużyny.",
            "club_memberships": "KtoWygral: pełna końcowa tabela 14 uczestników sezonu 2019/20.",
        }
        for dataset, note in notes.items():
            conn.execute(
                """INSERT INTO season_coverage(season_id,dataset,is_complete,notes)
                   VALUES(?,?,1,?)
                   ON CONFLICT(season_id,dataset) DO UPDATE SET is_complete=1,notes=excluded.notes""",
                (season_id, dataset, note),
            )
        conn.execute("UPDATE seasons SET is_complete=1 WHERE id=?", (season_id,))

        stored_matches = conn.execute("SELECT COUNT(*) FROM matches WHERE season_id=?", (season_id,)).fetchone()[0]
        stored_clubs = conn.execute("SELECT COUNT(*) FROM club_season_stats WHERE season_id=?", (season_id,)).fetchone()[0]

    print("2019/20: walidacja referencji OK")
    print(f"2019/20: mecze zapisane/przetworzone={match_rows}, w bazie={stored_matches}/91")
    print(f"2019/20: tabela zapisana/przetworzona={table_rows}, w bazie={stored_clubs}/14")
    print(f"Źródło: {SOURCE_URL}")


if __name__ == "__main__":
    main()
