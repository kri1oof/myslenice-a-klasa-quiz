from __future__ import annotations

from collections import defaultdict
import sqlite3

from .base import Question, deterministic_shuffle, name_options, question_id


_MINUTE_THRESHOLDS = (45, 90, 180, 270, 360, 450, 540, 720, 900, 1080, 1350, 1620, 1800)


def _appearance_sources(conn: sqlite3.Connection, appearance_ids: list[int]) -> list[str]:
    if not appearance_ids:
        return []
    placeholders = ",".join("?" for _ in appearance_ids)
    return [r[0] for r in conn.execute(
        f"""SELECT DISTINCT s.url
             FROM appearance_evidence ae JOIN sources s ON s.id=ae.source_id
             WHERE ae.appearance_id IN ({placeholders})
             ORDER BY s.authority DESC""",
        appearance_ids,
    )]


def _roster_sources(conn: sqlite3.Connection, season_id: int, club_id: int, player_id: int) -> list[str]:
    return [r[0] for r in conn.execute(
        """SELECT s.url
             FROM player_roster_membership_evidence e JOIN sources s ON s.id=e.source_id
             WHERE e.season_id=? AND e.club_id=? AND e.player_id=?
             ORDER BY s.authority DESC""",
        (season_id, club_id, player_id),
    )]


def _match_sources(conn: sqlite3.Connection, match_id: int) -> list[str]:
    return [r[0] for r in conn.execute(
        """SELECT s.url FROM match_evidence me JOIN sources s ON s.id=me.source_id
             WHERE me.match_id=? ORDER BY s.authority DESC""",
        (match_id,),
    )]


def _merge_sources(*groups: list[str]) -> list[str]:
    return list(dict.fromkeys(x for group in groups for x in group))


def _played_minutes(row: sqlite3.Row) -> int:
    """Estimate regulation-time minutes from official starter/substitution/card minutes.

    ŁNP exposes entry/exit minutes rather than a ready-made minutes-played total.
    We deliberately cap at 90 because added-time length is not available as a
    reliable match-duration field. The same convention is used for every player,
    so threshold and comparison questions remain consistent.
    """
    starter = row["starter"] == 1
    entered = row["entered_minute"]
    if not starter and entered is None:
        return 0
    start = 0 if starter else max(0, min(90, int(entered)))
    endings = [90]
    if row["left_minute"] is not None:
        endings.append(max(0, min(90, int(row["left_minute"]))))
    if row["red_minute"] is not None:
        endings.append(max(0, min(90, int(row["red_minute"]))))
    end = min(endings)
    return max(0, end - start)


def _minute_options(value: int) -> list[str]:
    values = [value]
    for delta in (15, -15, 30, -30, 45, -45, 60, -60, 90, -90):
        candidate = max(0, value + delta)
        if candidate not in values:
            values.append(candidate)
        if len(values) == 4:
            break
    return [str(x) for x in values]


def _comparison_answer(left: dict, right: dict, metric: str) -> str:
    if left[metric] == right[metric]:
        return "Tyle samo"
    return left["player"] if left[metric] > right[metric] else right["player"]


def _complete_lineup_seasons(conn: sqlite3.Connection) -> set[int]:
    result: set[int] = set()
    seasons = conn.execute("SELECT id FROM seasons").fetchall()
    for season in seasons:
        season_id = int(season[0])
        played = conn.execute(
            "SELECT COUNT(*) FROM matches WHERE season_id=? AND status='played'",
            (season_id,),
        ).fetchone()[0]
        complete = conn.execute(
            """SELECT COUNT(*)
                 FROM matches m JOIN match_coverage mc ON mc.match_id=m.id
                 WHERE m.season_id=? AND m.status='played'
                   AND mc.dataset='lineups' AND mc.is_complete=1""",
            (season_id,),
        ).fetchone()[0]
        if played > 0 and played == complete:
            result.add(season_id)
    return result


