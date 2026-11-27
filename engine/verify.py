"""Checks that the inverted index agrees with the forward index.

Used by tests/test_consistency.py (tiny corpus) and scripts/check_index.py (full index).
It reads inverted.bin itself (independent of the builder), so it also verifies the file format.
"""
import json
import os
import random
import struct

from engine.forward_index import load_offsets, read_doc
from engine.tokenizer import tokenize_doc

POSTING_HDR = struct.Struct("<IHH")   # doc_id u32, freq u16, n_pos u16
OFFSET_ENTRY = struct.Struct("<QI")   # byte_offset u64, byte_length u32


class PostingsReader:
    """Minimal reader for inverted.bin / inverted.offsets."""

    def __init__(self, prefix):
        with open(prefix + ".offsets", "rb") as f:
            self.offsets = f.read()
        self.num_words = len(self.offsets) // OFFSET_ENTRY.size
        self.f = open(prefix + ".bin", "rb")

    def close(self):
        self.f.close()

    def _entry(self, word_id):
        return OFFSET_ENTRY.unpack_from(self.offsets, word_id * OFFSET_ENTRY.size)

    def n_docs(self, word_id):
        off, _ = self._entry(word_id)
        self.f.seek(off)
        return struct.unpack("<I", self.f.read(4))[0]

    def get(self, word_id):
        """Returns [(doc_id, freq, [positions])] sorted by doc_id."""
        off, length = self._entry(word_id)
        self.f.seek(off)
        buf = self.f.read(length)
        n_docs = struct.unpack_from("<I", buf, 0)[0]
        pos = 4
        out = []
        for _ in range(n_docs):
            doc_id, freq, n_pos = POSTING_HDR.unpack_from(buf, pos)
            pos += POSTING_HDR.size
            positions = list(struct.unpack_from(f"<{n_pos}H", buf, pos))
            pos += 2 * n_pos
            out.append((doc_id, freq, positions))
        if pos != len(buf):
            raise ValueError(f"word {word_id}: entry length does not match its content")
        return out


def check_index(index_dir, seed=1, n_docs=50, terms_per_doc=8, n_words=200, n_queries=30):
    """Returns a list of error strings (empty list = everything is consistent)."""
    errors = []
    rnd = random.Random(seed)
    with open(os.path.join(index_dir, "lexicon.json"), encoding="utf-8") as f:
        lexicon = json.load(f)
    inv_lex = {v: k for k, v in lexicon.items()}
    f_offsets = load_offsets(os.path.join(index_dir, "forward.offsets"))
    f_bin = open(os.path.join(index_dir, "forward.bin"), "rb")
    num_docs = len(f_offsets) - 1
    pr = PostingsReader(os.path.join(index_dir, "inverted"))

    if pr.num_words < len(lexicon):
        errors.append(f"inverted index has {pr.num_words} words but lexicon has {len(lexicon)}")
        f_bin.close()
        pr.close()
        return errors

    # 1. total number of postings must equal total number of (doc, word) pairs
    total_fwd = sum(read_doc(f_bin, f_offsets, d)["terms"].__len__() for d in range(num_docs))
    total_inv = sum(pr.n_docs(w) for w in range(pr.num_words))
    if total_fwd != total_inv:
        errors.append(f"posting count mismatch: forward has {total_fwd}, inverted has {total_inv}")

    # 2. forward -> inverted: words of random documents are found in their postings
    for d in rnd.sample(range(num_docs), min(n_docs, num_docs)):
        doc = read_doc(f_bin, f_offsets, d)
        for wid, tf_t, tf_a, positions in rnd.sample(doc["terms"], min(terms_per_doc, len(doc["terms"]))):
            hit = [p for p in pr.get(wid) if p[0] == d]
            if len(hit) != 1:
                errors.append(f"doc {d} word {inv_lex.get(wid)!r}: found {len(hit)} postings, expected 1")
            elif hit[0][1] != tf_t + tf_a or hit[0][2] != positions:
                errors.append(f"doc {d} word {inv_lex.get(wid)!r}: freq/positions differ")

    # 3. inverted -> forward: postings of random words are real, sorted, and match the forward index
    for wid in rnd.sample(range(pr.num_words), min(n_words, pr.num_words)):
        postings = pr.get(wid)
        ids = [p[0] for p in postings]
        if ids != sorted(set(ids)):
            errors.append(f"word {inv_lex.get(wid)!r}: doc IDs not strictly increasing")
        for doc_id, freq, positions in postings[:20]:
            if freq != len(positions):
                errors.append(f"word {inv_lex.get(wid)!r} doc {doc_id}: freq != number of positions")
            terms = {t[0]: t for t in read_doc(f_bin, f_offsets, doc_id)["terms"]}
            t = terms.get(wid)
            if t is None or t[3] != positions:
                errors.append(f"word {inv_lex.get(wid)!r} doc {doc_id}: not in forward index or positions differ")

    # 4. multi-word AND search against a brute-force scan of the raw text
    doc_sets = []
    with open(os.path.join(index_dir, "metadata.jsonl"), encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            tokens, _ = tokenize_doc(r["title"], r["abstract"])
            doc_sets.append({lexicon[t] for t in tokens})
    for _ in range(n_queries):
        base = list(doc_sets[rnd.randrange(len(doc_sets))])
        q = rnd.sample(base, min(rnd.randint(2, 4), len(base)))
        expected = {i for i, s in enumerate(doc_sets) if all(w in s for w in q)}
        got = None
        for w in sorted(q, key=pr.n_docs):            # rarest word first
            ids = {p[0] for p in pr.get(w)}
            got = ids if got is None else got & ids
        if got != expected:
            errors.append(f"AND query {[inv_lex[w] for w in q]}: index gave {len(got)} docs, scan gave {len(expected)}")

    f_bin.close()
    pr.close()
    return errors
