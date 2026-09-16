from __future__ import annotations

import re
from bs4 import BeautifulSoup

from .common import ClubSeasonStatRecord, MatchRecord

SCORE_RE = re.compile(r"^(\d+)\s*[-:]\s*(\d+)(?:\s*\((\d+)\s*[-:]\s*(\d+)\))?.*$")
ROUND_RE = re.compile(r"(?:Kolejka|kolejka)\s*(\d+)")


def _clean(value: str) -> str:
    return " ".join(value.replace("\xa0", " ").split())


def parse_league(html: str, season: str) -> tuple[list[MatchRecord], list[ClubSeasonStatRecord]]:
    """Conservative parser for 90minut league pages.

    90minut historically changes markup. This parser looks for rows that visibly contain
    two clubs and a score and separately reads conventional standings rows.
    """
    soup = BeautifulSoup(html, "html.parser")
    matches: list[MatchRecord] = []
    standings: list[ClubSeasonStatRecord] = []
    current_round: int | None = None

    for node in soup.find_all(string=ROUND_RE):
        m = ROUND_RE.search(_clean(str(node)))
        if m:
            current_round = int(m.group(1))
        parent = node.parent
        # scan next rows near the heading
        for tr in parent.find_all_next("tr", limit=20):
            cells = [_clean(td.get_text(" ", strip=True)) for td in tr.find_all("td")]
            if len(cells) < 3:
                continue
            score_idx = next((i for i, c in enumerate(cells) if SCORE_RE.match(c)), None)
            if score_idx is None or score_idx == 0 or score_idx >= len(cells) - 1:
                continue
            score = SCORE_RE.match(cells[score_idx])
            home = cells[score_idx - 1]
            away = cells[score_idx + 1]
            if not home or not away or home.isdigit() or away.isdigit():
                continue
            matches.append(MatchRecord(
                season=season,
                round_no=current_round,
                home=home,
                away=away,
                home_goals=int(score.group(1)),
                away_goals=int(score.group(2)),
                home_ht=int(score.group(3)) if score.group(3) else None,
                away_ht=int(score.group(4)) if score.group(4) else None,
                confidence=0.92,
            ))

    for tr in soup.find_all("tr"):
        cells = [_clean(td.get_text(" ", strip=True)) for td in tr.find_all("td")]
        if len(cells) < 8 or not cells[0].rstrip(".").isdigit():
            continue
        # Common 90minut table variants can differ; accept only clearly numeric rows.
        numeric = [re.sub(r"\D", "", c) for c in cells[2:7]]
        if not all(x.isdigit() for x in numeric if x):
            continue
        goals = next((re.match(r"(\d+)\s*[-:]\s*(\d+)", c) for c in cells if re.match(r"(\d+)\s*[-:]\s*(\d+)", c)), None)
        if goals is None:
            continue
        try:
            standings.append(ClubSeasonStatRecord(
                season=season,
                club=cells[1],
                position=int(cells[0].rstrip(".")),
                played=int(cells[2]),
                points=int(cells[3]),
                goals_for=int(goals.group(1)),
                goals_against=int(goals.group(2)),
                confidence=0.92,
            ))
        except (ValueError, IndexError):
            continue
    # De-duplicate match rows that can be discovered more than once by nearby headings.
    unique: dict[tuple, MatchRecord] = {}
    for rec in matches:
        key = (rec.round_no, rec.home, rec.away, rec.home_goals, rec.away_goals)
        unique[key] = rec
    return list(unique.values()), standings


CLUB_HISTORY_RE = re.compile(
    r"(?P<season>20\d{2}/\d{2})\s*-\s*(?:Keeza\s+)?Klasa\s+A\s+20\d{2}/20\d{2},\s*grupa:\s*(?P<group>[^\n\r]+)",
    re.I,
)

def parse_club_history(html: str) -> tuple[str | None, list[str]]:
    """Return club name and seasons where the club played in the Myślenice A-class.

    This intentionally accepts historical group labels such as ``Kraków IV - Myślenice``
    and ``Kraków IV (Myślenice)`` but rejects cups and other A-class groups.
    """
    soup = BeautifulSoup(html, "html.parser")
    club: str | None = None
    if soup.title:
        title = _clean(soup.title.get_text(" ", strip=True))
        m = re.search(r"Skarb\s*-\s*(.+)$", title, re.I)
        if m:
            club = _clean(m.group(1))
    if not club:
        h = soup.find(["h1", "h2"] )
        if h:
            club = _clean(h.get_text(" ", strip=True))

    text = soup.get_text("\n", strip=True)
    seasons: set[str] = set()
    for m in CLUB_HISTORY_RE.finditer(text):
        group = _clean(m.group("group"))
        if "myślenice" not in group.lower() and "myslenice" not in group.lower():
            continue
        seasons.add(m.group("season"))
    return club, sorted(seasons, key=lambda x: int(x.split('/')[0]))

from urllib.parse import urljoin

SEASON_LABEL_RE = re.compile(r"(20\d{2})/(\d{2})")


def discover_myslenice_league_links(html: str, base_url: str) -> dict[str, str]:
    """Discover 90minut league-page URLs for Myślenice A-class seasons from a club page.

    The club pages expose historical competitions as links.  We only accept links whose
    surrounding visible text explicitly says Klasa A and Myślenice, so cups/barazes and
    neighbouring A-class groups are ignored.
    """
    soup = BeautifulSoup(html, "html.parser")
    found: dict[str, str] = {}
    for a in soup.find_all("a", href=True):
        href = a.get("href", "")
        if "liga" not in href.lower():
            continue
        # The group label is sometimes in the anchor and sometimes in the parent row.
        context = _clean((a.parent.get_text(" ", strip=True) if a.parent else a.get_text(" ", strip=True)))
        low = normalize_ascii(context)
        if "klasa a" not in low or "myslenice" not in low:
            continue
        sm = SEASON_LABEL_RE.search(context)
        if not sm:
            # Fall back to anchor text itself.
            sm = SEASON_LABEL_RE.search(_clean(a.get_text(" ", strip=True)))
        if not sm:
            continue
        season = f"{sm.group(1)}/{sm.group(2)}"
        found.setdefault(season, urljoin(base_url, href))
    return found


def discover_club_profile_links(html: str, base_url: str) -> dict[str, str]:
    """Return visible club names -> 90minut club profile URLs from a league page."""
    soup = BeautifulSoup(html, "html.parser")
    found: dict[str, str] = {}
    for a in soup.find_all("a", href=True):
        href = a.get("href", "")
        if "skarb.php" not in href or "id_klub=" not in href:
            continue
        name = _clean(a.get_text(" ", strip=True))
        if not name or len(name) < 2:
            continue
        # Ignore navigation labels that can also point to skarb.php.
        if normalize_ascii(name) in {"skarb", "klub", "mecze", "liga"}:
            continue
        found.setdefault(name, urljoin(base_url, href))
    return found


def normalize_ascii(value: str) -> str:
    import unicodedata
    value = unicodedata.normalize("NFKD", value.lower())
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    return " ".join(value.replace("ł", "l").split())
