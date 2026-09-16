from __future__ import annotations

import argparse
from pathlib import Path

from myslenice_quiz.db import connect, init_db
from myslenice_quiz.social_context import (
    audit_context,
    import_context_seed,
    import_social_pages,
    read_context_seed,
    read_social_pages,
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Import verified club social pages and match-context facts")
    parser.add_argument("--db", default="data/quiz.db")
    parser.add_argument("--pages", default="data/reference/club_social_pages.csv")
    parser.add_argument("--facts", default="data/reference/match_context_seed.csv")
    parser.add_argument("--audit-only", action="store_true")
    args = parser.parse_args()

    init_db(args.db)
    with connect(args.db) as conn:
        if not args.audit_only:
            pages_path = Path(args.pages)
            facts_path = Path(args.facts)
            pages = import_social_pages(conn, read_social_pages(pages_path)) if pages_path.exists() else 0
            linked, facts, skipped = import_context_seed(conn, read_context_seed(facts_path)) if facts_path.exists() else (0, 0, 0)
            print(f"Social/context import: strony={pages}, linki={linked}, fakty={facts}, pominięte={skipped}")

        rows = audit_context(conn)
        if not rows:
            print("Brak zweryfikowanego kontekstu przypiętego do meczów.")
            return
        print("SEZON | MECZ | POSTY | FAKTY | TYPY")
        for row in rows:
            print(f"{row['season']:9} | {row['home']} - {row['away']} | {row['posts']:5} | {row['facts']:5} | {row['fact_types'] or '-'}")


if __name__ == "__main__":
    main()
