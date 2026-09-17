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


def merge_exports(existing_path: Path, lnp_path: Path, output_path: Path) -> tuple[int, int, int]:
    existing = json.loads(existing_path.read_text(encoding="utf-8"))
    incoming = json.loads(lnp_path.read_text(encoding="utf-8"))
    questions = list(existing.get("questions") or [])
    index = {_key(q): i for i, q in enumerate(questions)}
    added = upgraded = 0

    for q in incoming.get("questions") or []:
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
    parser.add_argument("--existing", default="web/data/questions.json")
    parser.add_argument("--output", default="web/data/questions.json")
    args = parser.parse_args()

    db_path = Path(args.db)
    if db_path.exists():
        db_path.unlink()
    init_db(db_path)
    with connect(db_path) as conn:
        stats = import_file(conn, args.raw)
        questions = generate_all(conn, 0.80)
        conn.execute("UPDATE question_bank SET enabled=0")
        saved = save_questions(conn, questions)
        exported = export_questions(conn, args.lnp_export, 0.80)
    print("LNP_IMPORT", json.dumps(stats, ensure_ascii=False, sort_keys=True))
    print("LNP_QUESTIONS", saved, "EXPORTED", exported)

    total, added, upgraded = merge_exports(
        Path(args.existing), Path(args.lnp_export), Path(args.output)
    )
    print("MERGED_QUESTIONS", total, "ADDED", added, "UPGRADED", upgraded)


if __name__ == "__main__":
    main()
