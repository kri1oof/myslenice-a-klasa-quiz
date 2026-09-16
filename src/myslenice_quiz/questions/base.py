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


def save_questions(conn, questions: Iterable[Question]) -> int:
    count = 0
    for q in questions:
        if len(q.options) != 4 or len(set(q.options)) != 4 or q.correct_answer not in q.options:
            continue
        conn.execute(
            """INSERT INTO question_bank(id,question_type,difficulty,prompt,correct_answer,options_json,
               explanation,season_id,confidence,provenance_json,enabled)
               VALUES(?,?,?,?,?,?,?,?,?,?,1)
               ON CONFLICT(id) DO UPDATE SET prompt=excluded.prompt,correct_answer=excluded.correct_answer,
               options_json=excluded.options_json,explanation=excluded.explanation,confidence=excluded.confidence,
               provenance_json=excluded.provenance_json,enabled=1""",
            (q.id, q.question_type, q.difficulty, q.prompt, q.correct_answer,
             json.dumps(q.options, ensure_ascii=False), q.explanation, q.season_id, q.confidence,
             json.dumps(q.provenance, ensure_ascii=False)),
        )
        count += 1
    return count
