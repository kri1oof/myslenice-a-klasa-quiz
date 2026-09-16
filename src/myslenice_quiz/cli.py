from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from .db import connect, init_db, get_or_create_club, get_or_create_season
from .export import export_questions
from .ingest.common import (
    fetch, save_appearances, save_club_profiles, save_club_stats, save_goals, save_matches,
    save_player_stats, save_roster_memberships, set_match_coverage, set_match_team_coverage, upsert_source,
)
from .ingest.csv_import import import_club_stats_csv, import_matches_csv, import_player_stats_csv
from .ingest import futbolowo, ktowygral, mzpn, ninetyminut, regionalny, sportowetempo
from .ingest import offline_history
from .ingest import assets as club_assets
from .questions import generate_all
from .questions.base import save_questions
from .normalize import normalize_text
from .validate import validate_database


def cmd_init(args):
    init_db(args.db)
    print(f"Utworzono bazę: {args.db}")




def cmd_import_offline_history(args):
    init_db(args.db)
    records = offline_history.read_memberships(args.path)
    with connect(args.db) as conn:
        imported, sources = offline_history.import_memberships(conn, records)
    print(f"Offline historia: członkostwa={imported}, źródła={sources}, plik={args.path}")

def cmd_fetch_mzpn(args):
    init_db(args.db)
    html, _ = fetch(args.url)
    with connect(args.db) as conn:
        source_id = upsert_source(conn, "mzpn", args.url, html)
        matches = mzpn.parse_schedule(html, args.season)
        standings = mzpn.parse_standings(html, args.season)
        m = save_matches(conn, matches, source_id)
        s = save_club_stats(conn, standings, source_id)
        print(f"MZPN: mecze={m}, rekordy tabeli={s}")


def cmd_fetch_90(args):
    init_db(args.db)
    html, _ = fetch(args.url)
    with connect(args.db) as conn:
        source_id = upsert_source(conn, "90minut", args.url, html)
        matches, standings = ninetyminut.parse_league(html, args.season)
        m = save_matches(conn, matches, source_id)
        s = save_club_stats(conn, standings, source_id)
        print(f"90minut: mecze={m}, rekordy tabeli={s}")


def cmd_fetch_futbolowo_match(args):
    init_db(args.db)
    html, _ = fetch(args.url)
    with connect(args.db) as conn:
        source_id = upsert_source(conn, "futbolowo", args.url, html)
        matches, goals, appearances = futbolowo.parse_match(html, args.season)
        m = save_matches(conn, matches, source_id)
        g = save_goals(conn, goals, source_id)
        a = save_appearances(conn, appearances, source_id)
        if matches:
            rec = matches[0]
            total = None if rec.home_goals is None or rec.away_goals is None else rec.home_goals + rec.away_goals
            set_match_coverage(conn, rec.season, rec.home, rec.away, "goals", total is not None and len(goals) == total,
                               f"Futbolowo: {len(goals)} wydarzeń bramkowych / wynik {rec.home_goals}:{rec.away_goals}")
            starters_by_club = {}
            for x in appearances:
                if x.starter:
                    starters_by_club[x.club] = starters_by_club.get(x.club, 0) + 1
            complete_lineups = starters_by_club.get(rec.home, 0) >= 11 and starters_by_club.get(rec.away, 0) >= 11
            set_match_coverage(conn, rec.season, rec.home, rec.away, "lineups", complete_lineups,
                               "; ".join(f"{club}: {count} starterów" for club, count in starters_by_club.items()))
            _set_team_detail_coverage(conn, rec, goals, appearances)
        print(f"Futbolowo: mecze={m}, gole={g}, wpisy składu={a}")



def cmd_fetch_futbolowo_schedule(args):
    init_db(args.db)
    html, _ = fetch(args.url, timeout=args.timeout)
    with connect(args.db) as conn:
        source_id = upsert_source(conn, "futbolowo", args.url, html, "Terminarz sezonu Futbolowo")
        matches, detail_urls = futbolowo.parse_schedule(html, args.season, args.url)
        m = save_matches(conn, matches, source_id)
        assets = futbolowo.parse_club_assets(html, args.url)
        asset_count = save_club_profiles(conn, assets)
        season_id = conn.execute("SELECT id FROM seasons WHERE label=?", (args.season,)).fetchone()
        if season_id and matches and all(x.date for x in matches):
            conn.execute(
                """INSERT INTO season_coverage(season_id,dataset,is_complete,notes) VALUES(?,?,1,?)
                   ON CONFLICT(season_id,dataset) DO UPDATE SET is_complete=1,notes=excluded.notes""",
                (season_id[0], "dates", f"Futbolowo: {len(matches)} meczów z datą/godziną"),
            )
        print(f"Futbolowo terminarz: mecze={m}, z datą={sum(1 for x in matches if x.date)}, linki szczegółów={len(detail_urls)}, profile/herby={asset_count}")


def _set_team_detail_coverage(conn, rec, goals, appearances) -> None:
    for club, expected_goals in ((rec.home, rec.home_goals), (rec.away, rec.away_goals)):
        team_goals = [g for g in goals if g.club == club]
        events_complete = expected_goals is not None and len(team_goals) == expected_goals
        scorers_complete = events_complete and all(g.scorer is not None for g in team_goals)
        starters = [a for a in appearances if a.club == club and a.starter]
        starters_complete = len(starters) >= 11
        set_match_team_coverage(conn, rec.season, rec.home, rec.away, club, "goal_events", events_complete,
                                f"Futbolowo: wydarzenia {len(team_goals)}/{expected_goals if expected_goals is not None else '?'}")
        set_match_team_coverage(conn, rec.season, rec.home, rec.away, club, "scorers", scorers_complete,
                                f"Futbolowo: znani strzelcy {sum(1 for g in team_goals if g.scorer is not None)}/{expected_goals if expected_goals is not None else '?'}")
        set_match_team_coverage(conn, rec.season, rec.home, rec.away, club, "starters", starters_complete,
                                f"Futbolowo: starterzy {len(starters)}/11")


def cmd_crawl_futbolowo_schedule(args):
    import time
    import requests
    init_db(args.db)
    html, _ = fetch(args.url, timeout=args.timeout)
    matches, detail_urls = futbolowo.parse_schedule(html, args.season, args.url)
    if args.limit:
        detail_urls = detail_urls[:args.limit]
    with connect(args.db) as conn:
        source_id = upsert_source(conn, "futbolowo", args.url, html, "Terminarz sezonu Futbolowo")
        save_matches(conn, matches, source_id)
        save_club_profiles(conn, futbolowo.parse_club_assets(html, args.url))
        ok = failures = goals_total = apps_total = 0
        for i, url in enumerate(detail_urls, start=1):
            try:
                detail_html, _ = fetch(url, timeout=args.timeout)
            except requests.HTTPError as exc:
                failures += 1
                if getattr(exc.response, "status_code", None) == 429:
                    print(f"STOP [{i}/{len(detail_urls)}] HTTP 429 Too Many Requests. Zachowuję dotychczasowy postęp.")
                    break
                print(f"SKIP [{i}/{len(detail_urls)}] {url}: {exc}")
                continue
            except requests.RequestException as exc:
                failures += 1
                print(f"SKIP [{i}/{len(detail_urls)}] {url}: {exc}")
                continue
            sid = upsert_source(conn, "futbolowo", url, detail_html, "Szczegóły meczu Futbolowo")
            detail_matches, goals, appearances = futbolowo.parse_match(detail_html, args.season)
            if not detail_matches:
                failures += 1
                continue
            save_matches(conn, detail_matches, sid)
            goals_total += save_goals(conn, goals, sid)
            apps_total += save_appearances(conn, appearances, sid)
            rec = detail_matches[0]
            expected = None if rec.home_goals is None or rec.away_goals is None else rec.home_goals + rec.away_goals
            complete_goals = expected is not None and len(goals) == expected
            set_match_coverage(conn, rec.season, rec.home, rec.away, "goals", complete_goals,
                               f"Futbolowo: {len(goals)} wydarzeń / wynik {rec.home_goals}:{rec.away_goals}")
            starters = {}
            for ap in appearances:
                if ap.starter:
                    starters[ap.club] = starters.get(ap.club, 0) + 1
            complete_lineups = starters.get(rec.home, 0) >= 11 and starters.get(rec.away, 0) >= 11
            set_match_coverage(conn, rec.season, rec.home, rec.away, "lineups", complete_lineups,
                               "; ".join(f"{club}: {count} starterów" for club, count in starters.items()))
            _set_team_detail_coverage(conn, rec, goals, appearances)
            ok += 1
            print(f"OK [{i}/{len(detail_urls)}] {rec.home} - {rec.away}: gole={len(goals)}, skład={len(appearances)}")
            time.sleep(max(0.0, args.delay))
        season_row = conn.execute("SELECT id FROM seasons WHERE label=?", (args.season,)).fetchone()
        if season_row:
            season_id = int(season_row[0])
            total_matches = conn.execute("SELECT COUNT(*) FROM matches WHERE season_id=?", (season_id,)).fetchone()[0]
            goals_complete = conn.execute(
                """SELECT COUNT(*) FROM match_coverage mc JOIN matches m ON m.id=mc.match_id
                   WHERE m.season_id=? AND mc.dataset='goals' AND mc.is_complete=1""", (season_id,)
            ).fetchone()[0]
            lineups_complete = conn.execute(
                """SELECT COUNT(*) FROM match_coverage mc JOIN matches m ON m.id=mc.match_id
                   WHERE m.season_id=? AND mc.dataset='lineups' AND mc.is_complete=1""", (season_id,)
            ).fetchone()[0]
            for dataset, complete_count in (("goals", goals_complete), ("lineups", lineups_complete)):
                conn.execute(
                    """INSERT INTO season_coverage(season_id,dataset,is_complete,notes) VALUES(?,?,?,?)
                       ON CONFLICT(season_id,dataset) DO UPDATE SET is_complete=excluded.is_complete,notes=excluded.notes""",
                    (season_id, dataset, int(total_matches > 0 and complete_count == total_matches),
                     f"Futbolowo: kompletne {complete_count}/{total_matches} meczów"),
                )
            print(f"Pokrycie {args.season}: strzelcy kompletni={goals_complete}/{total_matches}, składy kompletne={lineups_complete}/{total_matches}")
    print(f"Crawl Futbolowo: strony={ok}, błędy={failures}, gole={goals_total}, wpisy składu={apps_total}")

