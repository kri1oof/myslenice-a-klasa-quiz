from __future__ import annotations

import csv
from pathlib import Path
import re
import time
from urllib.parse import urljoin

from bs4 import BeautifulSoup
import requests

from .common import ClubProfileRecord, USER_AGENT, save_club_profiles
from ..db import get_or_create_club
from ..normalize import normalize_text, slugify


def load_catalog(path: str | Path) -> list[ClubProfileRecord]:
    out: list[ClubProfileRecord] = []
    with Path(path).open("r", encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            name = (row.get("name") or "").strip()
            if not name:
                continue
            founded = (row.get("founded_year") or "").strip()
            out.append(ClubProfileRecord(
                club=name,
                short_name=(row.get("short_name") or "").strip() or None,
                city=(row.get("city") or "").strip() or None,
                founded_year=int(founded) if founded.isdigit() else None,
                crest_source_url=(row.get("crest_source_url") or "").strip() or None,
                website_url=(row.get("website_url") or "").strip() or None,
                notes=(row.get("notes") or "").strip() or None,
            ))
    return out


def _find_logo_url(html: str, page_url: str, club_name: str) -> str | None:
    soup = BeautifulSoup(html, "html.parser")
    target = normalize_text(club_name)
    candidates: list[tuple[int, str]] = []
    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src") or img.get("data-lazy-src")
        if not src:
            continue
        alt = normalize_text(img.get("alt") or "")
        src_low = src.lower()
        score = 0
        if "team logo" in alt or alt == "logo klubu": score += 100
        if target and target in alt: score += 80
        if "teams/" in src_low or "club" in src_low or "logo" in src_low: score += 20
        if any(x in src_low for x in ("avatar", "league", "banner", "ads")): score -= 40
        if score > 0:
            candidates.append((score, urljoin(page_url, src)))
    return max(candidates, default=(0, None), key=lambda x: x[0])[1]


def fetch_crests(conn, output_dir: str | Path = "web/assets/crests", overwrite: bool = False, delay: float = 0.15) -> tuple[int, int]:
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    rows = conn.execute(
        """SELECT c.id,c.name,c.slug,cp.crest_path,cp.crest_source_url,cp.crest_remote_url FROM clubs c
           LEFT JOIN club_profiles cp ON cp.club_id=c.id ORDER BY c.name"""
    ).fetchall()
    ok = skipped = 0
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    for row in rows:
        if row["crest_path"] and not overwrite:
            skipped += 1
            continue
        page_url = row["crest_source_url"]
        logo_url = row["crest_remote_url"]
        try:
            # Prefer a crest URL already discovered from a league/match page.
            # This avoids hammering club-profile sites and works even when a
            # provider rate-limits profile pages.
            if not logo_url and page_url:
                page = session.get(page_url, timeout=15)
                if page.status_code >= 400:
                    skipped += 1
                    continue
                logo_url = _find_logo_url(page.text, page_url, row["name"])
            if not logo_url:
                skipped += 1
                continue
            image = session.get(logo_url, timeout=15)
            image.raise_for_status()
            ctype = image.headers.get("content-type", "").lower()
            ext = ".webp" if "webp" in ctype else ".png" if "png" in ctype else ".jpg"
            path = output / f'{row["slug"]}{ext}'
            path.write_bytes(image.content)
            rel = path.as_posix()
            if rel.startswith("web/"):
                rel = rel[4:]
            conn.execute(
                """INSERT INTO club_profiles(club_id,crest_path,crest_remote_url,crest_source_url)
                   VALUES(?,?,?,?) ON CONFLICT(club_id) DO UPDATE SET
                   crest_path=excluded.crest_path,crest_remote_url=excluded.crest_remote_url,
                   crest_source_url=COALESCE(club_profiles.crest_source_url,excluded.crest_source_url)""",
                (row["id"], rel, logo_url, page_url),
            )
            ok += 1
        except requests.RequestException:
            skipped += 1
        time.sleep(max(0.0, delay))
    return ok, skipped
