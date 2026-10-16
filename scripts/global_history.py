"""Recent daily closes of SOX, NQ, KOSPI and Nikkei (月線 badges), USD/TWD and US 10Y (5-day moves);
SOX and TSM also keep open/high/low for half a year (their cards' 週K · 月線); writes docs/global_history.json.

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
SYMBOLS = {'sox': '^SOX', 'nq': 'NQ=F', 'kospi': '^KS11', 'nikkei': '^N225', 'usdtwd': 'TWD=X', 'us10y': '^TNX',
           'tw2330': '2330.TW', 'tsm': 'TSM'}
# 台積電和國際指數要算季線（60 日），多抓一點
LONG = {'tw2330': ('6mo', 70), 'sox': ('6mo', 120), 'tsm': ('6mo', 120),
        'nq': ('6mo', 70), 'kospi': ('6mo', 70), 'nikkei': ('6mo', 70)}  # 國際指數的季線 badge
# 週K 要開高低（18 週＋往前 20 天算月線）
OHLC = {'sox', 'tsm'}


def get_json(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=60) as res:
        return json.loads(res.read())


def closes(symbol, rng='3mo', keep=KEEP, ohlc=False):
    base = f'https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}'
    chart = get_json(base + f'?interval=1d&range={rng}')['chart']['result'][0]
    off = chart['meta']['gmtoffset']
    time.sleep(3)
    live = get_json(base + '?interval=5m&range=1d')['chart']['result'][0]['meta']
    prev = live.get('chartPreviousClose') or live.get('previousClose')
    start = (live.get('currentTradingPeriod') or {}).get('regular', {}).get('start', 0)

    q = chart['indicators']['quote'][0]
    bars = [(t, c) for t, c in zip(chart['timestamp'], q['close']) if c is not None]
    hlo = {t: (o, h, l) for t, o, h, l in zip(chart['timestamp'], q['open'], q['high'], q['low'])}
    # Up to the session that closed at `prev` (the one before the live quote's session).
    match = [i for i, (_, c) in enumerate(bars) if prev is not None and abs(c - prev) <= abs(prev) * 1e-6]
    if match:
        bars = bars[:match[-1] + 1]
    else:
        bars = [(t, c) for t, c in bars if t < start]
        # FX trades around the clock, so Yahoo's "previous close" is not any daily bar's close;
        # appending it would count a day twice.
        if prev is not None and not symbol.endswith('=X'):
            bars.append((start - 1, prev))
    def row(t, c):
        r = {'date': dt.datetime.fromtimestamp(t + off, dt.timezone.utc).date().isoformat(), 'close': round(c, 3)}
        o, h, l = hlo.get(t, (None, None, None))
        if ohlc and None not in (o, h, l):
            r.update(open=round(o, 3), high=round(h, 3), low=round(l, 3))
        return r
    return [row(t, c) for t, c in bars][-keep:]


def main():
    old = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {}
    out = dict(old)
    for i, (key, symbol) in enumerate(SYMBOLS.items()):
        if i:
            time.sleep(3)
        try:
            out[key] = closes(symbol, *LONG.get(key, ('3mo', KEEP)), ohlc=key in OHLC)
        except Exception as err:  # keep the previous list for this symbol
            print(f'{key}: {err}')
    OUT.write_text(json.dumps(out) + '\n', encoding='utf-8')
    print({k: (len(v), v[-1]) for k, v in out.items() if v})
    return 0


if __name__ == '__main__':
    sys.exit(main())
