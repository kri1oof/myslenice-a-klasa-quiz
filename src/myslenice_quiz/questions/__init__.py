from .generators import generate_all as _generate_core
from .lnp_questions import generate_lnp_questions
from .player_decision_questions import generate_player_decision_questions
from .social_questions import generate_social_context_questions
from .social_story_questions import generate_social_story_questions
from .special_context_questions import generate_special_context_questions


def generate_all(conn, min_confidence: float = 0.80):
    questions = list(_generate_core(conn, min_confidence))
    questions.extend(generate_lnp_questions(conn, min_confidence))
    questions.extend(generate_player_decision_questions(conn, min_confidence))
    questions.extend(generate_social_context_questions(conn, min_confidence))
    questions.extend(generate_social_story_questions(conn, min_confidence))
    questions.extend(generate_special_context_questions(conn, min_confidence))
    return list({q.id: q for q in questions}.values())


__all__ = ["generate_all"]
