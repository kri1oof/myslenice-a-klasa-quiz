from __future__ import annotations

import csv
from pathlib import Path

from .common import ClubSeasonStatRecord, MatchRecord, PlayerSeasonStatRecord


def import_matches_csv(path: str | Path) -> list[MatchRecord]:
    records: list[MatchRecord] = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            records.append(MatchRecord(
                season=row["season"],
                round_no=int(row["round_no"]) if row.get("round_no") else None,
                date=row.get("date") or None,
                home=row["home"],
                away=row["away"],
                home_goals=int(row["home_goals"]) if row.get("home_goals") else None,
                away_goals=int(row["away_goals"]) if row.get("away_goals") else None,
                home_ht=int(row["home_ht"]) if row.get("home_ht") else None,
                away_ht=int(row["away_ht"]) if row.get("away_ht") else None,
                confidence=float(row.get("confidence") or 1.0),
            ))
    return records


def import_player_stats_csv(path: str | Path) -> list[PlayerSeasonStatRecord]:
    records: list[PlayerSeasonStatRecord] = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            records.append(PlayerSeasonStatRecord(
                season=row["season"], club=row["club"], player=row["player"],
                goals=int(row["goals"]) if row.get("goals") else None,
                appearances=int(row["appearances"]) if row.get("appearances") else None,
                confidence=float(row.get("confidence") or 1.0),
            ))
    return records


def import_club_stats_csv(path: str | Path) -> list[ClubSeasonStatRecord]:
    fields = ["position", "played", "points", "wins", "draws", "losses", "goals_for", "goals_against"]
    records: list[ClubSeasonStatRecord] = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            kwargs = {field: int(row[field]) if row.get(field) else None for field in fields}
            records.append(ClubSeasonStatRecord(
                season=row["season"], club=row["club"], confidence=float(row.get("confidence") or 1.0), **kwargs
            ))
    return records
