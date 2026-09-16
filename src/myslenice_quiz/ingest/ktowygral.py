from __future__ import annotations

import re
from bs4 import BeautifulSoup

from .common import ClubSeasonStatRecord

SCORE_RE = re.compile(r"(\d+)\s*[-:]\s*(\d+)")
RECORD_RE = re.compile(r"(\d+)\s*[-–]\s*(\d+)\s*[-–]\s*(\d+)")

TEAM_SLUG_NAMES = {
    'clavia-swiatniki-gorne': 'Clavia Świątniki Górne',
    'dziecanovia-dziekanowice': 'Dziecanovia Dziekanowice',
    'beskid-tokarnia': 'Beskid Tokarnia',
    'skalnik-trzemesnia': 'Skalnik Trzemeśnia',
    'tempo-rzeszotary': 'Tempo Rzeszotary',
    'lks-rudnik-myslenice': 'LKS Rudnik',
    'lks-ii-rudnik-myslenice': 'LKS Rudnik II',
    'orzel-nowa-wies': 'Orzeł Nowa Wieś',
    'goscibia-sulkowice': 'Gościbia Sułkowice',
    'iskra-glogoczow': 'Iskra Głogoczów',
    'iskra-brzaczowice': 'Iskra Brzączowice',
    'lks-trzebunia': 'LKS Trzebunia',
    'karpaty-siepraw': 'Karpaty Siepraw',
    'grodzisko-raciechowice': 'Grodzisko Raciechowice',
    'zielonka-wrzasowice': 'Zielonka Wrząsowice',
    'lubomir-wisniowa': 'Lubomir Wiśniowa',
    'dalin-ii-myslenice': 'Dalin II Myślenice',
    'pasternik-ochojno': 'Pasternik Ochojno',
    'jordan-sum-zakliczyn': 'Jordan Sum Zakliczyn',
    'gorki-myslenice': 'Górki Myślenice',
    'sokol-borzeta': 'Sokół Borzęta',
    'staw-polanka': 'Staw Polanka',
    'topor-tenczyn': 'Topór Tenczyn',
    'hejnal-krzyszkowice': 'Hejnał Krzyszkowice',
    'szczebel-lubien': 'Szczebel Lubień',
    'wicher-stroza': 'Wicher Stróża',
    'wrzosy-osieczany': 'Wrzosy Osieczany',
    'rokita-kornatka': 'Rokita Kornatka',
    'sep-droginia': 'Sęp Droginia',
    'pcimianka-pcim': 'Pcimianka Pcim',
    'raba-dobczyce': 'Raba Dobczyce',
    'krakus-swoszowice-krakow': 'Krakus Swoszowice (Kraków)',
    'wroblowianka-wroblowice-krakow': 'Wróblowianka Wróblowice (Kraków)',
    'lks-mogilany': 'LKS Mogilany',
    'gdovia-gdow': 'Gdovia Gdów',
    'lks-libertow': 'LKS Libertów',
    'opatkowianka': 'Opatkowianka',
    'cyrhla-krzczonow': 'Cyrhla Krzczonów',
    'orzel-myslenice': 'Orzeł Myślenice',
}


def _club_name_from_cell(cell) -> str:
    text = _clean(cell.get_text(" ", strip=True))
    link = cell.find("a", href=True)
    if link:
        href = (link.get("href") or "").rstrip("/")
        parts = href.split("/")
        if "druzyna" in parts:
            try:
                slug = parts[parts.index("druzyna") + 1]
                if slug in TEAM_SLUG_NAMES:
                    return TEAM_SLUG_NAMES[slug]
            except (ValueError, IndexError):
                pass
    return text


def _clean(value: str) -> str:
    return " ".join(value.replace("\xa0", " ").split())


def parse_standings(html: str, season: str) -> list[ClubSeasonStatRecord]:
    """Parse a KtoWygral league/team standings table.

    The site exposes historical tables back to the early 2000s. We only emit
    rows that contain a position, team, matches and points, which makes the
    parser conservative across layout changes.
    """
    soup = BeautifulSoup(html, "html.parser")
    out: list[ClubSeasonStatRecord] = []
    seen: set[str] = set()
    for table in soup.find_all("table"):
        header = _clean(table.get_text(" ", strip=True)).lower()
        if "drużyna" not in header and "druzyna" not in header:
            continue
        if "pkt" not in header or "bram" not in header:
            continue
        for tr in table.find_all("tr"):
            cells = [_clean(x.get_text(" ", strip=True)) for x in tr.find_all(["td", "th"])]
            if len(cells) < 5:
                continue
            mpos = re.fullmatch(r"(\d+)\.?", cells[0])
            if not mpos:
                continue
            club = _club_name_from_cell(tr.find_all(["td", "th"])[1])
            if not club or club in seen:
                continue
            if not cells[2].isdigit() or not re.fullmatch(r"-?\d+", cells[3]):
                continue
            goals = SCORE_RE.search(cells[4])
            wins = draws = losses = None
            for cell in cells[5:]:
                rec = RECORD_RE.fullmatch(cell)
                if rec:
                    wins, draws, losses = map(int, rec.groups())
                    break
            out.append(ClubSeasonStatRecord(
                season=season,
                club=club,
                position=int(mpos.group(1)),
                played=int(cells[2]),
                points=int(cells[3]),
                wins=wins,
                draws=draws,
                losses=losses,
                goals_for=int(goals.group(1)) if goals else None,
                goals_against=int(goals.group(2)) if goals else None,
                confidence=0.82,
            ))
            seen.add(club)
    return out


