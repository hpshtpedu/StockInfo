"""Top foreign net buy / sell days ever (億元) in docs/foreign_records.json, for the 三大法人 card's
「外資賣超史上第N名」 badge.

Seeded from a PTT ranking up to 2026-10-12; each run merges the newer days already recorded in
docs/institutional.json (no network) and keeps the top 15 of each side.
"""
import json
import pathlib
import sys

DOCS = pathlib.Path(__file__).resolve().parent.parent / 'docs'
OUT = DOCS / 'foreign_records.json'
KEEP = 15


def main():
    rec = json.loads(OUT.read_text(encoding='utf-8'))
    days = json.loads((DOCS / 'institutional.json').read_text(encoding='utf-8'))['days']
    new = [d for d in days if d['date'] > rec['asOf']]
    if not new:
        print('no new days')
        return 0
    for side, key, reverse in (('buy', lambda d: d['foreign'], True), ('sell', lambda d: d['foreign'], False)):
        merged = {d['date']: d for d in rec[side]}
        for d in new:
            if (d['foreign'] > 0) == (side == 'buy'):
                merged[d['date']] = {'date': d['date'], 'foreign': d['foreign']}
        rec[side] = sorted(merged.values(), key=key, reverse=reverse)[:KEEP]
    rec['asOf'] = max(d['date'] for d in new)
    OUT.write_text(json.dumps(rec, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print('records as of', rec['asOf'])
    return 0


if __name__ == '__main__':
    sys.exit(main())
