"""0056、00878 近一年殖利率（自訂歷史配息率指標）-> docs/etf_yield.json。

定義：最近 4 次已除息的實際現金配息，每次的配息率＝該次每單位配息 ÷ 除息前一交易日的未還原收盤價；
近一年殖利率＝4 次配息率加總。不用現價、不預估、不複利。
資料：Yahoo 日線（events=div）；日線 close 只做分割調整、沒扣配息，可當未還原收盤價。每檔一個請求。
"""
import datetime as dt
import json
import pathlib
import sys
import time
import urllib.request

OUT = pathlib.Path(__file__).resolve().parent.parent / 'docs' / 'etf_yield.json'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
CODES = ['0056', '00878']
TW = dt.timezone(dt.timedelta(hours=8))


def yield_of(code):
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{code}.TW?interval=1d&range=2y&events=div'
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=60) as res:
        r = json.loads(res.read())['chart']['result'][0]
    day = lambda t: dt.datetime.fromtimestamp(t, TW).date()
    bars = [(day(t), c) for t, c in zip(r['timestamp'], r['indicators']['quote'][0]['close']) if c]
    today = dt.datetime.now(TW).date()
    divs = sorted(((day(d['date']), d['amount']) for d in (r.get('events') or {}).get('dividends', {}).values()
                   if day(d['date']) <= today), reverse=True)[:4]
    if len(divs) < 4:
        raise ValueError(f'{code}: 已除息配息不足 4 次')
    rows = []
    for ex, amount in divs:
        before = [c for d, c in bars if d < ex]
        if not before:
            raise ValueError(f'{code}: {ex} 找不到除息前一日收盤')
        rows.append({'exDate': ex.isoformat(), 'cash': round(amount, 4), 'prevClose': round(before[-1], 2),
                     'rate': round(amount / before[-1] * 100, 4)})
    return {'yield': round(sum(x['rate'] for x in rows), 2), 'dividends': rows}


def main():
    out = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {}
    for i, code in enumerate(CODES):
        if i:
            time.sleep(3)
        try:
            out[code] = yield_of(code)
        except Exception as err:  # 保留上次的結果
            print(f'{code}: {err}')
    OUT.write_text(json.dumps(out, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
