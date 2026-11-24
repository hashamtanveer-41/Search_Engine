"""Shared tokenizer. Every part of the project (indexing AND querying) must use this."""
import re
import unicodedata

MAX_TOKEN_LEN = 30
MAX_DOC_TOKENS = 65535          # positions are stored as unsigned 16-bit numbers
_NON_ALNUM = re.compile(r"[^a-z0-9]+")

# NOT removed while indexing (the project example query "data structures and
# algorithms" needs "and"). Use this set later to give such words low weight
# in ranking or to skip them in autocomplete.
STOPWORDS = frozenset("""
a about above after again against all am an and any are as at be because been
before being below between both but by can did do does doing down during each
few for from further had has have having he her here hers him his how i if in
into is it its just me more most my no nor not of off on once only or other our
out over own same she should so some such than that the their them then there
these they this those through to too under until up very was we were what when
where which while who whom why will with you your
""".split())


def normalize(text):
    """Lowercase and strip accents: 'Balázs' -> 'balazs'."""
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(c for c in text if not unicodedata.combining(c))
    return text.lower()


def tokenize(text, remove_stopwords=False):
    """Split text into words made of letters/digits. No stemming.

    'State-of-the-art' -> ['state', 'of', 'the', 'art'].
    One-letter tokens are dropped.
    """
    tokens = [t for t in _NON_ALNUM.split(normalize(text))
              if 1 < len(t) <= MAX_TOKEN_LEN]
    if remove_stopwords:
        tokens = [t for t in tokens if t not in STOPWORDS]
    return tokens


def tokenize_doc(title, abstract):
    """Tokens of title followed by abstract. Returns (tokens, title_len).

    A token at position p is in the title when p < title_len.
    """
    t = tokenize(title)
    a = tokenize(abstract)
    tokens = (t + a)[:MAX_DOC_TOKENS]
    return tokens, min(len(t), MAX_DOC_TOKENS)
