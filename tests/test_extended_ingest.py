from pathlib import Path
from myslenice_quiz.ingest import futbolowo, ktowygral

FIX = Path(__file__).parent / "fixtures"


def test_futbolowo_schedule_dates_rounds_and_detail_links():
    html = (FIX / "futbolowo_schedule.html").read_text(encoding="utf-8")
    matches, links = futbolowo.parse_schedule(html, "2021/22")
    assert len(matches) == 3
    assert matches[0].round_no == 1
    assert matches[0].date == "2021-08-07 18:00"
    assert matches[0].home == "Dziecanovia Dziekanowice"
    assert matches[0].away == "Clavia Świątniki Górne"
    assert (matches[0].home_goals, matches[0].away_goals) == (4, 4)
    assert any("/game/1001" in x for x in links)
    assert matches[2].round_no == 2


def test_futbolowo_match_goals_and_lineups():
    html = (FIX / "futbolowo_match.html").read_text(encoding="utf-8")
    matches, goals, appearances = futbolowo.parse_match(html, "2021/22")
    assert len(matches) == 1
    assert matches[0].date == "2022-05-07 17:00"
    assert len(goals) == 2
    assert goals[0].scorer == "Sylwester Łyżczarz"
    assert [g.minute for g in goals] == [26, 48]
    assert any(x.player == "Sylwester Łyżczarz" and x.starter and x.is_captain and x.shirt_number == 10 for x in appearances)
    assert any(x.player == "Piotr Rezerwowy" and x.starter is False and x.entered_minute == 65 for x in appearances)


def test_ktowygral_short_labels_use_team_slug_identity():
    html = (FIX / "ktowygral_table.html").read_text(encoding="utf-8")
    rows = ktowygral.parse_standings(html, "2007/08")
    assert [x.club for x in rows] == ["Raba Dobczyce", "Orzeł Myślenice"]


def test_futbolowo_club_assets_from_profile_links_and_images():
    html = '''<html><body>
      <a href="/club/5058">Clavia Świątniki Górne</a>
      <img alt="Clavia Świątniki Górne" src="https://static.futbolowo.pl/assets/clavia.png">
      <a href="/game/1042581">3:0</a>
    </body></html>'''
    assets = futbolowo.parse_club_assets(html, "https://dziecanovia.futbolowo.pl/schedule/x")
    clavia = next(x for x in assets if x.club == "Clavia Świątniki Górne")
    assert clavia.crest_source_url == "https://dziecanovia.futbolowo.pl/club/5058"
    assert clavia.crest_remote_url == "https://static.futbolowo.pl/assets/clavia.png"
    matches, links = futbolowo.parse_schedule('''<table><tr><td>07.08.2021</td><td>18:00</td><td>A Klub</td><td>1:0</td><td>B Klub</td></tr></table><a href="/game/1042581">szczegóły</a>''', "2021/22", "https://dziecanovia.futbolowo.pl/schedule/x")
    assert "https://dziecanovia.futbolowo.pl/game/1042581" in links


def test_regionalny_does_not_parse_h2h_goal_balance_as_match():
    from myslenice_quiz.ingest import regionalny
    html = '''<html><body>
    <table>
      <tr><th>M.</th><th>Drużyna</th><th>M</th><th>PKT</th><th>Z</th><th>R</th><th>P</th><th>Bramki</th><th>M</th><th>PKT</th><th>Z</th><th>R</th><th>P</th><th>Bramki</th></tr>
      <tr><td>2.</td><td>Pasternik Ochojno</td><td>30</td><td>62</td><td>19</td><td>5</td><td>6</td><td>79 - 37</td><td>2</td><td>4</td><td>1</td><td>1</td><td>0</td><td>2 - 0</td></tr>
    </table>
    <table>
      <tr><td>Kolejka 1</td></tr>
      <tr><td>Staw Polanka</td><td>3 - 0</td><td>Pasternik Ochojno</td><td>7 sierpnia 2021 16:00</td></tr>
    </table>
    </body></html>'''
    matches, standings = regionalny.parse_page(html, "2021/22")
    assert len(matches) == 1
    assert matches[0].home == "Staw Polanka"
    assert matches[0].away == "Pasternik Ochojno"
    assert matches[0].round_no == 1


def test_match_team_coverage_schema_and_rebuild(tmp_path):
    from myslenice_quiz.db import init_db, connect
    from myslenice_quiz.ingest.common import save_matches, save_goals, save_appearances, upsert_source, MatchRecord, GoalRecord, AppearanceRecord
    from myslenice_quiz.cli import cmd_rebuild_team_coverage
    from types import SimpleNamespace
    db = tmp_path / "q.db"
    init_db(str(db))
    with connect(str(db)) as conn:
        sid = upsert_source(conn, "test", "https://example.test/m", "x")
        save_matches(conn, [MatchRecord(season="2021/22", round_no=1, home="A", away="B", home_goals=2, away_goals=1, confidence=.9)], sid)
        save_goals(conn, [
            GoalRecord(season="2021/22", home="A", away="B", club="A", scorer="Jan A", minute=10, confidence=.9),
            GoalRecord(season="2021/22", home="A", away="B", club="A", scorer="Jan B", minute=20, confidence=.9),
            GoalRecord(season="2021/22", home="A", away="B", club="B", scorer=None, minute=30, confidence=.9),
        ], sid)
        apps=[]
        for i in range(11):
            apps.append(AppearanceRecord(season="2021/22", home="A", away="B", club="A", player=f"Player A{i}", starter=True, confidence=.9))
        save_appearances(conn, apps, sid)
    cmd_rebuild_team_coverage(SimpleNamespace(db=str(db), season="2021/22"))
    with connect(str(db)) as conn:
        vals={(r[0],r[1],r[2]) for r in conn.execute("SELECT c.name,mtc.dataset,mtc.is_complete FROM match_team_coverage mtc JOIN clubs c ON c.id=mtc.club_id")}
    assert ("A","scorers",1) in vals
    assert ("A","starters",1) in vals
    assert ("B","scorers",0) in vals
