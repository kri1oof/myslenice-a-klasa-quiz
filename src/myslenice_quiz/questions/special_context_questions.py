from __future__ import annotations

import sqlite3
from collections import defaultdict

from .base import Question, deterministic_shuffle, question_id


SPECIAL_PERSON_FACTS = {
    "halfway_line_scorer": (
        "social_halfway_line_scorer",
        lambda s, club, opponent: f'Kto zdobył bramkę z okolic połowy boiska w meczu {s["home"]} – {s["away"]}?',
        lambda value, club: f'Bramkę z okolic połowy boiska zdobył {value}.',
        4,
    ),
    "header_scorer": (
        "social_header_scorer",
        lambda s, club, opponent: f'Kto zdobył bramkę głową dla {club} w meczu {s["home"]} – {s["away"]}?',
        lambda value, club: f'Bramkę głową dla {club} zdobył {value}.',
        4,
    ),
    "brace_scorer": (
        "social_brace_scorer",
        lambda s, club, opponent: f'Kto zdobył dwie bramki dla {club} w meczu {s["home"]} – {s["away"]}?',
        lambda value, club: f'Dwie bramki dla {club} zdobył {value}.',
        3,
    ),
    "four_goal_scorer": (
        "social_four_goal_scorer",
        lambda s, club, opponent: f'Kto zdobył aż cztery bramki dla {club} w meczu {s["home"]} – {s["away"]}?',
        lambda value, club: f'Cztery bramki dla {club} zdobył {value}.',
        4,
    ),
    "promotion_clinching_goal_scorer": (
        "social_promotion_clinching_goal_scorer",
        lambda s, club, opponent: f'Kto zdobył drugą bramkę dla {club} w meczu z {opponent}, po którym klub zapewnił sobie awans?',
        lambda value, club: f'Drugą bramkę dla {club} w tym meczu zdobył {value}.',
        4,
    ),
    "opening_goal_scorer": (
        "social_opening_goal_scorer",
        lambda s, club, opponent: f'Kto otworzył wynik meczu {s["home"]} – {s["away"]}?',
        lambda value, club: f'Pierwszą bramkę w tym spotkaniu zdobył {value}.',
        3,
    ),
    "first_senior_goal_scorer": (
        "social_first_senior_goal_scorer",
        lambda s, club, opponent: f'Który zawodnik {club} zdobył swojego pierwszego gola w seniorskiej piłce w meczu {s["home"]} – {s["away"]}?',
        lambda value, club: f'Pierwszego gola w seniorskiej piłce zdobył wtedy {value}.',
        4,
    ),
    "penalty_saver": (
        "social_penalty_saver",
        lambda s, club, opponent: f'Kto obronił rzut karny dla {club} w meczu z {opponent}?',
        lambda value, club: f'Rzut karny obronił {value}.',
        4,
    ),
    "red_carded_goalkeeper": (
        "social_red_carded_goalkeeper",
        lambda s, club, opponent: f'Który bramkarz {club} zobaczył czerwoną kartkę w meczu z {opponent}?',
        lambda value, club: f'Czerwoną kartkę dla bramkarza {club} otrzymał {value}.',
        4,
    ),
    "emergency_goalkeeper": (
        "social_emergency_goalkeeper",
        lambda s, club, opponent: f'Kto awaryjnie stanął w bramce {club} po czerwonej kartce dla bramkarza w meczu z {opponent}?',
        lambda value, club: f'Po czerwonej kartce w bramce {club} stanął {value}.',
        4,
    ),
}


def _looks_like_person(value: str | None) -> bool:
    if not value:
        return False
    text = value.strip()
    if not text or text.replace(" ", "").isdigit() or ":" in text:
        return False
    return text.casefold() not in {"tak", "nie", "remis", "brak"}


def _urls(fact: sqlite3.Row) -> list[str]:
    values = [fact["post_url"], fact["source_url"]]
    return list(dict.fromkeys(x for x in values if x))


def generate_special_context_questions(conn: sqlite3.Connection, min_confidence: float = 0.80) -> list[Question]:
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if "match_context_facts" not in tables:
        return []

    placeholders = ",".join("?" for _ in SPECIAL_PERSON_FACTS)
    facts = conn.execute(
        f"""SELECT f.*,m.season_id,s.label season,h.name home,a.name away,c.name focal_club,
                   sp.post_url,src.url source_url
            FROM match_context_facts f
            JOIN matches m ON m.id=f.match_id
            JOIN seasons s ON s.id=m.season_id
            JOIN clubs h ON h.id=m.home_club_id
            JOIN clubs a ON a.id=m.away_club_id
            LEFT JOIN clubs c ON c.id=f.club_id
            LEFT JOIN social_posts sp ON sp.id=f.social_post_id
            LEFT JOIN sources src ON src.id=f.source_id
            WHERE f.verified=1 AND f.confidence>=? AND f.fact_type IN ({placeholders})
            ORDER BY f.match_id,f.id""",
        (min_confidence, *SPECIAL_PERSON_FACTS.keys()),
    ).fetchall()
    if not facts:
        return []

    all_facts = conn.execute(
        """SELECT f.match_id,f.subject,f.value FROM match_context_facts f
           WHERE f.verified=1 AND f.confidence>=? ORDER BY f.match_id,f.id""",
        (min_confidence,),
    ).fetchall()
    candidates_by_match: dict[int, list[str]] = defaultdict(list)
    for row in all_facts:
        for value in (row["subject"], row["value"]):
            if _looks_like_person(value) and value not in candidates_by_match[int(row["match_id"])]:
                candidates_by_match[int(row["match_id"])].append(value)

    questions: list[Question] = []
    for fact in facts:
        match_id = int(fact["match_id"])
        candidates = list(candidates_by_match[match_id])
        for row in conn.execute(
            """SELECT DISTINCT p.display_name FROM players p JOIN (
                 SELECT player_id FROM appearances WHERE match_id=?
                 UNION SELECT player_id FROM goals WHERE match_id=? AND player_id IS NOT NULL
               ) x ON x.player_id=p.id ORDER BY p.display_name""",
            (match_id, match_id),
        ):
            if row[0] not in candidates:
                candidates.append(row[0])

        correct = str(fact["value"] or "").strip()
        if not _looks_like_person(correct):
            continue
        options = [correct] + [x for x in candidates if x != correct]
        if len(options) < 3:
            continue

        question_type, prompt_builder, explanation_builder, difficulty = SPECIAL_PERSON_FACTS[fact["fact_type"]]
        club = fact["focal_club"] or fact["home"]
        opponent = fact["away"] if club == fact["home"] else fact["home"]
        qid = question_id(question_type, fact["id"])
        questions.append(Question(
            qid,
            question_type,
            difficulty,
            prompt_builder(fact, club, opponent),
            correct,
            deterministic_shuffle(options[:4], qid),
            explanation_builder(correct, club),
            fact["season_id"],
            fact["confidence"],
            _urls(fact),
        ))

    return questions
