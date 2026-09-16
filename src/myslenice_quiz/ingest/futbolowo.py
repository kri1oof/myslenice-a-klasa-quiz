from __future__ import annotations

from datetime import datetime
import re
from bs4 import BeautifulSoup, Tag

from .common import AppearanceRecord, ClubProfileRecord, GoalRecord, MatchRecord, PlayerSeasonStatRecord, RosterMembershipRecord

SCORE_RE = re.compile(r"(\d+)\s*:\s*(\d+)")
MINUTE_ONLY_RE = re.compile(r"^(\d+)(?:\+(\d+))?['’]$")
DATE_RE = re.compile(r"(\d{2})\.(\d{2})\.(\d{4})\s+(\d{1,2}:\d{2})")


def _clean(value: str) -> str:
    return " ".join(value.replace("\xa0", " ").split())


def _section_tokens(soup: BeautifulSoup, start: str, end: str | None) -> list[str]:
    tokens = [_clean(x) for x in soup.stripped_strings]
    try:
        i = next(i for i, x in enumerate(tokens) if x.lower() == start.lower()) + 1
    except StopIteration:
        return []
    j = len(tokens)
    if end:
        for k in range(i, len(tokens)):
            if tokens[k].lower() == end.lower():
                j = k
                break
    return tokens[i:j]


def _name_like(value: str) -> bool:
    low = value.lower()
    if low == "nieznany zawodnik":
        return True
    if any(x in low for x in ("widzów", "widzow", "gospodarze", "goście", "goscie", "numer", "imię i nazwisko")):
        return False
    return len(value.split()) >= 2 and not any(ch.isdigit() for ch in value)


def _lineup_tables(soup: BeautifulSoup, home: str, away: str) -> list[AppearanceRecord]:
    out: list[AppearanceRecord] = []
    for table in soup.find_all("table"):
        heading = table.find_previous(["h2", "h3", "h4"])
        if not heading:
            continue
        htext = _clean(heading.get_text(" ", strip=True)).lower()
        if htext not in {"skład wyjściowy", "sklad wyjsciowy", "skład rezerwowy", "sklad rezerwowy"}:
            continue
        starter = "wyj" in htext
        # The closest preceding exact team label identifies which column/table this is.
        club = None
        for prev in table.find_all_previous(string=True, limit=80):
            text = _clean(str(prev))
            if text == home or text == away:
                club = text
                break
        if not club:
            continue
        for tr in table.find_all("tr"):
            cells = [_clean(td.get_text(" ", strip=True)) for td in tr.find_all(["td", "th"])]
            if not cells or not re.fullmatch(r"\d+", cells[0]):
                continue
            shirt = int(cells[0])
            links = [a for a in tr.find_all("a") if _name_like(_clean(a.get_text(" ", strip=True)))]
            if links:
                player = _clean(links[-1].get_text(" ", strip=True))
            else:
                candidates = [_clean(c) for c in cells[1:] if _name_like(_clean(c))]
                if not candidates:
                    continue
                player = candidates[-1]
            row_text = _clean(tr.get_text(" ", strip=True))
            minutes = [int(x) for x in re.findall(r"\b(\d{1,3})['’]", row_text)]
            sub_minute = minutes[-1] if minutes else None
            captain = bool(tr.find("img", alt=re.compile("kapitan", re.I))) or "kapitan" in row_text.lower()
            out.append(AppearanceRecord(
                home=home, away=away, season="", club=club, player=player,
                starter=starter, shirt_number=shirt, is_captain=captain,
                entered_minute=None if starter else sub_minute,
                left_minute=sub_minute if starter else None,
                confidence=0.80,
            ))
    return out


