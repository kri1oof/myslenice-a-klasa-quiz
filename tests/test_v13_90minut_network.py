from pathlib import Path

from myslenice_quiz.ingest.ninetyminut import discover_myslenice_league_links, discover_club_profile_links
from myslenice_quiz.normalize import canonical_club_name


def test_discover_myslenice_league_links_only_target_group():
    html = '''
    <table>
      <tr><td>2002/03 - <a href="/liga/0/liga123.html">Klasa A 2002/2003</a>, grupa: Kraków IV - Myślenice</td></tr>
      <tr><td>2003/04 - <a href="liga/0/liga456.html">Klasa A 2003/2004</a>, grupa: Kraków IV - Myślenice</td></tr>
      <tr><td>2003/04 - <a href="/liga/0/liga999.html">Puchar Polski 2003/2004</a>, grupa: Myślenice</td></tr>
      <tr><td>2004/05 - <a href="/liga/0/liga777.html">Klasa A 2004/2005</a>, grupa: Wieliczka</td></tr>
    </table>'''
    found = discover_myslenice_league_links(html, "https://www.90minut.pl/skarb.php?id_klub=1")
    assert found == {
        "2002/03": "https://www.90minut.pl/liga/0/liga123.html",
        "2003/04": "https://www.90minut.pl/liga/0/liga456.html",
    }


def test_discover_club_profiles_from_league_page():
    html = '''<table><tr><td>1.</td><td><a href="/skarb.php?id_klub=3610&id_sezon=75">Pasternik Ochojno</a></td></tr>
    <tr><td>2.</td><td><a href="skarb.php?id_klub=3611&id_sezon=75">Pcimianka Pcim</a></td></tr></table>'''
    found = discover_club_profile_links(html, "https://www.90minut.pl/liga/0/liga1.html")
    assert found["Pasternik Ochojno"].startswith("https://www.90minut.pl/")
    assert found["Pcimianka Pcim"].startswith("https://www.90minut.pl/")


def test_jordan_alias_is_canonicalized():
    assert canonical_club_name("JORDAN ZAKLICZYN") == "Jordan Sum Zakliczyn"
    assert canonical_club_name("Jordan Sum Zakliczyn") == "Jordan Sum Zakliczyn"