def cmd_fetch_futbolowo_stats(args):
    init_db(args.db)
    html, _ = fetch(args.url)
    with connect(args.db) as conn:
        source_id = upsert_source(conn, "futbolowo", args.url, html)
        stats = futbolowo.parse_player_stats(html, args.season)
        n = save_player_stats(conn, stats, source_id)
        print(f"Futbolowo: statystyki zawodników={n}")


def cmd_fetch_futbolowo_career(args):
    init_db(args.db)
    html, _ = fetch(args.url, timeout=args.timeout)
    with connect(args.db) as conn:
        source_id = upsert_source(conn, "futbolowo", args.url, html, "Kariera zawodnika Futbolowo")
        records = futbolowo.parse_player_career(html)
        n = save_player_stats(conn, records, source_id)
        print(f"Futbolowo kariera: rekordy sezon-klub={n}")


def cmd_crawl_futbolowo_careers(args):
    import time
    import requests
    init_db(args.db)
    base = args.base_url.rstrip('/')
    with connect(args.db) as conn:
        params = []
        season_join = ""
        season_where = ""
        if args.season:
            season_join = " JOIN player_roster_memberships prm ON prm.player_id=p.id JOIN seasons s ON s.id=prm.season_id"
            season_where = " AND s.label=?"
            params.append(args.season)
        rows = conn.execute(
            "SELECT DISTINCT p.id,p.display_name,p.external_key FROM players p" + season_join +
            " WHERE p.external_key LIKE 'futbolowo:player:%'" + season_where + " ORDER BY p.display_name", params
        ).fetchall()
        if args.limit:
            rows = rows[:args.limit]
        ok = failures = stats_total = 0
        for i, row in enumerate(rows, 1):
            player_no = row['external_key'].split(':')[-1]
            url = f"{base}/player/{player_no}/career"
            try:
                html, _ = fetch(url, timeout=args.timeout)
            except requests.HTTPError as exc:
                failures += 1
                if getattr(exc.response, 'status_code', None) == 429:
                    print(f"STOP [{i}/{len(rows)}] HTTP 429. Zachowuję postęp.")
                    break
                print(f"SKIP [{i}/{len(rows)}] {row['display_name']}: {exc}")
                continue
            except requests.RequestException as exc:
                failures += 1
                print(f"SKIP [{i}/{len(rows)}] {row['display_name']}: {exc}")
                continue
            sid = upsert_source(conn, "futbolowo", url, html, "Kariera zawodnika Futbolowo")
            records = futbolowo.parse_player_career(html, expected_player=row['display_name'])
            stats_total += save_player_stats(conn, records, sid)
            ok += 1
            print(f"OK [{i}/{len(rows)}] {row['display_name']}: sezony/kluby={len(records)}")
            time.sleep(max(0.0, args.delay))
        print(f"Crawl karier: strony={ok}, błędy={failures}, rekordy sezon-klub={stats_total}")


def cmd_fetch_futbolowo_roster(args):
    init_db(args.db)
    html, _ = fetch(args.url, timeout=args.timeout)
    with connect(args.db) as conn:
        source_id = upsert_source(conn, "futbolowo", args.url, html, f"Archiwalna kadra {args.club} {args.season}")
        records, _ = futbolowo.parse_roster(html, args.season, args.club, args.url)
        n = save_roster_memberships(
            conn, records, source_id, mark_complete=False,
            notes=f"Futbolowo lista kadry: {len(records)} zawodników; automatycznie traktowana jako częściowa",
        )
        season_id = get_or_create_season(conn, args.season)
        club_id = get_or_create_club(conn, args.club)
        conn.execute(
            """INSERT INTO club_season_coverage(season_id,club_id,dataset,is_complete,notes)
               VALUES(?,?,'roster',0,?)
               ON CONFLICT(season_id,club_id,dataset) DO UPDATE SET is_complete=0,notes=excluded.notes""",
            (season_id, club_id, f"Lista Futbolowo jest dowodem pozytywnym, nie kompletnym rosterem: {args.url}"),
        )
        roles = sum(1 for r in records if r.role)
        print(f"Futbolowo kadra: klub={args.club}, zawodnicy={n}, pozycje={roles}, kompletna=nie (bezpieczny tryb)")



def cmd_probe_futbolowo_rosters(args):
    """Safely probe known club sites for a roster matching one exact season."""
    import requests
    init_db(args.db)
    config = json.loads(Path(args.config).read_text(encoding="utf-8"))
    clubs = config.get("clubs", [])
    accepted = mismatched = empty = failures = 0
    with connect(args.db) as conn:
        for i, item in enumerate(clubs, start=1):
            club = item.get("club")
            base = (item.get("base_url") or "").rstrip("/")
            if not club or not base:
                continue
            url = base + "/roster/kadra"
            try:
                html, _ = fetch(url, timeout=args.timeout)
            except requests.HTTPError as exc:
                failures += 1
                if getattr(exc.response, "status_code", None) == 429:
                    print(f"STOP [{i}/{len(clubs)}] HTTP 429. Zachowuję dotychczasowy postęp.")
                    break
                print(f"SKIP [{i}/{len(clubs)}] {club}: HTTP {getattr(exc.response, 'status_code', '?')}")
                continue
            except requests.RequestException as exc:
                failures += 1
                print(f"SKIP [{i}/{len(clubs)}] {club}: {exc}")
                continue
            detected = futbolowo.parse_roster_page_season(html)
            if detected != args.season:
                mismatched += 1
                print(f"SKIP [{i}/{len(clubs)}] {club}: strona kadry={detected or 'brak jawnego sezonu'}, oczekiwano={args.season}")
                time.sleep(max(0.0, args.delay))
                continue
            records, _ = futbolowo.parse_roster(html, args.season, club, url)
            if not records:
                empty += 1
                print(f"SKIP [{i}/{len(clubs)}] {club}: sezon zgodny, ale brak zawodników")
                time.sleep(max(0.0, args.delay))
                continue
            sid = upsert_source(conn, "futbolowo", url, html, f"Kadra {club} {args.season}")
            n = save_roster_memberships(conn, records, sid, mark_complete=False,
                                        notes=f"Futbolowo {url}; jawny sezon {detected}; lista traktowana jako częściowa")
            season_id = get_or_create_season(conn, args.season)
            club_id = get_or_create_club(conn, club)
            conn.execute(
                """INSERT INTO club_season_coverage(season_id,club_id,dataset,is_complete,notes)
                   VALUES(?,?,'roster',0,?)
                   ON CONFLICT(season_id,club_id,dataset) DO UPDATE SET is_complete=0,notes=excluded.notes""",
                (season_id, club_id, f"Futbolowo: jawnie oznaczony sezon {detected}; {n} pozytywnych rekordów kadry; kompletność niezałożona"),
            )
            accepted += 1
            print(f"OK [{i}/{len(clubs)}] {club}: sezon={detected}, zawodnicy={n}, pozycje={sum(1 for r in records if r.role)}")
            time.sleep(max(0.0, args.delay))
    print(f"Probe kadr: przyjęte={accepted}, inny/brak sezonu={mismatched}, puste={empty}, błędy={failures}")


def _mark_season_coverage_from_page(conn, season: str, matches, standings, source_label: str) -> None:
    row = conn.execute("SELECT id FROM seasons WHERE label=?", (season,)).fetchone()
    if not row:
        return
    season_id = row[0]
    if standings:
        positions = sorted(x.position for x in standings if x.position is not None)
        full_table = positions == list(range(1, len(positions) + 1)) and len(positions) >= 6
        if full_table:
            conn.execute(
                """INSERT INTO season_coverage(season_id,dataset,is_complete,notes) VALUES(?,?,1,?)
                   ON CONFLICT(season_id,dataset) DO UPDATE SET is_complete=1,notes=excluded.notes""",
                (season_id, "standings", f"{source_label}: pełna tabela {len(standings)} drużyn"),
            )
            conn.execute(
                """INSERT INTO season_coverage(season_id,dataset,is_complete,notes) VALUES(?,?,1,?)
                   ON CONFLICT(season_id,dataset) DO UPDATE SET is_complete=1,notes=excluded.notes""",
                (season_id, "club_memberships", f"{source_label}: pełna tabela {len(standings)} drużyn"),
            )
    expected = None
    if standings and all(x.played is not None for x in standings):
        total_played = sum(x.played for x in standings if x.played is not None)
        if total_played % 2 == 0:
            expected = total_played // 2
    if expected:
        exact_matches = len(matches) == expected
        conn.execute("UPDATE seasons SET is_complete=? WHERE id=?", (int(exact_matches), season_id))
        for dataset, note in (("matches", f"{source_label}: {len(matches)}/{expected} meczów"),
                              ("dates", f"{source_label}: daty dla {sum(1 for x in matches if x.date)}/{expected} meczów")):
            complete = exact_matches if dataset == "matches" else (exact_matches and sum(1 for x in matches if x.date) == expected)
            conn.execute(
                """INSERT INTO season_coverage(season_id,dataset,is_complete,notes) VALUES(?,?,?,?)
                   ON CONFLICT(season_id,dataset) DO UPDATE SET is_complete=excluded.is_complete,notes=excluded.notes""",
                (season_id, dataset, int(complete), note),
            )



