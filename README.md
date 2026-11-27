# Search_Engine

A file-based search engine over a 60,000-paper subset of the arXiv metadata dataset,
built for CS-250 Data Structures & Algorithms. No databases — every index is stored in
binary files on disk.

---

## Repository layout

```
engine/         Core library (tokenizer, lexicon, forward index, inverted index, …)
scripts/        Build and verification scripts
tests/          Unit and integration tests
data/subset/    60 k-paper arXiv JSONL subset (committed)
data/sample/    1 k-paper sample for quick testing (committed)
index/mini/     Pre-built 100-doc sample index (committed, for CI)
index/full/     Full 60 k-doc index  ← NOT committed (too large; build locally)
```

---

## Building the index

### 1 — Get the raw arXiv dataset

Download **arxiv-metadata-oai-snapshot.json** from Kaggle:

```
https://www.kaggle.com/datasets/Cornell-University/arxiv
```

Place the file in the project root (it is listed in `.gitignore` and will never be committed).

### 2 — Create the 60 k subset

```bash
python3 scripts/make_subset.py \
    --input arxiv-metadata-oai-snapshot.json \
    --output data/subset/arxiv_60k.jsonl \
    --limit 60000
```

> **Do not re-run this** if `data/subset/arxiv_60k.jsonl` is already committed —
> the committed file is the canonical subset used for reproducible results.

### 3 — Build all index files in one command

```bash
python3 scripts/build_all.py \
    --input data/subset/arxiv_60k.jsonl \
    --out   index/full
```

This runs the three steps below in sequence and ends with **PASS** if everything is consistent.

**Or run each step manually:**

```bash
# Step 3a – forward index + lexicon + metadata
python3 scripts/build_forward.py \
    --input data/subset/arxiv_60k.jsonl \
    --out   index/full

# Step 3b – inverted index
python3 scripts/build_inverted.py --index-dir index/full

# Step 3c – consistency check (must print PASS)
python3 scripts/check_index.py   --index-dir index/full
```

For the 1 k sample (fast, good for development):

```bash
python3 scripts/build_all.py \
    --input data/sample/arxiv_sample_1k.jsonl \
    --out   index/sample
```

### 4 — Run the tests

```bash
python3 -m pytest tests -v
```

All 5 tests should pass in under a second (they use temporary directories, not `index/full`).

---

## Output files explained

After running `build_all.py --out index/full` you will find:

| File | Size (approx.) | Description |
|---|---|---|
| `lexicon.json` | ~2 MB | JSON object mapping every unique token → integer word ID. IDs are assigned in descending frequency order (most common word = 0), which keeps high-frequency terms in the lowest-numbered inverted-index barrel. |
| `forward.bin` | ~50 MB | Binary forward index. **Per-document layout (little-endian):** `doc_id u32 \| title_len u16 \| total_len u16 \| n_terms u32`, then for each unique word (sorted by `word_id`): `word_id u32 \| title_freq u16 \| abstract_freq u16 \| n_pos u16 \| n_pos × position u16`. Positions count tokens from the start of the title; `position < title_len` means the word is in the title. |
| `forward.offsets` | ~0.5 MB | `(num_docs + 1)` × `u64` byte offsets. `offsets[i]` and `offsets[i+1]` are the start and end byte of document `i` in `forward.bin`, enabling O(1) random access. |
| `inverted.bin` | ~80 MB | Binary inverted index. **Per-word layout:** `n_docs u32`, then `n_docs` postings, each: `doc_id u32 \| freq u16 \| n_pos u16 \| n_pos × position u16`. Postings are sorted by `doc_id` (ascending). |
| `inverted.offsets` | ~1.2 MB | One entry per word ID: `byte_offset u64 \| byte_length u32` (12 bytes each). Seek to `word_id × 12` to find any word's postings in O(1). |
| `metadata.jsonl` | ~30 MB | Newline-delimited JSON, one record per document in `doc_id` order. Each record: `id`, `title`, `authors`, `categories`, `update_date`, `journal_ref`, `versions`, `abstract`. |
| `metadata.offsets` | ~0.5 MB | `(num_docs + 1)` × `u64` byte offsets into `metadata.jsonl`, enabling O(1) retrieval of any document's metadata without loading the whole file. |
| `docmap.json` | ~0.5 MB | JSON array: `docmap[doc_id]` = arXiv paper ID string (e.g. `"1706.03762"`). Used to translate internal integer `doc_id` back to the canonical arXiv identifier. |