def generate_player_decision_questions(conn: sqlite3.Connection, min_confidence: float) -> list[Question]:
    questions: list[Question] = []

    # One row per squad member from matches with a complete official lineup.
    rows = conn.execute(
        """SELECT ap.id,ap.match_id,ap.club_id,ap.player_id,ap.starter,
                  ap.entered_minute,ap.left_minute,ap.confidence,
                  m.season_id,m.round_no,s.label season,
                  c.name club,p.display_name player,
                  h.name home,a.name away,
                  MIN(CASE WHEN ca.card_type IN ('red','second_yellow_red') THEN ca.minute END) red_minute
             FROM appearances ap
             JOIN matches m ON m.id=ap.match_id
             JOIN seasons s ON s.id=m.season_id
             JOIN clubs c ON c.id=ap.club_id
             JOIN players p ON p.id=ap.player_id
             JOIN clubs h ON h.id=m.home_club_id
             JOIN clubs a ON a.id=m.away_club_id
             JOIN match_coverage mc ON mc.match_id=m.id
                AND mc.dataset='lineups' AND mc.is_complete=1
             LEFT JOIN cards ca ON ca.match_id=ap.match_id AND ca.player_id=ap.player_id
             WHERE ap.confidence>=?
             GROUP BY ap.id
             ORDER BY m.season_id,ap.club_id,ap.match_id,ap.id""",
        (min_confidence,),
    ).fetchall()
    if not rows:
        return questions

    complete_seasons = _complete_lineup_seasons(conn)

    by_season_club: dict[tuple[int, int], list[sqlite3.Row]] = defaultdict(list)
    by_match_club: dict[tuple[int, int], list[sqlite3.Row]] = defaultdict(list)
    for row in rows:
        by_season_club[(row["season_id"], row["club_id"])].append(row)
        by_match_club[(row["match_id"], row["club_id"])].append(row)

    # Cards are match facts, so count them only from matches covered by complete protocols.
    card_rows = conn.execute(
        """SELECT m.season_id,ca.club_id,ca.player_id,COUNT(*) card_count
             FROM cards ca
             JOIN matches m ON m.id=ca.match_id
             JOIN match_coverage mc ON mc.match_id=m.id
                AND mc.dataset='lineups' AND mc.is_complete=1
             WHERE ca.confidence>=?
             GROUP BY m.season_id,ca.club_id,ca.player_id""",
        (min_confidence,),
    ).fetchall()
    card_counts = {(r["season_id"], r["club_id"], r["player_id"]): int(r["card_count"]) for r in card_rows}

    # Season-level aggregates are generated only when every played match in that
    # season has a complete official lineup. For the current season the prompt
    # explicitly says "dotychczas".
    for (season_id, club_id), entries in by_season_club.items():
        if season_id not in complete_seasons:
            continue
        sample = entries[0]
        aggregates: dict[int, dict] = {}
        for row in entries:
            actually_played = row["starter"] == 1 or row["entered_minute"] is not None
            if not actually_played:
                continue
            item = aggregates.setdefault(row["player_id"], {
                "player_id": row["player_id"],
                "player": row["player"],
                "minutes": 0,
                "starts": 0,
                "appearances": 0,
                "cards": card_counts.get((season_id, club_id, row["player_id"]), 0),
                "appearance_ids": [],
                "confidence": 1.0,
            })
            item["minutes"] += _played_minutes(row)
            item["starts"] += int(row["starter"] == 1)
            item["appearances"] += 1
            item["appearance_ids"].append(int(row["id"]))
            item["confidence"] = min(item["confidence"], float(row["confidence"]))

        players = sorted(aggregates.values(), key=lambda x: (-x["minutes"], -x["appearances"], x["player"]))
        if not players:
            continue

        # Yes/no thresholds: deterministic mix of true and false statements.
        for item in players[:12]:
            minutes = int(item["minutes"])
            lower = [x for x in _MINUTE_THRESHOLDS if x < minutes - 15]
            upper = [x for x in _MINUTE_THRESHOLDS if x >= minutes + 15]
            prefer_true = (int(item["player_id"]) + int(season_id)) % 2 == 0
            if prefer_true and lower:
                threshold = lower[-1]
            elif upper:
                threshold = upper[0]
            elif lower:
                threshold = lower[-1]
            else:
                continue
            correct = "Tak" if minutes > threshold else "Nie"
            qid = question_id("player_season_minutes_over", season_id, club_id, item["player_id"], threshold)
            questions.append(Question(
                qid, "player_season_minutes_over", 3,
                f'Czy {item["player"]} rozegrał dotychczas więcej niż {threshold} minut dla {sample["club"]} w sezonie {sample["season"]}?',
                correct, deterministic_shuffle(["Tak", "Nie"], qid),
                f'Na podstawie kompletnych protokołów i minut zmian: około {minutes} minut gry.',
                season_id, item["confidence"], _appearance_sources(conn, item["appearance_ids"]),
            ))

        # Pair comparisons. Six pairs per team keep diversity high without flooding the bank.
        paired = players[:12]
        for left, right in zip(paired[::2], paired[1::2]):
            sources = _merge_sources(
                _appearance_sources(conn, left["appearance_ids"]),
                _appearance_sources(conn, right["appearance_ids"]),
            )
            for qtype, metric, label, difficulty in (
                ("compare_player_minutes", "minutes", "więcej minut", 3),
                ("compare_player_starts", "starts", "więcej razy rozpoczął mecz w podstawowym składzie", 4),
                ("compare_player_appearances", "appearances", "więcej razy pojawił się na boisku", 3),
            ):
                correct = _comparison_answer(left, right, metric)
                qid = question_id(qtype, season_id, club_id, left["player_id"], right["player_id"])
                questions.append(Question(
                    qid, qtype, difficulty,
                    f'Kto {label} dla {sample["club"]} dotychczas w sezonie {sample["season"]}: {left["player"]} czy {right["player"]}?',
                    correct, deterministic_shuffle([left["player"], right["player"], "Tyle samo"], qid),
                    f'{left["player"]}: {left[metric]}; {right["player"]}: {right[metric]}.',
                    season_id, min(left["confidence"], right["confidence"]), sources,
                ))

            if left["cards"] + right["cards"] > 0:
                correct = _comparison_answer(left, right, "cards")
                qid = question_id("compare_player_cards", season_id, club_id, left["player_id"], right["player_id"])
                questions.append(Question(
                    qid, "compare_player_cards", 4,
                    f'Kto dostał więcej kartek dla {sample["club"]} dotychczas w sezonie {sample["season"]}: {left["player"]} czy {right["player"]}?',
                    correct, deterministic_shuffle([left["player"], right["player"], "Tyle samo"], qid),
                    f'{left["player"]}: {left["cards"]}; {right["player"]}: {right["cards"]}.',
                    season_id, min(left["confidence"], right["confidence"]), sources,
                ))

    # Cache season rosters for safe negative squad questions.
    roster_rows = conn.execute(
        """SELECT prm.season_id,prm.club_id,prm.player_id,p.display_name player,prm.confidence
             FROM player_roster_memberships prm JOIN players p ON p.id=prm.player_id
             WHERE prm.confidence>=?
             ORDER BY prm.season_id,prm.club_id,p.display_name""",
        (min_confidence,),
    ).fetchall()
    rosters: dict[tuple[int, int], list[sqlite3.Row]] = defaultdict(list)
    for row in roster_rows:
        rosters[(row["season_id"], row["club_id"])].append(row)

    # Match-level decision questions from complete official squads.
    for (match_id, club_id), entries in by_match_club.items():
        sample = entries[0]
        opponent = sample["away"] if sample["club"] == sample["home"] else sample["home"]
        played = [r for r in entries if r["starter"] == 1 or r["entered_minute"] is not None]
        if played:
            with_minutes = [(r, _played_minutes(r)) for r in played]
            with_minutes.sort(key=lambda x: (-x[1], x[0]["player"]))

            # Exact derived minutes for one representative player per team/match.
            representative = next((x for x in with_minutes if 0 < x[1] < 90), with_minutes[0])
            row, minutes = representative
            qid = question_id("match_player_minutes", match_id, row["id"])
            questions.append(Question(
                qid, "match_player_minutes", 4,
                f'Ile minut, według minut zmian w protokole, rozegrał {row["player"]} w meczu {sample["club"]} z {opponent}?',
                str(minutes), deterministic_shuffle(_minute_options(minutes), qid),
                f'Z czasu wejścia/zejścia oraz ewentualnej czerwonej kartki wynika około {minutes} minut gry.',
                sample["season_id"], row["confidence"], _appearance_sources(conn, [int(row["id"])]),
            ))

            different = None
            for left in with_minutes:
                for right in reversed(with_minutes):
                    if left[0]["player_id"] != right[0]["player_id"] and left[1] != right[1] and right[1] > 0:
                        different = (left, right)
                        break
                if different:
                    break
            if different:
                (left, lm), (right, rm) = different
                correct = left["player"] if lm > rm else right["player"]
                qid = question_id("match_compare_player_minutes", match_id, left["id"], right["id"])
                questions.append(Question(
                    qid, "match_compare_player_minutes", 4,
                    f'Kto grał dłużej w meczu {sample["club"]} z {opponent}: {left["player"]} czy {right["player"]}?',
                    correct, deterministic_shuffle([left["player"], right["player"]], qid),
                    f'{left["player"]}: około {lm} min; {right["player"]}: około {rm} min.',
                    sample["season_id"], min(left["confidence"], right["confidence"]),
                    _appearance_sources(conn, [int(left["id"]), int(right["id"])]),
                ))

        entered = sorted(
            [r for r in entries if r["starter"] == 0 and r["entered_minute"] is not None],
            key=lambda r: (r["entered_minute"], r["player"]),
        )
        if len(entered) >= 2 and entered[0]["entered_minute"] != entered[1]["entered_minute"]:
            left, right = entered[0], entered[1]
            correct = left["player"]
            qid = question_id("compare_substitution_entry", match_id, left["id"], right["id"])
            questions.append(Question(
                qid, "compare_substitution_entry", 4,
                f'Kto wszedł na boisko wcześniej w meczu {sample["club"]} z {opponent}: {left["player"]} czy {right["player"]}?',
                correct, deterministic_shuffle([left["player"], right["player"]], qid),
                f'{left["player"]}: {left["entered_minute"]}. minuta; {right["player"]}: {right["entered_minute"]}. minuta.',
                sample["season_id"], min(left["confidence"], right["confidence"]),
                _appearance_sources(conn, [int(left["id"]), int(right["id"])]),
            ))

        used_subs = [r for r in entries if r["starter"] == 0 and r["entered_minute"] is not None]
        unused_subs = [r for r in entries if r["starter"] == 0 and r["entered_minute"] is None]
        if unused_subs and len(used_subs) >= 3:
            absent = unused_subs[0]
            opts = [absent["player"], *[r["player"] for r in used_subs[:3]]]
            if len(set(opts)) == 4:
                qid = question_id("unused_substitute", match_id, absent["id"])
                questions.append(Question(
                    qid, "unused_substitute", 4,
                    f'Który z tych rezerwowych {sample["club"]} NIE wszedł na boisko w meczu z {opponent}?',
                    absent["player"], deterministic_shuffle(opts, qid),
                    f'{absent["player"]} był w kadrze meczowej, ale bez zapisanej minuty wejścia.',
                    sample["season_id"], min(float(x["confidence"]) for x in [absent, *used_subs[:3]]),
                    _appearance_sources(conn, [int(x["id"]) for x in [absent, *used_subs[:3]]]),
                ))

        # User-requested "who is missing from this team in this match" question.
        # Because lineups are complete, absence from the official squad is valid evidence.
        squad_player_ids = {int(r["player_id"]) for r in entries}
        season_roster = rosters.get((sample["season_id"], club_id), [])
        absent_roster = [r for r in season_roster if int(r["player_id"]) not in squad_player_ids]
        if absent_roster and len(entries) >= 3:
            outsider = absent_roster[match_id % len(absent_roster)]
            insiders = entries[:3]
            opts = [outsider["player"], *[r["player"] for r in insiders]]
            if len(set(opts)) == 4:
                qid = question_id("match_squad_absent", match_id, club_id, outsider["player_id"])
                questions.append(Question(
                    qid, "match_squad_absent", 4,
                    f'Którego z tych zawodników NIE było w kadrze {sample["club"]} na mecz z {opponent} w sezonie {sample["season"]}?',
                    outsider["player"], deterministic_shuffle(opts, qid),
                    f'Kompletny protokół meczu zawiera pozostałą trójkę, ale nie zawiera {outsider["player"]}.',
                    sample["season_id"], min(float(outsider["confidence"]), *(float(r["confidence"]) for r in insiders)),
                    _merge_sources(
                        _match_sources(conn, match_id),
                        _roster_sources(conn, sample["season_id"], club_id, int(outsider["player_id"])),
                        _appearance_sources(conn, [int(r["id"]) for r in insiders]),
                    ),
                ))

        qid = question_id("match_squad_size", match_id, club_id)
        questions.append(Question(
            qid, "match_squad_size", 3,
            f'Ilu zawodników liczyła oficjalna kadra {sample["club"]} na mecz z {opponent}?',
            str(len(entries)), deterministic_shuffle(_minute_options(len(entries)), qid),
            f'W kompletnym protokole po stronie {sample["club"]} widnieje {len(entries)} zawodników.',
            sample["season_id"], min(float(r["confidence"]) for r in entries),
            _appearance_sources(conn, [int(r["id"]) for r in entries]),
        ))

    return questions
