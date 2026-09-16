from __future__ import annotations

from collections import defaultdict
from datetime import datetime
import sqlite3

from .base import Question, deterministic_shuffle, name_options, numeric_options, question_id, score_options


def _match_sources(conn: sqlite3.Connection, match_id: int) -> list[str]:
    return [r[0] for r in conn.execute(
        """SELECT s.url FROM match_evidence me JOIN sources s ON s.id=me.source_id
           WHERE me.match_id=? ORDER BY s.authority DESC""", (match_id,)
    )]


def _stat_sources(conn: sqlite3.Connection, stat_id: int, table: str) -> list[str]:
    mapping = {
        "club": ("club_season_stat_evidence", "stat_id"),
        "player": ("player_season_stat_evidence", "stat_id"),
    }
    evidence_table, key = mapping[table]
    return [r[0] for r in conn.execute(
        f"SELECT s.url FROM {evidence_table} e JOIN sources s ON s.id=e.source_id WHERE e.{key}=? ORDER BY s.authority DESC",
        (stat_id,),
    )]


def _goal_sources(conn: sqlite3.Connection, goal_ids: list[int]) -> list[str]:
    if not goal_ids:
        return []
    placeholders = ",".join("?" for _ in goal_ids)
    return [r[0] for r in conn.execute(
        f"""SELECT DISTINCT s.url FROM goal_evidence ge JOIN sources s ON s.id=ge.source_id
             WHERE ge.goal_id IN ({placeholders}) ORDER BY s.authority DESC""", goal_ids
    )]


def _appearance_sources(conn: sqlite3.Connection, appearance_ids: list[int]) -> list[str]:
    if not appearance_ids:
        return []
    placeholders = ",".join("?" for _ in appearance_ids)
    return [r[0] for r in conn.execute(
        f"""SELECT DISTINCT s.url FROM appearance_evidence ae JOIN sources s ON s.id=ae.source_id
             WHERE ae.appearance_id IN ({placeholders}) ORDER BY s.authority DESC""", appearance_ids
    )]


def _roster_sources(conn: sqlite3.Connection, season_id: int, club_id: int, player_id: int) -> list[str]:
    return [r[0] for r in conn.execute(
        """SELECT s.url FROM player_roster_membership_evidence e JOIN sources s ON s.id=e.source_id
             WHERE e.season_id=? AND e.club_id=? AND e.player_id=? ORDER BY s.authority DESC""",
        (season_id, club_id, player_id),
    )]


def _display_date(value: str | None) -> str | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("T", " "))
        return dt.strftime("%d.%m.%Y")
    except ValueError:
        return value[:10]


def _goal_data_complete(conn: sqlite3.Connection, match_id: int, expected_total: int | None) -> bool:
    explicit = conn.execute(
        "SELECT is_complete FROM match_coverage WHERE match_id=? AND dataset='goals'", (match_id,)
    ).fetchone()
    if explicit is not None:
        return bool(explicit[0])
    if expected_total is None:
        return False
    count = conn.execute("SELECT COUNT(1) FROM goals WHERE match_id=?", (match_id,)).fetchone()[0]
    return count == expected_total



def _team_data_complete(conn: sqlite3.Connection, match_id: int, club_id: int, dataset: str) -> bool:
    row = conn.execute(
        "SELECT is_complete FROM match_team_coverage WHERE match_id=? AND club_id=? AND dataset=?",
        (match_id, club_id, dataset),
    ).fetchone()
    return bool(row[0]) if row is not None else False

def _season_clubs(conn: sqlite3.Connection, season_id: int) -> list[str]:
    return [r[0] for r in conn.execute(
        """SELECT DISTINCT c.name FROM clubs c JOIN (
               SELECT home_club_id AS club_id FROM matches WHERE season_id=?
               UNION SELECT away_club_id FROM matches WHERE season_id=?
               UNION SELECT club_id FROM club_season_stats WHERE season_id=?
           ) x ON x.club_id=c.id ORDER BY c.name""", (season_id, season_id, season_id)
    )]


def generate_match_questions(conn: sqlite3.Connection, min_confidence: float) -> list[Question]:
    questions: list[Question] = []
    rows = conn.execute(
        """SELECT m.*,s.label season,h.name home,a.name away
           FROM matches m JOIN seasons s ON s.id=m.season_id
           JOIN clubs h ON h.id=m.home_club_id JOIN clubs a ON a.id=m.away_club_id
           WHERE m.home_goals IS NOT NULL AND m.away_goals IS NOT NULL AND m.confidence>=?""",
        (min_confidence,),
    ).fetchall()
    for r in rows:
        source_urls = _match_sources(conn, r["id"])
        score = f'{r["home_goals"]}:{r["away_goals"]}'
        qid = question_id("match_score", r["id"])
        options = deterministic_shuffle(score_options(r["home_goals"], r["away_goals"]), qid)
        if r["status"] == "walkover":
            score_prompt = f'Jaki oficjalny wynik zweryfikowano dla meczu {r["home"]} – {r["away"]} w sezonie {r["season"]}' + (f', w {r["round_no"]}. kolejce?' if r["round_no"] is not None else '?')
            score_explanation = f'Spotkanie zweryfikowano jako walkower z oficjalnym wynikiem {score}.'
        else:
            score_prompt = f'Jakim wynikiem zakończył się mecz {r["home"]} – {r["away"]} w sezonie {r["season"]}' + (f', w {r["round_no"]}. kolejce?' if r["round_no"] is not None else '?')
            score_explanation = f'Mecz zakończył się wynikiem {score}.'
        questions.append(Question(qid, "match_score", 2, score_prompt, score, options,
            score_explanation, r["season_id"], r["confidence"], source_urls))

        if r["home_goals"] > r["away_goals"]:
            winner = r["home"]
            outcome = f'Wygrana {r["home"]}'
        elif r["home_goals"] < r["away_goals"]:
            winner = r["away"]
            outcome = f'Wygrana {r["away"]}'
        else:
            winner = "Remis"
            outcome = "Remis"
        # Winner question uses two teams + draw + a neutral distractor from season.
        peers = [x for x in _season_clubs(conn, r["season_id"]) if x not in {r["home"], r["away"]}]
        choices = [r["home"], r["away"], "Remis"]
        if winner == "Remis":
            correct = "Remis"
        else:
            correct = winner
        if peers:
            choices.append(peers[0])
        else:
            choices.append("Mecz odwołano")
        qid = question_id("match_winner", r["id"])
        winner_prompt = (f'Komu przyznano zwycięstwo w meczu {r["home"]} – {r["away"]} w sezonie {r["season"]}?' if r["status"] == "walkover" else f'Kto wygrał mecz {r["home"]} – {r["away"]} w sezonie {r["season"]}?')
        winner_explanation = (f'Oficjalny wynik walkoweru {score} oznacza: {outcome}.' if r["status"] == "walkover" else f'Wynik {score} oznacza: {outcome}.')
        questions.append(Question(qid, "match_winner", 1, winner_prompt,
            correct, deterministic_shuffle(choices, qid), winner_explanation,
            r["season_id"], r["confidence"], source_urls))

        if r["status"] == "walkover":
            # Official 3:0/0:3 values are league verification scores, not a count of goals
            # actually scored on the pitch. Keep score/winner/round/date questions, but
            # do not create goal-count questions from them.
            continue_after_goal_counts = False
        else:
            continue_after_goal_counts = True

        if continue_after_goal_counts:
            total = r["home_goals"] + r["away_goals"]
            qid = question_id("match_total_goals", r["id"])
            questions.append(Question(qid, "match_total_goals", 1,
                f'Ile łącznie bramek padło w meczu {r["home"]} – {r["away"]} w sezonie {r["season"]}?',
                str(total), deterministic_shuffle(numeric_options(total), qid),
                f'Padło {r["home_goals"]} + {r["away_goals"]} = {total} bramek.', r["season_id"], r["confidence"], source_urls))

            for club, gf, ga, opponent in (
                (r["home"], r["home_goals"], r["away_goals"], r["away"]),
                (r["away"], r["away_goals"], r["home_goals"], r["home"]),
            ):
                qid = question_id("club_match_goals", r["id"], club)
                questions.append(Question(qid, "club_match_goals", 1,
                    f'Ile bramek zdobył {club} w meczu z {opponent} w sezonie {r["season"]}?',
                    str(gf), deterministic_shuffle(numeric_options(gf), qid),
                    f'{club} zdobył w tym spotkaniu {gf} bramki/bramek.', r["season_id"], r["confidence"], source_urls))
                qid = question_id("club_match_conceded", r["id"], club)
                questions.append(Question(qid, "club_match_conceded", 1,
                    f'Ile bramek stracił {club} w meczu z {opponent} w sezonie {r["season"]}?',
                    str(ga), deterministic_shuffle(numeric_options(ga), qid),
                    f'{club} stracił w tym spotkaniu {ga} bramki/bramek.', r["season_id"], r["confidence"], source_urls))

        if r["round_no"] is not None:
            clubs = [x for x in _season_clubs(conn, r["season_id"]) if x not in {r["home"], r["away"]}]
            for club, opponent in ((r["home"], r["away"]), (r["away"], r["home"])):
                qid = question_id("round_opponent", r["id"], club)
                opts = name_options(opponent, clubs)
                if len(opts) == 4:
                    questions.append(Question(qid, "round_opponent", 2,
                        f'Z kim grał {club} w {r["round_no"]}. kolejce sezonu {r["season"]}?',
                        opponent, deterministic_shuffle(opts, qid),
                        f'Rywalem był {opponent}; mecz zakończył się wynikiem {score}.', r["season_id"], r["confidence"], source_urls))
            qid = question_id("round_number", r["id"])
            questions.append(Question(qid, "round_number", 2,
                f'W której kolejce sezonu {r["season"]} rozegrano mecz {r["home"]} – {r["away"]}?',
                str(r["round_no"]), deterministic_shuffle(numeric_options(r["round_no"], minimum=1), qid),
                f'Była to {r["round_no"]}. kolejka.', r["season_id"], r["confidence"], source_urls))

        if r["status"] != "walkover" and r["home_ht"] is not None and r["away_ht"] is not None:
            ht = f'{r["home_ht"]}:{r["away_ht"]}'
            qid = question_id("halftime_score", r["id"])
            questions.append(Question(qid, "halftime_score", 3,
                f'Jaki był wynik do przerwy w meczu {r["home"]} – {r["away"]} w sezonie {r["season"]}?',
                ht, deterministic_shuffle(score_options(r["home_ht"], r["away_ht"]), qid),
                f'Do przerwy było {ht}; wynik końcowy to {score}.', r["season_id"], r["confidence"], source_urls))
    return questions