def parse_match(html: str, season: str) -> tuple[list[MatchRecord], list[GoalRecord], list[AppearanceRecord]]:
    """Parse a public Futbolowo match page: result, exact date, scorers and lineups.

    Missing data stays missing. In particular, "Nieznany zawodnik" is saved as a
    goal event without a player and never becomes a scorer question.
    """
    soup = BeautifulSoup(html, "html.parser")
    title = soup.find("h1")
    if not title:
        return [], [], []
    title_text = _clean(title.get_text(" ", strip=True))
    if " - " not in title_text:
        return [], [], []
    home, away = [x.strip() for x in title_text.split(" - ", 1)]

    full_text = _clean(soup.get_text(" ", strip=True))
    score_match = SCORE_RE.search(full_text)
    if not score_match:
        return [], [], []
    dm = DATE_RE.search(full_text)
    match_date = None
    if dm:
        day, month, year, hhmm = dm.groups()
        match_date = f"{year}-{month}-{day} {hhmm}"

    # On Futbolowo the location usually follows date/time before 90' / attendance.
    venue = None
    if dm:
        after = full_text[dm.end():]
        vm = re.match(r"\s+(.+?)\s+(?:90['’]|Widzów:|Widzow:)", after, re.I)
        if vm:
            candidate = _clean(vm.group(1))
            if 1 <= len(candidate) <= 80:
                venue = candidate

    match = MatchRecord(
        season=season, round_no=None, home=home, away=away,
        home_goals=int(score_match.group(1)), away_goals=int(score_match.group(2)),
        date=match_date, venue=venue, confidence=0.80,
    )

    goals: list[GoalRecord] = []
    tokens = _section_tokens(soup, "Bramki", "Kary")
    current_club = home
    pending_minute: tuple[int, int | None] | None = None
    for token in tokens:
        if token == home:
            current_club = home
            pending_minute = None
            continue
        if token == away:
            current_club = away
            pending_minute = None
            continue
        mm = MINUTE_ONLY_RE.fullmatch(token)
        if mm:
            pending_minute = (int(mm.group(1)), int(mm.group(2)) if mm.group(2) else None)
            continue
        if pending_minute and _name_like(token):
            goals.append(GoalRecord(
                home=home, away=away, season=season,
                scorer=None if "nieznany zawodnik" in token.lower() else token,
                club=current_club, minute=pending_minute[0], minute_extra=pending_minute[1], confidence=0.80,
            ))
            pending_minute = None

    appearances = _lineup_tables(soup, home, away)
    for item in appearances:
        item.season = season
    return [match], goals, appearances


def parse_player_stats(html: str, season: str) -> list[PlayerSeasonStatRecord]:
    soup = BeautifulSoup(html, "html.parser")
    heading = None
    for tag in soup.find_all(["h2", "h3", "h4"]):
        if "strzelone bramki" in _clean(tag.get_text(" ", strip=True)).lower():
            heading = tag
            break
    if heading is None:
        return []
    records: list[PlayerSeasonStatRecord] = []
    table = heading.find_next("table")
    if table is None:
        return []
    for tr in table.find_all("tr"):
        cells = [_clean(td.get_text(" ", strip=True)) for td in tr.find_all(["td", "th"])]
        meaningful = [c for c in cells if c and c.lower() not in {"image", "poz.", "suma"}]
        if len(meaningful) < 3:
            continue
        goals = meaningful[-1]
        if not goals.isdigit():
            continue
        player = meaningful[-3]
        club = meaningful[-2]
        if player.lower() in {"imię i nazwisko", "imie i nazwisko"}:
            continue
        records.append(PlayerSeasonStatRecord(season=season, club=club, player=player, goals=int(goals), confidence=0.80))
    return records




CAREER_SEASON_RE = re.compile(r"(20\d{2})\s*/\s*(20)?(\d{2})")

def _career_season_label(text: str) -> str | None:
    m = CAREER_SEASON_RE.search(text)
    if not m:
        return None
    start = int(m.group(1))
    end2 = int(m.group(3))
    return f"{start}/{end2:02d}"

