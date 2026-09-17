from __future__ import annotations

import sqlite3

from .base import Question, deterministic_shuffle, name_options, question_id


PERSON_FACT_TYPES = {
    "opening_scorer",
    "debut_player",
    "returning_player",
    "transfer_in",
}

SOURCE_FACT_TYPES = {
    "coverage_source",
    "photo_report_source",
}

KNOWN_CONTEXT_SOURCES = [
    "Koneserzy Życia",
    "Fotopstryki (Grzegorz Jania)",
    "ZatrzymajCzas photography",
    "MZPN Podokręg Myślenice",
]


def _looks_like_person(value: str | None) -> bool:
    if not value:
        return False
    text = value.strip()
    if not text or text.replace(" ", "").isdigit() or ":" in text:
        return False
    return text.casefold() not in {"tak", "nie", "remis", "brak"}


def _source_urls(fact: sqlite3.Row) -> list[str]:
    urls: list[str] = []
    for value in (fact["post_url"], fact["source_url"]):
        if value and value not in urls:
            urls.append(value)
    return urls


def _person_options(correct: str, candidates: list[str], qid: str) -> list[str]:
    values = [correct]
    for candidate in candidates:
        if candidate and candidate not in values and _looks_like_person(candidate):
            values.append(candidate)
        if len(values) >= 4:
            break
    if len(values) < 3:
        return []
    return deterministic_shuffle(values[:4], qid)


def _source_options(correct: str, observed: list[str], qid: str) -> list[str]:
    values = [correct]
    for candidate in observed + KNOWN_CONTEXT_SOURCES:
        if candidate and candidate not in values:
            values.append(candidate)
        if len(values) >= 4:
            break
    if len(values) < 3:
        return []
    return deterministic_shuffle(values[:4], qid)


def _club_options(conn: sqlite3.Connection, season_id: int, correct: str, qid: str) -> list[str]:
    peers = [
        row[0]
        for row in conn.execute(
            """SELECT DISTINCT c.name FROM clubs c JOIN (
                   SELECT home_club_id AS club_id FROM matches WHERE season_id=?
                   UNION SELECT away_club_id FROM matches WHERE season_id=?
                   UNION SELECT club_id FROM club_season_stats WHERE season_id=?
               ) x ON x.club_id=c.id ORDER BY c.name""",
            (season_id, season_id, season_id),
        )
        if row[0] != correct
    ]
    options = name_options(correct, peers)
    return deterministic_shuffle(options, qid) if len(options) >= 3 else []


def _static_source_questions() -> list[Question]:
    """Small source-awareness pool used only for verified local media profiles.

    These questions are deliberately separate from match facts. They teach the player
    which local pages/photographers appear in the provenance without pretending that
    a source covered a specific match when we do not have evidence for that link.
    """
    rows = [
        (
            "source_role_koneserzy",
            "Która strona jeździ na lokalne mecze i przygotowuje relacje z piłkarskiego życia niższych lig?",
            "Koneserzy Życia",
            ["Koneserzy Życia", "Fotopstryki (Grzegorz Jania)", "ZatrzymajCzas photography", "MZPN Podokręg Myślenice"],
            "Koneserzy Życia to niezależna strona relacyjna śledząca lokalne mecze i wydarzenia piłkarskie.",
            ["https://mateuszradzewicz.pl/"],
        ),
        (
            "source_role_fotopstryki",
            "Które z lokalnych źródeł fotograficznych prowadzi Grzegorz Jania?",
            "Fotopstryki (Grzegorz Jania)",
            ["Fotopstryki (Grzegorz Jania)", "Koneserzy Życia", "ZatrzymajCzas photography", "MZPN Podokręg Myślenice"],
            "Archiwum Fotopstryki jest prowadzone przez Grzegorza Janię i zawiera liczne galerie z lokalnych meczów.",
            ["https://www.fotopstryki.pl/"],
        ),
        (
            "source_role_zatrzymajczas",
            "Która marka fotograficzna regularnie pojawia się przy materiałach piłkarskich Podokręgu Myślenice i lokalnych klubów?",
            "ZatrzymajCzas photography",
            ["ZatrzymajCzas photography", "Fotopstryki (Grzegorz Jania)", "Koneserzy Życia", "MZPN Podokręg Myślenice"],
            "ZatrzymajCzas photography jest wielokrotnie podpisywane przy lokalnych materiałach i fotorelacjach piłkarskich.",
            ["https://myslenice.malopolskizpn.pl/pilkarkie-zakonczenie-lata-z-lks-gorki-patronat-prezesa/"],
        ),
    ]
    questions: list[Question] = []
    for qid_seed, prompt, correct, options, explanation, provenance in rows:
        qid = question_id("social_source_profile", qid_seed)
        questions.append(Question(
            qid,
            "social_source_profile",
            3,
            prompt,
            correct,
            deterministic_shuffle(options, qid),
            explanation,
            None,
            0.90,
            provenance,
        ))
    return questions


