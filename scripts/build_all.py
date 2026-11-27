"""One command that builds everything: lexicon, forward index, metadata, inverted index.

Usage:  python scripts/build_all.py --input data/sample/arxiv_sample_1k.jsonl --out index/sample
        python scripts/build_all.py --input data/subset/arxiv_60k.jsonl --out index/full
"""
import argparse
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def run(*cmd):
    print("\n$", " ".join(cmd))
    subprocess.run([sys.executable, *cmd], check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()
    fwd = [os.path.join(HERE, "build_forward.py"), "--input", args.input, "--out", args.out]
    if args.limit:
        fwd += ["--limit", str(args.limit)]
    run(*fwd)
    run(os.path.join(HERE, "build_inverted.py"), "--index-dir", args.out)
    run(os.path.join(HERE, "check_index.py"), "--index-dir", args.out)


if __name__ == "__main__":
    main()