def _reconcile_source_matches(conn, source_id: int, season: str, records) -> tuple[int, int]:
    """Remove stale match evidence left by an older parser for one source page.

    A match row is deleted only when the source being reconciled was its sole
    evidence and no dependent goal/lineup/coverage data exists. Otherwise we
    remove only the stale evidence and keep the independently supported match.
    """
    row = conn.execute("SELECT id FROM seasons WHERE label=?", (season,)).fetchone()
    if not row:
        return 0, 0
    season_id = int(row[0])
    desired: set[tuple[int | None, int, int]] = set()
    for rec in records:
        desired.add((rec.round_no, get_or_create_club(conn, rec.home), get_or_create_club(conn, rec.away)))

    stale = conn.execute(
        """SELECT m.id,m.round_no,m.home_club_id,m.away_club_id
           FROM matches m JOIN match_evidence me ON me.match_id=m.id
           WHERE m.season_id=? AND me.source_id=?""",
        (season_id, source_id),
    ).fetchall()
    evidence_removed = matches_removed = 0
    for r in stale:
        key = (r["round_no"], r["home_club_id"], r["away_club_id"])
        if key in desired:
            continue
        match_id = int(r["id"])
        conn.execute("DELETE FROM match_evidence WHERE match_id=? AND source_id=?", (match_id, source_id))
        evidence_removed += 1
        other_evidence = conn.execute("SELECT COUNT(*) FROM match_evidence WHERE match_id=?", (match_id,)).fetchone()[0]
        dependent = sum(conn.execute(f"SELECT COUNT(*) FROM {table} WHERE match_id=?", (match_id,)).fetchone()[0]
                        for table in ("goals", "appearances", "match_coverage", "cards"))
        if other_evidence == 0 and dependent == 0:
            conn.execute("DELETE FROM matches WHERE id=?", (match_id,))
            matches_removed += 1
    return evidence_removed, matches_removed


def cmd_fetch_90_club_history(args):
    init_db(args.db)
    html, _ = fetch(args.url, timeout=args.timeout)
    with connect(args.db) as conn:
        source_id = upsert_source(conn, "90minut", args.url, html, "Historia rozgrywek klubu")
        parsed_club, seasons = ninetyminut.parse_club_history(html)
        club = args.club or parsed_club
        if not club:
            raise SystemExit("Nie udało się ustalić nazwy klubu. Podaj --club.")
        club_id = get_or_create_club(conn, club)
        count = 0
        for season in seasons:
            season_id = get_or_create_season(conn, season)
            conn.execute(
                """INSERT INTO club_season_memberships(season_id,club_id,source_id,confidence)
                   VALUES(?,?,?,0.92)
                   ON CONFLICT(season_id,club_id) DO UPDATE SET
                   source_id=COALESCE(club_season_memberships.source_id,excluded.source_id),
                   confidence=MAX(club_season_memberships.confidence,excluded.confidence)""",
                (season_id, club_id, source_id),
            )
            count += 1
        print(f"90minut historia: klub={club}, sezony A-klasy Myślenice={count}: {', '.join(seasons) if seasons else '-'}")


def cmd_reconcile_roster_coverage(args):
    init_db(args.db)
    with connect(args.db) as conn:
        params = []
        season_filter = ""
        if args.season:
            season_filter = " AND s.label=?"
            params.append(args.season)
        rows = conn.execute(
            """SELECT csc.season_id,csc.club_id,s.label season,c.name club,csc.is_complete
               FROM club_season_coverage csc
               JOIN seasons s ON s.id=csc.season_id JOIN clubs c ON c.id=csc.club_id
               WHERE csc.dataset='roster'""" + season_filter, params
        ).fetchall()
        checked = downgraded = 0
        for row in rows:
            checked += 1
            roster_ids = {r[0] for r in conn.execute(
                "SELECT player_id FROM player_roster_memberships WHERE season_id=? AND club_id=?",
                (row['season_id'], row['club_id']))}
            confirmed_ids = {r[0] for r in conn.execute(
                """SELECT DISTINCT ap.player_id FROM appearances ap JOIN matches m ON m.id=ap.match_id
                   WHERE m.season_id=? AND ap.club_id=?
                   UNION SELECT DISTINCT g.player_id FROM goals g JOIN matches m ON m.id=g.match_id
                   WHERE m.season_id=? AND g.club_id=? AND g.player_id IS NOT NULL
                   UNION SELECT DISTINCT pss.player_id FROM player_season_stats pss
                   WHERE pss.season_id=? AND pss.club_id=? AND (COALESCE(pss.appearances,0)>0 OR COALESCE(pss.goals,0)>0)""",
                (row['season_id'], row['club_id'], row['season_id'], row['club_id'], row['season_id'], row['club_id']))}
            outside = confirmed_ids - roster_ids
            reason = (f"Niekompletna: {len(outside)} potwierdzonych zawodnikow spoza listy" if outside
                      else "Kompletnosc niepotwierdzona niezaleznym zrodlem")
            if row['is_complete']:
                downgraded += 1
            conn.execute(
                """UPDATE club_season_coverage SET is_complete=0,notes=?
                   WHERE season_id=? AND club_id=? AND dataset='roster'""",
                (reason, row['season_id'], row['club_id']))
            print(f"{row['season']} | {row['club']}: K.OK=-; {reason}")
        print(f"Reconcile roster: sprawdzono={checked}, cofnięto kompletność={downgraded}")


def cmd_audit_players(args):
    init_db(args.db)
    with connect(args.db) as conn:
        season = conn.execute("SELECT id FROM seasons WHERE label=?", (args.season,)).fetchone()
        if not season:
            raise SystemExit(f"Brak sezonu {args.season}")
        sid = int(season[0])
        rows = conn.execute(
            """SELECT c.id,c.name,
                      (SELECT COUNT(DISTINCT prm.player_id) FROM player_roster_memberships prm WHERE prm.season_id=? AND prm.club_id=c.id) roster,
                      (SELECT COUNT(DISTINCT ap.player_id) FROM appearances ap JOIN matches m ON m.id=ap.match_id WHERE m.season_id=? AND ap.club_id=c.id) players,
                      (SELECT COUNT(DISTINCT ap.player_id) FROM appearances ap JOIN matches m ON m.id=ap.match_id WHERE m.season_id=? AND ap.club_id=c.id AND ap.starter=1) starters,
                      (SELECT COUNT(DISTINCT g.player_id) FROM goals g JOIN matches m ON m.id=g.match_id WHERE m.season_id=? AND g.club_id=c.id AND g.player_id IS NOT NULL) scorers,
                      COALESCE((SELECT is_complete FROM club_season_coverage csc WHERE csc.season_id=? AND csc.club_id=c.id AND csc.dataset='roster'),0) roster_complete
               FROM clubs c
               JOIN club_season_memberships csm ON csm.club_id=c.id AND csm.season_id=?
               ORDER BY c.name""",
            (sid, sid, sid, sid, sid, sid),
        ).fetchall()
        print("KLUB | KADRA | K.OK | POTWIERDZENI | STARTERZY | STRZELCY")
        for r in rows:
            print(f"{r['name']:28} | {r['roster']:5} | {'TAK' if r['roster_complete'] else '-':4} | {r['players']:11} | {r['starters']:9} | {r['scorers']:8}")


def cmd_fetch_regionalny(args):
    init_db(args.db)
    html, _ = fetch(args.url)
    with connect(args.db) as conn:
        source_id = upsert_source(conn, "regionalny_futbol", args.url, html)
        matches, standings = regionalny.parse_page(html, args.season)
        m = save_matches(conn, matches, source_id)
        evidence_removed, matches_removed = _reconcile_source_matches(conn, source_id, args.season, matches)
        st = save_club_stats(conn, standings, source_id)
        _mark_season_coverage_from_page(conn, args.season, matches, standings, "RegionalnyFutbol")
        dates = sum(1 for x in matches if x.date)
        print(f"RegionalnyFutbol: mecze={m}, z datą={dates}, rekordy tabeli={st}, wyczyszczone={matches_removed}")



def cmd_sync_regionalny_history(args):
    import requests
    init_db(args.db)
    seasons_ok = matches_total = failed = 0
    with connect(args.db) as conn:
        for year in range(args.start_year, args.end_year + 1):
            season = f"{year}/{str(year + 1)[-2:]}"
            url = f"https://regionalnyfutbol.pl/liga%2Cklasa-a-malopolska-grupa-myslenice-sezon-{year}-{year+1}%2Ctabela-terminarz.html"
            try:
                html, _ = fetch(url, timeout=args.timeout)
            except requests.RequestException as exc:
                failed += 1
                print(f"SKIP {season}: {exc}")
                continue
            source_id = upsert_source(conn, "regionalny_futbol", url, html, "Tabela i terminarz sezonu")
            matches, standings = regionalny.parse_page(html, season)
            if len(standings) < 6 and len(matches) < 10:
                failed += 1
                print(f"SKIP {season}: parser tabela={len(standings)}, mecze={len(matches)}")
                continue
            save_matches(conn, matches, source_id)
            evidence_removed, matches_removed = _reconcile_source_matches(conn, source_id, season, matches)
            save_club_stats(conn, standings, source_id)
            _mark_season_coverage_from_page(conn, season, matches, standings, "RegionalnyFutbol")
            seasons_ok += 1; matches_total += len(matches)
            print(f"OK {season}: drużyny={len(standings)}, mecze={len(matches)}, daty={sum(1 for x in matches if x.date)}, wyczyszczone={matches_removed}")
    print(f"Regionalny historia: sezony={seasons_ok}, mecze={matches_total}, pominięte={failed}")

