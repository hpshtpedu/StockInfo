"""TSMC's (2330) market-cap weight in the TAIEX, for the 拉G盤 check; writes docs/tsmc_weight.json.

Source: TAIFEX 臺股期貨價格指數成分股暨市值比重 page (one request a day).
"""
import datetime as dt
import json
import pathlib
import re
import sys
import urllib.request

OUT = pathlib.Path(__file__).resolve().parent.parent / 'docs' / 'tsmc_weight.json'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'


def is_trading_day():
    """Today's TAIEX close is in (taiex_history.py runs earlier in the same job): not a holiday."""
    taiex = pathlib.Path(__file__).resolve().parent.parent / 'docs' / 'taiex_history.json'
    closes = json.loads(taiex.read_text(encoding='utf-8'))['closes'] if taiex.exists() else []
    today = dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date().isoformat()
    return bool(closes) and closes[-1]['date'] == today


def main():
    if not is_trading_day():
        print('market holiday: skip')
        return 0
    req = urllib.request.Request('https://www.taifex.com.tw/cht/9/futuresQADetail', headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as res:
        html = res.read().decode('utf-8', 'replace')
    m = re.search(r'>\s*2330\s*</td>.*?>\s*([\d.]+)%\s*</td>', html, re.S)
    if not m:
        print('2330 weight not found')
        return 0
    weight = float(m.group(1))
    if not 10 < weight < 80:
        print(f'unexpected weight {weight}')
        return 0
    today = dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date().isoformat()
    OUT.write_text(json.dumps({'date': today, 'weight': weight}) + '\n', encoding='utf-8')
    print(weight)
    return 0


if __name__ == '__main__':
    sys.exit(main())
