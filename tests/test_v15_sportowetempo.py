from myslenice_quiz.ingest.sportowetempo import parse_report, parse_season


def test_sportowetempo_season_parses_table_schedule_dates_and_walkover():
    html = '''
    <html><body>
    <table>
      <tr><th>lp</th><th>klub</th><th>M</th><th>PKT</th><th>BR</th><th>Z</th><th>R</th><th>P</th></tr>
      <tr><td>1</td><td>Hejnał Krzyszkowice</td><td>26</td><td>65</td><td>76-27</td><td>21</td><td>2</td><td>3</td></tr>
      <tr><td>2</td><td>Tempo Rzeszotary</td><td>26</td><td>54</td><td>64-41</td><td>17</td><td>3</td><td>6</td></tr>
    </table>
    <div>1. kolejka 15-16 sierpnia 2009</div>
    <div>Topór Tenczyn</div><div>1-2</div><div>Hejnał Krzyszkowice</div><div>15 sierpnia, 16:00</div>
    <div>2. kolejka 23 sierpnia 2009</div>
    <div>Tempo Rzeszotary</div><div>0-3</div><div>Pasternik Ochojno</div><div>28 kwietnia, 16:30</div><div>Na boisku 2-2, po weryfikacji 0-3 w.o.</div>
    <a href="/pn_malopolska_a_klasa_myslenice/relacja/123_test">relacja</a>
    </body></html>'''
    matches, table, reports = parse_season(html, '2009/10', 'https://www.sportowetempo.pl/pn_malopolska_a_klasa_myslenice/50')
    assert len(table) == 2
    assert table[0].club == 'Hejnał Krzyszkowice' and table[0].points == 65
    assert len(matches) == 2
    assert matches[0].round_no == 1 and matches[0].date == '2009-08-15 16:00'
    assert matches[1].round_no == 2 and matches[1].date == '2010-04-28 16:30'
    assert matches[1].status == 'walkover'
    assert reports == ['https://www.sportowetempo.pl/pn_malopolska_a_klasa_myslenice/relacja/123_test']


def test_sportowetempo_report_parses_goal_events_and_safe_full_names():
    html = '''<html><body>
    <h3>Orzeł Myślenice - Pasternik Ochojno 3-1 (2-1)</h3>
    <p>1-0 Mateusz Biela 3</p><p>1-1 ??</p><p>2-1 Łukasz Święch 40</p><p>3-1 Mateusz Mistarz 63</p>
    <p>ORZEŁ: Jan Pajka, Piotr Ferlak (46 Adam Lesiński), Kowalski.</p>
    </body></html>'''
    matches, goals, apps = parse_report(html, '2009/10')
    assert matches[0].home == 'Orzeł Myślenice' and matches[0].away_goals == 1
    assert [g.scorer for g in goals] == ['Mateusz Biela', None, 'Łukasz Święch', 'Mateusz Mistarz']
    assert [g.minute for g in goals] == [3, None, 40, 63]
    names = {a.player for a in apps}
    assert 'Jan Pajka' in names and 'Piotr Ferlak' in names and 'Adam Lesiński' in names
    assert 'Kowalski' not in names


def test_sportowetempo_report_parses_summary_when_only_one_team_scores():
    html = '''<html><body><h3>Iskra Brzączowice - LKS Rudnik 0-5 (0-1)</h3>
    <p>Gole: Marcin Filipek 3, Tomasz Klimczyk, Piotr Gancarczyk</p></body></html>'''
    matches, goals, _ = parse_report(html, '2011/12')
    assert len(goals) == 5
    assert all(g.club == 'LKS Rudnik' for g in goals)
    assert [g.scorer for g in goals].count('Marcin Filipek') == 3
