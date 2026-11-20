"""Biggest one-day drops in TWSE margin balance ever (億元) in docs/margin_records.json, for the
上市融資增減 card's 「資減第N名」 badge.

Seeded from a ranking the user provided up to 2026-11-20; each run merges the newer days already
recorded in docs/margin.json (no network) and keeps the top 15.
"""
import json
import pathlib
import sys

DOCS = pathlib.Path(__file__).resolve().parent.parent / 'docs'
OUT = DOCS / 'margin_records.json'
KEEP = 15


def main():
    rec = json.loads(OUT.read_text(encoding='utf-8'))
    m = json.loads((DOCS / 'margin.json').read_text(encoding='utf-8'))
    days = [*m.get('history', []), {'date': m['date'], 'balanceChange': m['balanceChange']}]
    new = [d for d in days if d['date'] > rec['asOf'] and d.get('balanceChange') is not None]
    if not new:
        print('no new days')
        return 0
    merged = {d['date']: d for d in rec['cut']}
    for d in new:
        if d['balanceChange'] < 0:
            merged[d['date']] = {'date': d['date'], 'change': d['balanceChange']}
    rec['cut'] = sorted(merged.values(), key=lambda d: d['change'])[:KEEP]
    rec['asOf'] = max(d['date'] for d in new)
    OUT.write_text(json.dumps(rec, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print('records as of', rec['asOf'])
    return 0


if __name__ == '__main__':
    sys.exit(main())
