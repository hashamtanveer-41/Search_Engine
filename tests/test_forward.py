"""Run:  python -m unittest discover tests"""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from engine.tokenizer import tokenize, tokenize_doc          # noqa: E402
from engine.lexicon import build_lexicon                     # noqa: E402
from engine.forward_index import ForwardIndexWriter, load_offsets, read_doc  # noqa: E402
from engine.metadata import MetadataWriter, read_metadata    # noqa: E402

DOCS = [
    {"id": "0001", "title": "Data Structures and Algorithms", "abstract": "We study data structures. Balázs wrote it."},
    {"id": "0002", "title": "Search engines", "abstract": "A state-of-the-art search engine uses an inverted index."},
    {"id": "0003", "title": "Index", "abstract": "index index index"},
]


class TestTokenizer(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(tokenize("Data structures and Algorithms"),
                         ["data", "structures", "and", "algorithms"])
        self.assertEqual(tokenize("state-of-the-art"), ["state", "of", "the", "art"])
        self.assertEqual(tokenize("Balázs"), ["balazs"])

    def test_title_len(self):
        tokens, title_len = tokenize_doc("Search engines", "uses an index")
        self.assertEqual(title_len, 2)
        self.assertEqual(tokens[:2], ["search", "engines"])


class TestForwardIndex(unittest.TestCase):
    def test_roundtrip(self):
        with tempfile.TemporaryDirectory() as d:
            tok = [tokenize_doc(r["title"], r["abstract"]) for r in DOCS]
            lex = build_lexicon(t for t, _ in tok)
            self.assertEqual(sorted(lex.values()), list(range(len(lex))))  # unique, contiguous IDs
            fwd = ForwardIndexWriter(os.path.join(d, "forward"))
            meta = MetadataWriter(os.path.join(d, ""))
            for i, (r, (tokens, tl)) in enumerate(zip(DOCS, tok)):
                fwd.add(i, [lex[t] for t in tokens], tl)
                meta.add(r)
            fwd.close(); meta.close()

            inv = {v: k for k, v in lex.items()}
            offs = load_offsets(os.path.join(d, "forward.offsets"))
            with open(os.path.join(d, "forward.bin"), "rb") as f:
                for i, (tokens, tl) in enumerate(tok):
                    doc = read_doc(f, offs, i)
                    self.assertEqual(doc["total_len"], len(tokens))
                    self.assertEqual(doc["title_len"], tl)
                    rebuilt = [None] * len(tokens)       # put every word back at its position
                    for wid, tf_t, tf_a, positions in doc["terms"]:
                        self.assertEqual(tf_t + tf_a, len(positions))
                        self.assertEqual(tf_t, sum(1 for p in positions if p < tl))
                        for p in positions:
                            rebuilt[p] = inv[wid]
                    self.assertEqual(rebuilt, tokens)
            with open(os.path.join(d, "metadata.jsonl"), "rb") as f:
                moffs = load_offsets(os.path.join(d, "metadata.offsets"))
                self.assertEqual(read_metadata(f, moffs, 1)["id"], "0002")
            with open(os.path.join(d, "docmap.json")) as f:
                self.assertEqual(json.load(f), ["0001", "0002", "0003"])


if __name__ == "__main__":
    unittest.main()
