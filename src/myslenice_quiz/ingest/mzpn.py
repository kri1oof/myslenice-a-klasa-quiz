from __future__ import annotations

import re
from bs4 import BeautifulSoup

from .common import ClubSeasonStatRecord, MatchRecord

ROUND_RE = re.compile(r"Kolejka\s+(\d+)", re.I)
DATE_RE = re.compile(r"(\d{1,2}\.\d{1,2}\.\d{4})(?:\s+(\d{1,2}:\d{2}))?")
TIME_RE = re.compile(r"^(\d{1,2}:\d{2})$")
SCORE_RE = re.compile(r"^(\d+)\s*:\s*(\d+)(?:\s*\((\d+)\s*:\s*(\d+)\))?$")
HT_RE = re.compile(r"^\((\d+)\s*:\s*(\d+)\)$")


def _clean(text: str) -> str:
    return " ".join(text.replace("\xa0", " ").split())


def parse_schedule(html: str, season: str) -> list[MatchRecord]:
    """Parse the visible MZPN schedule conservatively.

    MZPN has used several HTML variants. Depending on the template, a fixture can
    be exposed as either::

        DATE+TIME, HOME, "2:0 (1:0)", AWAY

    or::

        DATE, TIME, HOME, "2:0", "(1:0)", AWAY

    This parser supports both layouts and ignores fixtures without a final score.
    It never invents a result or a club name.
    """
    soup = BeautifulSoup(html, "html.parser")
    lines = [_clean(x) for x in soup.stripped_strings]
    records: list[MatchRecord] = []
    current_round: int | None = None
    i = 0

    while i < len(lines):
        round_match = ROUND_RE.fullmatch(lines[i])
        if round_match:
            current_round = int(round_match.group(1))
            i += 1
            continue

        date_match = DATE_RE.fullmatch(lines[i])
        if not (date_match and current_round is not None):
            i += 1
            continue

        date = date_match.group(1)
        time = date_match.group(2)
        start = i + 1
        if time is None and start < len(lines):
            time_match = TIME_RE.fullmatch(lines[start])
            if time_match:
                time = time_match.group(1)
                start += 1

        # Search only inside this fixture. Stop at the next round/date and keep a
        # small cap so unrelated page text cannot be mistaken for a match.
        end = min(len(lines), start + 8)
        j = start
        score_match = None
        while j < end:
            if ROUND_RE.fullmatch(lines[j]) or DATE_RE.fullmatch(lines[j]):
                break
            score_match = SCORE_RE.fullmatch(lines[j])
            if score_match:
                break
            j += 1

        if not score_match or j <= start:
            i += 1
            continue

        home = lines[j - 1]
        home_ht = int(score_match.group(3)) if score_match.group(3) is not None else None
        away_ht = int(score_match.group(4)) if score_match.group(4) is not None else None
        away_idx = j + 1

        # Some MZPN pages render the half-time score in its own element.
        if away_idx < len(lines):
            ht_match = HT_RE.fullmatch(lines[away_idx])
            if ht_match:
                home_ht = int(ht_match.group(1))
                away_ht = int(ht_match.group(2))
                away_idx += 1

        if away_idx >= len(lines):
            i += 1
            continue

        away = lines[away_idx]
        invalid_boundary = (
            ROUND_RE.fullmatch(home)
            or DATE_RE.fullmatch(home)
            or TIME_RE.fullmatch(home)
            or ROUND_RE.fullmatch(away)
            or DATE_RE.fullmatch(away)
            or TIME_RE.fullmatch(away)
        )
        if invalid_boundary:
            i += 1
            continue

        records.append(
            MatchRecord(
                season=season,
                round_no=current_round,
                date=f"{date} {time}" if time else date,
                home=home,
                away=away,
                home_goals=int(score_match.group(1)),
                away_goals=int(score_match.group(2)),
                home_ht=home_ht,
                away_ht=away_ht,
                confidence=1.0,
            )
        )
        i = away_idx + 1

    return records


def parse_standings(html: str, season: str) -> list[ClubSeasonStatRecord]:
    soup = BeautifulSoup(html, "html.parser")
    records: list[ClubSeasonStatRecord] = []
    for tr in soup.find_all("tr"):
        cells = [_clean(td.get_text(" ", strip=True)) for td in tr.find_all(["td", "th"])]
        if len(cells) < 8 or not cells[0].isdigit():
            continue
        # Expected visible columns: position, team, M, Pkt, Z, R, P, Bramki
        goals = re.fullmatch(r"(\d+)\s*:\s*(\d+)", cells[7])
        if not goals:
            continue
        try:
            records.append(
                ClubSeasonStatRecord(
                    season=season,
                    club=cells[1],
                    position=int(cells[0]),
                    played=int(cells[2]),
                    points=int(cells[3]),
                    wins=int(cells[4]),
                    draws=int(cells[5]),
                    losses=int(cells[6]),
                    goals_for=int(goals.group(1)),
                    goals_against=int(goals.group(2)),
                    confidence=1.0,
                )
            )
        except ValueError:
            continue
    return records