def cmd_fetch_ktowygral(args):
    init_db(args.db)
    html, _ = fetch(args.url)
    with connect(args.db) as conn:
        source_id = upsert_source(conn, "ktowygral", args.url, html)
        standings = ktowygral.parse_standings(html, args.season)
        st = save_club_stats(conn, standings, source_id)
        links = ktowygral.parse_team_profile_links(html)
        save_club_profiles(conn, [club_assets.ClubProfileRecord(club=name, crest_source_url=url) for name, url in links.items()])
        if len(standings) >= 10:
            season_id = conn.execute("SELECT id FROM seasons WHERE label=?", (args.season,)).fetchone()[0]
            conn.execute(
                """INSERT INTO season_coverage(season_id,dataset,is_complete,notes) VALUES(?,?,1,?)
                   ON CONFLICT(season_id,dataset) DO UPDATE SET is_complete=1,notes=excluded.notes""",
                (season_id, "club_memberships", f"Pełna tabela KtoWygral: {len(standings)} drużyn"),
            )
        print(f"KtoWygral: rekordy tabeli={st}")


def _season_labels(start=2002, end=2026):
    for year in range(start, end + 1):
        yield f"{year}/{str(year + 1)[-2:]}", f"{year}-{year + 1}"


def cmd_sync_history(args):
    import requests
    init_db(args.db)
    imported_seasons = imported_rows = failed = 0
    with connect(args.db) as conn:
        for label, path_label in _season_labels(args.start_year, args.end_year):
            url = f"https://www.ktowygral.info/liga/klasa-a-myslenice/{path_label}"
            try:
                html, _ = fetch(url, timeout=args.timeout)
            except requests.HTTPError as exc:
                failed += 1
                if getattr(exc.response, "status_code", None) == 429:
                    print(f"STOP {label}: serwis zwrócił 429 Too Many Requests. Nie ponawiam automatycznego crawla.")
                    break
                print(f"SKIP {label}: {exc}")
                continue
            except requests.RequestException as exc:
                failed += 1
                print(f"SKIP {label}: {exc}")
                continue
            source_id = upsert_source(conn, "ktowygral", url, html)
            standings = ktowygral.parse_standings(html, label)
            if len(standings) < 6:
                failed += 1
                print(f"SKIP {label}: parser znalazł tylko {len(standings)} drużyn")
                continue
            imported_rows += save_club_stats(conn, standings, source_id)
            links = ktowygral.parse_team_profile_links(html)
            save_club_profiles(conn, [club_assets.ClubProfileRecord(club=name, crest_source_url=url) for name, url in links.items()])
            season_id = conn.execute("SELECT id FROM seasons WHERE label=?", (label,)).fetchone()[0]
            conn.execute(
                """INSERT INTO season_coverage(season_id,dataset,is_complete,notes) VALUES(?,?,1,?)
                   ON CONFLICT(season_id,dataset) DO UPDATE SET is_complete=1,notes=excluded.notes""",
                (season_id, "club_memberships", f"Tabela KtoWygral: {len(standings)} drużyn"),
            )
            imported_seasons += 1
            print(f"OK {label}: {len(standings)} drużyn")
    print(f"Historia: sezony={imported_seasons}, rekordy klub-sezon={imported_rows}, pominięte={failed}")


def cmd_import_club_catalog(args):
    init_db(args.db)
    records = club_assets.load_catalog(args.path)
    with connect(args.db) as conn:
        n = save_club_profiles(conn, records)
    print(f"Katalog klubów: {n} rekordów")


def cmd_fetch_crests(args):
    init_db(args.db)
    with connect(args.db) as conn:
        ok, skipped = club_assets.fetch_crests(conn, args.output_dir, args.overwrite, args.delay)
    print(f"Herby: pobrano={ok}, pominięto/nie znaleziono={skipped}")


def cmd_rebuild_team_coverage(args):
    init_db(args.db)
    with connect(args.db) as conn:
        season = conn.execute("SELECT id FROM seasons WHERE label=?", (args.season,)).fetchone()
        if not season:
            raise SystemExit(f"Nie znaleziono sezonu {args.season}")
        season_id = int(season[0])
        matches = conn.execute(
            """SELECT m.id,m.home_goals,m.away_goals,h.name home,a.name away
               FROM matches m JOIN clubs h ON h.id=m.home_club_id JOIN clubs a ON a.id=m.away_club_id
               WHERE m.season_id=?""", (season_id,)
        ).fetchall()
        sides = scorer_ok = starter_ok = 0
        for m in matches:
            for club, expected in ((m["home"], m["home_goals"]), (m["away"], m["away_goals"])):
                club_id = get_or_create_club(conn, club)
                goal_stats = conn.execute(
                    "SELECT COUNT(*) total, SUM(CASE WHEN player_id IS NOT NULL THEN 1 ELSE 0 END) known FROM goals WHERE match_id=? AND club_id=?",
                    (m["id"], club_id),
                ).fetchone()
                total = int(goal_stats["total"] or 0); known = int(goal_stats["known"] or 0)
                events_complete = expected is not None and total == expected
                scorers_complete = events_complete and known == expected
                starters = int(conn.execute(
                    "SELECT COUNT(*) FROM appearances WHERE match_id=? AND club_id=? AND starter=1", (m["id"], club_id)
                ).fetchone()[0])
                starters_complete = starters >= 11
                conn.execute(
                    """INSERT INTO match_team_coverage(match_id,club_id,dataset,is_complete,notes) VALUES(?,?,?,?,?)
                       ON CONFLICT(match_id,club_id,dataset) DO UPDATE SET is_complete=excluded.is_complete,notes=excluded.notes""",
                    (m["id"], club_id, "goal_events", int(events_complete), f"Rebuild: wydarzenia {total}/{expected}"),
                )
                conn.execute(
                    """INSERT INTO match_team_coverage(match_id,club_id,dataset,is_complete,notes) VALUES(?,?,?,?,?)
                       ON CONFLICT(match_id,club_id,dataset) DO UPDATE SET is_complete=excluded.is_complete,notes=excluded.notes""",
                    (m["id"], club_id, "scorers", int(scorers_complete), f"Rebuild: znani strzelcy {known}/{expected}"),
                )
                conn.execute(
                    """INSERT INTO match_team_coverage(match_id,club_id,dataset,is_complete,notes) VALUES(?,?,?,?,?)
                       ON CONFLICT(match_id,club_id,dataset) DO UPDATE SET is_complete=excluded.is_complete,notes=excluded.notes""",
                    (m["id"], club_id, "starters", int(starters_complete), f"Rebuild: starterzy {starters}/11"),
                )
                sides += 1; scorer_ok += int(scorers_complete); starter_ok += int(starters_complete)
        print(f"Pokrycie per drużyna {args.season}: strzelcy={scorer_ok}/{sides}, pełna XI={starter_ok}/{sides}")


def cmd_audit_data(args):
    init_db(args.db)
    with connect(args.db) as conn:
        print("SEZON | MECZE | OCZEK. | DELTA | Z DATA | GOLE | WYSTEPY | G.OK | XI.OK | STR.T | XI.T | DRUZYNY")
        rows = conn.execute(
            """SELECT s.id,s.label,
               (SELECT COUNT(*) FROM matches m WHERE m.season_id=s.id) matches,
               (SELECT CASE WHEN COUNT(*)>0 AND SUM(CASE WHEN played IS NULL THEN 1 ELSE 0 END)=0
                            THEN SUM(played)/2 ELSE NULL END FROM club_season_stats css WHERE css.season_id=s.id) expected,
               (SELECT COUNT(*) FROM matches m WHERE m.season_id=s.id AND m.match_date IS NOT NULL) dated,
               (SELECT COUNT(*) FROM goals g JOIN matches m ON m.id=g.match_id WHERE m.season_id=s.id) goals,
               (SELECT COUNT(*) FROM appearances a JOIN matches m ON m.id=a.match_id WHERE m.season_id=s.id) apps,
               (SELECT COUNT(*) FROM match_coverage mc JOIN matches m ON m.id=mc.match_id
                  WHERE m.season_id=s.id AND mc.dataset='goals' AND mc.is_complete=1) goals_ok,
               (SELECT COUNT(*) FROM match_coverage mc JOIN matches m ON m.id=mc.match_id
                  WHERE m.season_id=s.id AND mc.dataset='lineups' AND mc.is_complete=1) lineups_ok,
               (SELECT COUNT(*) FROM match_team_coverage mtc JOIN matches m ON m.id=mtc.match_id
                  WHERE m.season_id=s.id AND mtc.dataset='scorers' AND mtc.is_complete=1) scorer_teams_ok,
               (SELECT COUNT(*) FROM match_team_coverage mtc JOIN matches m ON m.id=mtc.match_id
                  WHERE m.season_id=s.id AND mtc.dataset='starters' AND mtc.is_complete=1) starter_teams_ok,
               (SELECT COUNT(*) FROM club_season_memberships csm WHERE csm.season_id=s.id) clubs
               FROM seasons s ORDER BY s.start_year,s.label"""
        ).fetchall()
        for r in rows:
            expected = r["expected"]
            delta = None if expected is None else r["matches"] - expected
            exp_txt = "-" if expected is None else str(expected)
            delta_txt = "-" if delta is None else f"{delta:+d}"
            print(f"{r['label']:9} | {r['matches']:5} | {exp_txt:6} | {delta_txt:5} | {r['dated']:6} | {r['goals']:4} | {r['apps']:7} | {r['goals_ok']:4} | {r['lineups_ok']:5} | {r['scorer_teams_ok']:5} | {r['starter_teams_ok']:4} | {r['clubs']:7}")
        print("\nG.OK/XI.OK = komplet całego meczu. STR.T/XI.T = komplet danych jednej drużyny w meczu; to pozwala bezpiecznie generować pytania klubowe z częściowych protokołów.")


