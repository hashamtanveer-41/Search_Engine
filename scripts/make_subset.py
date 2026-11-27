"""Step 1: make the 60k subset and the 1k sample from the arXiv Kaggle file.

Usage:
    python scripts/make_subset.py --input arxiv-metadata-oai-snapshot.json

Streams the big file line by line, so it uses very little RAM.
Picks records uniformly at random (reservoir sampling) with a fixed seed,
so everyone in the team can reproduce the same subset.
"""
import argparse
import json
import random
import re
import statistics
from collections import Counter
from pathlib import Path


def clean(text):
    """Collapse all whitespace/newlines into single spaces."""
    return re.sub(r"\s+", " ", text or "").strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="arxiv-metadata-oai-snapshot.json")
    ap.add_argument("--out-dir", default="data")
    ap.add_argument("--n", type=int, default=60000, help="subset size")
    ap.add_argument("--sample-n", type=int, default=1000, help="sample size")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--min-words", type=int, default=60,
                    help="skip records whose title+abstract is shorter than this")
    args = ap.parse_args()

    rng = random.Random(args.seed)
    reservoir = []
    seen = 0
    with open(args.input, "r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                continue
            title = clean(r.get("title"))
            abstract = clean(r.get("abstract"))
            if not title or not abstract:
                continue
            if len((title + " " + abstract).split()) < args.min_words:
                continue
            rec = {
                "id": r.get("id", ""),
                "title": title,
                "authors": clean(r.get("authors")),
                "categories": clean(r.get("categories")),
                "journal_ref": clean(r.get("journal-ref")),
                "update_date": r.get("update_date", ""),
                "versions": len(r.get("versions") or []),
                "abstract": abstract,
            }
            seen += 1
            if len(reservoir) < args.n:
                reservoir.append(rec)
            else:
                j = rng.randrange(seen)   # reservoir sampling
                if j < args.n:
                    reservoir[j] = rec
            if line_no % 500000 == 0:
                print(f"  read {line_no:,} lines...")

    out = Path(args.out_dir)
    (out / "subset").mkdir(parents=True, exist_ok=True)
    (out / "sample").mkdir(parents=True, exist_ok=True)
    sample = rng.sample(reservoir, min(args.sample_n, len(reservoir)))
    for path, recs in [(out / "subset" / "arxiv_60k.jsonl", reservoir),
                       (out / "sample" / "arxiv_sample_1k.jsonl", sample)]:
        with open(path, "w", encoding="utf-8") as f:
            for rec in recs:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        print("wrote", path, len(recs), "records")

    words = [len((r["title"] + " " + r["abstract"]).split()) for r in reservoir]
    print(f"\nEligible records in file: {seen:,}")
    print(f"Subset size: {len(reservoir):,}  (need >= 45,000)")
    print(f"Median words (title+abstract): {statistics.median(words)}  (need >= 100)")
    print("Top categories:", Counter(r["categories"].split()[0] for r in reservoir).most_common(8))
    print("Papers per year:", sorted(Counter(r["update_date"][:4] for r in reservoir).items()))
    print("With journal_ref:", sum(1 for r in reservoir if r["journal_ref"]))


if __name__ == "__main__":
    main()
