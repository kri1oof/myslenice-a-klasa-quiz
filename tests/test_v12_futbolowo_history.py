from myslenice_quiz.ingest.futbolowo import parse_club_history_seasons


def test_parse_club_history_seasons_only_a_class():
    html = '''<html><body>
    Puchar Polski - PPN Myślenice Sezon 2022/23
    A Klasa - Podokręg Myślenice Sezon 2021/2022
    A Klasa - Podokręg Myślenice Sezon 2019/2020
    Klasa Okręgowa Kraków III Sezon 2023/24
    A Klasa - Podokręg Myślenice Sezon 2021/2022
    </body></html>'''
    assert parse_club_history_seasons(html) == ['2021/22', '2019/20']