def parse_player_career(html: str, expected_player: str | None = None) -> list[PlayerSeasonStatRecord]:
    """Parse Futbolowo player career totals (season, club, appearances, goals).

    The same player career page is usually accessible through many Futbolowo
    club domains. Only rows with an explicit four-digit season and numeric
    matches/goals are accepted.
    """
    soup = BeautifulSoup(html, "html.parser")
    h1 = soup.find("h1")
    raw_player = _clean(h1.get_text(" ", strip=True)) if h1 else ""
    player, _ = split_player_and_role(raw_player)
    if expected_player:
        expected_clean, _ = split_player_and_role(expected_player)
        # The database identity (coming from the roster's player id) is stronger
        # than decorative text in Futbolowo's career-page heading.
        if _name_like(expected_clean):
            player = expected_clean
    if not _name_like(player):
        return []
    out: list[PlayerSeasonStatRecord] = []
    seen: set[tuple[str, str]] = set()
    for tr in soup.find_all("tr"):
        cells = [_clean(td.get_text(" ", strip=True)) for td in tr.find_all(["td", "th"])]
        if len(cells) < 4:
            continue
        season_idx = next((i for i, c in enumerate(cells) if _career_season_label(c)), None)
        if season_idx is None:
            continue
        season = _career_season_label(cells[season_idx])
        assert season is not None
        after = [c for c in cells[season_idx + 1:] if c and c.lower() not in {"image"}]
        if len(after) < 3:
            continue
        # Club label is the text immediately before the first pair of integer
        # totals. Futbolowo may append "Pierwsza drużyna" to the club cell.
        number_pos = None
        for i in range(1, len(after) - 1):
            if after[i].isdigit() and after[i + 1].isdigit():
                number_pos = i
                break
        if number_pos is None or number_pos < 1:
            continue
        club = _clean(" ".join(after[:number_pos]))
        club = re.sub(r"\bPierwsza\s+drużyna\b", "", club, flags=re.I)
        club = re.sub(r"\bPierwsza\s+druzyna\b", "", club, flags=re.I)
        club = _clean(club)
        if not club or len(club) > 100:
            continue
        appearances = int(after[number_pos])
        goals = int(after[number_pos + 1])
        key = (season, club)
        if key in seen:
            continue
        seen.add(key)
        out.append(PlayerSeasonStatRecord(
            season=season, club=club, player=player, appearances=appearances, goals=goals, confidence=0.84
        ))
    return out

def parse_club_assets(html: str, page_url: str) -> list[ClubProfileRecord]:
    """Discover club profile URLs and crest image URLs exposed by Futbolowo.

    Futbolowo league widgets commonly link club names to ``/club/<id>`` and
    render the same club's crest as an image with an ``alt`` equal to the club
    name.  We merge those two signals by normalized club name.
    """
    from urllib.parse import urljoin
    from ..normalize import normalize_text

    soup = BeautifulSoup(html, "html.parser")
    by_key: dict[str, ClubProfileRecord] = {}

    # First collect crest images, because they are often not wrapped in the
    # profile link itself.
    image_urls: dict[str, tuple[str, str]] = {}
    for img in soup.find_all("img"):
        name = _clean(img.get("alt") or "")
        src = img.get("src") or img.get("data-src") or img.get("data-lazy-src")
        if not name or not src:
            continue
        key = normalize_text(name)
        if not key or len(key) < 3:
            continue
        image_urls[key] = (name, urljoin(page_url, src))

    # Club profile links are much more useful than guessing slugs.
    for a in soup.find_all("a", href=True):
        href = a.get("href") or ""
        if not re.search(r"/club/\d+", href):
            continue
        name = _clean(a.get_text(" ", strip=True))
        if not name:
            img = a.find("img")
            name = _clean(img.get("alt") or "") if img else ""
        if not name:
            continue
        key = normalize_text(name)
        if not key:
            continue
        crest = image_urls.get(key, (None, None))[1]
        by_key[key] = ClubProfileRecord(
            club=name,
            crest_remote_url=crest,
            crest_source_url=urljoin(page_url, href),
        )

    # Some league widgets expose only crest images. Keep these too; the crest
    # downloader can work directly from the image URL.
    for key, (name, crest) in image_urls.items():
        if key in by_key:
            if not by_key[key].crest_remote_url:
                by_key[key].crest_remote_url = crest
            continue
        # Avoid generic site graphics: real team crests normally have a club
        # name in alt and are served from Futbolowo's static host/assets.
        if "futbolowo" in crest and len(name.split()) >= 2:
            by_key[key] = ClubProfileRecord(club=name, crest_remote_url=crest)

    return list(by_key.values())

