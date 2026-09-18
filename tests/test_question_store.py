from __future__ import annotations

import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from question_store import load_question_store, write_question_store  # noqa: E402


def _payload():
    return {
        "version": 7,
        "count": 7,
        "clubs": {"Clavia": {"crest": "x.png"}},
        "questions": [
            {"id": "a1", "season": "2022/23", "type": "match_score", "question": "A"},
            {"id": "a2", "season": "2022/23", "type": "match_score", "question": "B"},
            {"id": "a3", "season": "2022/23", "type": "player_match_club", "question": "C"},
            {"id": "b1", "season": "2025/26", "type": "match_score", "question": "D"},
            {"id": "b2", "season": "2025/26", "type": "match_winner", "question": "E"},
            {"id": "c1", "season": None, "type": "social_mvp", "question": "F"},
            {"id": "c2", "type": "social_assist", "question": "G"},
        ],
    }


def test_question_store_round_trip_and_chunking(tmp_path):
    payload = _payload()
    index = write_question_store(payload, tmp_path / "questions", chunk_size=2)
    loaded = load_question_store(index)

    assert loaded["version"] == payload["version"]
    assert loaded["count"] == payload["count"]
    assert loaded["clubs"] == payload["clubs"]
    assert {q["id"] for q in loaded["questions"]} == {q["id"] for q in payload["questions"]}

    meta = json.loads(index.read_text(encoding="utf-8"))
    assert meta["count"] == 7
    assert meta["seasons"] == ["2022/23", "2025/26"]
    assert meta["season_counts"] == {"2022/23": 3, "2025/26": 2}
    assert len(meta["files"]) == 4
    assert all(entry["count"] <= 2 for entry in meta["files"])


def test_load_question_store_supports_legacy_monolith(tmp_path):
    payload = _payload()
    path = tmp_path / "questions.json"
    path.write_text(json.dumps(payload), encoding="utf-8")

    assert load_question_store(path) == payload
