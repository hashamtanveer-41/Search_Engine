"""Lexicon: every unique word -> a distinct integer word ID."""
import json
from collections import Counter


def build_lexicon(token_lists):
    """token_lists: iterable of token lists (one per document).

    IDs are given by overall frequency (most common word = 0). Common words get
    small IDs, which helps when the inverted index is split into barrels later.
    """
    counts = Counter()
    for tokens in token_lists:
        counts.update(tokens)
    ordered = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    return {word: wid for wid, (word, _) in enumerate(ordered)}


def save_lexicon(lexicon, path):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(lexicon, f, ensure_ascii=False)


def load_lexicon(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)