def cmd_import_csv(args):
    init_db(args.db)
    fake_html = Path(args.path).read_text(encoding="utf-8-sig")
    with connect(args.db) as conn:
        source_id = upsert_source(conn, "manual_csv", f"file://{Path(args.path).resolve()}", fake_html, "Ręczny import CSV")
        if args.kind == "matches":
            n = save_matches(conn, import_matches_csv(args.path), source_id)
        elif args.kind == "players":
            n = save_player_stats(conn, import_player_stats_csv(args.path), source_id)
        else:
            n = save_club_stats(conn, import_club_stats_csv(args.path), source_id)
        print(f"Zaimportowano: {n}")


def cmd_complete(args):
    init_db(args.db)
    with connect(args.db) as conn:
        cur = conn.execute("UPDATE seasons SET is_complete=? WHERE label=?", (1 if args.yes else 0, args.season))
        print(f"Zmieniono sezonów: {cur.rowcount}")


def cmd_coverage(args):
    init_db(args.db)
    with connect(args.db) as conn:
        row = conn.execute("SELECT id FROM seasons WHERE label=?", (args.season,)).fetchone()
        if not row:
            raise SystemExit(f"Nie znaleziono sezonu {args.season}. Najpierw zaimportuj dane.")
        conn.execute(
            """INSERT INTO season_coverage(season_id,dataset,is_complete,notes) VALUES(?,?,?,?)
               ON CONFLICT(season_id,dataset) DO UPDATE SET is_complete=excluded.is_complete,notes=excluded.notes""",
            (row[0], args.dataset, 1 if args.complete else 0, args.notes),
        )
        print(f"Coverage: {args.season} / {args.dataset} = {'complete' if args.complete else 'incomplete'}")


def cmd_generate(args):
    init_db(args.db)
    with connect(args.db) as conn:
        questions = generate_all(conn, args.min_confidence)
        # Rebuild the active bank atomically: old questions based on records
        # removed during reconciliation must not remain enabled forever.
        conn.execute("UPDATE question_bank SET enabled=0")
        n = save_questions(conn, questions)
        print(f"Wygenerowano/zaktualizowano pytań: {n}")



def _merge_player_identity(conn, dirty_id: int, clean_name: str) -> tuple[int, bool]:
    """Merge one role-suffixed Futbolowo player into the canonical clean identity."""
    from .normalize import normalize_text

    dirty = conn.execute("SELECT * FROM players WHERE id=?", (dirty_id,)).fetchone()
    if dirty is None:
        return dirty_id, False
    clean_norm = normalize_text(clean_name)
    target = conn.execute(
        "SELECT * FROM players WHERE id<>? AND normalized_name=? ORDER BY CASE WHEN external_key IS NOT NULL THEN 0 ELSE 1 END, id LIMIT 1",
        (dirty_id, clean_norm),
    ).fetchone()
    if target is None:
        conn.execute("UPDATE players SET display_name=?, normalized_name=? WHERE id=?", (clean_name, clean_norm, dirty_id))
        conn.execute(
            "INSERT OR IGNORE INTO player_aliases(player_id,alias,normalized_alias) VALUES(?,?,?)",
            (dirty_id, dirty['display_name'], normalize_text(dirty['display_name'])),
        )
        return dirty_id, True

    target_id = int(target['id'])
    # Preserve the stable Futbolowo player id on the canonical identity.
    if not target['external_key'] and dirty['external_key']:
        conflict = conn.execute("SELECT id FROM players WHERE external_key=? AND id<>?", (dirty['external_key'], dirty_id)).fetchone()
        if conflict is None:
            conn.execute("UPDATE players SET external_key=? WHERE id=?", (dirty['external_key'], target_id))

    # Roster membership has a composite FK in its evidence table, so recreate/merge it.
    for r in conn.execute("SELECT * FROM player_roster_memberships WHERE player_id=?", (dirty_id,)).fetchall():
        existing = conn.execute(
            "SELECT * FROM player_roster_memberships WHERE season_id=? AND club_id=? AND player_id=?",
            (r['season_id'], r['club_id'], target_id),
        ).fetchone()
        if existing:
            role = existing['role'] or r['role']
            conf = max(float(existing['confidence']), float(r['confidence']))
            conn.execute(
                "UPDATE player_roster_memberships SET role=?,confidence=? WHERE season_id=? AND club_id=? AND player_id=?",
                (role, conf, r['season_id'], r['club_id'], target_id),
            )
        else:
            conn.execute(
                "INSERT INTO player_roster_memberships(season_id,club_id,player_id,role,confidence) VALUES(?,?,?,?,?)",
                (r['season_id'], r['club_id'], target_id, r['role'], r['confidence']),
            )
        for ev in conn.execute(
            "SELECT source_id,confidence FROM player_roster_membership_evidence WHERE season_id=? AND club_id=? AND player_id=?",
            (r['season_id'], r['club_id'], dirty_id),
        ).fetchall():
            conn.execute(
                """INSERT INTO player_roster_membership_evidence(season_id,club_id,player_id,source_id,confidence)
                   VALUES(?,?,?,?,?) ON CONFLICT(season_id,club_id,player_id,source_id) DO UPDATE SET
                   confidence=MAX(player_roster_membership_evidence.confidence,excluded.confidence)""",
                (r['season_id'], r['club_id'], target_id, ev['source_id'], ev['confidence']),
            )
        conn.execute(
            "DELETE FROM player_roster_memberships WHERE season_id=? AND club_id=? AND player_id=?",
            (r['season_id'], r['club_id'], dirty_id),
        )

    # Season totals: preserve evidence and merge rather than silently overwrite.
    for st in conn.execute("SELECT * FROM player_season_stats WHERE player_id=?", (dirty_id,)).fetchall():
        existing = conn.execute(
            "SELECT * FROM player_season_stats WHERE season_id=? AND club_id=? AND player_id=?",
            (st['season_id'], st['club_id'], target_id),
        ).fetchone()
        if existing:
            appearances = existing['appearances'] if existing['appearances'] is not None else st['appearances']
            goals = existing['goals'] if existing['goals'] is not None else st['goals']
            conf = max(float(existing['confidence']), float(st['confidence']))
            target_stat_id = int(existing['id'])
            conn.execute(
                "UPDATE player_season_stats SET appearances=?,goals=?,confidence=? WHERE id=?",
                (appearances, goals, conf, target_stat_id),
            )
            for ev in conn.execute("SELECT source_id,confidence FROM player_season_stat_evidence WHERE stat_id=?", (st['id'],)).fetchall():
                conn.execute(
                    """INSERT INTO player_season_stat_evidence(stat_id,source_id,confidence) VALUES(?,?,?)
                       ON CONFLICT(stat_id,source_id) DO UPDATE SET confidence=MAX(player_season_stat_evidence.confidence,excluded.confidence)""",
                    (target_stat_id, ev['source_id'], ev['confidence']),
                )
            conn.execute("DELETE FROM player_season_stats WHERE id=?", (st['id'],))
        else:
            conn.execute("UPDATE player_season_stats SET player_id=? WHERE id=?", (target_id, st['id']))

    # Match appearances may already exist under the clean identity.
    for ap in conn.execute("SELECT * FROM appearances WHERE player_id=?", (dirty_id,)).fetchall():
        existing = conn.execute(
            "SELECT * FROM appearances WHERE match_id=? AND club_id=? AND player_id=?",
            (ap['match_id'], ap['club_id'], target_id),
        ).fetchone()
        if existing:
            target_ap_id = int(existing['id'])
            conn.execute(
                """UPDATE appearances SET starter=COALESCE(starter,?),entered_minute=COALESCE(entered_minute,?),
                   left_minute=COALESCE(left_minute,?),confidence=MAX(confidence,?) WHERE id=?""",
                (ap['starter'], ap['entered_minute'], ap['left_minute'], ap['confidence'], target_ap_id),
            )
            for ev in conn.execute("SELECT source_id,confidence FROM appearance_evidence WHERE appearance_id=?", (ap['id'],)).fetchall():
                conn.execute(
                    """INSERT INTO appearance_evidence(appearance_id,source_id,confidence) VALUES(?,?,?)
                       ON CONFLICT(appearance_id,source_id) DO UPDATE SET confidence=MAX(appearance_evidence.confidence,excluded.confidence)""",
                    (target_ap_id, ev['source_id'], ev['confidence']),
                )
            conn.execute("DELETE FROM appearances WHERE id=?", (ap['id'],))
        else:
            conn.execute("UPDATE appearances SET player_id=? WHERE id=?", (target_id, ap['id']))

    # Goal/card references are simple player foreign keys. Merge duplicate exact goals conservatively.
    for g in conn.execute("SELECT * FROM goals WHERE player_id=?", (dirty_id,)).fetchall():
        existing = conn.execute(
            """SELECT id FROM goals WHERE id<>? AND match_id=? AND club_id=? AND player_id=? AND minute IS ?
               AND minute_extra IS ? AND is_penalty=? AND is_own_goal=? LIMIT 1""",
            (g['id'], g['match_id'], g['club_id'], target_id, g['minute'], g['minute_extra'], g['is_penalty'], g['is_own_goal']),
        ).fetchone()
        if existing:
            target_goal_id = int(existing['id'])
            for ev in conn.execute("SELECT source_id,confidence FROM goal_evidence WHERE goal_id=?", (g['id'],)).fetchall():
                conn.execute(
                    """INSERT INTO goal_evidence(goal_id,source_id,confidence) VALUES(?,?,?)
                       ON CONFLICT(goal_id,source_id) DO UPDATE SET confidence=MAX(goal_evidence.confidence,excluded.confidence)""",
                    (target_goal_id, ev['source_id'], ev['confidence']),
                )
            conn.execute("DELETE FROM goals WHERE id=?", (g['id'],))
        else:
            conn.execute("UPDATE goals SET player_id=? WHERE id=?", (target_id, g['id']))
    conn.execute("UPDATE cards SET player_id=? WHERE player_id=?", (target_id, dirty_id))

    conn.execute(
        "INSERT OR IGNORE INTO player_aliases(player_id,alias,normalized_alias) VALUES(?,?,?)",
        (target_id, dirty['display_name'], normalize_text(dirty['display_name'])),
    )
    conn.execute("DELETE FROM player_aliases WHERE player_id=?", (dirty_id,))
    conn.execute("DELETE FROM players WHERE id=?", (dirty_id,))
    return target_id, True