def generate_club_season_questions(conn: sqlite3.Connection, min_confidence: float) -> list[Question]:
    questions: list[Question] = []
    rows = conn.execute(
        """SELECT css.*,s.label season,c.name club,s.is_complete
           FROM club_season_stats css JOIN seasons s ON s.id=css.season_id JOIN clubs c ON c.id=css.club_id
           WHERE css.confidence>=?""", (min_confidence,)
    ).fetchall()
    by_season: dict[int, list[sqlite3.Row]] = defaultdict(list)
    for r in rows:
        by_season[r["season_id"]].append(r)
        urls = _stat_sources(conn, r["id"], "club")
        metrics = [
            ("final_position", "Które miejsce zajął {club} w A-klasie Myślenice w sezonie {season}?", r["position"], 2, "miejsce"),
            ("season_points", "Ile punktów zdobył {club} w sezonie {season}?", r["points"], 2, "punktów"),
            ("season_wins", "Ile zwycięstw odniósł {club} w sezonie {season}?", r["wins"], 3, "zwycięstw"),
            ("season_draws", "Ile remisów zanotował {club} w sezonie {season}?", r["draws"], 3, "remisów"),
            ("season_losses", "Ile porażek zanotował {club} w sezonie {season}?", r["losses"], 3, "porażek"),
            ("season_goals_for", "Ile bramek strzelił {club} w sezonie {season}?", r["goals_for"], 3, "bramek"),
            ("season_goals_against", "Ile bramek stracił {club} w sezonie {season}?", r["goals_against"], 3, "bramek straconych"),
        ]
        for qtype, template, value, difficulty, noun in metrics:
            if value is None:
                continue
            qid = question_id(qtype, r["id"])
            questions.append(Question(qid, qtype, difficulty,
                template.format(club=r["club"], season=r["season"]), str(value),
                deterministic_shuffle(numeric_options(int(value), minimum=1 if qtype == "final_position" else 0), qid),
                f'{r["club"]}: {value} {noun} w sezonie {r["season"]}.', r["season_id"], r["confidence"], urls))
        if r["goals_for"] is not None and r["goals_against"] is not None:
            diff = r["goals_for"] - r["goals_against"]
            qid = question_id("season_goal_difference", r["id"])
            # permit negative distractors
            opts = [diff, diff + 1, diff - 1, -diff if diff != 0 else 2]
            opts = list(dict.fromkeys(opts))
            extra = 3
            while len(opts) < 4:
                if extra not in opts:
                    opts.append(extra)
                extra += 1
            questions.append(Question(qid, "season_goal_difference", 4,
                f'Jaki bilans bramkowy (różnica goli) miał {r["club"]} w sezonie {r["season"]}?',
                str(diff), deterministic_shuffle([str(x) for x in opts[:4]], qid),
                f'{r["goals_for"]} zdobytych minus {r["goals_against"]} straconych = {diff}.',
                r["season_id"], r["confidence"], urls))

    for season_id, items in by_season.items():
        if len(items) < 4:
            continue
        season = items[0]["season"]
        for r in items:
            if r["position"] is None:
                continue
            peers = [x for x in items if x["club"] != r["club"] and x["position"] is not None]
            options = name_options(r["club"], [x["club"] for x in peers])
            qid = question_id("club_by_position", season_id, r["position"])
            if len(options) == 4:
                questions.append(Question(qid, "club_by_position", 3,
                    f'Który klub zajął {r["position"]}. miejsce w A-klasie Myślenice w sezonie {season}?',
                    r["club"], deterministic_shuffle(options, qid),
                    f'{r["club"]} zakończył sezon na {r["position"]}. miejscu.', season_id, r["confidence"], _stat_sources(conn, r["id"], "club")))

        # Pair comparisons: deterministic adjacent pairs only to avoid question explosion.
        ordered = sorted([x for x in items if x["position"] is not None], key=lambda x: x["position"])
        for left, right in zip(ordered[::2], ordered[1::2]):
            qid = question_id("higher_finish", season_id, left["club_id"], right["club_id"])
            correct = left["club"] if left["position"] < right["position"] else right["club"]
            choices = [left["club"], right["club"], "Zajęły to samo miejsce", "Żaden z tych klubów"]
            conf = min(left["confidence"], right["confidence"])
            urls = list(dict.fromkeys(_stat_sources(conn, left["id"], "club") + _stat_sources(conn, right["id"], "club")))
            questions.append(Question(qid, "higher_finish", 2,
                f'Który klub zakończył sezon {season} wyżej w tabeli: {left["club"]} czy {right["club"]}?',
                correct, deterministic_shuffle(choices, qid),
                f'{left["club"]}: {left["position"]}. miejsce; {right["club"]}: {right["position"]}. miejsce.',
                season_id, conf, urls))

        if all(x["goals_for"] is not None for x in items):
            best = max(items, key=lambda x: x["goals_for"])
            tied = [x for x in items if x["goals_for"] == best["goals_for"]]
            if len(tied) == 1:
                options = name_options(best["club"], [x["club"] for x in items if x["club"] != best["club"]])
                qid = question_id("most_goals_team", season_id)
                if len(options) == 4:
                    questions.append(Question(qid, "most_goals_team", 4,
                        f'Która drużyna strzeliła najwięcej bramek w A-klasie Myślenice w sezonie {season}?',
                        best["club"], deterministic_shuffle(options, qid),
                        f'{best["club"]} zdobył {best["goals_for"]} bramek.', season_id, best["confidence"], _stat_sources(conn, best["id"], "club")))
        if all(x["goals_against"] is not None for x in items):
            best = min(items, key=lambda x: x["goals_against"])
            tied = [x for x in items if x["goals_against"] == best["goals_against"]]
            if len(tied) == 1:
                options = name_options(best["club"], [x["club"] for x in items if x["club"] != best["club"]])
                qid = question_id("fewest_conceded_team", season_id)
                if len(options) == 4:
                    questions.append(Question(qid, "fewest_conceded_team", 4,
                        f'Która drużyna straciła najmniej bramek w A-klasie Myślenice w sezonie {season}?',
                        best["club"], deterministic_shuffle(options, qid),
                        f'{best["club"]} stracił {best["goals_against"]} bramek.', season_id, best["confidence"], _stat_sources(conn, best["id"], "club")))
    return questions


