from pathlib import Path
from myslenice_quiz.ingest.mzpn import parse_schedule, parse_standings

FIX = Path(__file__).parent / "fixtures"


def test_parse_schedule():
    html = (FIX / "mzpn_schedule.html").read_text(encoding="utf-8")
    rows = parse_schedule(html, "2026/27")
    assert len(rows) == 2
    assert rows[0].round_no == 2
    assert rows[0].home == "CLAVIA ŚWIĄTNIKI GÓRNE"
    assert rows[0].away == "SKALNIK TRZEMEŚNIA"
    assert (rows[0].home_goals, rows[0].away_goals) == (2, 0)
    assert (rows[0].home_ht, rows[0].away_ht) == (0, 0)


def test_parse_standings():
    html = (FIX / "mzpn_table.html").read_text(encoding="utf-8")
    rows = parse_standings(html, "2026/27")
    assert len(rows) == 2
    assert rows[0].club == "TEMPO RZESZOTARY"
    assert rows[0].points == 15
    assert rows[0].goals_for == 20
    assert rows[0].goals_against == 2
