"""Forward index and inverted index must agree. Run: python -m unittest discover tests"""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from engine.tokenizer import tokenize_doc                       # noqa: E402
from engine.lexicon import build_lexicon, save_lexicon          # noqa: E402
from engine.forward_index import ForwardIndexWriter             # noqa: E402
from engine.metadata import MetadataWriter                      # noqa: E402
from engine.inverted_index import build_inverted_index          # noqa: E402
from engine.verify import check_index, PostingsReader           # noqa: E402

DOCS = [
    {"id": "1", "title": "Data Structures and Algorithms", "abstract": "We study data structures and sorting algorithms."},
    {"id": "2", "title": "Search engines", "abstract": "A search engine uses an inverted index and data structures."},
    {"id": "3", "title": "Index", "abstract": "index index index of data"},
    {"id": "4", "title": "Graph algorithms", "abstract": "Shortest path algorithms on a graph."},
    {"id": "5", "title": "Sorting", "abstract": "Sorting data with algorithms and structures"},
]


def build(d, chunk_size):
    tok = [tokenize_doc(r["title"], r["abstract"]) for r in DOCS]
    lex = build_lexicon(t for t, _ in tok)
    save_lexicon(lex, os.path.join(d, "lexicon.json"))
    fwd = ForwardIndexWriter(os.path.join(d, "forward"))
    meta = MetadataWriter(os.path.join(d, ""))
    for i, (r, (tokens, tl)) in enumerate(zip(DOCS, tok)):
        fwd.add(i, [lex[t] for t in tokens], tl)
        meta.add(r)
    fwd.close()
    meta.close()
    stats = build_inverted_index(os.path.join(d, "forward"), os.path.join(d, "inverted"),
                                 lexicon_path=os.path.join(d, "lexicon.json"), chunk_size=chunk_size)
    return lex, stats


class TestConsistency(unittest.TestCase):
    def test_indexes_agree_for_different_chunk_sizes(self):
        for chunk_size in (1, 3, 50_000):       # tiny chunks exercise the chunk boundaries
            with tempfile.TemporaryDirectory() as d:
                build(d, chunk_size)
                errors = check_index(d, n_docs=10, terms_per_doc=50, n_words=100, n_queries=40)
                self.assertEqual(errors, [], f"chunk_size={chunk_size}")

    def test_known_postings(self):
        with tempfile.TemporaryDirectory() as d:
            lex, stats = build(d, 50_000)
            self.assertEqual(stats.num_docs, len(DOCS))
            pr = PostingsReader(os.path.join(d, "inverted"))
            # "data" appears in docs 0, 1, 2, 4
            self.assertEqual([p[0] for p in pr.get(lex["data"])], [0, 1, 2, 4])
            # "index" appears 3 times in doc 2 (1 in title, 3 in abstract = 4)
            self.assertIn((2, 4, [0, 1, 2, 3]), pr.get(lex["index"]))
            pr.close()


if __name__ == "__main__":
    unittest.main()
