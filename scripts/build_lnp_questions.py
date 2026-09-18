from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from myslenice_quiz.db import connect, init_db  # noqa: E402
from myslenice_quiz.export import export_questions  # noqa: E402
from myslenice_quiz.ingest.laczynaspilka import import_file  # noqa: E402
from myslenice_quiz.player_characters import export_player_characters  # noqa: E402
from myslenice_quiz.questions import generate_all  # noqa: E402
from myslenice_quiz.questions.base import save_questions  # noqa: E402


def _key(q: dict) -> tuple[str, str]:
    text = re.sub(r"\s+", " ", str(q.get("question") or "").strip()).casefold()
    return str(q.get("type") or ""), text


def _merge_club(old: dict | None, new: dict | None) -> dict:
    out = dict(old or {})
    for key, value in (new or {}).items():
        if value and (not out.get(key) or key in {"crest_remote_url", "crest_source_url"}):
            out[key] = value
    return out


def _mark_completed_seasons(conn) -> list[str]:
    """Mark official ŁNP seasons complete when they contain matches and none remain scheduled.

    Older competition fixture lists may have fewer rows than a theoretical double
    round-robin because of withdrawals/cancellations. Therefore completion is based
    on the official match statuses we actually imported, not n*(n-1).
    """
    rows = conn.execute(
        """
        SELECT s.id, s.label,
               COUNT(m.id) AS match_count,
               SUM(CASE WHEN m.status='scheduled' THEN 1 ELSE 0 END) AS scheduled_count
        FROM seasons s
        LEFT JOIN matches m ON m.season_id=s.id
        GROUP BY s.id, s.label
        ORDER BY s.label
        """
    ).fetchall()
    completed: list[str] = []
    for row in rows:
        season_id = int(row[0])
        label = str(row[1])
        match_count = int(row[2] or 0)
        scheduled_count = int(row[3] or 0)
        if match_count <= 0 or scheduled_count > 0:
            continue
        conn.execute("UPDATE seasons SET is_complete=1 WHERE id=?", (season_id,))
        conn.execute(
            """INSERT INTO season_coverage(season_id,dataset,is_complete,notes)
               VALUES(?,'standings',1,'ŁNP/PZPN: brak zaplanowanych meczów; tabela traktowana jako końcowa')
               ON CONFLICT(season_id,dataset) DO UPDATE SET
               is_complete=1,notes=excluded.notes""",
            (season_id,),
        )
        completed.append(label)
    return completed


def _filter_conservative_historical_questions(conn, questions):
    """Keep 2022/23 player questions strictly tied to positive official evidence.

    ŁNP has official match protocols for the played fixtures in this season, so
    positive facts such as club, appearance, scorer, card, lineup role or an
    explicit substitution minute are usable.  We intentionally suppress question
    families that infer facts from absence or turn substitution timestamps into
    approximate played-minute totals.
    """
    row = conn.execute("SELECT id FROM seasons WHERE label='2022/23'").fetchone()
    if not row:
        return list(questions)
    season_id = int(row[0])
    blocked = {
        "match_squad_absent",
        "unused_substitute",
        "player_not_in_club",
        "player_season_for_club",
        "player_season_minutes_over",
        "compare_player_minutes",
        "match_player_minutes",
        "match_compare_player_minutes",
    }
    return [
        q for q in questions
        if q.season_id != season_id or q.question_type not in blocked
    ]


def merge_exports(existing_path: Path, lnp_path: Path, output_path: Path) -> tuple[int, int, int]:
    existing = json.loads(existing_path.read_text(encoding="utf-8"))
    incoming = json.loads(lnp_path.read_text(encoding="utf-8"))
    incoming_questions = list(incoming.get("questions") or [])

    # Player-age prompts include the observation date. A later official sync may
    # legitimately move that date (or the age itself), so old versions must not
    # accumulate beside the current one. Replace this generated type as a unit.
    refresh_types = {"lnp_player_age"}
    questions = [
        q for q in (existing.get("questions") or [])
        if q.get("type") not in refresh_types
    ]
    index = {_key(q): i for i, q in enumerate(questions)}
    added = upgraded = 0

    for q in incoming_questions:
        key = _key(q)
        if key in index:
            i = index[key]
            old = questions[i]
            merged = dict(old)
            merged.update({
                "answer": q.get("answer", old.get("answer")),
                "options": q.get("options", old.get("options")),
                "explanation": q.get("explanation") or old.get("explanation"),
                "confidence": max(float(old.get("confidence") or 0), float(q.get("confidence") or 0)),
                "clubs": sorted(set((old.get("clubs") or []) + (q.get("clubs") or []))),
                "sources": list(dict.fromkeys((old.get("sources") or []) + (q.get("sources") or []))),
            })
            questions[i] = merged
            upgraded += 1
        else:
            index[key] = len(questions)
            questions.append(q)
            added += 1

    clubs = dict(existing.get("clubs") or {})
    for name, meta in (incoming.get("clubs") or {}).items():
        clubs[name] = _merge_club(clubs.get(name), meta)

    payload = {
        "version": max(int(existing.get("version") or 1), int(incoming.get("version") or 1)),
        "count": len(questions),
        "clubs": clubs,
        "questions": questions,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return len(questions), added, upgraded


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw", default="lnp_myslenice.json")
    parser.add_argument("--db", default="lnp_build.db")
    parser.add_argument("--lnp-export", default="lnp_questions.json")
    parser.add_argument("--player-export", default="web/data/player-characters.json")
    parser.add_argument("--existing", default="web/data/questions.json")
    parser.add_argument("--output", default="web/data/questions.json")
    args = parser.parse_args()

    db_path = Path(args.db)
    if db_path.exists():
        db_path.unlink()
    init_db(db_path)
    with connect(db_path) as conn:
        stats = import_file(conn, args.raw)
        completed_seasons = _mark_completed_seasons(conn)
        player_count = export_player_characters(conn, args.player_export, 0.80)
        questions = _filter_conservative_historical_questions(conn, generate_all(conn, 0.80))
        conn.execute("UPDATE question_bank SET enabled=0")
        saved = save_questions(conn, questions)
        exported = export_questions(conn, args.lnp_export, 0.80)
    print("LNP_IMPORT", json.dumps(stats, ensure_ascii=False, sort_keys=True))
    print("LNP_COMPLETED_SEASONS", json.dumps(completed_seasons, ensure_ascii=False))
    print("LNP_PLAYER_CHARACTERS", player_count)
    print("LNP_QUESTIONS", saved, "EXPORTED", exported)

    total, added, upgraded = merge_exports(
        Path(args.existing), Path(args.lnp_export), Path(args.output)
    )
    print("MERGED_QUESTIONS", total, "ADDED", added, "UPGRADED", upgraded)


if __name__ == "__main__":
    main()
