from myslenice_quiz.ingest.futbolowo import parse_player_career


def test_parse_player_career_totals():
    html = '''<html><body><h1>Sylwester Łyżczarz</h1><table>
      <tr><th>Sezon</th><th>Kluby</th><th>Mecze</th><th>Bramki</th><th>Asysty</th></tr>
      <tr><td>21 / 22 2021 / 2022</td><td>Dziecanovia Dziekanowice Pierwsza drużyna</td><td>26</td><td>13</td><td>0</td></tr>
      <tr><td>20 / 21 2020 / 2021</td><td>Inny Klub Pierwsza drużyna</td><td>18</td><td>4</td><td>1</td></tr>
    </table></body></html>'''
    rows = parse_player_career(html)
    assert len(rows) == 2
    assert rows[0].season == '2021/22'
    assert rows[0].club == 'Dziecanovia Dziekanowice'
    assert rows[0].player == 'Sylwester Łyżczarz'
    assert rows[0].appearances == 26
    assert rows[0].goals == 13
