from __future__ import annotations

from datetime import datetime
import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from .common import AppearanceRecord, ClubSeasonStatRecord, GoalRecord, MatchRecord

ROUND_RE = re.compile(r"^(\d+)\.\s*kolejka\b", re.I)
SCORE_RE = re.compile(r"^(\d+)\s*[-:]\s*(\d+)(?:\s*\*|\s*\((?:wo|w\.o\.)\))?$", re.I)
TABLE_SCORE_RE = re.compile(r"^(\d+)\s*[-:]\s*(\d+)$")
REPORT_HEADING_RE = re.compile(
    r"^(.+?)\s+[–-]\s+(.+?)\s+(\d+)\s*[-:]\s*(\d+)(?:\s*\((\d+)\s*[-:]\s*(\d+)\))?$"
)
EVENT_GOAL_RE = re.compile(r"^(\d+)\s*[-:]\s*(\d+)\s+(.+?)(?:\s+(\d{1,3})(?:\+(\d+))?)?$", re.I)
DATE_RE = re.compile(r"(\d{1,2})\s+([A-Za-ząćęłńóśźżĄĆĘŁŃÓŚŹŻ]+)(?:\s+(\d{4}))?(?:\s*,?\s*(\d{1,2}:\d{2}))?", re.I)

MONTHS = {
    "stycznia": 1, "lutego": 2, "marca": 3, "kwietnia": 4, "maja": 5, "czerwca": 6,
    "lipca": 7, "sierpnia": 8, "września": 9, "wrzesnia": 9, "października": 10,
    "pazdziernika": 10, "listopada": 11, "grudnia": 12,
}


def _clean(value: str) -> str:
    return " ".join(value.replace("\xa0", " ").split())


def _season_years(season: str) -> tuple[int, int]:
    first = int(season.split("/")[0])
    return first, first + 1


def _date(value: str, season: str) -> str | None:
    m = DATE_RE.search(value)
    if not m:
        return None
    day, month_name, explicit_year, hhmm = m.groups()
    month = MONTHS.get(month_name.lower())
    if not month:
        return None
    first, second = _season_years(season)
    year = int(explicit_year) if explicit_year else (first if month >= 7 else second)
    try:
        dt = datetime(year, month, int(day))
    except ValueError:
        return None
    return dt.strftime("%Y-%m-%d") + (f" {hhmm}" if hhmm else "")


def _looks_like_date(value: str) -> bool:
    return bool(DATE_RE.search(value))


def parse_season(html: str, season: str, base_url: str) -> tuple[list[MatchRecord], list[ClubSeasonStatRecord], list[str]]:
    soup = BeautifulSoup(html, "html.parser")
    standings: list[ClubSeasonStatRecord] = []

    # The archive table has: position, club, M, PKT, BR, Z, R, P, ...
    for table in soup.find_all("table"):
        for tr in table.find_all("tr"):
            cells = [_clean(x.get_text(" ", strip=True)) for x in tr.find_all(["td", "th"])]
            if len(cells) < 8:
                continue
            pos_m = re.fullmatch(r"(\d+)\.?", cells[0])
            if not pos_m or not re.fullmatch(r"\d+", cells[2]) or not re.fullmatch(r"\d+", cells[3]):
                continue
            goals_m = TABLE_SCORE_RE.fullmatch(cells[4])
            if not goals_m:
                continue
            if not all(re.fullmatch(r"\d+", x) for x in cells[5:8]):
                continue
            standings.append(ClubSeasonStatRecord(
                season=season,
                club=cells[1],
                position=int(pos_m.group(1)),
                played=int(cells[2]),
                points=int(cells[3]),
                wins=int(cells[5]),
                draws=int(cells[6]),
                losses=int(cells[7]),
                goals_for=int(goals_m.group(1)),
                goals_against=int(goals_m.group(2)),
                confidence=0.88,
            ))

    lines = [_clean(x) for x in soup.stripped_strings if _clean(x)]
    matches: list[MatchRecord] = []
    current_round: int | None = None
    for i, token in enumerate(lines):
        rm = ROUND_RE.match(token)
        if rm:
            current_round = int(rm.group(1))
            continue
        if current_round is None:
            continue
        sm = SCORE_RE.fullmatch(token)
        if not sm or i < 1 or i + 1 >= len(lines):
            continue
        home, away = lines[i - 1], lines[i + 1]
        # Guard against standings/news fragments.
        if not home or not away or ROUND_RE.match(home) or ROUND_RE.match(away):
            continue
        next_tokens: list[str] = []
        j = i + 2
        while j < len(lines) and len(next_tokens) < 10:
            if ROUND_RE.match(lines[j]) or SCORE_RE.fullmatch(lines[j]):
                break
            next_tokens.append(lines[j])
            j += 1
        date = next((_date(x, season) for x in next_tokens if _looks_like_date(x)), None)
        notes = " ".join(next_tokens).lower()
        status = "walkover" if ("w.o." in notes or "(wo)" in notes or "walkower" in notes or "po weryfikacji" in notes) else "played"
        matches.append(MatchRecord(
            season=season,
            round_no=current_round,
            home=home,
            away=away,
            home_goals=int(sm.group(1)),
            away_goals=int(sm.group(2)),
            date=date,
            status=status,
            confidence=0.88,
        ))

    # Keep a single official record per round/home/away.
    dedup = {(m.round_no, m.home, m.away): m for m in matches}
    stat_dedup = {s.club: s for s in standings}
    reports: list[str] = []
    for a in soup.find_all("a", href=True):
        href = a.get("href", "")
        if "/relacja/" in href:
            url = urljoin(base_url, href)
            if url not in reports:
                reports.append(url)
    return list(dedup.values()), list(stat_dedup.values()), reports