def generate_player_questions(conn: sqlite3.Connection, min_confidence: float) -> list[Question]:
    questions: list[Question] = []
    rows = conn.execute(
        """SELECT pss.*,s.label season,c.name club,p.display_name player
           FROM player_season_stats pss JOIN seasons s ON s.id=pss.season_id
           JOIN clubs c ON c.id=pss.club_id JOIN players p ON p.id=pss.player_id
           WHERE pss.confidence>=?""", (min_confidence,)
    ).fetchall()
    by_season: dict[int, list[sqlite3.Row]] = defaultdict(list)
    for r in rows:
        by_season[r["season_id"]].append(r)
        urls = _stat_sources(conn, r["id"], "player")
        if r["goals"] is not None:
            qid = question_id("player_season_goals", r["id"])
            questions.append(Question(qid, "player_season_goals", 3,
                f'Ile bramek strzelił {r["player"]} dla {r["club"]} w sezonie {r["season"]}?',
                str(r["goals"]), deterministic_shuffle(numeric_options(r["goals"]), qid),
                f'{r["player"]} zdobył {r["goals"]} bramek dla {r["club"]}.', r["season_id"], r["confidence"], urls))
        if r["appearances"] is not None:
            qid = question_id("player_season_appearances", r["id"])
            questions.append(Question(qid, "player_season_appearances", 4,
                f'Ile występów zanotował {r["player"]} dla {r["club"]} w sezonie {r["season"]}?',
                str(r["appearances"]), deterministic_shuffle(numeric_options(r["appearances"]), qid),
                f'{r["player"]} zanotował {r["appearances"]} występów.', r["season_id"], r["confidence"], urls))

    for season_id, items in by_season.items():
        clubs = _season_clubs(conn, season_id)
        for r in items:
            other_clubs = [x for x in clubs if x != r["club"]]
            opts = name_options(r["club"], other_clubs)
            qid = question_id("player_club_season", r["id"])
            if len(opts) == 4:
                questions.append(Question(qid, "player_club_season", 2,
                    f'W którym klubie grał {r["player"]} w A-klasie Myślenice w sezonie {r["season"]}?',
                    r["club"], deterministic_shuffle(opts, qid),
                    f'W danych sezonowych {r["player"]} jest przypisany do {r["club"]}.', season_id, r["confidence"], _stat_sources(conn, r["id"], "player")))

        # Club top scorer where the imported player table is sufficiently populated and unique.
        by_club: dict[int, list[sqlite3.Row]] = defaultdict(list)
        for r in items:
            if r["goals"] is not None:
                by_club[r["club_id"]].append(r)
        for club_id, club_items in by_club.items():
            if len(club_items) < 4:
                continue
            top = max(club_items, key=lambda x: x["goals"])
            if sum(1 for x in club_items if x["goals"] == top["goals"]) != 1:
                continue
            opts = name_options(top["player"], [x["player"] for x in sorted(club_items, key=lambda x: x["goals"], reverse=True) if x["player"] != top["player"]])
            qid = question_id("club_top_scorer", season_id, club_id)
            if len(opts) == 4:
                questions.append(Question(qid, "club_top_scorer", 4,
                    f'Kto był najskuteczniejszym strzelcem {top["club"]} w sezonie {top["season"]} według dostępnych statystyk?',
                    top["player"], deterministic_shuffle(opts, qid),
                    f'{top["player"]} zdobył {top["goals"]} bramek.', season_id, top["confidence"], _stat_sources(conn, top["id"], "player")))

        scorers = [x for x in items if x["goals"] is not None]
        scorers = sorted(scorers, key=lambda x: (x["club"], -x["goals"], x["player"]))
        for left, right in zip(scorers[::2], scorers[1::2]):
            if left["goals"] == right["goals"]:
                correct = "Tyle samo"
            else:
                correct = left["player"] if left["goals"] > right["goals"] else right["player"]
            choices = [left["player"], right["player"], "Tyle samo", "Żaden z nich"]
            qid = question_id("compare_player_goals", season_id, left["id"], right["id"])
            questions.append(Question(qid, "compare_player_goals", 3,
                f'Kto strzelił więcej goli w sezonie {left["season"]}: {left["player"]} czy {right["player"]}?',
                correct, deterministic_shuffle(choices, qid),
                f'{left["player"]}: {left["goals"]}; {right["player"]}: {right["goals"]}.', season_id,
                min(left["confidence"], right["confidence"]),
                list(dict.fromkeys(_stat_sources(conn, left["id"], "player") + _stat_sources(conn, right["id"], "player")))))
    return questions


def generate_goal_event_questions(conn: sqlite3.Connection, min_confidence: float) -> list[Question]:
    questions: list[Question] = []
    matches = conn.execute(
        """SELECT m.id,s.id season_id,s.label season,h.name home,a.name away,m.home_goals,m.away_goals,m.confidence
           FROM matches m JOIN seasons s ON s.id=m.season_id
           JOIN clubs h ON h.id=m.home_club_id JOIN clubs a ON a.id=m.away_club_id
           WHERE m.confidence>=?""", (min_confidence,)
    ).fetchall()
    for m in matches:
        goals = conn.execute(
            """SELECT g.id,g.club_id,g.minute,g.minute_extra,g.confidence,c.name club,p.display_name player
               FROM goals g JOIN clubs c ON c.id=g.club_id LEFT JOIN players p ON p.id=g.player_id
               WHERE g.match_id=? AND g.player_id IS NOT NULL AND g.confidence>=?
               ORDER BY COALESCE(g.minute,999),COALESCE(g.minute_extra,0),g.id""", (m["id"], min_confidence)
        ).fetchall()
        if not goals:
            continue
        players = list(dict.fromkeys(g["player"] for g in goals))
        # Add peers from season stats for plausible distractors.
        peer_players = [r[0] for r in conn.execute(
            """SELECT DISTINCT p.display_name FROM player_season_stats pss JOIN players p ON p.id=pss.player_id
               WHERE pss.season_id=? AND pss.confidence>=? ORDER BY p.display_name""", (m["season_id"], min_confidence)
        )]
        all_peers = list(dict.fromkeys(players + peer_players))
        by_club: dict[str, list[sqlite3.Row]] = defaultdict(list)
        for g in goals:
            by_club[g["club"]].append(g)
        for club, club_goals in by_club.items():
            opponent = m["away"] if club == m["home"] else m["home"]
            unique_scorers = list(dict.fromkeys(g["player"] for g in club_goals))
            for scorer in unique_scorers:
                opts = name_options(scorer, [p for p in all_peers if p != scorer])
                qid = question_id("match_scorer", m["id"], club, scorer)
                if len(opts) == 4:
                    goal_ids = [g["id"] for g in club_goals if g["player"] == scorer]
                    questions.append(Question(qid, "match_scorer", 3,
                        f'Kto był jednym ze strzelców bramek dla {club} w meczu z {opponent} w sezonie {m["season"]}?',
                        scorer, deterministic_shuffle(opts, qid),
                        f'{scorer} figuruje jako strzelec bramki/bramek {club} w tym meczu.', m["season_id"],
                        min([m["confidence"]] + [g["confidence"] for g in club_goals if g["player"] == scorer]), _goal_sources(conn, goal_ids)))

            # Exact individual totals require all scorer identities for THIS club,
            # not necessarily a complete scorer list for the opponent.
            if _team_data_complete(conn, m["id"], club_goals[0]["club_id"], "scorers"):
                for scorer in unique_scorers:
                    scorer_goals = [g for g in club_goals if g["player"] == scorer]
                    count_goals = len(scorer_goals)
                    qid = question_id("player_match_goals", m["id"], scorer)
                    questions.append(Question(qid, "player_match_goals", 4,
                        f'Ile bramek strzelił {scorer} dla {club} w meczu z {opponent} w sezonie {m["season"]}?',
                        str(count_goals), deterministic_shuffle(numeric_options(count_goals, minimum=1), qid),
                        f'Kompletny zapis bramek pokazuje {count_goals} trafienia {scorer}.', m["season_id"],
                        min(g["confidence"] for g in scorer_goals), _goal_sources(conn, [g["id"] for g in scorer_goals])))

            if len(unique_scorers) >= 1:
                count = len(unique_scorers)
                qid = question_id("different_scorers_match", m["id"], club)
                questions.append(Question(qid, "different_scorers_match", 4,
                    f'Ilu różnych znanych strzelców bramek miał {club} w meczu z {opponent} w sezonie {m["season"]}?',
                    str(count), deterministic_shuffle(numeric_options(count, minimum=1), qid),
                    f'W bazie dla tego meczu występuje {count} różnych znanych strzelców {club}.', m["season_id"],
                    min(g["confidence"] for g in club_goals), _goal_sources(conn, [g["id"] for g in club_goals])))

        timed = [g for g in goals if g["minute"] is not None]
        for g in timed:
            minute_label = str(g["minute"]) if not g["minute_extra"] else f'{g["minute"]}+{g["minute_extra"]}'
            base = g["minute"] + (g["minute_extra"] or 0)
            opts = [minute_label]
            for delta in (1, -1, 2, -2, 5, -5):
                val = max(1, base + delta)
                label = str(val)
                if label not in opts:
                    opts.append(label)
                if len(opts) == 4:
                    break
            qid = question_id("scorer_minute", g["id"])
            questions.append(Question(qid, "scorer_minute", 4,
                f'W której minucie {g["player"]} zdobył bramkę w meczu {m["home"]} – {m["away"]} w sezonie {m["season"]}?',
                minute_label, deterministic_shuffle(opts[:4], qid),
                f'Gol {g["player"]} jest zapisany przy {minute_label}. minucie.', m["season_id"],
                min(m["confidence"], g["confidence"]), _goal_sources(conn, [g["id"]])))

        if timed:
            earliest_min = min((g["minute"], g["minute_extra"] or 0) for g in timed)
            firsts = [g for g in timed if (g["minute"], g["minute_extra"] or 0) == earliest_min]
            if len(firsts) == 1:
                first = firsts[0]
                opts = name_options(first["player"], [p for p in all_peers if p != first["player"]])
                qid = question_id("first_scorer_match", m["id"])
                if len(opts) == 4:
                    questions.append(Question(qid, "first_scorer_match", 5,
                        f'Kto strzelił pierwszą znaną bramkę w meczu {m["home"]} – {m["away"]} w sezonie {m["season"]}?',
                        first["player"], deterministic_shuffle(opts, qid),
                        f'Najwcześniejszy zapisany gol należy do {first["player"]}.', m["season_id"],
                        min(m["confidence"], first["confidence"]), _goal_sources(conn, [first["id"]])))
    return questions