def cmd_repair_futbolowo_player_names(args):
    init_db(args.db)
    repaired = merged = 0
    with connect(args.db) as conn:
        rows = conn.execute("SELECT id,display_name FROM players ORDER BY id").fetchall()
        for row in rows:
            clean_name, role = futbolowo.split_player_and_role(row['display_name'])
            if not role or clean_name == row['display_name']:
                continue
            before_target = conn.execute(
                "SELECT id FROM players WHERE id<>? AND normalized_name=(SELECT normalized_name FROM players WHERE id=?)",
                (row['id'], row['id']),
            ).fetchone()
            target_id, changed = _merge_player_identity(conn, int(row['id']), clean_name)
            if changed:
                repaired += 1
                if target_id != int(row['id']):
                    merged += 1
        print(f"Naprawa nazw Futbolowo: poprawiono={repaired}, scalono_duplikaty={merged}")



def cmd_sync_futbolowo_club_histories(args):
    """Import positive A-class season memberships from already-discovered Futbolowo club profiles."""
    import requests
    init_db(args.db)
    ok = failures = memberships = 0
    with connect(args.db) as conn:
        rows = conn.execute(
            """SELECT cp.club_id,c.name,cp.crest_source_url FROM club_profiles cp
               JOIN clubs c ON c.id=cp.club_id
               WHERE cp.crest_source_url IS NOT NULL AND cp.crest_source_url LIKE '%/club/%'
               ORDER BY c.name"""
        ).fetchall()
        if args.limit:
            rows = rows[:args.limit]
        for i, row in enumerate(rows, 1):
            url = row['crest_source_url']
            try:
                html, _ = fetch(url, timeout=args.timeout)
            except requests.HTTPError as exc:
                failures += 1
                status = getattr(exc.response, 'status_code', None)
                if status == 429:
                    print(f"STOP [{i}/{len(rows)}] HTTP 429. Zachowuję postęp.")
                    break
                print(f"SKIP [{i}/{len(rows)}] {row['name']}: HTTP {status or '?'}")
                continue
            except requests.RequestException as exc:
                failures += 1
                print(f"SKIP [{i}/{len(rows)}] {row['name']}: {exc}")
                continue
            seasons = futbolowo.parse_club_history_seasons(html)
            sid = upsert_source(conn, 'futbolowo', url, html, f"Historia rozgrywek klubu {row['name']}")
            for season in seasons:
                season_id = get_or_create_season(conn, season)
                conn.execute(
                    """INSERT INTO club_season_memberships(season_id,club_id,source_id,confidence)
                       VALUES(?,?,?,0.82) ON CONFLICT(season_id,club_id) DO UPDATE SET
                       source_id=COALESCE(club_season_memberships.source_id,excluded.source_id),
                       confidence=MAX(club_season_memberships.confidence,excluded.confidence)""",
                    (season_id, row['club_id'], sid),
                )
                memberships += 1
            ok += 1
            print(f"OK [{i}/{len(rows)}] {row['name']}: sezony A-klasy={len(seasons)} ({', '.join(seasons) if seasons else '-'})")
            time.sleep(max(0.0, args.delay))
    print(f"Historie Futbolowo: kluby={ok}, błędy={failures}, rekordy klub-sezon={memberships}")

def cmd_sync_ktowygral_team_histories(args):
    """Fetch one profile per known club and import explicit A-class Myślenice seasons."""
    import requests
    init_db(args.db)
    config = json.loads(Path(args.config).read_text(encoding="utf-8"))
    clubs = config.get("clubs", [])
    ok = failures = records_total = 0
    with connect(args.db) as conn:
        for i, item in enumerate(clubs, 1):
            club = item.get("club")
            url = item.get("url")
            if not club or not url:
                continue
            try:
                html, _ = fetch(url, timeout=args.timeout)
            except requests.HTTPError as exc:
                failures += 1
                status = getattr(exc.response, "status_code", None)
                if status == 429:
                    print(f"STOP [{i}/{len(clubs)}] HTTP 429. Zachowuję postęp; nie omijam limitu serwisu.")
                    break
                print(f"SKIP [{i}/{len(clubs)}] {club}: HTTP {status or '?'}")
                continue
            except requests.RequestException as exc:
                failures += 1
                print(f"SKIP [{i}/{len(clubs)}] {club}: {exc}")
                continue
            sid = upsert_source(conn, "ktowygral", url, html, f"Historia drużyny {club}")
            records = ktowygral.parse_team_history_profile(html, club)
            if not records:
                print(f"SKIP [{i}/{len(clubs)}] {club}: brak jawnych sezonów A-klasy Myślenice")
                time.sleep(max(0.0, args.delay))
                continue
            save_club_stats(conn, records, sid)
            club_id = get_or_create_club(conn, club)
            for rec in records:
                season_id = get_or_create_season(conn, rec.season)
                conn.execute(
                    """INSERT INTO club_season_memberships(season_id,club_id,source_id,confidence)
                       VALUES(?,?,?,?) ON CONFLICT(season_id,club_id) DO UPDATE SET
                       source_id=COALESCE(club_season_memberships.source_id,excluded.source_id),
                       confidence=MAX(club_season_memberships.confidence,excluded.confidence)""",
                    (season_id, club_id, sid, rec.confidence),
                )
            records_total += len(records)
            ok += 1
            print(f"OK [{i}/{len(clubs)}] {club}: sezony A-klasy={len(records)} ({', '.join(r.season for r in records)})")
            time.sleep(max(0.0, args.delay))
    print(f"Historie KtoWygral: kluby={ok}, błędy={failures}, rekordy klub-sezon={records_total}")


def cmd_audit_club_history(args):
    init_db(args.db)
    with connect(args.db) as conn:
        rows = conn.execute(
            """SELECT c.name AS club, COUNT(DISTINCT csm.season_id) AS seasons,
                      MIN(s.start_year) AS first_year, MAX(s.start_year) AS last_year
               FROM club_season_memberships csm
               JOIN clubs c ON c.id=csm.club_id JOIN seasons s ON s.id=csm.season_id
               GROUP BY csm.club_id,c.name ORDER BY seasons DESC,c.name"""
        ).fetchall()
        print("KLUB | SEZONY A-KLASY | PIERWSZY | OSTATNI")
        for r in rows:
            first = f"{r['first_year']}/{(int(r['first_year'])+1)%100:02d}" if r['first_year'] is not None else '-'
            last = f"{r['last_year']}/{(int(r['last_year'])+1)%100:02d}" if r['last_year'] is not None else '-'
            print(f"{r['club']:<30} | {int(r['seasons']):>3} | {first:<7} | {last:<7}")


def _merge_club_alias_identity(conn, dirty_id: int, target_id: int) -> None:
    """Merge a known duplicate club into the canonical club.

    Intended for unambiguous naming variants only.  Before moving rows we reject
    overlapping season-level identities because those require manual reconciliation.
    """
    if dirty_id == target_id:
        return
    for table in ("club_season_memberships", "club_season_stats", "club_season_coverage"):
        overlap = conn.execute(
            f"""SELECT 1 FROM {table} a JOIN {table} b ON a.season_id=b.season_id
                WHERE a.club_id=? AND b.club_id=? LIMIT 1""",
            (dirty_id, target_id),
        ).fetchone()
        if overlap:
            raise RuntimeError(f"Nie mogę automatycznie scalić klubów: nakładają się rekordy w {table}")

    # Merge the one-to-one profile before changing foreign keys.
    dirty_profile = conn.execute("SELECT * FROM club_profiles WHERE club_id=?", (dirty_id,)).fetchone()
    target_profile = conn.execute("SELECT * FROM club_profiles WHERE club_id=?", (target_id,)).fetchone()
    if dirty_profile and target_profile:
        fields = ["short_name","city","founded_year","crest_path","crest_remote_url","crest_source_url","website_url","notes"]
        values = [target_profile[f] if target_profile[f] is not None else dirty_profile[f] for f in fields]
        conn.execute(
            "UPDATE club_profiles SET " + ",".join(f"{f}=?" for f in fields) + " WHERE club_id=?",
            (*values, target_id),
        )
        conn.execute("DELETE FROM club_profiles WHERE club_id=?", (dirty_id,))
    elif dirty_profile:
        conn.execute("UPDATE club_profiles SET club_id=? WHERE club_id=?", (target_id, dirty_id))

    # These tables do not overlap for aliases admitted by the automatic repair.
    for table, column in (
        ("matches", "home_club_id"), ("matches", "away_club_id"),
        ("goals", "club_id"), ("appearances", "club_id"),
        ("player_season_stats", "club_id"), ("club_season_stats", "club_id"),
        ("club_season_memberships", "club_id"), ("cards", "club_id"),
        ("match_team_coverage", "club_id"), ("player_roster_memberships", "club_id"),
        ("player_roster_membership_evidence", "club_id"), ("club_season_coverage", "club_id"),
    ):
        conn.execute(f"UPDATE {table} SET {column}=? WHERE {column}=?", (target_id, dirty_id))

    aliases = conn.execute("SELECT alias,normalized_alias FROM club_aliases WHERE club_id=?", (dirty_id,)).fetchall()
    for a in aliases:
        conn.execute(
            "INSERT OR IGNORE INTO club_aliases(club_id,alias,normalized_alias) VALUES(?,?,?)",
            (target_id, a['alias'], a['normalized_alias']),
        )
    conn.execute("DELETE FROM club_aliases WHERE club_id=?", (dirty_id,))
    conn.execute("DELETE FROM clubs WHERE id=?", (dirty_id,))


