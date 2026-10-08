"""Keep Taiwan VIX (臺指選擇權波動率指數) daily closes in docs/vix_history.json.

TAIFEX publishes one small file per month and keeps only the last few months online, so this
accumulates history over time (up to ~1 year) for the card's percentile. The first run
backfills whatever months are still available; later runs fetch the current and previous month.
"""
import datetime as dt
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request

OUT = pathlib.Path(__file__).resolve().parent.parent / 'docs' / 'vix_history.json'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
URL = 'https://www.taifex.com.tw/file/taifex/Dailydownload/vix/log2data/{}new.txt'
KEEP = 260  # about one year of trading days


def fetch_month(ym):
    req = urllib.request.Request(URL.format(ym), headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            text = res.read().decode('latin-1')  # only the ASCII data rows are used
    except urllib.error.HTTPError:
        return {}
    return {f'{d[:4]}-{d[4:6]}-{d[6:]}': float(v) for d, v in re.findall(r'^(\d{8})\s+\d+\s+([\d.]+)', text, re.M)}


def main():
    old = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {'closes': []}
    closes = {c['date']: c['close'] for c in old['closes']}
    today = dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date()
    months_back = 5 if len(closes) < 40 else 2

    first = today.replace(day=1)
    for i in range(months_back):
        if i:
            time.sleep(3)  # keep request rates low
            first = (first - dt.timedelta(days=1)).replace(day=1)
        closes.update(fetch_month(f'{first:%Y%m}'))

    kept = [{'date': d, 'close': closes[d]} for d in sorted(closes)][-KEEP:]
    OUT.write_text(json.dumps({'closes': kept}) + '\n', encoding='utf-8')
    print(f'{len(kept)} closes, {kept[0]["date"] if kept else None} .. {kept[-1] if kept else None}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
