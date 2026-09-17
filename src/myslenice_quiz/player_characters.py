from __future__ import annotations

from collections import defaultdict
import json
from pathlib import Path
import sqlite3
from typing import Any


def _clamp(value: float, low: int = 35, high: int = 95) -> int:
    return max(low, min(high, int(round(value))))


def played_minutes(
    *,
    starter: bool,
    entered_minute: int | None,
    left_minute: int | None,
    red_minute: int | None,
) -> int:
    """Estimate regulation-time minutes from official ŁNP event minutes.

    Added-time length is not reliably available, so the same 90-minute cap used by
    the quiz minute questions is applied here as well.
    """
    if not starter and entered_minute is None:
        return 0
    start = 0 if starter else max(0, min(90, int(entered_minute or 0)))
    endings = [90]
    if left_minute is not None:
        endings.append(max(0, min(90, int(left_minute))))
    if red_minute is not None:
        endings.append(max(0, min(90, int(red_minute))))
    return max(0, min(endings) - start)


def derive_ratings(stats: dict[str, Any], season_max_minutes: int) -> dict[str, int]:
    appearances = max(1, int(stats.get("appearances") or 0))
    starts = max(0, int(stats.get("starts") or 0))
    minutes = max(0, int(stats.get("minutes") or 0))
    goals = max(0, int(stats.get("goals") or 0))
    yellows = max(0, int(stats.get("yellow_cards") or 0))
    reds = max(0, int(stats.get("red_cards") or 0))

    relative_minutes = min(1.0, minutes / max(1, season_max_minutes))
    start_share = min(1.0, starts / appearances)
    average_minutes = min(90.0, minutes / appearances)
    # The 360-minute denominator shrinks tiny samples so one short cameo goal does
    # not create an unrealistic finishing rating.
    goals_per_90_shrunk = goals * 90 / max(360, minutes)
    cards_per_app = (yellows + 2 * reds) / appearances

    experience = _clamp(42 + 53 * (relative_minutes ** 0.70))
    rhythm = _clamp(40 + 30 * start_share + 25 * min(1.0, average_minutes / 80))
    finishing = _clamp(38 + min(32, goals * 4.5) + min(25, goals_per_90_shrunk * 30))
    discipline = _clamp(94 - min(45, yellows * 2.7 + reds * 14 + cards_per_app * 5))
    game_rating = _clamp(
        0.28 * experience + 0.28 * rhythm + 0.25 * finishing + 0.19 * discipline
    )
    return {
        "experience": experience,
        "rhythm": rhythm,
        "finishing": finishing,
        "discipline": discipline,
        "game_rating": game_rating,
    }


def archetype_for(stats: dict[str, Any], ratings: dict[str, int]) -> str:
    appearances = max(1, int(stats.get("appearances") or 0))
    starts = int(stats.get("starts") or 0)
    minutes = int(stats.get("minutes") or 0)
    goals = int(stats.get("goals") or 0)
    captaincies = int(stats.get("captaincies") or 0)
    average_minutes = minutes / appearances

    if captaincies >= 2 and captaincies / appearances >= 0.20:
        return "Lider"
    if goals >= 4 and ratings["finishing"] >= 72:
        return "Snajper"
    if starts / appearances >= 0.80 and average_minutes >= 70:
        return "Żelazny skład"
    if starts / appearances < 0.50 and goals >= 2:
        return "Joker"
    if ratings["discipline"] < 60:
        return "Na granicy ryzyka"
    if ratings["experience"] >= 80:
        return "Ograny"
    return "Regularny"


