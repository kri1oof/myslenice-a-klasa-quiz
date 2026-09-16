from __future__ import annotations

import sqlite3
from collections import defaultdict

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


def _person_question(
    questions: list[Question],
    fact: sqlite3.Row,
    sample: sqlite3.Row,
    player_candidates: list[str],
    question_type: str,
    prompt: str,
    explanation: str,
    urls: list[str],
    difficulty: int = 3,
) -> None:
    qid = question_id(question_type, fact["id"])
    options = _person_options(fact["value"], player_candidates, qid)
    if not options:
        return
    questions.append(Question(
        qid, question_type, difficulty, prompt, fact["value"], options, explanation,
        sample["season_id"], fact["confidence"], urls,
    ))


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
            opponent = sample["away"] if club == sample["home"] else sample["home"]
            urls = _source_urls(conn, fact)
            confidence = fact["confidence"]

            if fact_type == "mvp":
                _person_question(
                    questions, fact, sample, player_candidates, "social_mvp",
                    f'Kogo relacja po meczu {sample["home"]} – {sample["away"]} w sezonie {sample["season"]} wyróżniła jako MVP?',
                    f'W relacji pomeczowej jako MVP wskazano: {fact["value"]}.', urls,
                )
            elif fact_type == "standout_player":
                _person_question(
                    questions, fact, sample, player_candidates, "social_standout_player",
                    f'Którego zawodnika relacja wskazała jako bohatera meczu {sample["home"]} – {sample["away"]}?',
                    f'Relacja wyróżniła jako bohatera spotkania zawodnika {fact["value"]}.', urls,
                )
            elif fact_type == "captain":
                _person_question(
                    questions, fact, sample, player_candidates, "social_captain",
                    f'Kto według relacji był kapitanem {club} w meczu z {opponent}?',
                    f'Kapitanem {club} był {fact["value"]}.', urls,
                )
            elif fact_type == "assist" and fact["subject"]:
                _person_question(
                    questions, fact, sample, player_candidates, "social_assist",
                    f'Kto asystował przy bramce, którą {fact["subject"]} zdobył w meczu {sample["home"]} – {sample["away"]}?',
                    f'Przy trafieniu zawodnika {fact["subject"]} asystował {fact["value"]}.', urls, 4,
                )
            elif fact_type == "penalty_scorer":
                _person_question(
                    questions, fact, sample, player_candidates, "social_penalty_scorer",
                    f'Kto wykorzystał rzut karny dla {club} w meczu {sample["home"]} – {sample["away"]}?',
                    f'Rzut karny wykorzystał {fact["value"]}.', urls,
                )
            elif fact_type == "missed_penalty":
                _person_question(
                    questions, fact, sample, player_candidates, "social_missed_penalty",
                    f'Kto nie wykorzystał rzutu karnego dla {club} w meczu {sample["home"]} – {sample["away"]}?',
                    f'Niewykorzystany rzut karny wykonywał {fact["value"]}.', urls, 4,
                )
            elif fact_type == "own_goal":
                _person_question(
                    questions, fact, sample, player_candidates, "social_own_goal",
                    f'Który zawodnik zanotował samobójcze trafienie w meczu {sample["home"]} – {sample["away"]}?',
                    f'Samobójcze trafienie zanotował {fact["value"]}.', urls, 4,
                )
            elif fact_type == "equalizer_scorer":
                _person_question(
                    questions, fact, sample, player_candidates, "social_equalizer",
                    f'Kto zdobył bramkę wyrównującą w meczu {sample["home"]} – {sample["away"]}?',
                    f'Bramkę wyrównującą zdobył {fact["value"]}.', urls,
                )
            elif fact_type == "late_equalizer_scorer":
                _person_question(
                    questions, fact, sample, player_candidates, "social_late_equalizer",
                    f'Kto zdobył wyrównującą bramkę w końcówce meczu {sample["home"]} – {sample["away"]}?',
                    f'Bramkę dającą remis zdobył {fact["value"]}.', urls,
                )
            elif fact_type == "hat_trick_scorer":
                _person_question(
                    questions, fact, sample, player_candidates, "social_hat_trick_scorer",
                    f'Kto skompletował hat-tricka w meczu {sample["home"]} – {sample["away"]}?',
                    f'Hat-tricka w tym spotkaniu zdobył {fact["value"]}.', urls, 3,
                )
            elif fact_type == "returning_player":
                _person_question(
                    questions, fact, sample, player_candidates, "social_returning_player",
                    f'Który zawodnik {club} według relacji wracał do kadry po przerwie przed meczem z {opponent}?',
                    f'Wracającym po przerwie zawodnikiem był {fact["value"]}.', urls, 4,
                )
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
            elif fact_type == "oldest_starting_age":
                try:
                    value = int(fact["value"])
                except (TypeError, ValueError):
                    continue
                qid = question_id("social_oldest_starting_age", fact["id"])
                questions.append(Question(
                    qid, "social_oldest_starting_age", 4,
                    f'Ile lat miał najstarszy zawodnik {club} w wyjściowej jedenastce na mecz {sample["home"]} – {sample["away"]}, według relacji?',
                    str(value), deterministic_shuffle(numeric_options(value, minimum=15), qid),
                    f'Według relacji najstarszy zawodnik {club} w wyjściowej jedenastce miał {value} lat.',
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
