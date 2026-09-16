from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
import random
from typing import Iterable


@dataclass(slots=True)
class Question:
    id: str
    question_type: str
    difficulty: int
    prompt: str
    correct_answer: str
    options: list[str]
    explanation: str
    season_id: int | None
    confidence: float
    provenance: list[str]

    def as_json(self) -> dict:
        data = asdict(self)
        data["options"] = self.options
        return data


def question_id(question_type: str, *parts: object) -> str:
    payload = "|".join(str(x) for x in (question_type, *parts))
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:16]


def numeric_options(correct: int, minimum: int = 0, count: int = 4) -> list[str]:
    candidates = [correct]
    for delta in (1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 7, -7, 10, -10):
        value = correct + delta
        if value >= minimum and value not in candidates:
            candidates.append(value)
        if len(candidates) >= count:
            break
    return [str(x) for x in candidates[:count]]


def score_options(home: int, away: int) -> list[str]:
    correct = f"{home}:{away}"
    candidates = [correct]
    variants = [
        (away, home),
        (home + 1, away),
        (home, away + 1),
        (max(0, home - 1), away),
        (home, max(0, away - 1)),
        (home + 1, away + 1),
        (max(0, home - 1), max(0, away - 1)),
    ]
    for h, a in variants:
        value = f"{h}:{a}"
        if value not in candidates:
            candidates.append(value)
        if len(candidates) == 4:
            break
    return candidates


def name_options(correct: str, peers: Iterable[str], count: int = 4) -> list[str]:
    unique = [correct]
    for peer in peers:
        if peer and peer not in unique:
            unique.append(peer)
        if len(unique) >= count:
            break
    return unique[:count]


def deterministic_shuffle(values: list[str], seed: str) -> list[str]:
    values = list(values)
    rng = random.Random(seed)
    rng.shuffle(values)
    return values


def _natural_options(q: Question) -> list[str]:
    """Remove artificial distractors where the question has a natural answer set.

    Most quiz questions still use four options. Comparisons and match outcomes are
    different: adding a random fourth answer makes the question less natural rather
    than harder. The frontend renders any number of buttons, so keep 2-4 choices.
    """
    options = list(dict.fromkeys(q.options))

    if q.question_type == "match_winner":
        # Exactly the two teams taking part plus draw.
        options = [x for x in options if x == "Remis" or x in q.prompt]
    elif q.question_type == "higher_finish":
        # Positions are known and distinct: only the two compared clubs are possible.
        options = [x for x in options if x in q.prompt]
    elif q.question_type == "compare_player_goals":
        # Player A, player B, or a tie.
        options = [x for x in options if x == "Tyle samo" or x in q.prompt]
    elif q.question_type == "player_match_role":
        # A confirmed appearance with a starter flag can only be starter or bench.
        options = [x for x in options if x in {"Podstawowy skład", "Ławka rezerwowych"}]

    return options


def save_questions(conn, questions: Iterable[Question]) -> int:
    count = 0
    for q in questions:
        options = _natural_options(q)
        if not 2 <= len(options) <= 4 or len(set(options)) != len(options) or q.correct_answer not in options:
            continue
        conn.execute(
            """INSERT INTO question_bank(id,question_type,difficulty,prompt,correct_answer,options_json,
               explanation,season_id,confidence,provenance_json,enabled)
               VALUES(?,?,?,?,?,?,?,?,?,?,1)
               ON CONFLICT(id) DO UPDATE SET prompt=excluded.prompt,correct_answer=excluded.correct_answer,
               options_json=excluded.options_json,explanation=excluded.explanation,confidence=excluded.confidence,
               provenance_json=excluded.provenance_json,enabled=1""",
            (q.id, q.question_type, q.difficulty, q.prompt, q.correct_answer,
             json.dumps(options, ensure_ascii=False), q.explanation, q.season_id, q.confidence,
             json.dumps(q.provenance, ensure_ascii=False)),
        )
        count += 1
    return count
