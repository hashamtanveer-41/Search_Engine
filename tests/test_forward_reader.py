"""
Verification test for ForwardIndexReader against ForwardIndexWriter.
Create a temporary 3-document forward index, read it back, and verify every field.
"""

from pathlib import Path
import tempfile

from engine.forward_index import ForwardIndexWriter, load_offsets, read_doc
from engine.forward_reader import ForwardIndexReader


def run_tests() -> None:
    # TemporaryDirectory is used to create a throwaway folder and it is deleted automatically
    # when the 'with' block ends — this makes sure that we do not leave junk files in the repo.
    with tempfile.TemporaryDirectory() as tmp_dir:
        prefix = str(Path(tmp_dir) / "forward")

        # 1. Define 3 self made documents: (doc_id, list_of_word_ids_in_order, title_len)
        #    word_id 10 appears in both title (pos 0) and abstract (pos 3) of doc 0.
        sample_docs = [
            (0, [10, 20, 30, 10, 40], 2),   # title: [10, 20], abstract: [30, 10, 40]
            (1, [50, 10, 60], 1),           # title: [50], abstract: [10, 60]
            (2, [20, 20, 20, 70], 2),       # title: [20, 20], abstract: [20, 70]
        ]

        # 2. Write forward.bin and forward.offsets using the ForwardIndexWriter
        writer = ForwardIndexWriter(prefix)
        for doc_id, word_ids, title_len in sample_docs:
            writer.add(doc_id, word_ids, title_len)
        writer.close()

        # 3. Read them back using ForwardIndexReader
        with ForwardIndexReader(prefix) as reader:
            # Check total document count (we ignore the extra EOF sentinel offset)
            assert reader.num_docs == 3, f"Expected 3 docs, got {reader.num_docs}"

            # Test A: Random access with get_doc() in non-sequential order
            doc0 = reader.get_doc(0)
            assert doc0.doc_id == 0
            assert doc0.title_len == 2
            assert doc0.total_len == 5
            assert len(doc0.terms) == 4  # Unique words: 10, 20, 30, 40

            # Verify word_id 10 in doc 0: 1 time in title (pos 0), 1 time in abstract (pos 3)
            term10 = doc0.terms[0]
            assert term10.word_id == 10
            assert term10.title_freq == 1
            assert term10.abstract_freq == 1
            assert term10.positions == (0, 3)

            # Test B: Cross-check every doc against IndexWriter's read_doc() helper
            offsets = load_offsets(prefix + ".offsets")
            with open(prefix + ".bin", "rb") as bin_f:
                for doc_id in range(reader.num_docs):
                    mine = reader.get_doc(doc_id)
                    hashams = read_doc(bin_f, offsets, doc_id)

                    assert mine.doc_id == hashams["doc_id"]
                    assert mine.title_len == hashams["title_len"]
                    assert mine.total_len == hashams["total_len"]

                    mine_tuples = [
                        (t.word_id, t.title_freq, t.abstract_freq, list(t.positions))
                        for t in mine.terms
                    ]
                    assert mine_tuples == hashams["terms"], f"Mismatch on doc {doc_id}"

            # Test C: Sequential streaming with iter_docs()
            streamed_ids = [doc.doc_id for doc in reader.iter_docs()]
            assert streamed_ids == [0, 1, 2], f"Unexpected stream order: {streamed_ids}"

            # Test D: Out-of-range doc_id should raise IndexError
            try:
                reader.get_doc(99)
                raise AssertionError("Expected IndexError for doc_id=99")
            except IndexError:
                pass

    print("ALL TESTS PASSED: ForwardIndexReader matches ForwardIndexWriter byte-for-byte.")


if __name__ == "__main__":
    run_tests()