from __future__ import annotations

import sqlite3
from dataclasses import dataclass


@dataclass(slots=True)
class ValidationIssue:
    level: str
    code: str
    message: str


def validate_database(conn: sqlite3.Connection) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []

    conflicts = conn.execute("SELECT COUNT(*) FROM data_conflicts WHERE resolved=0").fetchone()[0]
    if conflicts:
        issues.append(ValidationIssue("ERROR", "UNRESOLVED_CONFLICTS", f"Nierozwiązane konflikty danych: {conflicts}"))

    unknown_goals = conn.execute("SELECT COUNT(*) FROM goals WHERE player_id IS NULL").fetchone()[0]
    if unknown_goals:
        issues.append(ValidationIssue("INFO", "UNKNOWN_SCORERS", f"Bramki bez znanego strzelca: {unknown_goals}; nie będą źródłem pytań o zawodników."))

    suspicious = conn.execute(
        "SELECT COUNT(*) FROM matches WHERE home_goals < 0 OR away_goals < 0 OR home_ht < 0 OR away_ht < 0"
    ).fetchone()[0]
    if suspicious:
        issues.append(ValidationIssue("ERROR", "NEGATIVE_SCORE", f"Mecze z ujemnym wynikiem: {suspicious}"))

    ht_impossible = conn.execute(
        """SELECT COUNT(*) FROM matches WHERE home_ht IS NOT NULL AND away_ht IS NOT NULL
           AND (home_goals IS NULL OR away_goals IS NULL OR home_ht > home_goals OR away_ht > away_goals)"""
    ).fetchone()[0]
    if ht_impossible:
        issues.append(ValidationIssue("ERROR", "IMPOSSIBLE_HALFTIME", f"Niespójne wyniki do przerwy: {ht_impossible}"))

    duplicates = conn.execute(
        """SELECT COUNT(*) FROM (
             SELECT season_id,round_no,home_club_id,away_club_id,COUNT(*) c FROM matches
             GROUP BY season_id,round_no,home_club_id,away_club_id HAVING c>1
           )"""
    ).fetchone()[0]
    if duplicates:
        issues.append(ValidationIssue("ERROR", "DUPLICATE_MATCHES", f"Potencjalne duplikaty meczów: {duplicates}"))

    q_invalid = conn.execute(
        "SELECT COUNT(*) FROM question_bank WHERE confidence < 0.8 OR enabled NOT IN (0,1)"
    ).fetchone()[0]
    if q_invalid:
        issues.append(ValidationIssue("WARN", "LOW_CONFIDENCE_QUESTIONS", f"Pytania wymagające przeglądu: {q_invalid}"))

    if not issues:
        issues.append(ValidationIssue("OK", "CLEAN", "Baza przeszła podstawową walidację."))
    return issues