SCHEDULE_DATE_RE = re.compile(r"^(\d{2})\.(\d{2})\.(\d{4})$")
TIME_RE = re.compile(r"^\d{1,2}:\d{2}$")
ROUND_RE = re.compile(r"kolejka\s+(\d+)", re.I)


def parse_schedule(html: str, season: str, page_url: str = "https://futbolowo.pl") -> tuple[list[MatchRecord], list[str]]:
    """Parse a Futbolowo season schedule.

    The schedule is a strong source for round number, calendar date/time and result.
    It may also expose links to individual match pages; these are returned for an
    optional detail crawl. The parser intentionally skips rows without a score.
    """
    soup = BeautifulSoup(html, "html.parser")
    records: list[MatchRecord] = []
    detail_urls: list[str] = []
    seen: set[tuple[int | None, str, str]] = set()

    # Futbolowo commonly renders each round as a heading followed by a table.
    # Iterate tables and infer the closest previous "Kolejka N" label.
    for table in soup.find_all("table"):
        round_no = None
        prev_texts: list[str] = []
        for prev in table.find_all_previous(["h1", "h2", "h3", "h4", "div", "span"], limit=25):
            txt = _clean(prev.get_text(" ", strip=True))
            if txt:
                prev_texts.append(txt)
            rm = ROUND_RE.search(txt)
            if rm:
                round_no = int(rm.group(1))
                break

        for tr in table.find_all("tr"):
            cells = [_clean(td.get_text(" ", strip=True)) for td in tr.find_all(["td", "th"])]
            if len(cells) < 4:
                continue
            date_idx = next((i for i, c in enumerate(cells) if SCHEDULE_DATE_RE.fullmatch(c)), None)
            if date_idx is None:
                continue
            score_candidates = [i for i, c in enumerate(cells) if i > date_idx + 1 and SCORE_RE.fullmatch(c.rstrip("* ")) and not TIME_RE.fullmatch(c)]
            score_idx = score_candidates[0] if score_candidates else None
            if score_idx is None:
                continue
            sm = SCORE_RE.fullmatch(cells[score_idx].rstrip("* "))
            if not sm:
                continue
            dm = SCHEDULE_DATE_RE.fullmatch(cells[date_idx])
            assert dm is not None
            day, month, year = dm.groups()
            time_value = next((c for c in cells[date_idx + 1:score_idx] if TIME_RE.fullmatch(c)), None)

            # Team names are the nearest meaningful text cells to the score.
            left = [c for c in cells[date_idx + 1:score_idx] if c and not TIME_RE.fullmatch(c)]
            right = [c for c in cells[score_idx + 1:] if c]
            if not left or not right:
                continue
            home = left[-1]
            away = right[0]
            if home.lower() in {"gospodarze", "wynik", "data"} or away.lower() in {"goście", "goscie"}:
                continue

            date = f"{year}-{month}-{day}" + (f" {time_value}" if time_value else "")
            key = (round_no, home, away)
            if key in seen:
                continue
            seen.add(key)
            records.append(MatchRecord(
                season=season,
                round_no=round_no,
                home=home,
                away=away,
                home_goals=int(sm.group(1)),
                away_goals=int(sm.group(2)),
                date=date,
                confidence=0.80,
            ))

            for a in tr.find_all("a", href=True):
                href = a.get("href") or ""
                if "/game/" in href:
                    from urllib.parse import urljoin
                    detail_urls.append(urljoin("https://futbolowo.pl", href))

    # Fallback for layouts where tables are not semantically separated by round.
    if not records:
        current_round = None
        for node in soup.find_all(string=True):
            text = _clean(str(node))
            rm = ROUND_RE.fullmatch(text)
            if rm:
                current_round = int(rm.group(1))
                continue
            if not SCHEDULE_DATE_RE.fullmatch(text):
                continue
            tr = node.find_parent("tr") if isinstance(node, Tag) else None
            if tr is None and getattr(node, "parent", None):
                tr = node.parent.find_parent("tr")
            if tr is None:
                continue
            cells = [_clean(td.get_text(" ", strip=True)) for td in tr.find_all(["td", "th"])]
            date_idx = next((i for i, c in enumerate(cells) if SCHEDULE_DATE_RE.fullmatch(c)), None)
            if date_idx is None:
                continue
            score_candidates = [i for i, c in enumerate(cells) if i > date_idx + 1 and SCORE_RE.fullmatch(c.rstrip("* ")) and not TIME_RE.fullmatch(c)]
            score_idx = score_candidates[0] if score_candidates else None
            if score_idx is None:
                continue
            sm = SCORE_RE.fullmatch(cells[score_idx].rstrip("* "))
            if not sm:
                continue
            dm = SCHEDULE_DATE_RE.fullmatch(cells[date_idx]); assert dm
            day, month, year = dm.groups()
            time_value = next((c for c in cells[date_idx + 1:score_idx] if TIME_RE.fullmatch(c)), None)
            left = [c for c in cells[date_idx + 1:score_idx] if c and not TIME_RE.fullmatch(c)]
            right = [c for c in cells[score_idx + 1:] if c]
            if not left or not right:
                continue
            home, away = left[-1], right[0]
            key = (current_round, home, away)
            if key in seen:
                continue
            seen.add(key)
            records.append(MatchRecord(
                season=season, round_no=current_round, home=home, away=away,
                home_goals=int(sm.group(1)), away_goals=int(sm.group(2)),
                date=f"{year}-{month}-{day}" + (f" {time_value}" if time_value else ""),
                confidence=0.80,
            ))

    # Game links are not always nested inside the schedule row. Futbolowo
    # often renders a separate league widget where score links point to /game/.
    # Collect every public match link from the page as a conservative fallback.
    from urllib.parse import urljoin
    for a in soup.find_all("a", href=True):
        href = a.get("href") or ""
        if re.search(r"/game/\d+", href):
            detail_urls.append(urljoin(page_url, href))

    return records, list(dict.fromkeys(detail_urls))


