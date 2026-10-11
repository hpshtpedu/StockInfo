"""Build worker/src/s2t.json: a compact Simplified -> Traditional (Taiwan) dictionary for 金十 headlines.

Source: the OpenCC dictionaries (Apache-2.0, https://github.com/BYVoid/OpenCC), as shipped in the
opencc-python-reimplemented sdist. Usage: python build_s2t.py <path to opencc/dictionary>

Kept: STCharacters (first candidate), the STPhrases entries whose result differs from converting
character by character, the TWPhrases (IT/Name/Other vocabulary) and TWVariants.
"""
import json
import os
import pathlib
import sys

D = sys.argv[1]
OUT = pathlib.Path(__file__).resolve().parent.parent / 'src' / 's2t.json'


def load(name):
    m = {}
    for line in open(os.path.join(D, name), encoding='utf-8'):
        if '\t' in line:
            k, v = line.rstrip('\n').split('\t', 1)
            m[k] = v.split(' ')[0]
    return m


ch = load('STCharacters.txt')
ph = load('STPhrases.txt')
tw = {}
for n in ('TWPhrasesIT.txt', 'TWPhrasesName.txt', 'TWPhrasesOther.txt'):
    tw.update(load(n))
per_char = lambda s: ''.join(ch.get(c, c) for c in s)
data = {
    'c': {k: v for k, v in ch.items() if k != v},
    'p': {k: v for k, v in ph.items() if per_char(k) != v},
    't': tw,
    'v': load('TWVariants.txt'),
}
OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(OUT, {k: len(v) for k, v in data.items()})
