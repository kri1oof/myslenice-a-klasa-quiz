from __future__ import annotations

from collections import defaultdict
import json
from pathlib import Path
import re
import shutil
from typing import Any

INDEX_NAME = "index.json"
DEFAULT_CHUNK_SIZE = 12000


def _valid_club_name(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip()) and any(ch.isalpha() for ch in value)


def _season_sort_key(label: str | None) -> tuple[int, str]:
    if not label:
        return (999999, "")
    match = re.match(r"^(\d{4})/", str(label))
    return (int(match.group(1)) if match else 999998, str(label))


def _season_slug(label: str | None) -> str:
    if not label:
        return "general"
    text = str(label).strip().replace("/", "-")
    text = re.sub(r"[^0-9A-Za-z._-]+", "-", text).strip("-")
    return text or "general"


def _resolve_index(path: str | Path) -> Path:
    p = Path(path)
    if p.is_dir() or p.suffix.lower() != ".json":
        return p / INDEX_NAME
    return p


def load_question_store(path: str | Path) -> dict[str, Any]:
    """Load either the legacy monolithic JSON or the sharded question store."""
    p = Path(path)
    if p.is_dir():
        p = p / INDEX_NAME

    payload = json.loads(p.read_text(encoding="utf-8"))
    files = payload.get("files")
    if not isinstance(files, list):
        return payload

    questions: list[dict[str, Any]] = []
    for entry in files:
        rel = entry.get("path")
        if not rel:
            raise ValueError(f"Question index entry without path: {entry!r}")
        shard_path = p.parent / rel
        shard = json.loads(shard_path.read_text(encoding="utf-8"))
        shard_questions = list(shard.get("questions") or [])
        expected = int(entry.get("count") or 0)
        if expected and expected != len(shard_questions):
            raise ValueError(
                f"Question shard count mismatch for {shard_path}: "
                f"index={expected}, actual={len(shard_questions)}"
            )
        questions.extend(shard_questions)

    expected_total = int(payload.get("count") or 0)
    if expected_total != len(questions):
        raise ValueError(
            f"Question store count mismatch: index={expected_total}, actual={len(questions)}"
        )

    return {
        "version": int(payload.get("version") or 1),
        "count": len(questions),
        "clubs": dict(payload.get("clubs") or {}),
        "questions": questions,
    }


def write_question_store(
    payload: dict[str, Any],
    output: str | Path,
    *,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
) -> Path:
    """Write a scalable question store with an index and bounded-size shards."""
    if chunk_size <= 0:
        raise ValueError("chunk_size must be positive")

    index_path = _resolve_index(output)
    out_dir = index_path.parent
    out_dir.mkdir(parents=True, exist_ok=True)

    for stale in out_dir.glob("*.json"):
        stale.unlink()

    questions: list[dict[str, Any]] = []
    for raw_question in payload.get("questions") or []:
        question = dict(raw_question)
        if isinstance(question.get("clubs"), list):
            question["clubs"] = [
                name for name in question["clubs"]
                if _valid_club_name(name)
            ]
        questions.append(question)

    clean_clubs = {
        name: meta
        for name, meta in dict(payload.get("clubs") or {}).items()
        if _valid_club_name(name)
    }

    groups: dict[str | None, list[dict[str, Any]]] = defaultdict(list)
    for question in questions:
        groups[question.get("season")].append(question)

    entries: list[dict[str, Any]] = []
    seasons: list[str] = []
    season_counts: dict[str, int] = {}

    for season in sorted(groups, key=_season_sort_key):
        values = groups[season]
        if season:
            seasons.append(str(season))
            season_counts[str(season)] = len(values)
        slug = _season_slug(season)
        parts = (len(values) + chunk_size - 1) // chunk_size or 1
        for part_idx, start in enumerate(range(0, len(values), chunk_size), start=1):
            chunk = values[start : start + chunk_size]
            name = f"{slug}.json" if parts == 1 else f"{slug}-{part_idx:02d}.json"
            shard_payload = {
                "version": int(payload.get("version") or 1),
                "season": season,
                "part": part_idx,
                "parts": parts,
                "count": len(chunk),
                "questions": chunk,
            }
            (out_dir / name).write_text(
                json.dumps(shard_payload, ensure_ascii=False, separators=(",", ":")),
                encoding="utf-8",
            )
            entries.append(
                {
                    "path": name,
                    "season": season,
                    "part": part_idx,
                    "parts": parts,
                    "count": len(chunk),
                }
            )

    types = sorted({str(q.get("type")) for q in questions if q.get("type")})
    index = {
        "schema_version": 1,
        "version": int(payload.get("version") or 1),
        "count": len(questions),
        "clubs": clean_clubs,
        "seasons": seasons,
        "season_counts": season_counts,
        "types": types,
        "files": entries,
    }
    index_path.write_text(
        json.dumps(index, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return index_path


def copy_question_store(source: str | Path, destination: str | Path) -> Path:
    src_index = _resolve_index(source)
    dst_index = _resolve_index(destination)
    if dst_index.parent.exists():
        shutil.rmtree(dst_index.parent)
    shutil.copytree(src_index.parent, dst_index.parent)
    return dst_index
