from __future__ import annotations

import argparse
from pathlib import Path

from question_store import load_question_store, write_question_store


def main() -> None:
    parser = argparse.ArgumentParser(description="Split a quiz question database into bounded shards.")
    parser.add_argument("--input", required=True, help="Legacy questions.json or an existing question-store index")
    parser.add_argument("--output", required=True, help="Output directory or index.json path")
    parser.add_argument("--chunk-size", type=int, default=12000)
    args = parser.parse_args()

    source = Path(args.input)
    payload = load_question_store(source)
    index_path = write_question_store(payload, args.output, chunk_size=args.chunk_size)
    roundtrip = load_question_store(index_path)

    assert roundtrip["count"] == payload["count"]
    assert roundtrip["questions"] == payload["questions"]
    assert roundtrip.get("clubs", {}) == payload.get("clubs", {})

    print("QUESTION_STORE_INDEX", index_path)
    print("QUESTION_STORE_COUNT", roundtrip["count"])
    print("QUESTION_STORE_SHARDS", len(list(index_path.parent.glob("*.json"))) - 1)


if __name__ == "__main__":
    main()