PLAYER_HREF_RE = re.compile(r"/player/(\d+)(?:/|$)", re.I)
ROLE_WORDS = ("Bramkarz", "Obrońca", "Pomocnik", "Napastnik")
ROLE_SUFFIX_RE = re.compile(r"\s+(?=(?:Bramkarz|Obrońca|Pomocnik|Napastnik)(?:\s|/|$))", re.I)


def split_player_and_role(text: str) -> tuple[str, str | None]:
    """Split Futbolowo labels like ``Jan Kowalski Obrońca / Pomocnik``.

    Some roster/career templates put the position *inside the player link or H1*,
    not in a separate node. Treat role words as metadata, never as part of the
    player's identity.
    """
    text = _clean(text)
    low = text.lower()
    positions = [(low.find(word.lower()), word) for word in ROLE_WORDS if low.find(word.lower()) >= 0]
    if not positions:
        return text, None
    cut = min(pos for pos, _ in positions)
    player = _clean(text[:cut].rstrip(" -/"))
    role_text = _clean(text[cut:])
    roles = [word for word in ROLE_WORDS if word.lower() in role_text.lower()]
    ordered = sorted(((role_text.lower().find(word.lower()), word) for word in roles), key=lambda x: x[0])
    role = " / ".join(word for _, word in ordered) if ordered else None
    return player, role


def _extract_role(text: str, player: str) -> str | None:
    rest = _clean(text.replace(player, " "))
    # Futbolowo may list combined positions such as "Obrońca / Pomocnik".
    roles = [word for word in ROLE_WORDS if word.lower() in rest.lower()]
    if not roles:
        return None
    # Preserve the order in which roles appear in the visible row when possible.
    positions = sorted(((rest.lower().find(word.lower()), word) for word in roles), key=lambda x: x[0])
    return " / ".join(word for _, word in positions)




ROSTER_PAGE_SEASON_RE = re.compile(r"(?:Kadra\s+.+?\s+w\s+)?(20\d{2})\s*/\s*(20\d{2})", re.I)