def generate_derived_match_questions(conn: sqlite3.Connection, min_confidence: float) -> list[Question]:
    """Questions derivable from a complete season's match list only."""
    questions: list[Question] = []
    seasons = conn.execute("SELECT id,label FROM seasons WHERE is_complete=1").fetchall()
    for season in seasons:
        matches = conn.execute(
            """SELECT m.*,h.name home,a.name away FROM matches m
               JOIN clubs h ON h.id=m.home_club_id JOIN clubs a ON a.id=m.away_club_id
               WHERE m.season_id=? AND m.home_goals IS NOT NULL AND m.away_goals IS NOT NULL AND m.confidence>=?
               ORDER BY COALESCE(m.round_no,999),COALESCE(m.match_date,''),m.id""", (season["id"], min_confidence)
        ).fetchall()
        if not matches:
            continue
        club_matches: dict[int, list[tuple[sqlite3.Row, bool]]] = defaultdict(list)
        for m in matches:
            club_matches[m["home_club_id"]].append((m, True))
            club_matches[m["away_club_id"]].append((m, False))
        for club_id, items in club_matches.items():
            club_name = conn.execute("SELECT name FROM clubs WHERE id=?", (club_id,)).fetchone()[0]
            # Biggest win, highest-scoring game, clean sheets, BTTS, max winning streak.
            wins = []
            clean_sheets = 0
            btts = 0
            streak = max_streak = 0
            for m, is_home in items:
                gf = m["home_goals"] if is_home else m["away_goals"]
                ga = m["away_goals"] if is_home else m["home_goals"]
                if gf > ga:
                    wins.append((gf - ga, gf + ga, m, is_home))
                    streak += 1
                    max_streak = max(max_streak, streak)
                else:
                    streak = 0
                if ga == 0:
                    clean_sheets += 1
                if gf > 0 and ga > 0:
                    btts += 1
            urls = list(dict.fromkeys(url for m, _ in items for url in _match_sources(conn, m["id"])))
            conf = min(m["confidence"] for m, _ in items)
            for qtype, value, prompt, explanation in (
                ("season_clean_sheets", clean_sheets, f'Ile czystych kont zanotował {club_name} w sezonie {season["label"]}?', f'{club_name} zakończył {clean_sheets} meczów bez straty gola.'),
                ("season_btts", btts, f'W ilu meczach {club_name} w sezonie {season["label"]} obie drużyny strzelały gola?', f'Takich spotkań było {btts}.'),
                ("longest_winning_streak", max_streak, f'Jaka była najdłuższa seria kolejnych zwycięstw {club_name} w sezonie {season["label"]}?', f'Najdłuższa seria wyniosła {max_streak} meczów.'),
            ):
                qid = question_id(qtype, season["id"], club_id)
                questions.append(Question(qid, qtype, 5, prompt, str(value),
                    deterministic_shuffle(numeric_options(value), qid), explanation, season["id"], conf, urls))
            if wins:
                max_margin = max(x[0] for x in wins)
                biggest = [x for x in wins if x[0] == max_margin]
                if len(biggest) == 1:
                    _, _, m, is_home = biggest[0]
                    opponent = m["away"] if is_home else m["home"]
                    peers = [x for x in _season_clubs(conn, season["id"]) if x not in {club_name, opponent}]
                    opts = name_options(opponent, peers)
                    qid = question_id("biggest_win_opponent", season["id"], club_id)
                    if len(opts) == 4:
                        questions.append(Question(qid, "biggest_win_opponent", 5,
                            f'Z kim {club_name} odniósł swoje najwyższe zwycięstwo w sezonie {season["label"]}?',
                            opponent, deterministic_shuffle(opts, qid),
                            f'Najwyższe zwycięstwo miało różnicę {max_margin} bramek.', season["id"], m["confidence"], _match_sources(conn, m["id"])))
                # no question if multiple matches share the same highest margin

            totals = [(m["home_goals"] + m["away_goals"], m, is_home) for m, is_home in items]
            max_total = max(x[0] for x in totals)
            highest = [x for x in totals if x[0] == max_total]
            if len(highest) == 1:
                _, m, is_home = highest[0]
                opponent = m["away"] if is_home else m["home"]
                peers = [x for x in _season_clubs(conn, season["id"]) if x not in {club_name, opponent}]
                opts = name_options(opponent, peers)
                qid = question_id("highest_scoring_match_opponent", season["id"], club_id)
                if len(opts) == 4:
                    questions.append(Question(qid, "highest_scoring_match_opponent", 5,
                        f'Z kim {club_name} rozegrał swój mecz z największą łączną liczbą bramek w sezonie {season["label"]}?',
                        opponent, deterministic_shuffle(opts, qid),
                        f'W tym spotkaniu padło łącznie {max_total} bramek.', season["id"], m["confidence"], _match_sources(conn, m["id"])))
    return questions


def generate_date_round_questions(conn: sqlite3.Connection, min_confidence: float) -> list[Question]:
    questions: list[Question] = []
    rows = conn.execute(
        """SELECT m.*,s.label season,h.name home,a.name away
           FROM matches m JOIN seasons s ON s.id=m.season_id
           JOIN clubs h ON h.id=m.home_club_id JOIN clubs a ON a.id=m.away_club_id
           WHERE m.match_date IS NOT NULL AND m.confidence>=?""", (min_confidence,)
    ).fetchall()
    by_season: dict[int, list[sqlite3.Row]] = defaultdict(list)
    for r in rows:
        by_season[r["season_id"]].append(r)
    weekdays = ["poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota", "niedziela"]
    for season_id, items in by_season.items():
        distinct_dates = list(dict.fromkeys(filter(None, (_display_date(x["match_date"]) for x in items))))
        for r in items:
            answer = _display_date(r["match_date"])
            if answer:
                opts = name_options(answer, [x for x in distinct_dates if x != answer])
                qid = question_id("match_date", r["id"])
                if len(opts) == 4:
                    questions.append(Question(qid, "match_date", 3,
                        f'Kiedy rozegrano mecz {r["home"]} – {r["away"]} w sezonie {r["season"]}?',
                        answer, deterministic_shuffle(opts, qid),
                        f'Spotkanie rozegrano {answer}.', season_id, r["confidence"], _match_sources(conn, r["id"])))
            if r["round_no"] is not None:
                qid = question_id("match_round", r["id"])
                questions.append(Question(qid, "match_round", 2,
                    f'W której kolejce sezonu {r["season"]} rozegrano mecz {r["home"]} – {r["away"]}?',
                    str(r["round_no"]), deterministic_shuffle(numeric_options(r["round_no"], minimum=1), qid),
                    f'Była to {r["round_no"]}. kolejka.', season_id, r["confidence"], _match_sources(conn, r["id"])))
            try:
                dt = datetime.fromisoformat(r["match_date"].replace("T", " "))
            except ValueError:
                continue
            day = weekdays[dt.weekday()]
            distractors = [weekdays[(dt.weekday()+x) % 7] for x in (1, -1, 2)]
            qid = question_id("match_weekday", r["id"])
            questions.append(Question(qid, "match_weekday", 2,
                f'W jaki dzień tygodnia rozegrano {r["home"]} – {r["away"]} w sezonie {r["season"]}?',
                day, deterministic_shuffle([day, *distractors], qid),
                f'Data meczu to {_display_date(r["match_date"])} — był to {day}.', season_id, r["confidence"], _match_sources(conn, r["id"])))
    return questions


