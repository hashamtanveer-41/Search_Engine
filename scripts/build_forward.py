"""Builds lexicon + forward index + metadata from a subset file.

Usage:
    python scripts/build_forward.py --input data/sample/arxiv_sample_1k.jsonl --out index/sample
    python scripts/build_forward.py --input data/subset/arxiv_60k.jsonl --out index/full
    python scripts/build_forward.py --input data/subset/arxiv_60k.jsonl --out index/mini --limit 100
"""
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from engine.tokenizer import tokenize_doc          # noqa: E402
from engine.lexicon import build_lexicon, save_lexicon   # noqa: E402
from engine.forward_index import ForwardIndexWriter      # noqa: E402
from engine.metadata import MetadataWriter               # noqa: E402


def read_records(path, limit=None):
    with open(path, "r", encoding="utf-8") as f:
        for i, line in enumerate(f):
            if limit is not None and i >= limit:
                return
            if line.strip():
                yield json.loads(line)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--out", required=True, help="output folder")
    ap.add_argument("--limit", type=int, default=None, help="only the first N docs")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    t0 = time.time()

    # Pass 1: lexicon (tokenize everything, count words)
    lexicon = build_lexicon(tokenize_doc(r["title"], r["abstract"])[0]
                            for r in read_records(args.input, args.limit))
    save_lexicon(lexicon, os.path.join(args.out, "lexicon.json"))
    print(f"lexicon: {len(lexicon):,} unique words  ({time.time() - t0:.1f}s)")

    # Pass 2: forward index + metadata
    fwd = ForwardIndexWriter(os.path.join(args.out, "forward"))
    meta = MetadataWriter(os.path.join(args.out, ""))
    n = 0
    for doc_id, r in enumerate(read_records(args.input, args.limit)):
        tokens, title_len = tokenize_doc(r["title"], r["abstract"])
        fwd.add(doc_id, [lexicon[t] for t in tokens], title_len)
        meta.add(r)
        n += 1
    fwd.close()
    meta.close()

    print(f"forward index + metadata: {n:,} docs  ({time.time() - t0:.1f}s total)")
    for name in ["lexicon.json", "forward.bin", "forward.offsets",
                 "metadata.jsonl", "metadata.offsets", "docmap.json"]:
        size = os.path.getsize(os.path.join(args.out, name))
        print(f"  {name:18s} {size / 1e6:8.2f} MB")


if __name__ == "__main__":
    main()
