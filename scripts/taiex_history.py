"""Keep recent TAIEX daily closes in docs/taiex_history.json for the moving-average card.

Source: TWSE 發行量加權股價指數歷史資料 (one month per request, 3 s apart). The first run
backfills 13 months; later runs refetch only the current month (and the previous one early
in a month), keeping the last 260 trading days.
"""
import datetime as dt
import json
import pathlib
import sys
import time
import urllib.request

OUT = pathlib.Path(__file__).resolve().parent.parent / 'docs' / 'taiex_history.json'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
KEEP = 260  # enough for the 240-day (annual) moving average


def fetch_month(first_day):
    url = f'https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?date={first_day:%Y%m%d}&response=json'
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as res:
        data = json.loads(res.read().decode('utf-8-sig'))
    out = {}
    for row in data.get('data') or []:
        y, m, d = (int(x) for x in row[0].split('/'))  # ROC date "115/09/01"
        out[dt.date(1911 + y, m, d).isoformat()] = float(row[4].replace(',', ''))
    return out


def month_starts(today, count):
    first = today.replace(day=1)
    for _ in range(count):
        yield first
        first = (first - dt.timedelta(days=1)).replace(day=1)


def main():
    old = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {'closes': []}
    closes = {c['date']: c['close'] for c in old['closes']}
    today = dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date()
    months = 13 if len(closes) < 240 else (2 if today.day <= 7 else 1)

    for i, first in enumerate(month_starts(today, months)):
        if i:
            time.sleep(3)  # TWSE asks clients to keep request rates low
        closes.update(fetch_month(first))

    kept = [{'date': d, 'close': closes[d]} for d in sorted(closes)][-KEEP:]
    OUT.write_text(json.dumps({'closes': kept}) + '\n', encoding='utf-8')
    print(f'{months} months fetched, {len(kept)} closes, latest {kept[-1] if kept else None}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
