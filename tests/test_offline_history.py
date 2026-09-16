from pathlib import Path
from myslenice_quiz.db import connect, init_db
from myslenice_quiz.ingest.offline_history import read_memberships, import_memberships


def test_offline_history_seed_import(tmp_path: Path):
    db = tmp_path / "q.db"
    csv_path = tmp_path / "seed.csv"
    csv_path.write_text(
        "season,club,source_name,source_url,confidence,notes\n"
        "2002/03,Test Club,archive-index,https://example.test/club,0.9,verified positive membership\n",
        encoding="utf-8",
    )
    init_db(db)
    records = read_memberships(csv_path)
    with connect(db) as conn:
        imported, sources = import_memberships(conn, records)
        assert imported == 1
        assert sources == 1
        row = conn.execute(
            """SELECT s.label,c.name,csm.confidence FROM club_season_memberships csm
               JOIN seasons s ON s.id=csm.season_id JOIN clubs c ON c.id=csm.club_id"""
        ).fetchone()
        assert row[0] == "2002/03"
        assert row[1] == "Test Club"
        assert abs(row[2]-0.9) < 1e-9
