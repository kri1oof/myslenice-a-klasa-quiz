from myslenice_quiz.ingest.futbolowo import parse_roster
from myslenice_quiz.db import init_db, connect
from myslenice_quiz.ingest.common import save_roster_memberships, upsert_source
from myslenice_quiz.questions.generators import generate_roster_questions


def sample_roster_html():
    return '''
    <html><body><h1>Kadra</h1><ul>
      <li><a href="/player/1/career">Jan Kowalski</a> Bramkarz</li>
      <li><a href="/player/2/career">Adam Nowak</a> Obrońca / Pomocnik</li>
      <li><a href="/player/3/career">Piotr Lis</a> Obrońca</li>
      <li><a href="/player/4/career">Marek Kot</a> Pomocnik</li>
      <li><a href="/player/5/career">Karol Wilk</a> Napastnik</li>
      <li><a href="/player/6/career">Tomasz Król</a> Obrońca</li>
      <li><a href="/player/7/career">Paweł Mazur</a> Pomocnik</li>
      <li><a href="/player/8/career">Kamil Dudek</a> Napastnik</li>
    </ul></body></html>'''


def test_parse_roster_positions_and_completeness():
    records, complete = parse_roster(sample_roster_html(), "2021/22", "Test FC")
    assert complete is False
    assert len(records) == 8
    assert records[0].player == "Jan Kowalski"
    assert records[0].role == "Bramkarz"
    assert records[1].role == "Obrońca / Pomocnik"
    assert records[0].external_key == "futbolowo:player:1"


def test_save_roster_memberships_marks_club_coverage(tmp_path):
    db = tmp_path / "q.db"
    init_db(db)
    records, complete = parse_roster(sample_roster_html(), "2021/22", "Test FC")
    with connect(db) as conn:
        sid = upsert_source(conn, "futbolowo", "https://example.test/roster", sample_roster_html())
        assert save_roster_memberships(conn, records, sid, mark_complete=complete) == 8
        count = conn.execute("SELECT COUNT(*) FROM player_roster_memberships").fetchone()[0]
        cov = conn.execute("SELECT is_complete FROM club_season_coverage WHERE dataset='roster'").fetchone()
        assert count == 8
        assert cov is None
