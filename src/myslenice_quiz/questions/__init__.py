from .generators import generate_all as _generate_core
from .social_questions import generate_social_context_questions


def generate_all(conn, min_confidence: float = 0.80):
    questions = list(_generate_core(conn, min_confidence))
    questions.extend(generate_social_context_questions(conn, min_confidence))
    return list({q.id: q for q in questions}.values())


__all__ = ["generate_all"]
