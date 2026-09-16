from myslenice_quiz.ingest.futbolowo import parse_roster_page_season


def test_roster_page_season_from_title():
    html = '<html><head><title>Kadra Beskid Tokarnia w 2022/2023</title></head><body><h1>Kadra</h1></body></html>'
    assert parse_roster_page_season(html) == '2022/23'


def test_roster_page_season_rejects_unrelated_selector_season():
    html = '<html><head><title>Kadra</title></head><body><h1>Kadra</h1><div>Wybierz sezon 2021/2022</div></body></html>'
    assert parse_roster_page_season(html) is None


def test_roster_page_season_from_heading():
    html = '<html><body><h1>Kadra Dziecanovia Dziekanowice w 2021/2022</h1></body></html>'
    assert parse_roster_page_season(html) == '2021/22'
