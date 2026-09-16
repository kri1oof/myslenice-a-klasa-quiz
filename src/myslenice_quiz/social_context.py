from __future__ import annotations

import csv
import hashlib
import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import sqlite3

from .db import get_or_create_club
from .normalize import normalize_text


@dataclass(slots=True)
class SocialPageRow:
    club: str
    platform: str
    page_name: str
    page_url: str
    verification_source: str | None = None
    notes: str | None = None


@dataclass(slots=True)
class ContextSeedRow:
    club: str
    season: str
    opponent: str
    source_url: str
    published_at: str | None
    relation_type: str
    fact_type: str
    subject: str | None
    value: str
    confidence: float
    notes: str | None = None
    score: str | None = None
    match_date: str | None = None


def _clean(value: str | None) -> str:
    return (value or "").strip()


def read_social_pages(path: str | Path) -> list[SocialPageRow]:
    rows: list[SocialPageRow] = []
    with Path(path).open("r", encoding="utf-8-sig", newline="") as handle:
        for raw in csv.DictReader(handle):
            club = _clean(raw.get("club"))
            page_url = _clean(raw.get("page_url"))
            if not club or not page_url:
                continue
            rows.append(SocialPageRow(
                club=club,
                platform=_clean(raw.get("platform")) or "facebook",
                page_name=_clean(raw.get("page_name")) or club,
                page_url=page_url,
                verification_source=_clean(raw.get("verification_source")) or None,
                notes=_clean(raw.get("notes")) or None,
            ))
    return rows


def import_social_pages(conn: sqlite3.Connection, rows: list[SocialPageRow]) -> int:
    imported = 0
    for row in rows:
        club_id = get_or_create_club(conn, row.club)
        notes = row.notes or ""
        if row.verification_source:
            notes = (notes + ("; " if notes else "") + f"verification_source={row.verification_source}")
        conn.execute(
            """INSERT INTO club_social_pages(club_id,platform,page_name,page_url,verified,active,notes)
               VALUES(?,?,?,?,1,1,?)
               ON CONFLICT(page_url) DO UPDATE SET club_id=excluded.club_id,platform=excluded.platform,
                 page_name=excluded.page_name,verified=1,active=1,notes=excluded.notes""",
            (club_id, row.platform, row.page_name, row.page_url, notes or None),
        )
        imported += 1
    return imported


def read_context_seed(path: str | Path) -> list[ContextSeedRow]:
    rows: list[ContextSeedRow] = []
    with Path(path).open("r", encoding="utf-8-sig", newline="") as handle:
        for raw in csv.DictReader(handle):
            if not _clean(raw.get("club")) or not _clean(raw.get("season")) or not _clean(raw.get("opponent")):
                continue
            rows.append(ContextSeedRow(
                club=_clean(raw.get("club")),
                season=_clean(raw.get("season")),
                opponent=_clean(raw.get("opponent")),
                source_url=_clean(raw.get("source_url")),
                published_at=_clean(raw.get("published_at")) or None,
                relation_type=_clean(raw.get("relation_type")) or "post_match",
                fact_type=_clean(raw.get("fact_type")),
                subject=_clean(raw.get("subject")) or None,
                value=_clean(raw.get("value")),
                confidence=float(_clean(raw.get("confidence")) or "0.85"),
                notes=_clean(raw.get("notes")) or None,
                score=_clean(raw.get("score")) or None,
                match_date=_clean(raw.get("match_date")) or None,
            ))
    return rows


def _source_id(conn: sqlite3.Connection, url: str, source_type: str = "local_context") -> int:
    conn.execute(
        "INSERT OR IGNORE INTO sources(source_type,url,authority,notes) VALUES(?,?,?,?)",
        (source_type, url, 0.82, "Publiczny materiał klubowy/lokalny używany jako kontekst meczu"),
    )
    return int(conn.execute("SELECT id FROM sources WHERE url=?", (url,)).fetchone()[0])


def _club_id(conn: sqlite3.Connection, name: str) -> int | None:
    normalized = normalize_text(name)
    row = conn.execute("SELECT club_id FROM club_aliases WHERE normalized_alias=?", (normalized,)).fetchone()
    if row:
        return int(row[0])
    row = conn.execute("SELECT id FROM clubs WHERE lower(name)=lower(?)", (name,)).fetchone()
    return int(row[0]) if row else None


def _parse_score(value: str | None) -> tuple[int, int] | None:
    if not value or ":" not in value:
        return None
    try:
        left, right = value.split(":", 1)
        return int(left.strip()), int(right.strip())
    except ValueError:
        return None