def generate_lineup_questions(conn: sqlite3.Connection, min_confidence: float) -> list[Question]:
    questions: list[Question] = []
    matches = conn.execute(
        """SELECT m.id,m.season_id,s.label season,h.name home,a.name away,m.confidence
           FROM matches m JOIN seasons s ON s.id=m.season_id
           JOIN clubs h ON h.id=m.home_club_id JOIN clubs a ON a.id=m.away_club_id
           WHERE m.confidence>=?""", (min_confidence,)
    ).fetchall()
    for m in matches:
        rows = conn.execute(
            """SELECT ap.id,ap.club_id,ap.starter,ap.entered_minute,ap.left_minute,ap.confidence,
                      p.display_name player,c.name club,ad.shirt_number,ad.is_captain
               FROM appearances ap JOIN players p ON p.id=ap.player_id JOIN clubs c ON c.id=ap.club_id
               LEFT JOIN appearance_details ad ON ad.appearance_id=ap.id
               WHERE ap.match_id=? AND ap.confidence>=? ORDER BY c.name,ap.starter DESC,p.display_name""",
            (m["id"], min_confidence),
        ).fetchall()
        if not rows:
            continue
        by_club: dict[str, list[sqlite3.Row]] = defaultdict(list)
        for r in rows:
            by_club[r["club"]].append(r)
        for club, entries in by_club.items():
            opponent = m["away"] if club == m["home"] else m["home"]
            starters = [r for r in entries if r["starter"] == 1]
            bench = [r for r in entries if r["starter"] == 0]
            if len(bench) >= 3:
                for st in starters[:4]:
                    opts = [st["player"]] + [x["player"] for x in bench[:3]]
                    if len(set(opts)) != 4:
                        continue
                    qid = question_id("starting_xi_player", m["id"], st["id"])
                    questions.append(Question(qid, "starting_xi_player", 4,
                        f'Który z tych zawodników rozpoczął mecz {club} z {opponent} w podstawowym składzie?',
                        st["player"], deterministic_shuffle(opts, qid),
                        f'{st["player"]} figuruje w składzie wyjściowym {club}.', m["season_id"],
                        min(m["confidence"], st["confidence"]), _appearance_sources(conn, [st["id"], *[x["id"] for x in bench[:3]]])))
            entered = [r for r in bench if r["entered_minute"] is not None]
            if len(starters) >= 3:
                for sub in entered[:4]:
                    opts = [sub["player"]] + [x["player"] for x in starters[:3]]
                    if len(set(opts)) != 4:
                        continue
                    qid = question_id("came_off_bench", m["id"], sub["id"])
                    questions.append(Question(qid, "came_off_bench", 4,
                        f'Który zawodnik {club} wszedł z ławki w meczu z {opponent}?',
                        sub["player"], deterministic_shuffle(opts, qid),
                        f'{sub["player"]} wszedł z ławki w {sub["entered_minute"]}. minucie.', m["season_id"],
                        min(m["confidence"], sub["confidence"]), _appearance_sources(conn, [sub["id"]])))
                    qid2 = question_id("substitution_minute_in", m["id"], sub["id"])
                    questions.append(Question(qid2, "substitution_minute_in", 5,
                        f'W której minucie {sub["player"]} wszedł na boisko w meczu {club} – {opponent}?',
                        str(sub["entered_minute"]), deterministic_shuffle(numeric_options(sub["entered_minute"], minimum=1), qid2),
                        f'Zmiana jest zapisana przy {sub["entered_minute"]}. minucie.', m["season_id"], sub["confidence"], _appearance_sources(conn, [sub["id"]])))
            captain = [r for r in starters if r["is_captain"] == 1]
            noncaptains = [r for r in starters if r["is_captain"] == 0]
            if len(captain) == 1 and len(noncaptains) >= 3:
                cap = captain[0]
                opts = [cap["player"]] + [x["player"] for x in noncaptains[:3]]
                qid = question_id("match_captain", m["id"], club)
                questions.append(Question(qid, "match_captain", 5,
                    f'Kto był kapitanem {club} w meczu z {opponent}?', cap["player"], deterministic_shuffle(opts, qid),
                    f'Przy {cap["player"]} widnieje oznaczenie kapitana.', m["season_id"], cap["confidence"], _appearance_sources(conn, [cap["id"]])))
            for r in entries:
                if r["shirt_number"] is None:
                    continue
                qid = question_id("shirt_number_match", m["id"], r["id"])
                questions.append(Question(qid, "shirt_number_match", 5,
                    f'Z jakim numerem grał {r["player"]} w meczu {club} – {opponent}?',
                    str(r["shirt_number"]), deterministic_shuffle(numeric_options(r["shirt_number"], minimum=1), qid),
                    f'W protokole {r["player"]} ma numer {r["shirt_number"]}.', m["season_id"], r["confidence"], _appearance_sources(conn, [r["id"]])))
        coverage = conn.execute("SELECT is_complete FROM match_coverage WHERE match_id=? AND dataset='lineups'", (m["id"],)).fetchone()
        if coverage and coverage[0]:
            for club, entries in by_club.items():
                opponent = m["away"] if club == m["home"] else m["home"]
                used = [r for r in entries if r["starter"] == 0 and r["entered_minute"] is not None]
                qid = question_id("substitutes_used", m["id"], club)
                questions.append(Question(qid, "substitutes_used", 4,
                    f'Ilu rezerwowych {club} weszło na boisko w meczu z {opponent}?',
                    str(len(used)), deterministic_shuffle(numeric_options(len(used)), qid),
                    f'Kompletny protokół składu pokazuje {len(used)} wejść z ławki.', m["season_id"],
                    min([m["confidence"]] + [r["confidence"] for r in entries]), _appearance_sources(conn, [r["id"] for r in entries])))
    return questions



def generate_confirmed_appearance_questions(conn: sqlite3.Connection, min_confidence: float) -> list[Question]:
    """Generate questions from positive match-level appearance facts.

    These do not require a complete season roster. A recorded appearance proves the
    player represented that club in that specific match, so the question remains safe
    even when the opposing lineup is missing.
    """
    questions: list[Question] = []
    rows = conn.execute(
        """SELECT ap.id,ap.match_id,ap.club_id,ap.starter,ap.confidence,
                  p.display_name player,c.name club,s.id season_id,s.label season,
                  h.name home,a.name away
           FROM appearances ap
           JOIN players p ON p.id=ap.player_id
           JOIN clubs c ON c.id=ap.club_id
           JOIN matches m ON m.id=ap.match_id
           JOIN seasons s ON s.id=m.season_id
           JOIN clubs h ON h.id=m.home_club_id
           JOIN clubs a ON a.id=m.away_club_id
           WHERE ap.confidence>=?
           ORDER BY ap.match_id,ap.id""", (min_confidence,)
    ).fetchall()
    for r in rows:
        # Guard against contradictory data where one player is assigned to both teams.
        dup = conn.execute(
            "SELECT COUNT(DISTINCT club_id) FROM appearances WHERE match_id=? AND player_id=(SELECT player_id FROM appearances WHERE id=?)",
            (r["match_id"], r["id"]),
        ).fetchone()[0]
        if dup != 1:
            continue
        opponent = r["away"] if r["club"] == r["home"] else r["home"]
        peers = [opponent] + [x for x in _season_clubs(conn, r["season_id"]) if x not in {r["club"], opponent}]
        opts = name_options(r["club"], peers)
        if len(opts) == 4:
            qid = question_id("player_match_club", r["id"])
            questions.append(Question(
                qid, "player_match_club", 3,
                f'W barwach którego klubu wystąpił {r["player"]} w meczu {r["home"]} – {r["away"]} w sezonie {r["season"]}?',
                r["club"], deterministic_shuffle(opts, qid),
                f'{r["player"]} figuruje w protokole tego meczu po stronie {r["club"]}.',
                r["season_id"], r["confidence"], _appearance_sources(conn, [r["id"]])
            ))
        if r["starter"] is not None:
            correct = "Podstawowy skład" if r["starter"] == 1 else "Ławka rezerwowych"
            opts2 = ["Podstawowy skład", "Ławka rezerwowych", "Nie był w protokole", "Sztab szkoleniowy"]
            qid2 = question_id("player_match_role", r["id"])
            questions.append(Question(
                qid2, "player_match_role", 3,
                f'Jaką rolę miał {r["player"]} w protokole {r["club"]} na mecz z {opponent}?',
                correct, deterministic_shuffle(opts2, qid2),
                f'W danych meczowych {r["player"]} jest zapisany jako {correct.lower()}.',
                r["season_id"], r["confidence"], _appearance_sources(conn, [r["id"]])
            ))
    return questions

