"""
Forward Index Reader (Salman - Phase 2)
Read the two binary files created by the ForwardIndexWriter:
  1. <prefix>.bin     -> raw binary data for all documents packed back-to-back
  2. <prefix>.offsets -> a lookup table of byte positions (8 bytes per entry)
"""

from dataclasses import dataclass
from pathlib import Path
import struct
from typing import Iterator, Tuple

# Using the same bianry format for the writer and the reader.
#   DOC_HDR  = struct.Struct("<IHHI")  -> 12 bytes: doc_id, title_len, total_len, n_terms
#   TERM_HDR = struct.Struct("<IHHH")  -> 10 bytes: word_id, title_freq, abstract_freq, n_pos
# "<" is used to denote little endian
# "I" = unsigned 4-byte int (u32), "H" = unsigned 2-byte int (u16).
from engine.forward_index import DOC_HDR, TERM_HDR

# Each entry in forward.offsets is an 8-byte unsigned integer.
OFFSET_STRUCT = struct.Struct("<Q")        # Reads 1 offset  (8 bytes)
OFFSET_PAIR_STRUCT = struct.Struct("<QQ")  # Reads 2 offsets (16 bytes)


# @dataclass will automatically create __init__ and __repr__ 
# slots=True tells Python not to create a hidden dict per object whic will save RAM.
@dataclass(slots=True)
class TermEntry:
    """One unique word inside a document, plus where it appears."""
    word_id: int
    title_freq: int          # How many times this word appeared in the title
    abstract_freq: int       # How many times this word appeared in the abstract
    positions: Tuple[int, ...]  # Token indices


@dataclass(slots=True)
class ForwardDocument:
    """All decoded data for a single document from forward.bin."""
    doc_id: int
    title_len: int           # Number of tokens in the title
    total_len: int           # Total tokens in title + abstract
    terms: Tuple[TermEntry, ...]  # All unique words in this doc (sorted by word_id)


