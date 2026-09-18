from __future__ import annotations

import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from build_lnp_questions import merge_exports  # noqa: E402
from question_store import load_question_store, write_question_store  # noqa: E402


def test_merge_exports_reads_and_writes_sharded_store(tmp_path):
    store = tmp_path / "questions"
    existing = {
        "version": 2,
        "count": 2,
        "clubs": {"Clavia": {"crest": "clavia.png"}},
        "questions": [
            {
                "id": "old-1",
                "type": "match_score",
                "season": "2022/23",
                "question": "Jaki wynik?",
                "answer": "1:0",
                "options": ["1:0", "0:0"],
                "confidence": 0.9,
                "clubs": ["Clavia"],
                "sources": ["old"],
            },
            {
                "id": "old-2",
                "type": "social_mvp",
                "season": None,
                "question": "MVP?",
                "answer": "A",
                "options": ["A", "B"],
                "confidence": 0.8,
                "clubs": [],
                "sources": ["social"],
            },
        ],
    }
    write_question_store(existing, store, chunk_size=1)

    incoming_path = tmp_path / "incoming.json"
    incoming_path.write_text(
        json.dumps(
            {
                "version": 3,
                "count": 2,
                "clubs": {"Clavia": {"crest_remote_url": "remote.png"}},
                "questions": [
                    {
                        "id": "new-version",
                        "type": "match_score",
                        "season": "2022/23",
                        "question": "Jaki wynik?",
                        "answer": "2:0",
                        "options": ["2:0", "1:0"],
                        "confidence": 1.0,
                        "clubs": ["Clavia"],
                        "sources": ["official"],
                    },
                    {
                        "id": "new-2",
                        "type": "match_winner",
                        "season": "2025/26",
                        "question": "Kto wygrał?",
                        "answer": "Clavia",
                        "options": ["Clavia", "Rywal"],
                        "confidence": 1.0,
                        "clubs": ["Clavia"],
                        "sources": ["official"],
                    },
                ],
            }
        ),
        encoding="utf-8",
    )

    total, added, upgraded = merge_exports(store, incoming_path, store)
    merged = load_question_store(store)

    assert (total, added, upgraded) == (3, 1, 1)
    assert merged["version"] == 3
    assert merged["count"] == 3
    updated = next(q for q in merged["questions"] if q["question"] == "Jaki wynik?")
    assert updated["answer"] == "2:0"
    assert updated["confidence"] == 1.0
    assert updated["sources"] == ["old", "official"]
    assert merged["clubs"]["Clavia"]["crest"] == "clavia.png"
    assert merged["clubs"]["Clavia"]["crest_remote_url"] == "remote.png"
