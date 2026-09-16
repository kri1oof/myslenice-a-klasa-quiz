from __future__ import annotations

from datetime import datetime
import re
from bs4 import BeautifulSoup

from .common import ClubSeasonStatRecord, MatchRecord

ROUND_RE = re.compile(r"Kolejka\s+(\d+)", re.I)
SCORE_RE = re.compile(r"^(\d+)\s*[-:]\s*(\d+)(?:\s*\*|\s*wo)?$", re.I)
DATE_RE = re.compile(r"(\d{1,2})\s+([A-Za-ząćęłńóśźżĄĆĘŁŃÓŚŹŻ]+)\s+(\d{4})(?:.*?(\d{1,2}:\d{2}))?", re.I)
GOALS_RE = re.compile(r"(\d+)\s*[-:]\s*(\d+)")

MONTHS = {
    "stycznia": 1, "lutego": 2, "marca": 3, "kwietnia": 4, "maja": 5, "czerwca": 6,
    "lipca": 7, "sierpnia": 8, "września": 9, "wrzesnia": 9, "października": 10,
    "pazdziernika": 10, "listopada": 11, "grudnia": 12,
}


def _clean(value: str) -> str:
    return " ".join(value.replace("\xa0", " ").split())


def _date(value: str) -> str | None:
    m = DATE_RE.search(value)
    if not m:
        return None
    day, month_name, year, hhmm = m.groups()
    month = MONTHS.get(month_name.lower())
    if not month:
        return None
    dt = datetime(int(year), month, int(day))
    return dt.strftime("%Y-%m-%d") + (f" {hhmm}" if hhmm else "")


def parse_page(html: str, season: str) -> tuple[list[MatchRecord], list[ClubSeasonStatRecord]]:
    soup = BeautifulSoup(html, "html.parser")
    matches: list[MatchRecord] = []
    standings: list[ClubSeasonStatRecord] = []

    # Standings: wide table with position, club, M, Pkt, Z, R, P, goals.
    for table in soup.find_all("table"):
        text = _clean(table.get_text(" ", strip=True)).lower()
        if "drużyna" in text or "druzyna" in text:
            for tr in table.find_all("tr"):
                cells = [_clean(x.get_text(" ", strip=True)) for x in tr.find_all(["td", "th"])]
                if len(cells) < 8:
                    continue
                pos = re.fullmatch(r"(\d+)\.?", cells[0])
                if not pos:
                    continue
                numeric = [c for c in cells[2:7] if re.fullmatch(r"\d+", c)]
                goals = next((GOALS_RE.search(c) for c in cells[2:] if GOALS_RE.search(c)), None)
                if len(numeric) < 5 or not goals:
                    continue
                played, points, wins, draws, losses = map(int, numeric[:5])
                standings.append(ClubSeasonStatRecord(
                    season=season, club=cells[1], position=int(pos.group(1)), played=played,
                    points=points, wins=wins, draws=draws, losses=losses,
                    goals_for=int(goals.group(1)), goals_against=int(goals.group(2)), confidence=0.84,
                ))

    # Schedule is rendered as table rows. Track the most recent round heading.
    current_round: int | None = None
    for tr in soup.find_all("tr"):
        cells = [_clean(x.get_text(" ", strip=True)) for x in tr.find_all(["td", "th"])]
        row_text = _clean(tr.get_text(" ", strip=True))
        rm = ROUND_RE.search(row_text)
        if rm and (len(cells) <= 2 or not any(SCORE_RE.match(c) for c in cells)):
            current_round = int(rm.group(1))
            continue

        # The league table contains a secondary H2H block whose goal balance
        # is rendered with the same ``x - y`` notation as a match score.  Rows
        # beginning with a position number and carrying many statistic columns
        # are standings rows, never schedule rows.  Older versions of this
        # parser treated a few H2H goal balances as phantom matches.
        if len(cells) >= 8 and cells and re.fullmatch(r"\d+\.?", cells[0]):
            continue

        score_idx = next((i for i, c in enumerate(cells) if SCORE_RE.match(c)), None)
        if score_idx is None or score_idx == 0 or score_idx + 1 >= len(cells):
            continue
        score = SCORE_RE.match(cells[score_idx])
        home = cells[score_idx - 1]
        away = cells[score_idx + 1]
        if not home or not away or home.lower().startswith("pauza"):
            continue
        date_text = " ".join(cells[score_idx + 2:])
        parsed_date = _date(date_text)
        # Before the first round heading, a score-like value cannot be a league
        # fixture unless the row itself carries a calendar date.
        if current_round is None and parsed_date is None:
            continue
        matches.append(MatchRecord(
            season=season,
            round_no=current_round,
            home=home,
            away=away,
            home_goals=int(score.group(1)),
            away_goals=int(score.group(2)),
            date=parsed_date,
            confidence=0.84,
        ))

    # Some Regionalny pages use divs rather than rows. Fall back to text lines
    # in the exact visual order: "home | score | away | date".
    if not matches:
        lines = [_clean(x) for x in soup.stripped_strings if _clean(x)]
        current_round = None
        for i, token in enumerate(lines):
            rm = ROUND_RE.fullmatch(token)
            if rm:
                current_round = int(rm.group(1))
                continue
            sm = SCORE_RE.fullmatch(token)
            if not sm or i < 1 or i + 1 >= len(lines):
                continue
            home, away = lines[i - 1], lines[i + 1]
            if home.lower().startswith("pauza"):
                continue
            following = " ".join(lines[i + 2:i + 6])
            matches.append(MatchRecord(
                season=season, round_no=current_round, home=home, away=away,
                home_goals=int(sm.group(1)), away_goals=int(sm.group(2)), date=_date(following), confidence=0.84,
            ))

    # De-duplicate because a page can contain more than one representation.
    dedup = {(m.round_no, m.home, m.away): m for m in matches}
    stat_dedup = {s.club: s for s in standings}
    return list(dedup.values()), list(stat_dedup.values())
