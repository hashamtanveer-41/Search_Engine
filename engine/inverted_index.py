"""
Inverted Index Builder by Salman
It converts forward.bin and forward.offsets into:
  1. <prefix>.bin     -> per word_id:
                           n_docs (u32)
                           then n_docs times:
                             doc_id (u32) | freq (u16) | n_pos (u16) | n_pos x pos (u16)
  2. <prefix>.offsets -> per word_id:
                           byte_offset (u64) | byte_length (u32)  [12 bytes per word_id]

All integers are little-endian ('<') with standard sizes and no padding.
"""

from dataclasses import dataclass
import json
from pathlib import Path
import struct
import time
from typing import Optional

from engine.forward_reader import ForwardIndexReader

# Binary format definitions
WORD_HDR = struct.Struct("<I")       # 4 bytes: n_docs (u32)
POSTING_HDR = struct.Struct("<IHH")  # 8 bytes: doc_id (u32), freq (u16), n_pos (u16)
OFFSET_ENTRY = struct.Struct("<QI")  # 12 bytes: byte_offset (u64), byte_length (u32)


@dataclass(slots=True)
class BuildStats:
    """Summary metrics recorded after a build."""
    num_docs: int
    num_words: int
    total_postings: int
    bin_size_bytes: int
    offsets_size_bytes: int
    elapsed_seconds: float


def _resolve_num_words(
    reader: ForwardIndexReader,
    lexicon_path: Optional[str | Path] = None,
) -> int:
    """
    Determine total number of word IDs (0 .. num_words - 1).
    Use lexicon.json if it is given or scan forward.bin once to find max(word_id) + 1.
    """
    if lexicon_path is not None:
        lex_file = Path(lexicon_path)
        if not lex_file.exists():
            raise FileNotFoundError(f"Missing lexicon file: {lex_file}")
        with open(lex_file, "r", encoding="utf-8") as f:
            lexicon = json.load(f)
        if not lexicon:
            return 0
        # Handle standard {word: word_id} dict safely even if IDs are non-contiguous
        return max(lexicon.values()) + 1

    # Fallback when testing without a lexicon.json file
    max_wid = -1
    for doc in reader.iter_docs():
        if doc.terms:
            # The terms in the document are sorted by word_id and so the last term will have the largest ID
            last_wid = doc.terms[-1].word_id
            if last_wid > max_wid:
                max_wid = last_wid
    return max_wid + 1


def build_inverted_index(
    forward_prefix: str | Path,
    inverted_prefix: str | Path,
    *,
    lexicon_path: Optional[str | Path] = None,
    num_words: Optional[int] = None,
    chunk_size: int = 50_000,
) -> BuildStats:
    """
    Build the inverted.bin and the inverted.offsets from an existing forward index.

    Parameters:
    forward_prefix  : Path without extension to forward index (e.g. 'index/full/forward')
    inverted_prefix : Path without extension for the output files (e.g. 'index/full/inverted')
    lexicon_path    : Optional path to lexicon.json. This is to avoid an extra scan for the word count.
    num_words       : Optional explicit word count (overrides lexicon_path if given)
    chunk_size      : Number of word IDs processed in RAM per pass. This keeps RAM low.
    """
    if chunk_size <= 0:
        raise ValueError("chunk_size must be a positive integer.")

    start_time = time.perf_counter()

    inv_prefix_str = str(inverted_prefix)
    bin_path = Path(inv_prefix_str + ".bin")
    offsets_path = Path(inv_prefix_str + ".offsets")

    # Making sure that the output directory exists before creating files
    bin_path.parent.mkdir(parents=True, exist_ok=True)

    total_postings = 0

    with ForwardIndexReader(forward_prefix) as reader:
        num_docs = reader.num_docs

        # Step 1: Figure out how many word IDs exist (0 .. total_words - 1)
        if num_words is None:
            total_words = _resolve_num_words(reader, lexicon_path=lexicon_path)
        else:
            total_words = num_words

        # Step 2: Open both output binary files once and write chunk by chunk
        with open(bin_path, "wb") as bin_file, open(offsets_path, "wb") as offsets_file:
            # Process the word IDs in ranges: [0, chunk_size), [chunk_size, 2*chunk_size), ...
            for chunk_start in range(0, total_words, chunk_size):
                chunk_end = min(chunk_start + chunk_size, total_words)
                chunk_len = chunk_end - chunk_start

                # For each word in this chunk:
                #   doc_counts[i]   = how many documents contain (chunk_start + i)
                #   postings_buf[i] = raw packed bytes of all postings for that word
                doc_counts = [0] * chunk_len
                postings_buf = [bytearray() for _ in range(chunk_len)]

                # Stream forward.bin sequentially from doc 0 to doc N-1.
                # Because docs arrive in ascending doc_id order, every posting list will be already sorted by doc_id.
                for doc in reader.iter_docs():
                    doc_id = doc.doc_id

                    for term in doc.terms:
                        wid = term.word_id
                        if wid < chunk_start:
                            continue
                        if wid >= chunk_end:
                            # doc.terms is sorted by word_id, so no later term can be in this chunk
                            break

                        local_idx = wid - chunk_start
                        freq = term.title_freq + term.abstract_freq
                        positions = term.positions
                        n_pos = len(positions)

                        # Pack the posting directly into bytes to minimize RAM usage:
                        #   doc_id (u32), freq (u16), n_pos (u16), followed by positions (u16 each)
                        buf = postings_buf[local_idx]
                        buf += POSTING_HDR.pack(doc_id, freq, n_pos)
                        if n_pos > 0:
                            buf += struct.pack(f"<{n_pos}H", *positions)

                        doc_counts[local_idx] += 1
                        total_postings += 1

                # Flush this entire chunk to inverted.bin and inverted.offsets in word_id order
                offset_chunk = bytearray()
                for local_idx in range(chunk_len):
                    entry_start = bin_file.tell()
                    n_docs = doc_counts[local_idx]

                    # Write header followed by packed postings
                    bin_file.write(WORD_HDR.pack(n_docs))
                    if n_docs > 0:
                        bin_file.write(postings_buf[local_idx])

                    entry_length = bin_file.tell() - entry_start
                    offset_chunk += OFFSET_ENTRY.pack(entry_start, entry_length)

                # Write all offsets for this chunk in a single disk write
                offsets_file.write(offset_chunk)

                # Free chunk buffers before moving to the next chunk
                del doc_counts
                del postings_buf

    elapsed = time.perf_counter() - start_time
    return BuildStats(
        num_docs=num_docs,
        num_words=total_words,
        total_postings=total_postings,
        bin_size_bytes=bin_path.stat().st_size,
        offsets_size_bytes=offsets_path.stat().st_size,
        elapsed_seconds=elapsed,
    )