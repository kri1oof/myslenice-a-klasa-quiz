from types import SimpleNamespace

from myslenice_quiz.db import connect, init_db, get_or_create_club, get_or_create_player, get_or_create_season
from myslenice_quiz.ingest.common import RosterMembershipRecord, PlayerSeasonStatRecord, save_roster_memberships, save_player_stats, upsert_source
from myslenice_quiz.ingest.futbolowo import parse_roster, parse_player_career
from myslenice_quiz.cli import cmd_repair_futbolowo_player_names


def test_roster_link_that_wraps_position_does_not_duplicate_player():
    html = '''<html><body><h1>Kadra</h1><ul>
      <li><a href="/player/123/career">Bartłomiej Idzi Obrońca / Pomocnik</a></li>
    </ul></body></html>'''
    rows, complete = parse_roster(html, "2021/22", "Dziecanovia Dziekanowice")
    assert complete is False
    assert len(rows) == 1
    assert rows[0].player == "Bartłomiej Idzi"
    assert rows[0].role == "Obrońca / Pomocnik"
    assert rows[0].external_key == "futbolowo:player:123"


def test_career_heading_position_is_metadata_not_name():
    html = '''<html><body><h1>Bartłomiej Idzi Obrońca / Pomocnik</h1><table>
      <tr><td>2021 / 2022</td><td>Dziecanovia Dziekanowice Pierwsza drużyna</td><td>20</td><td>3</td></tr>
    </table></body></html>'''
    rows = parse_player_career(html, expected_player="Bartłomiej Idzi")
    assert len(rows) == 1
    assert rows[0].player == "Bartłomiej Idzi"
    assert rows[0].appearances == 20
    assert rows[0].goals == 3


def test_repair_merges_role_suffixed_player_and_stats(tmp_path):
    db = tmp_path / "quiz.db"
    init_db(str(db))
    with connect(str(db)) as conn:
        source = upsert_source(conn, "futbolowo", "https://example.test/roster", "x")
        # Existing clean identity from match protocol.
        clean_id = get_or_create_player(conn, "Bartłomiej Idzi")
        # Dirty identity from old roster parser, carrying the stable Futbolowo id.
        dirty_id = get_or_create_player(conn, "Bartłomiej Idzi Obrońca / Pomocnik", "futbolowo:player:123")
        season_id = get_or_create_season(conn, "2021/22")
        club_id = get_or_create_club(conn, "Dziecanovia Dziekanowice")
        conn.execute("INSERT INTO player_roster_memberships(season_id,club_id,player_id,role,confidence) VALUES(?,?,?,?,?)", (season_id, club_id, dirty_id, "Obrońca / Pomocnik", .8))
        conn.execute("INSERT INTO player_roster_membership_evidence(season_id,club_id,player_id,source_id,confidence) VALUES(?,?,?,?,?)", (season_id, club_id, dirty_id, source, .8))
        save_player_stats(conn, [PlayerSeasonStatRecord(season="2021/22", club="Dziecanovia Dziekanowice", player="Bartłomiej Idzi Obrońca / Pomocnik", appearances=20, goals=3, confidence=.84)], source)
    cmd_repair_futbolowo_player_names(SimpleNamespace(db=str(db)))
    with connect(str(db)) as conn:
        players = conn.execute("SELECT id,display_name,external_key FROM players WHERE normalized_name LIKE 'bartlomiej idzi%'").fetchall()
        assert len(players) == 1
        assert players[0]["display_name"] == "Bartłomiej Idzi"
        assert players[0]["external_key"] == "futbolowo:player:123"
        stats = conn.execute("SELECT appearances,goals FROM player_season_stats WHERE player_id=?", (players[0]["id"],)).fetchone()
        assert (stats["appearances"], stats["goals"]) == (20, 3)
        roster = conn.execute("SELECT role FROM player_roster_memberships WHERE player_id=?", (players[0]["id"],)).fetchone()
        assert roster["role"] == "Obrońca / Pomocnik"