class ForwardIndexReader:
    def __init__(self, prefix: str | Path) -> None:
        """
        Open forward.bin and forward.offsets for reading.
        prefix: path without extension, e.g. 'index/full/forward'
        """
        prefix_str = str(prefix)
        self.bin_path = Path(prefix_str + ".bin")
        self.offsets_path = Path(prefix_str + ".offsets")

        if not self.bin_path.exists():
            raise FileNotFoundError(f"Missing {self.bin_path}")
        if not self.offsets_path.exists():
            raise FileNotFoundError(f"Missing {self.offsets_path}")

        # Open in read binary mode so Python reads raw bytes.
        self._bin_file = open(self.bin_path, "rb")
        self._offsets_file = open(self.offsets_path, "rb")

        # Calculate how many documents exist without reading the whole file.
        # forward_index stores (num_docs + 1) offsets:
        #   offsets[0] = start of doc 0 (byte 0)
        #   offsets[1] = start of doc 1 (also the end of doc 0)
        #   ...
        #   offsets[N] = end of the last doc (total size of forward.bin)
        offsets_size = self.offsets_path.stat().st_size
        if offsets_size < OFFSET_STRUCT.size or offsets_size % OFFSET_STRUCT.size != 0:
            raise ValueError(
                f"Invalid offsets file size ({offsets_size} bytes); "
                "must be a multiple of 8 bytes."
            )
        # Divide total bytes by 8 to get number of offsets, then subtract 1 for the extra end-of-file offset.
        self._num_docs = (offsets_size // OFFSET_STRUCT.size) - 1

    @property
    def num_docs(self) -> int:
        """Total number of documents stored in this forward index."""
        return self._num_docs

    def close(self) -> None:
        """Close both open file handles to free OS resources."""
        self._bin_file.close()
        self._offsets_file.close()

    # __enter__ and __exit__ let us use:  with ForwardIndexReader(...) as reader:
    # This guarantees close() is called automatically even if an error happens.
    def __enter__(self) -> "ForwardIndexReader":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()

    @staticmethod
    def _decode_doc(buf: bytes) -> ForwardDocument:
        """
        Turn one document's raw bytes (buf) into a ForwardDocument object.
        We use a cursor 'pos' that moves forward through 'buf' as we unpack each field.
        """
        pos = 0

        # 1. Unpack the 12-byte document header starting at byte 0.
        # unpack_from reads directly from 'buf' at index 'pos' without slicing/copying bytes.
        doc_id, title_len, total_len, n_terms = DOC_HDR.unpack_from(buf, pos)
        pos += DOC_HDR.size  # Advance cursor by 12 bytes

        # 2. Loop n_terms times to unpack each unique word in this document.
        terms = []
        for _ in range(n_terms):
            # Unpack the 10-byte term header
            word_id, title_freq, abstract_freq, n_pos = TERM_HDR.unpack_from(buf, pos)
            pos += TERM_HDR.size  # Advance cursor by 10 bytes

            # Unpack the list of word positions (each position is a 2-byte u16)
            if n_pos > 0:
                positions = struct.unpack_from(f"<{n_pos}H", buf, pos)
                pos += 2 * n_pos  # Advance cursor by (2 * number of positions) bytes
            else:
                positions = ()

            terms.append(
                TermEntry(
                    word_id=word_id,
                    title_freq=title_freq,
                    abstract_freq=abstract_freq,
                    positions=positions,
                )
            )

        return ForwardDocument(
            doc_id=doc_id,
            title_len=title_len,
            total_len=total_len,
            terms=tuple(terms),
        )

    def get_offset_range(self, doc_id: int) -> Tuple[int, int]:
        """
        Look up (start_byte, end_byte) for doc_id in O(1) time.
        Because every offset is 8 bytes, doc_id's entry starts at byte (doc_id * 8).
        """
        if doc_id < 0 or doc_id >= self._num_docs:
            raise IndexError(f"doc_id {doc_id} out of range (0..{self._num_docs - 1})")

        # Jump to doc_id's position in forward.offsets
        self._offsets_file.seek(doc_id * OFFSET_STRUCT.size)
        # Read 16 bytes at once: offsets[doc_id] and offsets[doc_id + 1]
        pair_bytes = self._offsets_file.read(OFFSET_PAIR_STRUCT.size)
        return OFFSET_PAIR_STRUCT.unpack(pair_bytes)

    def get_doc(self, doc_id: int) -> ForwardDocument:
        """
        Random-access lookup: fetch ANY document by doc_id in O(1) time
        using a single disk read.
        """
        start, end = self.get_offset_range(doc_id)
        doc_size = end - start

        # Jump to where this document begins in forward.bin
        self._bin_file.seek(start)
        raw = self._bin_file.read(doc_size)
        if len(raw) != doc_size:
            raise EOFError(f"Truncated record for doc_id={doc_id}")

        doc = self._decode_doc(raw)
        # Make sure the doc_id stored inside the record matches what we asked for
        if doc.doc_id != doc_id:
            raise ValueError(
                f"Offset mismatch: requested doc_id={doc_id}, read doc_id={doc.doc_id}"
            )
        return doc

    def iter_docs(self) -> Iterator[ForwardDocument]:
        """
        Sequential generator: yields documents one by one from doc 0 to doc N-1.
        Because it uses 'yield', only ONE document is in RAM at a time.
        Your Inverted Index Builder will loop over this method.
        """
        # Reset both files back to byte 0
        self._offsets_file.seek(0)
        self._bin_file.seek(0)

        # Read the very first offset (0)
        prev_offset = OFFSET_STRUCT.unpack(
            self._offsets_file.read(OFFSET_STRUCT.size)
        )[0]

        for _ in range(self._num_docs):
            # Read the next offset so we know the exact byte length of the current doc
            next_offset = OFFSET_STRUCT.unpack(
                self._offsets_file.read(OFFSET_STRUCT.size)
            )[0]
            raw = self._bin_file.read(next_offset - prev_offset)
            yield self._decode_doc(raw)
            prev_offset = next_offset