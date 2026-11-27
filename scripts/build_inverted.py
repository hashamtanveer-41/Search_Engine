"""Builds inverted.bin / inverted.offsets from an existing forward index.

Usage:  python scripts/build_inverted.py --index-dir index/full
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from engine.inverted_index import build_inverted_index   # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--index-dir", required=True, help="folder with forward.bin and lexicon.json")
    ap.add_argument("--chunk-size", type=int, default=50_000)
    args = ap.parse_args()
    d = args.index_dir
    stats = build_inverted_index(os.path.join(d, "forward"), os.path.join(d, "inverted"),
                                 lexicon_path=os.path.join(d, "lexicon.json"),
                                 chunk_size=args.chunk_size)
    print(f"inverted index: {stats.num_words:,} words, {stats.total_postings:,} postings, "
          f"{stats.num_docs:,} docs")
    print(f"  inverted.bin      {stats.bin_size_bytes / 1e6:8.2f} MB")
    print(f"  inverted.offsets  {stats.offsets_size_bytes / 1e6:8.2f} MB")
    print(f"  build time        {stats.elapsed_seconds:8.1f} s")


if __name__ == "__main__":
    main()
