"""Metadata store: one JSON line per doc ID, with byte offsets for direct access.

Files: docmap.json (list: doc_id -> arXiv id), metadata.jsonl, metadata.offsets.
Each line: id, title, authors, categories, update_date, journal_ref, versions, abstract.
"""
import json
import struct


class MetadataWriter:
    def __init__(self, prefix):
        self.prefix = prefix
        self.f = open(prefix + "metadata.jsonl", "wb")
        self.offsets = [0]
        self.docmap = []

    def add(self, record):
        self.f.write((json.dumps(record, ensure_ascii=False) + "\n").encode("utf-8"))
        self.offsets.append(self.f.tell())
        self.docmap.append(record["id"])

    def close(self):
        self.f.close()
        with open(self.prefix + "metadata.offsets", "wb") as f:
            f.write(struct.pack(f"<{len(self.offsets)}Q", *self.offsets))
        with open(self.prefix + "docmap.json", "w", encoding="utf-8") as f:
            json.dump(self.docmap, f)


def read_metadata(jsonl_file, offsets, doc_id):
    """jsonl_file: open metadata.jsonl ('rb')."""
    jsonl_file.seek(offsets[doc_id])
    return json.loads(jsonl_file.read(offsets[doc_id + 1] - offsets[doc_id]))