def _resolve_team_label(label: str, home: str, away: str) -> str | None:
    norm = re.sub(r"[^A-ZĄĆĘŁŃÓŚŹŻ0-9]", "", label.upper())
    for club in (home, away):
        cn = re.sub(r"[^A-ZĄĆĘŁŃÓŚŹŻ0-9]", "", club.upper())
        first = re.sub(r"[^A-ZĄĆĘŁŃÓŚŹŻ0-9]", "", club.split()[0].upper())
        if norm and (norm == cn or norm == first or cn.startswith(norm) or norm.startswith(first)):
            return club
    return None


def _full_name(name: str) -> bool:
    name = _clean(name)
    if name in {"?", "??", "-"}:
        return False
    # Avoid creating ambiguous surname-only identities from old reports.
    return len([x for x in name.replace("-", " ").split() if x]) >= 2


def parse_report(html: str, season: str) -> tuple[list[MatchRecord], list[GoalRecord], list[AppearanceRecord]]:
    soup = BeautifulSoup(html, "html.parser")
    lines = [_clean(x) for x in soup.stripped_strings if _clean(x)]
    heading = None
    for line in lines:
        hm = REPORT_HEADING_RE.match(line)
        if hm:
            heading = hm
            break
    if not heading:
        return [], [], []
    home, away = _clean(heading.group(1)), _clean(heading.group(2))
    hg, ag = int(heading.group(3)), int(heading.group(4))
    hht = int(heading.group(5)) if heading.group(5) is not None else None
    aht = int(heading.group(6)) if heading.group(6) is not None else None
    match = MatchRecord(season=season, round_no=None, home=home, away=away, home_goals=hg, away_goals=ag,
                        home_ht=hht, away_ht=aht, confidence=0.82)

    goals: list[GoalRecord] = []
    prev_h = prev_a = 0
    for line in lines:
        gm = EVENT_GOAL_RE.match(line)
        if not gm:
            continue
        nh, na = int(gm.group(1)), int(gm.group(2))
        if nh == prev_h and na == prev_a:
            continue
        if nh == prev_h + 1 and na == prev_a:
            club = home
        elif na == prev_a + 1 and nh == prev_h:
            club = away
        else:
            prev_h, prev_a = nh, na
            continue
        scorer = _clean(gm.group(3))
        if scorer in {"?", "??"}:
            scorer = None
        minute = int(gm.group(4)) if gm.group(4) else None
        extra = int(gm.group(5)) if gm.group(5) else None
        goals.append(GoalRecord(home=home, away=away, season=season, scorer=scorer, club=club,
                                minute=minute, minute_extra=extra, confidence=0.82))
        prev_h, prev_a = nh, na

    # Goal-summary format, safe when only one team scored (e.g. 0-5, "Gole: X 3, Y, Z").
    if not goals and (hg == 0) != (ag == 0):
        scoring_club = away if hg == 0 else home
        expected = ag if hg == 0 else hg
        for line in lines:
            if not line.lower().startswith("gole:"):
                continue
            body = line.split(":", 1)[1].strip()
            parsed: list[tuple[str, int]] = []
            for part in [x.strip() for x in body.split(",") if x.strip()]:
                mm = re.match(r"^(.+?)\s+(\d+)$", part)
                if mm and _full_name(mm.group(1)):
                    parsed.append((_clean(mm.group(1)), int(mm.group(2))))
                elif _full_name(part):
                    parsed.append((_clean(part), 1))
            if sum(n for _, n in parsed) == expected:
                for scorer, count in parsed:
                    for _ in range(count):
                        goals.append(GoalRecord(home=home, away=away, season=season, scorer=scorer,
                                                club=scoring_club, confidence=0.80))
            break

    appearances: list[AppearanceRecord] = []
    # Parse only full names. Surname-only historical lineups are useful for humans but not safe
    # as global player identities without a roster to resolve them.
    for line in lines:
        lm = re.match(r"^([A-ZĄĆĘŁŃÓŚŹŻ][A-ZĄĆĘŁŃÓŚŹŻ .-]{2,}):\s+(.+)$", line)
        if not lm or lm.group(1).upper() in {"GOLE", "BRAMKI"}:
            continue
        club = _resolve_team_label(lm.group(1), home, away)
        if not club:
            continue
        for part in [x.strip() for x in lm.group(2).split(",") if x.strip()]:
            starter = re.sub(r"\s*\([^)]*\)\s*$", "", part).strip()
            if _full_name(starter):
                appearances.append(AppearanceRecord(home=home, away=away, season=season, club=club,
                                                    player=starter, starter=True, confidence=0.76))
            sub = re.search(r"\((\d{1,3})\s+([^()]+)\)", part)
            if sub and _full_name(sub.group(2)):
                appearances.append(AppearanceRecord(home=home, away=away, season=season, club=club,
                                                    player=_clean(sub.group(2)), starter=False,
                                                    entered_minute=int(sub.group(1)), confidence=0.76))
    return [match], goals, appearances
