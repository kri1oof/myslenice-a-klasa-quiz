from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Allow running this helper directly from a fresh PowerShell session, even when
# the project has not yet been installed into the currently active interpreter.
ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from myslenice_quiz.db import connect, init_db
from myslenice_quiz.social_context import (
    audit_context,
    import_context_seed,
    import_social_pages,
    read_context_seed,
    read_social_pages,
)


def _fact_paths(explicit: list[str] | None) -> list[Path]:
    if explicit:
        return [Path(value) for value in explicit]
    # Keep the original seed file and allow season/source-specific supplements,
    # e.g. match_context_seed_2019_20_futmal.csv. This makes verified research
    # easy to extend without rewriting one ever-growing CSV.
    return sorted(Path("data/reference").glob("match_context_seed*.csv"))


def main() -> None:
    parser = argparse.ArgumentParser(description="Import verified club social pages and match-context facts")
    parser.add_argument("--db", default="data/quiz.db")
    parser.add_argument("--pages", default="data/reference/club_social_pages.csv")
    parser.add_argument("--facts", action="append", help="CSV z faktami; można podać wielokrotnie. Bez opcji importowane są match_context_seed*.csv")
    parser.add_argument("--audit-only", action="store_true")
    args = parser.parse_args()

    init_db(args.db)
    with connect(args.db) as conn:
        if not args.audit_only:
            pages_path = Path(args.pages)
            pages = import_social_pages(conn, read_social_pages(pages_path)) if pages_path.exists() else 0

            linked_total = facts_total = skipped_total = 0
            fact_files = [path for path in _fact_paths(args.facts) if path.exists()]
            for facts_path in fact_files:
                linked, facts, skipped = import_context_seed(conn, read_context_seed(facts_path))
                linked_total += linked
                facts_total += facts
                skipped_total += skipped
                print(f"  fakty: {facts_path} -> linki={linked}, fakty={facts}, pominięte={skipped}")

            print(
                f"Social/context import: strony={pages}, pliki_faktów={len(fact_files)}, "
                f"linki={linked_total}, fakty={facts_total}, pominięte={skipped_total}"
            )

        rows = audit_context(conn)
        if not rows:
            print("Brak zweryfikowanego kontekstu przypiętego do meczów.")
            return
        print("SEZON | MECZ | POSTY | FAKTY | TYPY")
        for row in rows:
            print(f"{row['season']:9} | {row['home']} - {row['away']} | {row['posts']:5} | {row['facts']:5} | {row['fact_types'] or '-'}")


if __name__ == "__main__":
    main()
