"""Recent daily closes of SOX, NQ, KOSPI and Nikkei for their 月線 (20-day MA) badges;
writes docs/global_history.json.

Yahoo daily bars, two requests per symbol, 3 s apart. Only finished sessions are kept: the
frontend adds the live quote (and its previous close, if this file lags) on top. Yahoo now and
then leaves a day's close empty; for a 20-day average a missing day hardly matters.
"""
import datetime as dt
import json
import pathlib
import sys
import time
import urllib.parse
import urllib.request

OUT = pathlib.Path(__file__).resolve().parent.parent / 'docs' / 'global_history.json'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
KEEP = 30
SYMBOLS = {'sox': '^SOX', 'nq': 'NQ=F', 'kospi': '^KS11', 'nikkei': '^N225'}


def get_json(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=60) as res:
        return json.loads(res.read())


def closes(symbol):
    base = f'https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}'
    chart = get_json(base + '?interval=1d&range=3mo')['chart']['result'][0]
    off = chart['meta']['gmtoffset']
    time.sleep(3)
    live = get_json(base + '?interval=5m&range=1d')['chart']['result'][0]['meta']
    prev = live.get('chartPreviousClose') or live.get('previousClose')
    start = (live.get('currentTradingPeriod') or {}).get('regular', {}).get('start', 0)

    bars = [(t, c) for t, c in zip(chart['timestamp'], chart['indicators']['quote'][0]['close']) if c is not None]
    # Up to the session that closed at `prev` (the one before the live quote's session).
    match = [i for i, (_, c) in enumerate(bars) if prev is not None and abs(c - prev) <= abs(prev) * 1e-6]
    if match:
        bars = bars[:match[-1] + 1]
    else:
        bars = [(t, c) for t, c in bars if t < start]
        if prev is not None:
            bars.append((start - 1, prev))
    return [{'date': dt.datetime.fromtimestamp(t + off, dt.timezone.utc).date().isoformat(), 'close': round(c, 3)}
            for t, c in bars][-KEEP:]


def main():
    old = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {}
    out = dict(old)
    for i, (key, symbol) in enumerate(SYMBOLS.items()):
        if i:
            time.sleep(3)
        try:
            out[key] = closes(symbol)
        except Exception as err:  # keep the previous list for this symbol
            print(f'{key}: {err}')
    OUT.write_text(json.dumps(out) + '\n', encoding='utf-8')
    print({k: (len(v), v[-1]) for k, v in out.items() if v})
    return 0


if __name__ == '__main__':
    sys.exit(main())