def cmd_repair_club_aliases(args):
    """Merge only hard-coded, unambiguous club-name variants."""
    from .normalize import canonical_club_name
    init_db(args.db)
    merged = 0
    with connect(args.db) as conn:
        rows = conn.execute("SELECT id,name FROM clubs ORDER BY id").fetchall()
        for row in rows:
            canonical = canonical_club_name(row['name'])
            if canonical == row['name']:
                continue
            target = conn.execute("SELECT id FROM clubs WHERE name=?", (canonical,)).fetchone()
            if not target:
                # Rename in place if canonical identity does not exist yet.
                from .normalize import slugify, normalize_text
                conn.execute("UPDATE clubs SET name=?,slug=? WHERE id=?", (canonical, slugify(canonical), row['id']))
                conn.execute(
                    "INSERT OR IGNORE INTO club_aliases(club_id,alias,normalized_alias) VALUES(?,?,?)",
                    (row['id'], row['name'], normalize_text(row['name'])),
                )
                print(f"RENAME {row['name']} -> {canonical}")
                merged += 1
                continue
            _merge_club_alias_identity(conn, int(row['id']), int(target['id']))
            print(f"MERGE {row['name']} -> {canonical}")
            merged += 1
    print(f"Naprawa aliasów klubów: scalono/przemianowano={merged}")


def cmd_sync_90minut_network_history(args):
    """Recursively discover Myślenice A-class seasons and clubs via 90minut.

    The crawler starts from a small, explicit seed list.  Club pages reveal league
    links; league pages reveal more club profiles.  Only links explicitly labelled
    as Myślenice A-class and seasons inside the requested range are followed.
    """
    import requests
    from collections import deque
    init_db(args.db)
    seeds = args.seed_url or [
        "https://www.90minut.pl/skarb.php?id_klub=3610&id_sezon=75",  # Pasternik Ochojno
        "https://www.90minut.pl/skarb.php?id_klub=3611&id_sezon=83",  # Pcimianka Pcim
    ]
    club_q = deque(seeds)
    league_q = deque()  # (season, url)
    seen_clubs: set[str] = set()
    seen_leagues: set[str] = set()
    clubs_ok = leagues_ok = failures = memberships = 0

    def in_range(season: str) -> bool:
        try:
            y = int(season.split('/')[0])
            return args.start_year <= y <= args.end_year
        except Exception:
            return False

    with connect(args.db) as conn:
        requests_done = 0
        while (club_q or league_q) and requests_done < args.max_pages:
            if club_q:
                url = club_q.popleft()
                if url in seen_clubs:
                    continue
                seen_clubs.add(url)
                kind = "club"
                season_hint = None
            else:
                season_hint, url = league_q.popleft()
                if url in seen_leagues:
                    continue
                seen_leagues.add(url)
                kind = "league"

            try:
                html, _ = fetch(url, timeout=args.timeout)
            except requests.HTTPError as exc:
                failures += 1
                status = getattr(exc.response, 'status_code', None)
                if status == 429:
                    print(f"STOP HTTP 429 po {requests_done} stronach. Zachowuję postęp i nie omijam limitu.")
                    break
                print(f"SKIP {kind} HTTP {status or '?'}: {url}")
                continue
            except requests.RequestException as exc:
                failures += 1
                print(f"SKIP {kind}: {exc}")
                continue
            requests_done += 1

            if kind == "club":
                sid = upsert_source(conn, "90minut", url, html, "Historia klubu / odkrywanie lig")
                club, seasons = ninetyminut.parse_club_history(html)
                if club:
                    club_id = get_or_create_club(conn, club)
                    for season in seasons:
                        if not in_range(season):
                            continue
                        season_id = get_or_create_season(conn, season)
                        conn.execute(
                            """INSERT INTO club_season_memberships(season_id,club_id,source_id,confidence)
                               VALUES(?,?,?,0.92) ON CONFLICT(season_id,club_id) DO UPDATE SET
                               source_id=COALESCE(club_season_memberships.source_id,excluded.source_id),
                               confidence=MAX(club_season_memberships.confidence,excluded.confidence)""",
                            (season_id, club_id, sid),
                        )
                        memberships += 1
                links = ninetyminut.discover_myslenice_league_links(html, url)
                for season, league_url in links.items():
                    if in_range(season) and league_url not in seen_leagues:
                        league_q.append((season, league_url))
                clubs_ok += 1
                print(f"CLUB [{clubs_ok}] {club or '?'}: sezony={len([x for x in seasons if in_range(x)])}, ligi_odkryte={len(links)}")
            else:
                sid = upsert_source(conn, "90minut", url, html, f"Liga A Myślenice {season_hint}")
                matches, standings = ninetyminut.parse_league(html, season_hint)
                save_matches(conn, matches, sid)
                save_club_stats(conn, standings, sid)
                if standings:
                    _mark_season_coverage_from_page(conn, season_hint, matches, standings, "90minut")
                profiles = ninetyminut.discover_club_profile_links(html, url)
                for _, profile_url in profiles.items():
                    if profile_url not in seen_clubs:
                        club_q.append(profile_url)
                leagues_ok += 1
                print(f"LIGA [{leagues_ok}] {season_hint}: tabela={len(standings)}, mecze={len(matches)}, profile={len(profiles)}")

            time.sleep(max(0.0, args.delay))

    print(f"90minut network: profile_klubow={clubs_ok}, ligi={leagues_ok}, członkostwa={memberships}, błędy={failures}, strony={requests_done}")


def cmd_fetch_sportowetempo_season(args):
    init_db(args.db)
    html, _ = fetch(args.url, timeout=args.timeout)
    with connect(args.db) as conn:
        source_id = upsert_source(conn, "sportowetempo", args.url, html, f"SportoweTempo A-klasa Myślenice {args.season}")
        matches, standings, reports = sportowetempo.parse_season(html, args.season, args.url)
        _reconcile_source_matches(conn, source_id, args.season, matches)
        m = save_matches(conn, matches, source_id)
        s = save_club_stats(conn, standings, source_id)
        _mark_season_coverage_from_page(conn, args.season, matches, standings, "SportoweTempo")
    print(f"SportoweTempo: mecze={m}, tabela={s}, daty={sum(1 for x in matches if x.date)}, walkowery={sum(1 for x in matches if x.status == 'walkover')}, relacje={len(reports)}")


def _save_sportowetempo_report(conn, url: str, html: str, season: str):
    sid = upsert_source(conn, "sportowetempo", url, html, "Relacja meczowa SportoweTempo")
    matches, goals, appearances = sportowetempo.parse_report(html, season)
    if not matches:
        return None, 0, 0
    save_matches(conn, matches, sid)
    g = save_goals(conn, goals, sid)
    a = save_appearances(conn, appearances, sid)
    rec = matches[0]
    total = None if rec.home_goals is None or rec.away_goals is None else rec.home_goals + rec.away_goals
    if total is not None and len(goals) == total:
        set_match_coverage(conn, rec.season, rec.home, rec.away, "goals", True, f"SportoweTempo: {len(goals)}/{total} wydarzeń bramkowych")
        for club, expected in ((rec.home, rec.home_goals), (rec.away, rec.away_goals)):
            club_goals = [x for x in goals if x.club == club]
            if expected is not None and len(club_goals) == expected and all(x.scorer is not None for x in club_goals):
                row = conn.execute("SELECT id FROM clubs WHERE normalized_name=?", (normalize_text(club),)).fetchone()
                if row:
                    set_match_team_coverage(conn, rec.season, rec.home, rec.away, club, "scorers", True, f"SportoweTempo: znani strzelcy {len(club_goals)}/{expected}")
    return rec, g, a


def cmd_fetch_sportowetempo_report(args):
    init_db(args.db)
    html, _ = fetch(args.url, timeout=args.timeout)
    with connect(args.db) as conn:
        rec, g, a = _save_sportowetempo_report(conn, args.url, html, args.season)
    if rec is None:
        print("SportoweTempo relacja: nie rozpoznano meczu")
    else:
        print(f"SportoweTempo relacja: {rec.home} - {rec.away}, gole={g}, wpisy składu={a}")


def cmd_crawl_sportowetempo_season(args):
    import requests
    init_db(args.db)
    html, _ = fetch(args.url, timeout=args.timeout)
    matches, standings, reports = sportowetempo.parse_season(html, args.season, args.url)
    if args.limit:
        reports = reports[:args.limit]
    with connect(args.db) as conn:
        source_id = upsert_source(conn, "sportowetempo", args.url, html, f"SportoweTempo A-klasa Myślenice {args.season}")
        _reconcile_source_matches(conn, source_id, args.season, matches)
        save_matches(conn, matches, source_id)
        save_club_stats(conn, standings, source_id)
        _mark_season_coverage_from_page(conn, args.season, matches, standings, "SportoweTempo")
        ok = failures = goals_total = apps_total = 0
        for i, url in enumerate(reports, 1):
            try:
                detail_html, _ = fetch(url, timeout=args.timeout)
            except requests.HTTPError as exc:
                failures += 1
                if getattr(exc.response, "status_code", None) == 429:
                    print(f"STOP [{i}/{len(reports)}] HTTP 429. Zachowuję postęp.")
                    break
                print(f"SKIP [{i}/{len(reports)}] {url}: {exc}")
                continue
            except requests.RequestException as exc:
                failures += 1
                print(f"SKIP [{i}/{len(reports)}] {url}: {exc}")
                continue
            try:
                rec, g, a = _save_sportowetempo_report(conn, url, detail_html, args.season)
            except Exception as exc:
                failures += 1
                print(f"SKIP [{i}/{len(reports)}] błąd parsera/zapisu: {url}: {type(exc).__name__}: {exc}")
                time.sleep(max(0.0, args.delay))
                continue
            if rec is None:
                failures += 1
                print(f"SKIP [{i}/{len(reports)}] nierozpoznana relacja: {url}")
            else:
                ok += 1; goals_total += g; apps_total += a
                print(f"OK [{i}/{len(reports)}] {rec.home} - {rec.away}: gole={g}, skład={a}")
            time.sleep(max(0.0, args.delay))
    print(f"Crawl SportoweTempo: relacje={ok}, błędy={failures}, gole={goals_total}, wpisy składu={apps_total}")