def match_context_row(conn: sqlite3.Connection, row: ContextSeedRow) -> tuple[int | None, float, dict]:
    season = conn.execute("SELECT id FROM seasons WHERE label=?", (row.season,)).fetchone()
    club_id = _club_id(conn, row.club)
    opponent_id = _club_id(conn, row.opponent)
    if not season or club_id is None or opponent_id is None:
        return None, 0.0, {"reason": "missing season/club"}

    candidates = conn.execute(
        """SELECT id,match_date,home_club_id,away_club_id,home_goals,away_goals,round_no
           FROM matches WHERE season_id=? AND
           ((home_club_id=? AND away_club_id=?) OR (home_club_id=? AND away_club_id=?))""",
        (season[0], club_id, opponent_id, opponent_id, club_id),
    ).fetchall()
    if not candidates:
        return None, 0.0, {"reason": "no club-pair match"}

    expected_score = _parse_score(row.score)
    scored: list[tuple[float, sqlite3.Row, dict]] = []
    for candidate in candidates:
        score = 0.60  # season + exact pair
        evidence: dict[str, object] = {"season": row.season, "club_pair": True}
        if row.match_date and candidate["match_date"]:
            try:
                expected = datetime.fromisoformat(row.match_date[:10])
                actual = datetime.fromisoformat(str(candidate["match_date"])[:10])
                delta = abs((actual - expected).days)
                if delta == 0:
                    score += 0.25
                    evidence["date"] = "exact"
                elif delta <= 3:
                    score += 0.15
                    evidence["date_delta_days"] = delta
            except ValueError:
                pass
        if expected_score and candidate["home_goals"] is not None and candidate["away_goals"] is not None:
            actual_score = (int(candidate["home_goals"]), int(candidate["away_goals"]))
            if actual_score == expected_score:
                score += 0.20
                evidence["score"] = "exact"
            elif actual_score == expected_score[::-1]:
                # Seed score may be written from the focal club's perspective.
                score += 0.12
                evidence["score"] = "reverse-perspective"
        scored.append((min(score, 1.0), candidate, evidence))

    scored.sort(key=lambda item: item[0], reverse=True)
    best_score, best, evidence = scored[0]
    if len(scored) > 1 and scored[1][0] == best_score:
        return None, best_score, {"reason": "ambiguous", "candidates": [int(x[1]["id"]) for x in scored[:2]]}
    return int(best["id"]), best_score, evidence


def import_context_seed(conn: sqlite3.Connection, rows: list[ContextSeedRow]) -> tuple[int, int, int]:
    linked = facts = skipped = 0
    for row in rows:
        match_id, match_score, evidence = match_context_row(conn, row)
        if match_id is None or match_score < 0.72:
            skipped += 1
            continue
        club_id = _club_id(conn, row.club)
        source_id = _source_id(conn, row.source_url)
        post_hash = hashlib.sha1(f"{row.source_url}|{row.published_at or ''}".encode("utf-8")).hexdigest()

        # Not every context source is literally a Facebook post. The generic social_posts
        # table can also hold a local-media mirror/quote of a club post; use a synthetic
        # page record for those sources so provenance stays explicit.
        page_url = row.source_url.split("/artykul/")[0] if "/artykul/" in row.source_url else row.source_url
        platform = "facebook" if "facebook.com" in row.source_url else "local_media"
        page_name = row.club if platform == "facebook" else "Lokalne źródło / materiał klubowy"
        conn.execute(
            """INSERT OR IGNORE INTO club_social_pages(club_id,platform,page_name,page_url,verified,active,notes)
               VALUES(?,?,?,?,1,1,?)""",
            (club_id, platform, page_name, page_url, "Źródło kontekstowe zaimportowane z seed"),
        )
        page_id = int(conn.execute("SELECT id FROM club_social_pages WHERE page_url=?", (page_url,)).fetchone()[0])
        conn.execute(
            """INSERT INTO social_posts(social_page_id,source_id,post_url,published_at,text_content,content_hash,confidence,fetched_at)
               VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
               ON CONFLICT(post_url) DO UPDATE SET source_id=excluded.source_id,published_at=excluded.published_at,
                 content_hash=excluded.content_hash,confidence=max(social_posts.confidence,excluded.confidence)""",
            (page_id, source_id, row.source_url, row.published_at, row.notes, post_hash, row.confidence),
        )
        post_id = int(conn.execute("SELECT id FROM social_posts WHERE post_url=?", (row.source_url,)).fetchone()[0])
        conn.execute(
            """INSERT INTO social_post_match_links(social_post_id,match_id,relation_type,match_score,verified,evidence_json)
               VALUES(?,?,?,?,1,?)
               ON CONFLICT(social_post_id,match_id) DO UPDATE SET relation_type=excluded.relation_type,
                 match_score=max(social_post_match_links.match_score,excluded.match_score),verified=1,evidence_json=excluded.evidence_json""",
            (post_id, match_id, row.relation_type, match_score, json.dumps(evidence, ensure_ascii=False)),
        )
        linked += 1
        exists = conn.execute(
            """SELECT id FROM match_context_facts WHERE match_id=? AND fact_type=?
               AND COALESCE(subject,'')=COALESCE(?, '') AND value=? AND COALESCE(source_id,0)=?""",
            (match_id, row.fact_type, row.subject, row.value, source_id),
        ).fetchone()
        if not exists:
            conn.execute(
                """INSERT INTO match_context_facts(match_id,club_id,social_post_id,source_id,fact_type,subject,value,confidence,verified,notes)
                   VALUES(?,?,?,?,?,?,?,?,1,?)""",
                (match_id, club_id, post_id, source_id, row.fact_type, row.subject, row.value, row.confidence, row.notes),
            )
            facts += 1
    return linked, facts, skipped


def audit_context(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute(
        """SELECT s.label season,h.name home,a.name away,COUNT(DISTINCT spml.social_post_id) posts,
                  COUNT(mcf.id) facts,
                  GROUP_CONCAT(DISTINCT mcf.fact_type) fact_types
           FROM matches m
           JOIN seasons s ON s.id=m.season_id
           JOIN clubs h ON h.id=m.home_club_id JOIN clubs a ON a.id=m.away_club_id
           LEFT JOIN social_post_match_links spml ON spml.match_id=m.id AND spml.verified=1
           LEFT JOIN match_context_facts mcf ON mcf.match_id=m.id AND mcf.verified=1
           WHERE spml.social_post_id IS NOT NULL OR mcf.id IS NOT NULL
           GROUP BY m.id ORDER BY s.start_year,m.match_date,m.round_no"""
    ).fetchall()
