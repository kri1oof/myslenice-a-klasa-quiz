import sqlite3
from myslenice_quiz.ingest.futbolowo import parse_roster
from myslenice_quiz.db import get_or_create_player


def test_roster_positions_are_merged_and_never_auto_complete():
    html = '''<html><body><h1>Kadra</h1><ul>
      <li><a href="/player/101/career">Piotr Drożdżowski</a> Bramkarz</li>
      <li><a href="/player/102/career">Hubert Pańtak</a> Obrońca / Pomocnik</li>
    </ul></body></html>'''
    rows, complete = parse_roster(html, "2021/22", "Dziecanovia Dziekanowice")
    assert complete is False
    by_name = {r.player: r for r in rows}
    assert by_name["Piotr Drożdżowski"].role == "Bramkarz"
    assert by_name["Hubert Pańtak"].role == "Obrońca / Pomocnik"


def test_external_key_attaches_to_existing_name_only_player():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript('''
      CREATE TABLE players(id INTEGER PRIMARY KEY, display_name TEXT NOT NULL, normalized_name TEXT NOT NULL, birth_date TEXT, external_key TEXT, UNIQUE(normalized_name,birth_date,external_key));
      CREATE TABLE player_aliases(id INTEGER PRIMARY KEY, player_id INTEGER NOT NULL, alias TEXT NOT NULL, normalized_alias TEXT NOT NULL, UNIQUE(player_id,normalized_alias));
    ''')
    first = get_or_create_player(conn, "Jan Kowalski")
    second = get_or_create_player(conn, "Jan Kowalski", "futbolowo:player:123")
    assert first == second
    assert conn.execute("SELECT external_key FROM players WHERE id=?", (first,)).fetchone()[0] == "futbolowo:player:123"