def generate_complete_goal_questions(conn: sqlite3.Connection, min_confidence: float) -> list[Question]:
    questions: list[Question] = []
    matches = conn.execute(
        """SELECT m.*,s.label season,h.name home,a.name away FROM matches m
           JOIN seasons s ON s.id=m.season_id JOIN clubs h ON h.id=m.home_club_id JOIN clubs a ON a.id=m.away_club_id
           WHERE m.home_goals IS NOT NULL AND m.away_goals IS NOT NULL AND m.confidence>=?""", (min_confidence,)
    ).fetchall()
    for m in matches:
        total = m["home_goals"] + m["away_goals"]
        if total <= 0 or not _goal_data_complete(conn, m["id"], total):
            continue
        goals = conn.execute(
            """SELECT g.id,g.club_id,g.minute,g.minute_extra,g.confidence,p.display_name player,c.name club
               FROM goals g LEFT JOIN players p ON p.id=g.player_id JOIN clubs c ON c.id=g.club_id
               WHERE g.match_id=? ORDER BY COALESCE(g.minute,999),COALESCE(g.minute_extra,0),g.id""", (m["id"],)
        ).fetchall()
        known = [g for g in goals if g["player"] is not None]
        if len(known) != len(goals):
            continue
        counts: dict[str, int] = defaultdict(int)
        for g in known:
            counts[g["player"]] += 1
        for player, count in counts.items():
            ids = [g["id"] for g in known if g["player"] == player]
            qid = question_id("player_match_goals_complete", m["id"], player)
            questions.append(Question(qid, "player_match_goals_complete", 4,
                f'Ile bramek strzelił {player} w meczu {m["home"]} – {m["away"]}?',
                str(count), deterministic_shuffle(numeric_options(count, minimum=1), qid),
                f'Kompletny zapis bramek przypisuje {player} {count} trafienie/trafienia.', m["season_id"],
                min([m["confidence"]] + [g["confidence"] for g in known if g["player"] == player]), _goal_sources(conn, ids)))
        timed = [g for g in known if g["minute"] is not None]
        if len(timed) == len(known):
            first_key = min((g["minute"], g["minute_extra"] or 0) for g in timed)
            last_key = max((g["minute"], g["minute_extra"] or 0) for g in timed)
            for qtype, key, stem in (("first_scorer_complete", first_key, "pierwszą"), ("last_scorer_complete", last_key, "ostatnią")):
                selected = [g for g in timed if (g["minute"], g["minute_extra"] or 0) == key]
                if len(selected) != 1:
                    continue
                g = selected[0]
                peers = list(dict.fromkeys(x["player"] for x in timed if x["player"] != g["player"]))
                # Pull same-season scorers if needed for distractors.
                peers += [r[0] for r in conn.execute(
                    """SELECT DISTINCT p.display_name FROM goals gg JOIN matches mm ON mm.id=gg.match_id JOIN players p ON p.id=gg.player_id
                       WHERE mm.season_id=? AND p.display_name<>? LIMIT 20""", (m["season_id"], g["player"])).fetchall()]
                opts = name_options(g["player"], peers)
                if len(opts) != 4:
                    continue
                qid = question_id(qtype, m["id"])
                questions.append(Question(qid, qtype, 5,
                    f'Kto zdobył {stem} bramkę w meczu {m["home"]} – {m["away"]}?',
                    g["player"], deterministic_shuffle(opts, qid),
                    f'{g["player"]} jest {"pierwszym" if "first" in qtype else "ostatnim"} strzelcem w kompletnym zapisie bramek.',
                    m["season_id"], min(m["confidence"], g["confidence"]), _goal_sources(conn, [g["id"]])))
        scorers = len(counts)
        qid = question_id("distinct_scorers_complete", m["id"])
        questions.append(Question(qid, "distinct_scorers_complete", 5,
            f'Ilu różnych zawodników zdobyło bramki w meczu {m["home"]} – {m["away"]}?',
            str(scorers), deterministic_shuffle(numeric_options(scorers, minimum=1), qid),
            f'Kompletny zapis meczu zawiera {scorers} różnych strzelców.', m["season_id"],
            min([m["confidence"]] + [g["confidence"] for g in known]), _goal_sources(conn, [g["id"] for g in known])))

        multi = [(player, count) for player, count in counts.items() if count >= 2]
        for player, count in multi:
            if count >= 3:
                other_players = [p for p, c in counts.items() if p != player and c < 3]
            else:
                other_players = [p for p, c in counts.items() if p != player and c != 2]
            other_players += [r[0] for r in conn.execute(
                """SELECT DISTINCT p.display_name FROM player_season_stats ps JOIN players p ON p.id=ps.player_id
                   WHERE ps.season_id=? AND p.display_name<>? LIMIT 20""", (m["season_id"], player)).fetchall()]
            opts = name_options(player, other_players)
            if len(opts) == 4:
                qtype = "hattrick_scorer" if count >= 3 else "brace_scorer"
                word = "co najmniej trzy" if count >= 3 else "dokładnie dwie"
                qid = question_id(qtype, m["id"], player)
                questions.append(Question(qid, qtype, 5,
                    f'Który zawodnik zdobył {word} bramki w meczu {m["home"]} – {m["away"]}?',
                    player, deterministic_shuffle(opts, qid),
                    f'{player} zdobył w tym meczu {count} bramki/bramek.', m["season_id"],
                    min(g["confidence"] for g in known if g["player"] == player),
                    _goal_sources(conn, [g["id"] for g in known if g["player"] == player])))

        if timed and len(timed) == len(known):
            first_half = sum(1 for g in timed if (g["minute"] or 999) <= 45)
            second_half = len(timed) - first_half
            for qtype, val, label in (("first_half_goal_count", first_half, "pierwszej połowie"), ("second_half_goal_count", second_half, "drugiej połowie")):
                qid = question_id(qtype, m["id"])
                questions.append(Question(qid, qtype, 4,
                    f'Ile bramek padło w {label} meczu {m["home"]} – {m["away"]}?',
                    str(val), deterministic_shuffle(numeric_options(val), qid),
                    f'Kompletny zapis minut bramek daje {val} trafień w {label}.', m["season_id"],
                    min(g["confidence"] for g in timed), _goal_sources(conn, [g["id"] for g in timed])))
    return questions


def generate_round_questions(conn: sqlite3.Connection, min_confidence: float) -> list[Question]:
    questions: list[Question] = []
    covered = [r[0] for r in conn.execute(
        "SELECT season_id FROM season_coverage WHERE dataset='matches' AND is_complete=1"
    )]
    for season_id in covered:
        season = conn.execute("SELECT label FROM seasons WHERE id=?", (season_id,)).fetchone()[0]
        rows = conn.execute(
            """SELECT m.*,h.name home,a.name away FROM matches m JOIN clubs h ON h.id=m.home_club_id JOIN clubs a ON a.id=m.away_club_id
               WHERE m.season_id=? AND m.round_no IS NOT NULL AND m.home_goals IS NOT NULL AND m.away_goals IS NOT NULL AND m.confidence>=?""",
            (season_id, min_confidence),
        ).fetchall()
        by_round: dict[int, list[sqlite3.Row]] = defaultdict(list)
        for r in rows:
            by_round[r["round_no"]].append(r)
        for rnd, games in by_round.items():
            total = sum(g["home_goals"] + g["away_goals"] for g in games)
            urls = list(dict.fromkeys(u for g in games for u in _match_sources(conn, g["id"])))
            conf = min(g["confidence"] for g in games)
            qid = question_id("round_total_goals", season_id, rnd)
            questions.append(Question(qid, "round_total_goals", 4,
                f'Ile łącznie bramek padło w {rnd}. kolejce sezonu {season}?',
                str(total), deterministic_shuffle(numeric_options(total), qid),
                f'W meczach tej kolejki padło łącznie {total} bramek.', season_id, conf, urls))
            totals = [(g["home_goals"] + g["away_goals"], g) for g in games]
            best_total = max(t[0] for t in totals)
            best = [g for t, g in totals if t == best_total]
            if len(best) == 1 and len(games) >= 4:
                g = best[0]
                correct = f'{g["home"]} – {g["away"]}'
                peers = [f'{x["home"]} – {x["away"]}' for x in games if x["id"] != g["id"]]
                opts = name_options(correct, peers)
                if len(opts) == 4:
                    qid = question_id("round_highest_scoring_match", season_id, rnd)
                    questions.append(Question(qid, "round_highest_scoring_match", 5,
                        f'W którym meczu {rnd}. kolejki sezonu {season} padło najwięcej bramek?',
                        correct, deterministic_shuffle(opts, qid),
                        f'W spotkaniu {correct} padło {best_total} bramek.', season_id, g["confidence"], _match_sources(conn, g["id"])))
    return questions



