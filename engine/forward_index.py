"""Forward index: doc ID -> the words (IDs) it contains, with positions.

forward.bin, little-endian. Per document:
    doc_id u32 | title_len u16 | total_len u16 | n_terms u32
  then for each unique word (sorted by word_id):
    word_id u32 | title_freq u16 | abstract_freq u16 | n_pos u16 | n_pos x position u16
Positions count tokens from the start of the title; position < title_len = title.

forward.offsets: (num_docs + 1) x u64 byte offsets, so any document can be read
directly: doc i is the bytes offsets[i] .. offsets[i+1].
"""
import struct

DOC_HDR = struct.Struct("<IHHI")
TERM_HDR = struct.Struct("<IHHH")


def encode_doc(doc_id, word_ids, title_len):
    positions = {}
    for pos, wid in enumerate(word_ids):
        positions.setdefault(wid, []).append(pos)
    out = bytearray(DOC_HDR.pack(doc_id, title_len, len(word_ids), len(positions)))
    for wid in sorted(positions):
        ps = positions[wid]
        tf_title = sum(1 for p in ps if p < title_len)
        out += TERM_HDR.pack(wid, tf_title, len(ps) - tf_title, len(ps))
        out += struct.pack(f"<{len(ps)}H", *ps)
    return bytes(out)


class ForwardIndexWriter:
    def __init__(self, prefix):
        """prefix: path without extension, e.g. 'index/forward'."""
        self.prefix = prefix
        self.f = open(prefix + ".bin", "wb")
        self.offsets = [0]

    def add(self, doc_id, word_ids, title_len):
        assert doc_id == len(self.offsets) - 1, "documents must be added in doc_id order"
        self.f.write(encode_doc(doc_id, word_ids, title_len))
        self.offsets.append(self.f.tell())

    def close(self):
        self.f.close()
        with open(self.prefix + ".offsets", "wb") as f:
            f.write(struct.pack(f"<{len(self.offsets)}Q", *self.offsets))


def load_offsets(path):
    with open(path, "rb") as f:
        data = f.read()
    return list(struct.unpack(f"<{len(data) // 8}Q", data))


def decode_doc(buf):
    doc_id, title_len, total_len, n_terms = DOC_HDR.unpack_from(buf, 0)
    pos = DOC_HDR.size
    terms = []
    for _ in range(n_terms):
        wid, tf_title, tf_abs, n_pos = TERM_HDR.unpack_from(buf, pos)
        pos += TERM_HDR.size
        positions = list(struct.unpack_from(f"<{n_pos}H", buf, pos))
        pos += 2 * n_pos
        terms.append((wid, tf_title, tf_abs, positions))
    return {"doc_id": doc_id, "title_len": title_len, "total_len": total_len, "terms": terms}


def read_doc(bin_file, offsets, doc_id):
    """bin_file: open forward.bin ('rb'); offsets from load_offsets()."""
    bin_file.seek(offsets[doc_id])
    return decode_doc(bin_file.read(offsets[doc_id + 1] - offsets[doc_id]))


def iter_docs(bin_path, offsets_path):
    offsets = load_offsets(offsets_path)
    with open(bin_path, "rb") as f:
        for doc_id in range(len(offsets) - 1):
            yield read_doc(f, offsets, doc_id)
