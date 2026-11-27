"""Checks that the inverted index matches the forward index.

Usage:  python scripts/check_index.py --index-dir index/full
"""
import argparse
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from engine.verify import check_index   # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--index-dir", required=True)
    ap.add_argument("--seed", type=int, default=1)
    args = ap.parse_args()
    t0 = time.time()
    errors = check_index(args.index_dir, seed=args.seed)
    if errors:
        print(f"FAIL: {len(errors)} problems (first 10):")
        for e in errors[:10]:
            print("  -", e)
        sys.exit(1)
    print(f"PASS: forward and inverted index agree ({time.time() - t0:.1f}s)")


if __name__ == "__main__":
    main()