def parse_roster_page_season(html: str) -> str | None:
    """Return the season explicitly advertised by a Futbolowo roster page.

    This guard is intentionally conservative. A club domain may still be live
    years after the target season, so ``/roster/kadra`` must never be imported
    into a historical season unless the page itself names that exact season.
    """
    soup = BeautifulSoup(html, "html.parser")
    candidates: list[str] = []
    if soup.title:
        candidates.append(_clean(soup.title.get_text(" ", strip=True)))
    for tag in soup.find_all(["h1", "h2"]):
        candidates.append(_clean(tag.get_text(" ", strip=True)))
    # Futbolowo sometimes puts the effective season in surrounding visible text
    # rather than the h1, but we deliberately inspect only the first portion to
    # avoid matching season selectors or league-table widgets lower on the page.
    body = _clean(soup.get_text(" ", strip=True))
    if body:
        candidates.append(body[:500])
    for text in candidates:
        m = re.search(r"Kadra(?:\s+.+?)?\s+w\s+(20\d{2})\s*/\s*(20\d{2})", text, re.I)
        if m:
            return f"{m.group(1)}/{m.group(2)[-2:]}"
    return None

def parse_roster(html: str, season: str, club: str, page_url: str = "https://futbolowo.pl") -> tuple[list[RosterMembershipRecord], bool]:
    """Parse a Futbolowo roster page as positive membership evidence.

    Archived ``/roster/kadra`` pages can expose only a subset of a historical
    squad, so row count alone is never used as proof of completeness. The
    parser still extracts every visible player and position it can find.
    """
    from ..normalize import normalize_text

    soup = BeautifulSoup(html, "html.parser")
    by_player: dict[str, RosterMembershipRecord] = {}

    for a in soup.find_all("a", href=True):
        href = a.get("href") or ""
        m = PLAYER_HREF_RE.search(href)
        if not m:
            continue
        raw_player = _clean(a.get_text(" ", strip=True))
        player, linked_role = split_player_and_role(raw_player)
        if not _name_like(player) or player.lower() == "nieznany zawodnik":
            continue
        role = linked_role
        node = a
        for _ in range(5):
            node = node.parent
            if node is None:
                break
            visible = _clean(node.get_text(" ", strip=True))
            found_role = _extract_role(visible, player)
            if found_role:
                role = found_role
                break
        key = f"futbolowo:player:{m.group(1)}"
        by_player[key] = RosterMembershipRecord(
            season=season, club=club, player=player, role=role,
            external_key=key, confidence=0.80,
        )

    # Merge position-bearing plain rows even when linked players already exist.
    for node in soup.find_all(["li", "tr"]):
        text = _clean(node.get_text(" ", strip=True))
        if not text or not any(word.lower() in text.lower() for word in ROLE_WORDS):
            continue
        player, role = split_player_and_role(text)
        if not _name_like(player) or len(player.split()) > 5:
            continue
        if not role:
            continue
        norm = normalize_text(player)
        existing_key = next((k for k, r in by_player.items() if normalize_text(r.player) == norm), None)
        if existing_key:
            if not by_player[existing_key].role:
                by_player[existing_key].role = role
        else:
            by_player[f"plain:{norm}"] = RosterMembershipRecord(
                season=season, club=club, player=player, role=role, confidence=0.76
            )

    records = list(by_player.values())
    # Important: archived Futbolowo roster pages have been observed to show 12
    # names while match protocols prove 25 distinct players for the same club.
    return records, False

CLUB_HISTORY_RE = re.compile(
    r"A\s*Klasa\s*-?\s*Podokręg\s*Myślenice\s+Sezon\s+(20\d{2})\s*/\s*(20\d{2}|\d{2})",
    re.I,
)


def parse_club_history_seasons(html: str) -> list[str]:
    """Return explicit senior A-class Myślenice seasons from a Futbolowo club profile."""
    soup = BeautifulSoup(html, 'html.parser')
    text = _clean(soup.get_text(' ', strip=True))
    out: list[str] = []
    seen: set[str] = set()
    for m in CLUB_HISTORY_RE.finditer(text):
        start = int(m.group(1))
        end_raw = m.group(2)
        end2 = int(end_raw) % 100
        label = f"{start}/{end2:02d}"
        if label not in seen:
            seen.add(label)
            out.append(label)
    return out
