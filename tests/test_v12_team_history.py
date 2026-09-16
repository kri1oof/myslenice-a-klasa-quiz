from myslenice_quiz.ingest.ktowygral import parse_team_history_profile


def test_parse_team_history_profile_filters_other_leagues():
    html = '''<html><body>
    <div>2025/2026 Klasa A Myślenice Mecze:26 Punkty:31 Bramki 51 - 52</div>
    <div>2024/2025 Klasa A Myślenice 3.Miejsce 58pkt Mecze:28 Bramki:67:25</div>
    <div>2023/2024 Klasa Okręgowa Kraków III Mecze:26 Punkty:7 Bramki 20 - 92</div>
    <div>2006/2007 Klasa A Kraków IV (Myślenice) Mecze:26 Punkty:29 Bramki 35 - 51</div>
    <div>2005/2006 Klasa B Myślenice Mecze:22 Punkty:42 Bramki 68 - 38</div>
    </body></html>'''
    rows = parse_team_history_profile(html, 'Beskid Tokarnia')
    assert [r.season for r in rows] == ['2025/26', '2024/25', '2006/07']
    assert rows[0].played == 26 and rows[0].points == 31
    assert rows[0].goals_for == 51 and rows[0].goals_against == 52
    assert rows[1].position == 3 and rows[1].points == 58
    assert rows[2].played == 26
