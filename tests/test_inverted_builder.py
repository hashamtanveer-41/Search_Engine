"""
Unit tests for the Inverted Index Builder (engine/inverted_index.py).
Build a small forward index, invert it in both single-chunk and multi-chunk modes,
and verify every byte and posting entry.
"""

from pathlib import Path
import struct
import tempfile

from engine.forward_index import ForwardIndexWriter
from engine.inverted_index import (
    OFFSET_ENTRY,
    POSTING_HDR,
    WORD_HDR,
    build_inverted_index,
)


def _raw_read_word(bin_path: Path, offsets_path: Path, word_id: int):
    """ A low-level helper to manually unpack one word's postings using inverted.offsets."""
    with open(offsets_path, "rb") as off_f:
        off_f.seek(word_id * OFFSET_ENTRY.size)
        byte_offset, byte_length = OFFSET_ENTRY.unpack(off_f.read(OFFSET_ENTRY.size))

    with open(bin_path, "rb") as bin_f:
        bin_f.seek(byte_offset)
        raw = bin_f.read(byte_length)

    assert len(raw) == byte_length, f"Truncated read for word_id={word_id}"

    (n_docs,) = WORD_HDR.unpack_from(raw, 0)
    pos = WORD_HDR.size
    postings = []

    for _ in range(n_docs):
        doc_id, freq, n_pos = POSTING_HDR.unpack_from(raw, pos)
        pos += POSTING_HDR.size
        positions = struct.unpack_from(f"<{n_pos}H", raw, pos) if n_pos > 0 else ()
        pos += 2 * n_pos
        postings.append((doc_id, freq, positions))

    assert pos == byte_length, f"Leftover bytes for word_id={word_id}"
    return postings


def run_tests() -> None:
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp = Path(tmp_dir)
        fwd_prefix = tmp / "forward"
        inv_single = tmp / "inverted_single"
        inv_chunked = tmp / "inverted_chunked"

        # 1. Create a 3-doc forward index with the ForwardIndexWriter
        #    Word 10 appears in doc 0 (positions 0, 3) and doc 1 (position 1)
        #    Word 20 appears in doc 0 (position 1) and doc 2 (positions 0, 1, 2)
        #    Word 70 appears only in doc 2 (position 3)
        #    Words like 0, 5, 15 do not appear anywhere (which tests empty postings)
        sample_docs = [
            (0, [10, 20, 30, 10, 40], 2),
            (1, [50, 10, 60], 1),
            (2, [20, 20, 20, 70], 2),
        ]
        writer = ForwardIndexWriter(str(fwd_prefix))
        for doc_id, word_ids, title_len in sample_docs:
            writer.add(doc_id, word_ids, title_len)
        writer.close()

        # 2. Build the inverted index in 1 pass (chunk_size=1000)
        stats_single = build_inverted_index(fwd_prefix, inv_single, chunk_size=1000)

        # 3. Build the inverted index across multiple chunks (chunk_size=20 -> 4 passes for IDs 0..70)
        stats_chunked = build_inverted_index(fwd_prefix, inv_chunked, chunk_size=20)

        # Test A: Single-pass and multi-chunk outputs should be byte-for-byte identical
        assert Path(f"{inv_single}.bin").read_bytes() == Path(f"{inv_chunked}.bin").read_bytes()
        assert Path(f"{inv_single}.offsets").read_bytes() == Path(f"{inv_chunked}.offsets").read_bytes()
        assert stats_single.total_postings == stats_chunked.total_postings == 9
        assert stats_single.num_words == 71  # word IDs 0 .. 70

        bin_path = Path(f"{inv_chunked}.bin")
        offsets_path = Path(f"{inv_chunked}.offsets")

        # Test B: Verify exact postings for multi-doc words (sorted by doc_id)
        assert _raw_read_word(bin_path, offsets_path, 10) == [
            (0, 2, (0, 3)),
            (1, 1, (1,)),
        ]
        assert _raw_read_word(bin_path, offsets_path, 20) == [
            (0, 1, (1,)),
            (2, 3, (0, 1, 2)),
        ]

        # Test C: Verify single-doc words
        assert _raw_read_word(bin_path, offsets_path, 30) == [(0, 1, (2,))]
        assert _raw_read_word(bin_path, offsets_path, 70) == [(2, 1, (3,))]

        # Test D: Verify unused word ID returns empty posting list cleanly
        assert _raw_read_word(bin_path, offsets_path, 0) == []
        assert _raw_read_word(bin_path, offsets_path, 15) == []

        print(
            f"ALL TESTS PASSED: {stats_chunked.num_docs} docs, "
            f"{stats_chunked.num_words} word slots, "
            f"{stats_chunked.total_postings} postings "
            f"({stats_chunked.bin_size_bytes} B bin, {stats_chunked.offsets_size_bytes} B offsets)."
        )


if __name__ == "__main__":
    run_tests()