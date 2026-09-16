from __future__ import annotations

from collections import defaultdict
import sqlite3

from .base import Question, deterministic_shuffle, numeric_options, question_id


def _looks_like_person(value: str | None) -> bool:
    if not value:
        return False
    text = value.strip()
    if not text or text.replace(" ", "").isdigit() or ":" in text:
        return False
    lowered = text.casefold()
    return lowered not in {"tak", "nie", "remis", "brak"}


def _source_urls(conn: sqlite3.Connection, fact: sqlite3.Row) -> list[str]:
    urls: list[str] = []
    if fact["post_url"]:
        urls.append(fact["post_url"])
    if fact["source_url"] and fact["source_url"] not in urls:
        urls.append(fact["source_url"])
    return urls


def _person_options(correct: str, candidates: list[str], qid: str) -> list[str]:
    unique = [correct]
    for value in candidates:
        if value and value not in unique and _looks_like_person(value):
            unique.append(value)
        if len(unique) >= 4:
            break
    # Context questions are allowed to have 3 answers if the source only gives us
    # three plausible named people; never invent a random fourth person.
    if len(unique) < 3:
        return []
    return deterministic_shuffle(unique[:4], qid)


def generate_social_context_questions(conn: sqlite3.Connection, min_confidence: float = 0.80) -> list[Question]:
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if "match_context_facts" not in tables:
        return []

    facts = conn.execute(
        """SELECT f.*,m.season_id,m.home_club_id,m.away_club_id,m.home_goals,m.away_goals,
                  s.label season,h.name home,a.name away,c.name focal_club,
                  sp.post_url,src.url source_url
           FROM match_context_facts f
           JOIN matches m ON m.id=f.match_id
           JOIN seasons s ON s.id=m.season_id
           JOIN clubs h ON h.id=m.home_club_id
           JOIN clubs a ON a.id=m.away_club_id
           LEFT JOIN clubs c ON c.id=f.club_id
           LEFT JOIN social_posts sp ON sp.id=f.social_post_id
           LEFT JOIN sources src ON src.id=f.source_id
           WHERE f.verified=1 AND f.confidence>=?
           ORDER BY f.match_id,f.id""",
        (min_confidence,),
    ).fetchall()
    if not facts:
        return []

    by_match: dict[int, list[sqlite3.Row]] = defaultdict(list)
    for fact in facts:
        by_match[int(fact["match_id"])].append(fact)

    questions: list[Question] = []
    for match_id, match_facts in by_match.items():
        sample = match_facts[0]
        player_candidates: list[str] = []
        for fact in match_facts:
            for candidate in (fact["subject"], fact["value"]):
                if _looks_like_person(candidate) and candidate not in player_candidates:
                    player_candidates.append(candidate)
        for row in conn.execute(
            """SELECT DISTINCT p.display_name FROM players p JOIN (
                 SELECT player_id FROM appearances WHERE match_id=?
                 UNION SELECT player_id FROM goals WHERE match_id=? AND player_id IS NOT NULL
               ) x ON x.player_id=p.id ORDER BY p.display_name""",
            (match_id, match_id),
        ):
            if row[0] not in player_candidates:
                player_candidates.append(row[0])

        for fact in match_facts:
            fact_type = fact["fact_type"]
            club = fact["focal_club"] or sample["home"]
            urls = _source_urls(conn, fact)
            confidence = fact["confidence"]

            if fact_type == "mvp":
                qid = question_id("social_mvp", fact["id"])
                options = _person_options(fact["value"], player_candidates, qid)
                if options:
                    questions.append(Question(
                        qid, "social_mvp", 3,
                        f'Kogo relacja po meczu {sample["home"]} – {sample["away"]} w sezonie {sample["season"]} wyróżniła jako MVP?',
                        fact["value"], options,
                        f'W relacji pomeczowej jako MVP wskazano: {fact["value"]}.',
                        sample["season_id"], confidence, urls,
                    ))
            elif fact_type == "captain":
                qid = question_id("social_captain", fact["id"])
                options = _person_options(fact["value"], player_candidates, qid)
                if options:
                    questions.append(Question(
                        qid, "social_captain", 3,
                        f'Kto według relacji był kapitanem {club} w meczu z {sample["away"] if club == sample["home"] else sample["home"]}?',
                        fact["value"], options,
                        f'Kapitanem {club} był {fact["value"]}.',
                        sample["season_id"], confidence, urls,
                    ))
            elif fact_type == "assist" and fact["subject"]:
                qid = question_id("social_assist", fact["id"])
                options = _person_options(fact["value"], player_candidates, qid)
                if options:
                    questions.append(Question(
                        qid, "social_assist", 4,
                        f'Kto asystował przy bramce, którą {fact["subject"]} zdobył w meczu {sample["home"]} – {sample["away"]}?',
                        fact["value"], options,
                        f'Przy trafieniu zawodnika {fact["subject"]} asystował {fact["value"]}.',
                        sample["season_id"], confidence, urls,
                    ))
            elif fact_type == "penalty_scorer":
                qid = question_id("social_penalty_scorer", fact["id"])
                options = _person_options(fact["value"], player_candidates, qid)
                if options:
                    questions.append(Question(
                        qid, "social_penalty_scorer", 3,
                        f'Kto wykorzystał rzut karny dla {club} w meczu {sample["home"]} – {sample["away"]}?',
                        fact["value"], options,
                        f'Rzut karny wykorzystał {fact["value"]}.',
                        sample["season_id"], confidence, urls,
                    ))
            elif fact_type == "late_equalizer_scorer":
                qid = question_id("social_late_equalizer", fact["id"])
                options = _person_options(fact["value"], player_candidates, qid)
                if options:
                    questions.append(Question(
                        qid, "social_late_equalizer", 3,
                        f'Kto zdobył wyrównującą bramkę w końcówce meczu {sample["home"]} – {sample["away"]}?',
                        fact["value"], options,
                        f'Bramkę dającą remis zdobył {fact["value"]}.',
                        sample["season_id"], confidence, urls,
                    ))
            elif fact_type == "attendance":
                try:
                    value = int(fact["value"])
                except (TypeError, ValueError):
                    continue
                qid = question_id("social_attendance", fact["id"])
                questions.append(Question(
                    qid, "social_attendance", 4,
                    f'Ilu widzów według relacji oglądało mecz {sample["home"]} – {sample["away"]}?',
                    str(value), deterministic_shuffle(numeric_options(value, minimum=0), qid),
                    f'Relacja podaje frekwencję: {value} widzów.',
                    sample["season_id"], confidence, urls,
                ))
            elif fact_type == "comeback_from":
                correct = str(fact["value"])
                if ":" not in correct:
                    continue
                try:
                    left, right = [int(x) for x in correct.split(":", 1)]
                except ValueError:
                    continue
                variants = [correct, f"{left}:{max(0, right-1)}", f"{left+1}:{right}", f"{left}:{right+1}"]
                options = list(dict.fromkeys(variants))
                if len(options) < 3:
                    continue
                qid = question_id("social_comeback_from", fact["id"])
                questions.append(Question(
                    qid, "social_comeback_from", 3,
                    f'Z jakiego niekorzystnego wyniku {club} odrobił straty w meczu {sample["home"]} – {sample["away"]}?',
                    correct, deterministic_shuffle(options[:4], qid),
                    f'{club} odrobił straty od wyniku {correct}.',
                    sample["season_id"], confidence, urls,
                ))
    return questions