def generate_social_story_questions(conn: sqlite3.Connection, min_confidence: float = 0.80) -> list[Question]:
    tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if "match_context_facts" not in tables:
        return _static_source_questions()

    facts = conn.execute(
        """SELECT f.*,m.season_id,m.home_club_id,m.away_club_id,
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

    person_candidates: list[str] = []
    observed_sources: list[str] = []
    for fact in facts:
        if fact["fact_type"] in PERSON_FACT_TYPES:
            for candidate in (fact["subject"], fact["value"]):
                if _looks_like_person(candidate) and candidate not in person_candidates:
                    person_candidates.append(candidate)
        if fact["fact_type"] in SOURCE_FACT_TYPES and fact["value"] not in observed_sources:
            observed_sources.append(fact["value"])

    questions = _static_source_questions()
    for fact in facts:
        fact_type = fact["fact_type"]
        club = fact["focal_club"] or fact["home"]
        opponent = fact["away"] if club == fact["home"] else fact["home"]
        urls = _source_urls(fact)

        if fact_type == "opening_scorer":
            qid = question_id("social_opening_scorer", fact["id"])
            options = _person_options(fact["value"], person_candidates, qid)
            if options:
                questions.append(Question(
                    qid, "social_opening_scorer", 3,
                    f'Kto według relacji otworzył wynik meczu {fact["home"]} – {fact["away"]} w sezonie {fact["season"]}?',
                    fact["value"], options,
                    f'Pierwszą bramkę w tej relacji zdobył {fact["value"]}.',
                    fact["season_id"], fact["confidence"], urls,
                ))

        elif fact_type == "debut_player":
            qid = question_id("social_debut_player", fact["id"])
            options = _person_options(fact["value"], person_candidates, qid)
            if options:
                questions.append(Question(
                    qid, "social_debut_player", 4,
                    f'Który zawodnik {club} według relacji debiutował w meczu z {opponent}?',
                    fact["value"], options,
                    f'Debiut w tym spotkaniu zanotował {fact["value"]}.',
                    fact["season_id"], fact["confidence"], urls,
                ))

        elif fact_type == "returning_player":
            # The basic social generator already supports this fact. Keep a distinct
            # story question only when the seed explicitly describes a return to club.
            if (fact["subject"] or "").casefold() != "return_to_club":
                continue
            qid = question_id("social_return_to_club", fact["id"])
            options = _person_options(fact["value"], person_candidates, qid)
            if options:
                questions.append(Question(
                    qid, "social_return_to_club", 4,
                    f'Który zawodnik według relacji wrócił do {club} przed meczem z {opponent}?',
                    fact["value"], options,
                    f'Do {club} wrócił {fact["value"]}.',
                    fact["season_id"], fact["confidence"], urls,
                ))

        elif fact_type == "transfer_in":
            qid = question_id("social_transfer_in", fact["id"])
            options = _person_options(fact["value"], person_candidates, qid)
            if options:
                questions.append(Question(
                    qid, "social_transfer_in", 4,
                    f'Który zawodnik był nowym transferem {club} wskazanym w relacji przed meczem z {opponent}?',
                    fact["value"], options,
                    f'Nowym zawodnikiem {club} był {fact["value"]}.',
                    fact["season_id"], fact["confidence"], urls,
                ))

        elif fact_type == "transfer_from" and fact["subject"]:
            qid = question_id("social_transfer_from", fact["id"])
            options = _club_options(conn, int(fact["season_id"]), fact["value"], qid)
            if options:
                questions.append(Question(
                    qid, "social_transfer_from", 4,
                    f'Z jakiego klubu według relacji trafił {fact["subject"]} do {club}?',
                    fact["value"], options,
                    f'{fact["subject"]} trafił do {club} z klubu {fact["value"]}.',
                    fact["season_id"], fact["confidence"], urls,
                ))

        elif fact_type in SOURCE_FACT_TYPES:
            qtype = "social_photo_report_source" if fact_type == "photo_report_source" else "social_coverage_source"
            qid = question_id(qtype, fact["id"])
            options = _source_options(fact["value"], observed_sources, qid)
            if not options:
                continue
            if fact_type == "photo_report_source":
                prompt = f'Kto przygotował fotorelację z meczu {fact["home"]} – {fact["away"]} w sezonie {fact["season"]}?'
                explanation = f'Fotorelację z tego spotkania przygotował/a {fact["value"]}.'
            else:
                prompt = f'Która strona przygotowała relację z meczu {fact["home"]} – {fact["away"]} w sezonie {fact["season"]}?'
                explanation = f'Źródłem relacji było: {fact["value"]}.'
            questions.append(Question(
                qid, qtype, 4, prompt, fact["value"], options, explanation,
                fact["season_id"], fact["confidence"], urls,
            ))

    return questions
