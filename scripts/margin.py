"""Compute the TWSE (上市) margin maintenance ratio and balance change; write docs/margin.json.

ratio = sum(margin lots * 1000 * close) / total margin amount, over listed stocks.
Run daily after TWSE publishes margin data (~21:00 Taipei). Stdlib only.
"""
import json
import pathlib
import sys
import urllib.request

OUT = pathlib.Path(__file__).resolve().parent.parent / 'docs' / 'margin.json'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'


def get_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as res:
        return json.loads(res.read().decode('utf-8-sig'))


def num(s):
    s = str(s).replace(',', '').replace('+', '').strip()
    try:
        return float(s)
    except ValueError:
        return None


def roc_to_iso(roc):  # "1151006" -> "2026-10-06"
    return f'{1911 + int(roc[:3])}-{roc[3:5]}-{roc[5:7]}'


def main():
    day_all = get_json('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL')
    date = roc_to_iso(day_all[0]['Date'])
    price = {r['Code']: num(r['ClosingPrice']) for r in day_all}
    lots = {r['股票代號']: num(r['融資今日餘額']) or 0
            for r in get_json('https://openapi.twse.com.tw/v1/exchangeReport/MI_MARGN')}
    summary = get_json('https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?selectType=MS&response=json')
    amount_row = next(r for r in summary['tables'][0]['data'] if r[0].startswith('融資金額'))
    amount = num(amount_row[5]) * 1000       # 今日餘額 (仟元 -> 元)
    amount_prev = num(amount_row[4]) * 1000  # 前日餘額

    # Margin data lags prices until the evening; skip until both refer to the same day.
    if summary['date'] != date.replace('-', ''):
        print(f'margin data not ready: prices {date}, margin {summary["date"]}')
        return 0

    market_value = sum(n * 1000 * price[code] for code, n in lots.items() if price.get(code))
    result = {
        'date': date,
        'ratio': round(market_value / amount * 100, 2),
        # 融資餘額與日增減 (億元)
        'balance': round(amount / 1e8, 2),
        'balanceChange': round((amount - amount_prev) / 1e8, 2),
    }

    # Keep the previous trading day's ratio for the day-over-day change.
    old = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {}
    if old.get('date') == date:
        result['prev'] = old.get('prev')
    elif old.get('ratio') is not None:
        result['prev'] = old['ratio']

    OUT.write_text(json.dumps(result, ensure_ascii=False) + '\n', encoding='utf-8')
    print(result)
    return 0


if __name__ == '__main__':
    sys.exit(main())
