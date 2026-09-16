from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

from .common import upsert_source
from ..db import get_or_create_club, get_or_create_season


@dataclass(frozen=True)
class OfflineMembership:
    season: str
    club: str
    source_name: str
    source_url: str
    confidence: float
    notes: str | None = None


def read_memberships(path: str | Path) -> list[OfflineMembership]:
    rows: list[OfflineMembership] = []
    with Path(path).open("r", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            season = (row.get("season") or "").strip()
            club = (row.get("club") or "").strip()
            source_name = (row.get("source_name") or "offline-history").strip()
            source_url = (row.get("source_url") or "").strip()
            notes = (row.get("notes") or "").strip() or None
            if not season or not club or not source_url:
                continue
            try:
                confidence = float(row.get("confidence") or 0.85)
            except ValueError:
                confidence = 0.85
            confidence = max(0.0, min(1.0, confidence))
            rows.append(OfflineMembership(season, club, source_name, source_url, confidence, notes))
    return rows


def import_memberships(conn, records: list[OfflineMembership]) -> tuple[int, int]:
    imported = 0
    source_ids: dict[tuple[str, str], int] = {}
    for rec in records:
        key = (rec.source_name, rec.source_url)
        source_id = source_ids.get(key)
        if source_id is None:
            source_id = upsert_source(conn, rec.source_name, rec.source_url, rec.notes or "Offline verified history seed")
            source_ids[key] = source_id
        season_id = get_or_create_season(conn, rec.season)
        club_id = get_or_create_club(conn, rec.club)
        conn.execute(
            """INSERT INTO club_season_memberships(season_id,club_id,source_id,confidence)
               VALUES(?,?,?,?) ON CONFLICT(season_id,club_id) DO UPDATE SET
               source_id=COALESCE(club_season_memberships.source_id,excluded.source_id),
               confidence=MAX(club_season_memberships.confidence,excluded.confidence)""",
            (season_id, club_id, source_id, rec.confidence),
        )
        imported += 1
    return imported, len(source_ids)