def generate_extended_season_questions(conn: sqlite3.Connection, min_confidence: float) -> list[Question]:
    """More season-wide questions that are safe only with a complete match list."""
    questions: list[Question] = []
    season_rows = conn.execute(
        """SELECT s.id,s.label FROM seasons s
           WHERE s.is_complete=1 OR EXISTS(
               SELECT 1 FROM season_coverage sc WHERE sc.season_id=s.id AND sc.dataset='matches' AND sc.is_complete=1
           ) ORDER BY s.start_year"""
    ).fetchall()
    for season in season_rows:
        games = conn.execute(
            """SELECT m.*,h.name home,a.name away FROM matches m
               JOIN clubs h ON h.id=m.home_club_id JOIN clubs a ON a.id=m.away_club_id
               WHERE m.season_id=? AND m.home_goals IS NOT NULL AND m.away_goals IS NOT NULL AND m.confidence>=?
               ORDER BY COALESCE(m.round_no,999),COALESCE(m.match_date,''),m.id""",
            (season["id"], min_confidence),
        ).fetchall()
        if not games:
            continue
        urls = list(dict.fromkeys(u for g in games for u in _match_sources(conn, g["id"])))
        conf = min(g["confidence"] for g in games)

        # League-level season facts.
        zero_zero = sum(1 for g in games if g["home_goals"] == 0 and g["away_goals"] == 0)
        five_plus = sum(1 for g in games if g["home_goals"] + g["away_goals"] >= 5)
        for qtype, val, prompt, expl in (
            ("season_zero_zero_matches", zero_zero,
             f'Ile meczów zakończyło się wynikiem 0:0 w A-klasie Myślenice w sezonie {season["label"]}?',
             f'W tym sezonie zanotowano {zero_zero} bezbramkowych remisów.'),
            ("season_five_plus_goal_matches", five_plus,
             f'Ile meczów z co najmniej 5 bramkami rozegrano w sezonie {season["label"]}?',
             f'Co najmniej pięć goli padło w {five_plus} spotkaniach.'),
        ):
            qid = question_id(qtype, season["id"])
            questions.append(Question(qid, qtype, 4, prompt, str(val),
                deterministic_shuffle(numeric_options(val), qid), expl, season["id"], conf, urls))

        score_counts: dict[str, int] = defaultdict(int)
        for g in games:
            score_counts[f'{g["home_goals"]}:{g["away_goals"]}'] += 1
        top_count = max(score_counts.values())
        top_scores = [score for score, count in score_counts.items() if count == top_count]
        if len(top_scores) == 1 and len(score_counts) >= 4:
            correct = top_scores[0]
            peers = sorted((x for x in score_counts if x != correct), key=lambda x: (-score_counts[x], x))
            qid = question_id("most_common_score", season["id"])
            questions.append(Question(qid, "most_common_score", 5,
                f'Jaki wynik końcowy występował najczęściej w sezonie {season["label"]}?',
                correct, deterministic_shuffle([correct, *peers[:3]], qid),
                f'Wynik {correct} padł {top_count} razy.', season["id"], conf, urls))

        by_round: dict[int, list[sqlite3.Row]] = defaultdict(list)
        for g in games:
            if g["round_no"] is not None:
                by_round[g["round_no"]].append(g)
        if by_round:
            totals = {rnd: sum(g["home_goals"] + g["away_goals"] for g in rs) for rnd, rs in by_round.items()}
            maximum = max(totals.values())
            best = [rnd for rnd, total in totals.items() if total == maximum]
            if len(best) == 1 and len(totals) >= 4:
                rnd = best[0]
                other = [str(x) for x in totals if x != rnd]
                opts = name_options(str(rnd), other)
                if len(opts) == 4:
                    qid = question_id("highest_scoring_round", season["id"])
                    questions.append(Question(qid, "highest_scoring_round", 5,
                        f'Która kolejka sezonu {season["label"]} była najbardziej bramkowa?',
                        str(rnd), deterministic_shuffle(opts, qid),
                        f'W {rnd}. kolejce padło łącznie {maximum} bramek.', season["id"], conf, urls))

        # Club home/away splits and first win / streaks.
        club_games: dict[int, list[tuple[sqlite3.Row, bool]]] = defaultdict(list)
        for g in games:
            club_games[g["home_club_id"]].append((g, True))
            club_games[g["away_club_id"]].append((g, False))
        for club_id, items in club_games.items():
            club = conn.execute("SELECT name FROM clubs WHERE id=?", (club_id,)).fetchone()[0]
            home_points = away_points = 0
            unbeaten = winless = best_unbeaten = best_winless = 0
            first_win_round = None
            for g, at_home in items:
                gf = g["home_goals"] if at_home else g["away_goals"]
                ga = g["away_goals"] if at_home else g["home_goals"]
                pts = 3 if gf > ga else 1 if gf == ga else 0
                if at_home: home_points += pts
                else: away_points += pts
                if gf >= ga:
                    unbeaten += 1; best_unbeaten = max(best_unbeaten, unbeaten)
                else:
                    unbeaten = 0
                if gf <= ga:
                    winless += 1; best_winless = max(best_winless, winless)
                else:
                    winless = 0
                    if first_win_round is None and g["round_no"] is not None:
                        first_win_round = g["round_no"]
            club_urls = list(dict.fromkeys(u for g, _ in items for u in _match_sources(conn, g["id"])))
            club_conf = min(g["confidence"] for g, _ in items)
            for qtype, val, prompt, expl in (
                ("club_home_points", home_points, f'Ile punktów {club} zdobył u siebie w sezonie {season["label"]}?', f'U siebie {club} zdobył {home_points} punktów.'),
                ("club_away_points", away_points, f'Ile punktów {club} zdobył na wyjazdach w sezonie {season["label"]}?', f'Na wyjazdach {club} zdobył {away_points} punktów.'),
                ("longest_unbeaten_streak", best_unbeaten, f'Jaka była najdłuższa seria meczów bez porażki {club} w sezonie {season["label"]}?', f'Najdłuższa seria bez porażki wyniosła {best_unbeaten} meczów.'),
                ("longest_winless_streak", best_winless, f'Jaka była najdłuższa seria meczów bez zwycięstwa {club} w sezonie {season["label"]}?', f'Najdłuższa seria bez zwycięstwa wyniosła {best_winless} meczów.'),
            ):
                qid = question_id(qtype, season["id"], club_id)
                questions.append(Question(qid, qtype, 5, prompt, str(val),
                    deterministic_shuffle(numeric_options(val), qid), expl, season["id"], club_conf, club_urls))
            if first_win_round is not None:
                qid = question_id("first_win_round", season["id"], club_id)
                questions.append(Question(qid, "first_win_round", 5,
                    f'W której kolejce {club} odniósł pierwsze zwycięstwo w sezonie {season["label"]}?',
                    str(first_win_round), deterministic_shuffle(numeric_options(first_win_round, minimum=1), qid),
                    f'Pierwsze zwycięstwo {club} przypadło na {first_win_round}. kolejkę.', season["id"], club_conf, club_urls))

        # Head-to-head points in the season. Both legs are counted if both exist.
        pairs: dict[tuple[int, int], list[sqlite3.Row]] = defaultdict(list)
        for g in games:
            pair = tuple(sorted((g["home_club_id"], g["away_club_id"])))
            pairs[pair].append(g)
        for (left_id, right_id), pair_games in pairs.items():
            if len(pair_games) < 2:
                continue
            names = {left_id: conn.execute("SELECT name FROM clubs WHERE id=?", (left_id,)).fetchone()[0],
                     right_id: conn.execute("SELECT name FROM clubs WHERE id=?", (right_id,)).fetchone()[0]}
            points = {left_id: 0, right_id: 0}
            for g in pair_games:
                if g["home_goals"] > g["away_goals"]: points[g["home_club_id"]] += 3
                elif g["home_goals"] < g["away_goals"]: points[g["away_club_id"]] += 3
                else:
                    points[g["home_club_id"]] += 1; points[g["away_club_id"]] += 1
            for club_id, opp_id in ((left_id, right_id), (right_id, left_id)):
                val = points[club_id]
                qid = question_id("h2h_season_points", season["id"], club_id, opp_id)
                purls = list(dict.fromkeys(u for g in pair_games for u in _match_sources(conn, g["id"])))
                questions.append(Question(qid, "h2h_season_points", 5,
                    f'Ile punktów zdobył {names[club_id]} w ligowych meczach z {names[opp_id]} w sezonie {season["label"]}?',
                    str(val), deterministic_shuffle(numeric_options(val), qid),
                    f'Bilans punktowy {names[club_id]} w tych spotkaniach to {val} punktów.', season["id"],
                    min(g["confidence"] for g in pair_games), purls))
    return questions


def generate_membership_questions(conn: sqlite3.Connection, min_confidence: float) -> list[Question]:
    """League size and positive/negative membership questions for seasons with complete club lists."""
    questions: list[Question] = []
    seasons = conn.execute(
        """SELECT s.id,s.label FROM seasons s JOIN season_coverage sc ON sc.season_id=s.id
           WHERE sc.dataset IN ('standings','club_memberships') AND sc.is_complete=1
           GROUP BY s.id,s.label ORDER BY s.start_year"""
    ).fetchall()
    all_clubs = [r[0] for r in conn.execute("SELECT name FROM clubs ORDER BY name")]
    for season in seasons:
        members = [r[0] for r in conn.execute(
            """SELECT DISTINCT c.name FROM clubs c JOIN (
                 SELECT club_id FROM club_season_memberships WHERE season_id=?
                 UNION SELECT club_id FROM club_season_stats WHERE season_id=?
               ) x ON x.club_id=c.id ORDER BY c.name""", (season["id"], season["id"]))]
        if not members:
            continue
        qid = question_id("league_team_count", season["id"])
        questions.append(Question(qid, "league_team_count", 3,
            f'Ile drużyn występowało w A-klasie Myślenice w sezonie {season["label"]}?',
            str(len(members)), deterministic_shuffle(numeric_options(len(members), minimum=2), qid),
            f'Kompletna lista tego sezonu zawiera {len(members)} drużyn.', season["id"], min_confidence, []))
        outsiders = [x for x in all_clubs if x not in members]
        if len(members) >= 3 and outsiders:
            outsider = outsiders[0]
            choices = [outsider, *members[:3]]
            if len(set(choices)) == 4:
                qid = question_id("club_not_in_season", season["id"], outsider)
                questions.append(Question(qid, "club_not_in_season", 4,
                    f'Która z tych drużyn NIE występowała w A-klasie Myślenice w sezonie {season["label"]}?',
                    outsider, deterministic_shuffle(choices, qid),
                    f'{outsider} nie znajduje się na kompletnej liście drużyn tego sezonu.', season["id"], min_confidence, []))
    return questions