def cmd_validate(args):
    init_db(args.db)
    with connect(args.db) as conn:
        issues = validate_database(conn)
    for issue in issues:
        print(f"[{issue.level}] {issue.code}: {issue.message}")
    if any(x.level == "ERROR" for x in issues):
        raise SystemExit(2)


def cmd_export(args):
    init_db(args.db)
    with connect(args.db) as conn:
        n = export_questions(conn, args.output, args.min_confidence)
    print(f"Wyeksportowano {n} pytań do {args.output}")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="myslenice-quiz", description="Baza i generator quizu A-klasy Myślenice")
    p.add_argument("--db", default="data/quiz.db", help="Ścieżka do SQLite")
    sub = p.add_subparsers(required=True)

    sp = sub.add_parser("init-db"); sp.set_defaults(func=cmd_init)

    sp = sub.add_parser("fetch-mzpn"); sp.add_argument("--season", required=True); sp.add_argument("url"); sp.set_defaults(func=cmd_fetch_mzpn)
    sp = sub.add_parser("fetch-90minut"); sp.add_argument("--season", required=True); sp.add_argument("url"); sp.set_defaults(func=cmd_fetch_90)
    sp = sub.add_parser("fetch-90-club-history"); sp.add_argument("--club"); sp.add_argument("--timeout", type=int, default=20); sp.add_argument("url"); sp.set_defaults(func=cmd_fetch_90_club_history)
    sp = sub.add_parser("sync-90minut-network-history"); sp.add_argument("--start-year", type=int, default=2002); sp.add_argument("--end-year", type=int, default=2019); sp.add_argument("--timeout", type=int, default=20); sp.add_argument("--delay", type=float, default=0.8); sp.add_argument("--max-pages", type=int, default=140); sp.add_argument("--seed-url", action="append"); sp.set_defaults(func=cmd_sync_90minut_network_history)
    sp = sub.add_parser("fetch-regionalny"); sp.add_argument("--season", required=True); sp.add_argument("url"); sp.set_defaults(func=cmd_fetch_regionalny)
    sp = sub.add_parser("fetch-sportowetempo-season"); sp.add_argument("--season", required=True); sp.add_argument("--timeout", type=int, default=20); sp.add_argument("url"); sp.set_defaults(func=cmd_fetch_sportowetempo_season)
    sp = sub.add_parser("fetch-sportowetempo-report"); sp.add_argument("--season", required=True); sp.add_argument("--timeout", type=int, default=20); sp.add_argument("url"); sp.set_defaults(func=cmd_fetch_sportowetempo_report)
    sp = sub.add_parser("crawl-sportowetempo-season"); sp.add_argument("--season", required=True); sp.add_argument("--timeout", type=int, default=20); sp.add_argument("--delay", type=float, default=0.5); sp.add_argument("--limit", type=int); sp.add_argument("url"); sp.set_defaults(func=cmd_crawl_sportowetempo_season)
    sp = sub.add_parser("sync-regionalny-history"); sp.add_argument("--start-year", type=int, default=2017); sp.add_argument("--end-year", type=int, default=2025); sp.add_argument("--timeout", type=int, default=15); sp.set_defaults(func=cmd_sync_regionalny_history)
    sp = sub.add_parser("fetch-ktowygral"); sp.add_argument("--season", required=True); sp.add_argument("url"); sp.set_defaults(func=cmd_fetch_ktowygral)
    sp = sub.add_parser("sync-ktowygral-team-histories"); sp.add_argument("--config", default="config/ktowygral_team_profiles_2021_22.json"); sp.add_argument("--timeout", type=int, default=20); sp.add_argument("--delay", type=float, default=1.25); sp.set_defaults(func=cmd_sync_ktowygral_team_histories)
    sp = sub.add_parser("sync-history"); sp.add_argument("--start-year", type=int, default=2002); sp.add_argument("--end-year", type=int, default=2026); sp.add_argument("--timeout", type=int, default=15); sp.set_defaults(func=cmd_sync_history)
    sp = sub.add_parser("fetch-futbolowo-match"); sp.add_argument("--season", required=True); sp.add_argument("url"); sp.set_defaults(func=cmd_fetch_futbolowo_match)
    sp = sub.add_parser("fetch-futbolowo-schedule"); sp.add_argument("--season", required=True); sp.add_argument("--timeout", type=int, default=20); sp.add_argument("url"); sp.set_defaults(func=cmd_fetch_futbolowo_schedule)
    sp = sub.add_parser("crawl-futbolowo-schedule"); sp.add_argument("--season", required=True); sp.add_argument("--timeout", type=int, default=20); sp.add_argument("--delay", type=float, default=0.25); sp.add_argument("--limit", type=int); sp.add_argument("url"); sp.set_defaults(func=cmd_crawl_futbolowo_schedule)
    sp = sub.add_parser("fetch-futbolowo-stats"); sp.add_argument("--season", required=True); sp.add_argument("url"); sp.set_defaults(func=cmd_fetch_futbolowo_stats)
    sp = sub.add_parser("fetch-futbolowo-career"); sp.add_argument("--timeout", type=int, default=20); sp.add_argument("url"); sp.set_defaults(func=cmd_fetch_futbolowo_career)
    sp = sub.add_parser("crawl-futbolowo-careers"); sp.add_argument("--season"); sp.add_argument("--base-url", required=True); sp.add_argument("--timeout", type=int, default=20); sp.add_argument("--delay", type=float, default=0.35); sp.add_argument("--limit", type=int); sp.set_defaults(func=cmd_crawl_futbolowo_careers)
    sp = sub.add_parser("fetch-futbolowo-roster"); sp.add_argument("--season", required=True); sp.add_argument("--club", required=True); sp.add_argument("--timeout", type=int, default=20); sp.add_argument("url"); sp.set_defaults(func=cmd_fetch_futbolowo_roster)
    sp = sub.add_parser("probe-futbolowo-rosters"); sp.add_argument("--season", required=True); sp.add_argument("--config", default="config/futbolowo_club_sites_2021_22.json"); sp.add_argument("--timeout", type=int, default=20); sp.add_argument("--delay", type=float, default=0.35); sp.set_defaults(func=cmd_probe_futbolowo_rosters)
    sp = sub.add_parser("sync-futbolowo-club-histories"); sp.add_argument("--timeout", type=int, default=20); sp.add_argument("--delay", type=float, default=0.6); sp.add_argument("--limit", type=int); sp.set_defaults(func=cmd_sync_futbolowo_club_histories)

    sp = sub.add_parser("import-club-catalog"); sp.add_argument("path"); sp.set_defaults(func=cmd_import_club_catalog)
    sp = sub.add_parser("fetch-crests"); sp.add_argument("--output-dir", default="web/assets/crests"); sp.add_argument("--overwrite", action="store_true"); sp.add_argument("--delay", type=float, default=0.15); sp.set_defaults(func=cmd_fetch_crests)
    sp = sub.add_parser("rebuild-team-coverage"); sp.add_argument("--season", required=True); sp.set_defaults(func=cmd_rebuild_team_coverage)
    sp = sub.add_parser("audit-data"); sp.set_defaults(func=cmd_audit_data)
    sp = sub.add_parser("audit-club-history"); sp.set_defaults(func=cmd_audit_club_history)
    sp = sub.add_parser("reconcile-roster-coverage"); sp.add_argument("--season"); sp.set_defaults(func=cmd_reconcile_roster_coverage)
    sp = sub.add_parser("repair-futbolowo-player-names"); sp.set_defaults(func=cmd_repair_futbolowo_player_names)
    sp = sub.add_parser("repair-club-aliases"); sp.set_defaults(func=cmd_repair_club_aliases)
    sp = sub.add_parser("audit-players"); sp.add_argument("--season", required=True); sp.set_defaults(func=cmd_audit_players)
    sp = sub.add_parser("import-csv"); sp.add_argument("kind", choices=["matches", "players", "clubs"]); sp.add_argument("path"); sp.set_defaults(func=cmd_import_csv)
    sp = sub.add_parser("set-season-complete"); sp.add_argument("season"); sp.add_argument("--yes", action="store_true"); sp.set_defaults(func=cmd_complete)
    sp = sub.add_parser("set-coverage"); sp.add_argument("season"); sp.add_argument("dataset", choices=["matches","standings","club_memberships","players","goals","lineups","dates"]); sp.add_argument("--complete", action="store_true"); sp.add_argument("--notes"); sp.set_defaults(func=cmd_coverage)
    sp = sub.add_parser("import-offline-history"); sp.add_argument("path", nargs="?", default="data/reference/historical_memberships_seed.csv"); sp.set_defaults(func=cmd_import_offline_history)
    sp = sub.add_parser("generate"); sp.add_argument("--min-confidence", type=float, default=0.80); sp.set_defaults(func=cmd_generate)
    sp = sub.add_parser("validate"); sp.set_defaults(func=cmd_validate)
    sp = sub.add_parser("export"); sp.add_argument("--min-confidence", type=float, default=0.80); sp.add_argument("--output", default="web/data/questions.json"); sp.set_defaults(func=cmd_export)
    return p


def main() -> None:
    args = build_parser().parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