def parse_team_profile_links(html: str) -> dict[str, str]:
    """Return canonical club name -> KtoWygral team profile URL from a league page."""
    from urllib.parse import urljoin
    soup = BeautifulSoup(html, "html.parser")
    out: dict[str, str] = {}
    for table in soup.find_all("table"):
        header = _clean(table.get_text(" ", strip=True)).lower()
        if ("drużyna" not in header and "druzyna" not in header) or "pkt" not in header:
            continue
        for tr in table.find_all("tr"):
            cells = tr.find_all(["td", "th"])
            if len(cells) < 2:
                continue
            club = _club_name_from_cell(cells[1])
            link = cells[1].find("a", href=True)
            if not club or not link:
                continue
            href = link.get("href") or ""
            # Remove optional /YYYY-YYYY suffix to get stable profile URL.
            href = re.sub(r"/\d{4}-\d{4}/?$", "", href)
            out[club] = urljoin("https://www.ktowygral.info", href)
    return out

TEAM_HISTORY_SEASON_RE = re.compile(r"(?P<start>20\d{2})\s*/\s*(?:(?P<end4>20\d{2})|(?P<end2>\d{2}))")


def _season_label_from_match(m: re.Match[str]) -> str:
    start = int(m.group('start'))
    if m.group('end4'):
        end2 = int(m.group('end4')) % 100
    else:
        end2 = int(m.group('end2'))
    return f"{start}/{end2:02d}"


def _is_myslenice_a_class(label: str) -> bool:
    x = _clean(label).lower()
    if 'klasa a' not in x:
        return False
    return 'myślenice' in x or 'myslenice' in x or 'kraków iv' in x or 'krakow iv' in x


def parse_team_history_profile(html: str, club: str) -> list[ClubSeasonStatRecord]:
    """Parse one KtoWygral team profile into positive A-class Myślenice season facts.

    Team profile pages are preferable to hammering one league endpoint per season:
    one polite request can expose many seasons for a club.  Absence is never used
    as evidence here; only explicit A-class Myślenice rows become records.
    """
    soup = BeautifulSoup(html, 'html.parser')
    text = _clean(soup.get_text(' ', strip=True))
    matches = list(TEAM_HISTORY_SEASON_RE.finditer(text))
    out: list[ClubSeasonStatRecord] = []
    seen: set[str] = set()
    for i, sm in enumerate(matches):
        season = _season_label_from_match(sm)
        end = matches[i + 1].start() if i + 1 < len(matches) else min(len(text), sm.end() + 320)
        chunk = _clean(text[sm.end():end])[:320]
        # League label ends before stats/current-season markers.
        league = re.split(r"(?:Aktualny sezon|\d+\.?\s*Miejsce|Mecze\s*:|Punkty\s*:|\d+\s*pkt|Bramki\s*:?)", chunk, maxsplit=1, flags=re.I)[0]
        if not _is_myslenice_a_class(league):
            continue
        if season in seen:
            continue
        seen.add(season)
        position = played = points = gf = ga = None
        pm = re.search(r"(\d+)\.?\s*Miejsce", chunk, re.I)
        mm = re.search(r"Mecze\s*:\s*(\d+)", chunk, re.I)
        psm = re.search(r"Punkty\s*:\s*(\d+)", chunk, re.I) or re.search(r"\b(\d+)\s*pkt\b", chunk, re.I)
        gm = re.search(r"Bramki\s*:?[ ]*(\d+)\s*[-:]\s*(\d+)", chunk, re.I)
        if pm: position = int(pm.group(1))
        if mm: played = int(mm.group(1))
        if psm: points = int(psm.group(1))
        if gm:
            gf, ga = int(gm.group(1)), int(gm.group(2))
        out.append(ClubSeasonStatRecord(
            season=season, club=club, position=position, played=played, points=points,
            goals_for=gf, goals_against=ga, confidence=0.84,
        ))
    return out