def build_player_characters(
    conn: sqlite3.Connection,
    min_confidence: float = 0.80,
) -> list[dict[str, Any]]:
    rows = conn.execute(
        """SELECT ap.id,ap.club_id,ap.player_id,ap.starter,ap.entered_minute,
                  ap.left_minute,ap.confidence,m.season_id,s.label season,
                  c.name club,p.display_name player,p.normalized_name,p.external_key,
                  p.birth_date,COALESCE(ad.is_captain,0) is_captain,
                  MIN(CASE WHEN ca.card_type IN ('red','second_yellow_red') THEN ca.minute END) red_minute
             FROM appearances ap
             JOIN matches m ON m.id=ap.match_id AND m.status='played'
             JOIN seasons s ON s.id=m.season_id
             JOIN clubs c ON c.id=ap.club_id
             JOIN players p ON p.id=ap.player_id
             JOIN match_coverage mc ON mc.match_id=m.id
                AND mc.dataset='lineups' AND mc.is_complete=1
             LEFT JOIN appearance_details ad ON ad.appearance_id=ap.id
             LEFT JOIN cards ca ON ca.match_id=ap.match_id AND ca.player_id=ap.player_id
             WHERE ap.confidence>=?
             GROUP BY ap.id
             ORDER BY m.season_id,ap.club_id,ap.player_id,ap.match_id""",
        (min_confidence,),
    ).fetchall()

    aggregates: dict[tuple[int, int, int], dict[str, Any]] = {}
    for row in rows:
        starter = row["starter"] == 1
        entered = row["entered_minute"]
        if not starter and entered is None:
            continue
        key = (int(row["season_id"]), int(row["club_id"]), int(row["player_id"]))
        item = aggregates.setdefault(
            key,
            {
                "season_id": int(row["season_id"]),
                "season": row["season"],
                "club_id": int(row["club_id"]),
                "club": row["club"],
                "player_id": int(row["player_id"]),
                "player": row["player"],
                "normalized_name": row["normalized_name"],
                "external_key": row["external_key"],
                "birth_date": row["birth_date"],
                "appearances": 0,
                "starts": 0,
                "sub_entries": 0,
                "minutes": 0,
                "captaincies": 0,
                "goals": 0,
                "yellow_cards": 0,
                "red_cards": 0,
                "confidence": 1.0,
            },
        )
        item["appearances"] += 1
        item["starts"] += int(starter)
        item["sub_entries"] += int(not starter)
        item["captaincies"] += int(row["is_captain"] == 1)
        item["minutes"] += played_minutes(
            starter=starter,
            entered_minute=entered,
            left_minute=row["left_minute"],
            red_minute=row["red_minute"],
        )
        item["confidence"] = min(item["confidence"], float(row["confidence"]))

    goals = conn.execute(
        """SELECT m.season_id,g.club_id,g.player_id,COUNT(*) goal_count
             FROM goals g
             JOIN matches m ON m.id=g.match_id AND m.status='played'
             JOIN match_coverage mc ON mc.match_id=m.id
                AND mc.dataset='lineups' AND mc.is_complete=1
             WHERE g.player_id IS NOT NULL AND g.is_own_goal=0 AND g.confidence>=?
             GROUP BY m.season_id,g.club_id,g.player_id""",
        (min_confidence,),
    ).fetchall()
    for row in goals:
        key = (int(row["season_id"]), int(row["club_id"]), int(row["player_id"]))
        if key in aggregates:
            aggregates[key]["goals"] = int(row["goal_count"])

    cards = conn.execute(
        """SELECT m.season_id,ca.club_id,ca.player_id,
                  SUM(CASE WHEN ca.card_type='yellow' THEN 1 ELSE 0 END) yellow_cards,
                  SUM(CASE WHEN ca.card_type IN ('red','second_yellow_red') THEN 1 ELSE 0 END) red_cards
             FROM cards ca
             JOIN matches m ON m.id=ca.match_id AND m.status='played'
             JOIN match_coverage mc ON mc.match_id=m.id
                AND mc.dataset='lineups' AND mc.is_complete=1
             WHERE ca.player_id IS NOT NULL AND ca.confidence>=?
             GROUP BY m.season_id,ca.club_id,ca.player_id""",
        (min_confidence,),
    ).fetchall()
    for row in cards:
        key = (int(row["season_id"]), int(row["club_id"]), int(row["player_id"]))
        if key in aggregates:
            aggregates[key]["yellow_cards"] = int(row["yellow_cards"] or 0)
            aggregates[key]["red_cards"] = int(row["red_cards"] or 0)

    source_rows = conn.execute(
        """SELECT DISTINCT m.season_id,ap.club_id,ap.player_id,s.url,s.authority
             FROM appearances ap
             JOIN matches m ON m.id=ap.match_id
             JOIN appearance_evidence ae ON ae.appearance_id=ap.id
             JOIN sources s ON s.id=ae.source_id
             WHERE ap.confidence>=?
             ORDER BY s.authority DESC""",
        (min_confidence,),
    ).fetchall()
    sources: dict[tuple[int, int, int], list[str]] = defaultdict(list)
    for row in source_rows:
        key = (int(row["season_id"]), int(row["club_id"]), int(row["player_id"]))
        url = str(row["url"])
        if url not in sources[key] and len(sources[key]) < 3:
            sources[key].append(url)

    season_max_minutes: dict[int, int] = defaultdict(int)
    for item in aggregates.values():
        season_max_minutes[item["season_id"]] = max(
            season_max_minutes[item["season_id"]], int(item["minutes"])
        )

    output: list[dict[str, Any]] = []
    for key, item in aggregates.items():
        ratings = derive_ratings(item, season_max_minutes[item["season_id"]])
        external = item["external_key"] or item["normalized_name"] or str(item["player_id"])
        output.append(
            {
                "id": f'{item["season"]}|{item["club"]}|{external}',
                "player": item["player"],
                "club": item["club"],
                "season": item["season"],
                "birth_date": item["birth_date"],
                "archetype": archetype_for(item, ratings),
                "sample_reliable": item["appearances"] >= 3 and item["minutes"] >= 180,
                "stats": {
                    "appearances": item["appearances"],
                    "starts": item["starts"],
                    "sub_entries": item["sub_entries"],
                    "minutes": item["minutes"],
                    "goals": item["goals"],
                    "yellow_cards": item["yellow_cards"],
                    "red_cards": item["red_cards"],
                    "captaincies": item["captaincies"],
                },
                "ratings": ratings,
                "confidence": round(float(item["confidence"]), 3),
                "sources": sources.get(key, []),
            }
        )

    return sorted(
        output,
        key=lambda x: (
            x["season"],
            x["club"],
            -int(x["ratings"]["game_rating"]),
            x["player"],
        ),
    )


def export_player_characters(
    conn: sqlite3.Connection,
    path: str | Path,
    min_confidence: float = 0.80,
) -> int:
    profiles = build_player_characters(conn, min_confidence)
    payload = {
        "version": 1,
        "count": len(profiles),
        "rating_note": (
            "Oceny RPG są wskaźnikami do mechaniki gry wyliczonymi z oficjalnych "
            "protokołów ŁNP/PZPN; nie są oficjalnymi ocenami umiejętności zawodników."
        ),
        "players": profiles,
    }
    output = Path(path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return len(profiles)