def generate_roster_questions(conn: sqlite3.Connection, min_confidence: float) -> list[Question]:
    questions: list[Question] = []
    rows = conn.execute(
        """SELECT prm.*,s.label season,c.name club,p.display_name player
           FROM player_roster_memberships prm
           JOIN seasons s ON s.id=prm.season_id JOIN clubs c ON c.id=prm.club_id JOIN players p ON p.id=prm.player_id
           WHERE prm.confidence>=? ORDER BY prm.season_id,c.name,p.display_name""", (min_confidence,)
    ).fetchall()
    by_club: dict[tuple[int,int], list[sqlite3.Row]] = defaultdict(list)
    for r in rows:
        by_club[(r['season_id'], r['club_id'])].append(r)
        if r['role']:
            role_opts = ["Bramkarz", "Obrońca", "Pomocnik", "Napastnik"]
            # Combined roles are legitimate labels; only create if we can make 4 distinct choices.
            correct = r['role']
            opts = list(dict.fromkeys([correct] + [x for x in role_opts if x != correct]))[:4]
            if len(opts) == 4:
                qid = question_id('roster_role', r['season_id'], r['club_id'], r['player_id'])
                questions.append(Question(qid, 'roster_role', 2,
                    f'Na jakiej pozycji figuruje {r["player"]} w archiwalnej kadrze {r["club"]} z sezonu {r["season"]}?',
                    correct, deterministic_shuffle(opts, qid),
                    f'W archiwalnej kadrze pozycja jest zapisana jako: {correct}.',
                    r['season_id'], r['confidence'], _roster_sources(conn, r['season_id'], r['club_id'], r['player_id'])))

    # A complete club roster lets us safely ask which player appears on that roster.
    for (season_id, club_id), members in by_club.items():
        cov = conn.execute(
            "SELECT is_complete FROM club_season_coverage WHERE season_id=? AND club_id=? AND dataset='roster'",
            (season_id, club_id),
        ).fetchone()
        if not cov or not cov[0] or len(members) < 4:
            continue
        member_ids = {r['player_id'] for r in members}
        outsiders = conn.execute(
            """SELECT DISTINCT p.id,p.display_name FROM players p JOIN (
                 SELECT ap.player_id FROM appearances ap JOIN matches m ON m.id=ap.match_id WHERE m.season_id=? AND ap.club_id<>?
                 UNION SELECT g.player_id FROM goals g JOIN matches m ON m.id=g.match_id WHERE m.season_id=? AND g.club_id<>? AND g.player_id IS NOT NULL
               ) x ON x.player_id=p.id ORDER BY p.display_name""",
            (season_id, club_id, season_id, club_id),
        ).fetchall()
        outsider_names = [x['display_name'] for x in outsiders if x['id'] not in member_ids]
        if not outsider_names:
            continue
        # Limit to a handful per roster to avoid flooding the bank.
        for r in members[:8]:
            opts = name_options(r['player'], outsider_names)
            if len(opts) != 4:
                continue
            qid = question_id('roster_member', season_id, club_id, r['player_id'])
            questions.append(Question(qid, 'roster_member', 2,
                f'Który z tych zawodników figuruje w archiwalnej kadrze {r["club"]} na sezon {r["season"]}?',
                r['player'], deterministic_shuffle(opts, qid),
                f'{r["player"]} znajduje się na kompletnej archiwalnej liście kadry {r["club"]}.',
                season_id, r['confidence'], _roster_sources(conn, season_id, club_id, r['player_id'])))
    return questions


def generate_history_questions(conn: sqlite3.Connection, min_confidence: float) -> list[Question]:
    """Questions that require explicit completeness coverage before using absence as evidence."""
    questions: list[Question] = []
    covered_player_seasons = [r[0] for r in conn.execute(
        """SELECT season_id FROM season_coverage WHERE dataset='players' AND is_complete=1 ORDER BY season_id"""
    )]
    if len(covered_player_seasons) >= 4:
        placeholders = ",".join("?" for _ in covered_player_seasons)
        rows = conn.execute(
            f"""SELECT pss.*,s.label season,c.name club,p.display_name player
                 FROM player_season_stats pss JOIN seasons s ON s.id=pss.season_id
                 JOIN clubs c ON c.id=pss.club_id JOIN players p ON p.id=pss.player_id
                 WHERE pss.season_id IN ({placeholders}) AND pss.confidence>=?""",
            (*covered_player_seasons, min_confidence),
        ).fetchall()
        by_player_club: dict[tuple[int,int], list[sqlite3.Row]] = defaultdict(list)
        season_labels = {r[0]: r[1] for r in conn.execute(
            f"SELECT id,label FROM seasons WHERE id IN ({placeholders})", covered_player_seasons
        )}
        for r in rows:
            by_player_club[(r["player_id"], r["club_id"])].append(r)
        for (_, _), memberships in by_player_club.items():
            positive_ids = {r["season_id"] for r in memberships}
            negative_ids = [sid for sid in covered_player_seasons if sid not in positive_ids]
            if not negative_ids:
                continue
            for r in memberships:
                distractors = [season_labels[sid] for sid in negative_ids]
                # Fill from other positive seasons only if the stem asks for one of these seasons? No: that would create multiple correct answers.
                opts = name_options(r["season"], distractors)
                if len(opts) != 4:
                    continue
                qid = question_id("player_season_for_club", r["player_id"], r["club_id"], r["season_id"])
                questions.append(Question(qid, "player_season_for_club", 4,
                    f'W którym z tych sezonów {r["player"]} grał w {r["club"]} w A-klasie Myślenice?',
                    r["season"], deterministic_shuffle(opts, qid),
                    f'W kompletnej bazie zawodników dla objętych sezonów {r["player"]} jest przypisany do {r["club"]} w sezonie {r["season"]}.',
                    r["season_id"], r["confidence"], _stat_sources(conn, r["id"], "player")))

        # "Who did NOT play for club X" only when roster coverage for that season is complete.
        for season_id in covered_player_seasons:
            season_rows = [r for r in rows if r["season_id"] == season_id]
            by_club: dict[int, list[sqlite3.Row]] = defaultdict(list)
            for r in season_rows:
                by_club[r["club_id"]].append(r)
            all_players = {r["player_id"]: r for r in season_rows}
            for club_id, club_rows in by_club.items():
                roster_ids = {r["player_id"] for r in club_rows}
                outsiders = [r for pid, r in all_players.items() if pid not in roster_ids]
                if len(club_rows) < 3 or not outsiders:
                    continue
                outsider = outsiders[0]
                insiders = club_rows[:3]
                choices = [outsider["player"]] + [r["player"] for r in insiders]
                if len(set(choices)) != 4:
                    continue
                qid = question_id("player_not_in_club", season_id, club_id, outsider["player_id"])
                questions.append(Question(qid, "player_not_in_club", 5,
                    f'Który z tych zawodników NIE grał w {club_rows[0]["club"]} w sezonie {club_rows[0]["season"]}?',
                    outsider["player"], deterministic_shuffle(choices, qid),
                    f'{outsider["player"]} jest w kompletnej bazie tego sezonu przypisany do innego klubu.',
                    season_id, min([outsider["confidence"]] + [r["confidence"] for r in insiders]),
                    list(dict.fromkeys(_stat_sources(conn, outsider["id"], "player") + sum((_stat_sources(conn, r["id"], "player") for r in insiders), [])))))

    covered_club_seasons = [r[0] for r in conn.execute(
        """SELECT season_id FROM season_coverage WHERE dataset IN ('standings','club_memberships') AND is_complete=1 GROUP BY season_id ORDER BY season_id"""
    )]
    if len(covered_club_seasons) >= 4:
        placeholders = ",".join("?" for _ in covered_club_seasons)
        rows = conn.execute(
            f"""SELECT css.*,s.label season,c.name club FROM club_season_stats css
                 JOIN seasons s ON s.id=css.season_id JOIN clubs c ON c.id=css.club_id
                 WHERE css.season_id IN ({placeholders}) AND css.confidence>=?""",
            (*covered_club_seasons, min_confidence),
        ).fetchall()
        labels = {r[0]: r[1] for r in conn.execute(
            f"SELECT id,label FROM seasons WHERE id IN ({placeholders})", covered_club_seasons
        )}
        by_club: dict[int, list[sqlite3.Row]] = defaultdict(list)
        for r in rows:
            by_club[r["club_id"]].append(r)
        for club_id, memberships in by_club.items():
            positive = {r["season_id"] for r in memberships}
            negatives = [sid for sid in covered_club_seasons if sid not in positive]
            for r in memberships:
                opts = name_options(r["season"], [labels[sid] for sid in negatives])
                if len(opts) != 4:
                    continue
                qid = question_id("club_season_participation", club_id, r["season_id"])
                questions.append(Question(qid, "club_season_participation", 3,
                    f'W którym z tych sezonów {r["club"]} występował w A-klasie Myślenice?',
                    r["season"], deterministic_shuffle(opts, qid),
                    f'{r["club"]} widnieje w kompletnej tabeli sezonu {r["season"]}.',
                    r["season_id"], r["confidence"], _stat_sources(conn, r["id"], "club")))
    return questions


def generate_all(conn: sqlite3.Connection, min_confidence: float = 0.80) -> list[Question]:
    questions: list[Question] = []
    questions.extend(generate_match_questions(conn, min_confidence))
    questions.extend(generate_club_season_questions(conn, min_confidence))
    questions.extend(generate_player_questions(conn, min_confidence))
    questions.extend(generate_goal_event_questions(conn, min_confidence))
    questions.extend(generate_complete_goal_questions(conn, min_confidence))
    questions.extend(generate_date_round_questions(conn, min_confidence))
    questions.extend(generate_lineup_questions(conn, min_confidence))
    questions.extend(generate_confirmed_appearance_questions(conn, min_confidence))
    questions.extend(generate_round_questions(conn, min_confidence))
    questions.extend(generate_derived_match_questions(conn, min_confidence))
    questions.extend(generate_extended_season_questions(conn, min_confidence))
    questions.extend(generate_membership_questions(conn, min_confidence))
    questions.extend(generate_history_questions(conn, min_confidence))
    # Stable de-duplication by id.
    return list({q.id: q for q in questions}.values())
