"""Compute the TWSE (上市) margin maintenance ratio and balance change; write docs/margin.json.

ratio = sum(margin lots * 1000 * close) / total margin amount, over listed stocks.
Run daily after TWSE publishes margin data (~21:00 Taipei). Stdlib only.
"""
import datetime as dt
import json
import pathlib
import sys
import time
import urllib.request

OUT = pathlib.Path(__file__).resolve().parent.parent / 'docs' / 'margin.json'
HISTORY = 15  # days of balance changes kept for the 連N增/減 badge
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


def table(report, title_part):
    return next(t for t in report['tables'] if title_part in t.get('title', ''))


# Daily balance changes before `date`, oldest first, from the small summary report.
def backfill(date):
    out = []
    day = dt.date.fromisoformat(date)
    for _ in range(HISTORY * 2):  # calendar days; weekends and holidays have no report
        if len(out) >= HISTORY - 1:
            break
        day -= dt.timedelta(days=1)
        if day.weekday() >= 5:
            continue
        time.sleep(3)
        report = get_json(f'https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date={day:%Y%m%d}&selectType=MS&response=json')
        if report.get('stat') != 'OK':
            continue
        row = next(r for r in table(report, '信用交易統計')['data'] if r[0].startswith('融資金額'))
        out.append({'date': day.isoformat(), 'balanceChange': round((num(row[5]) - num(row[4])) * 1000 / 1e8, 2)})
    return out[::-1]


# TWSE website reports (not the OpenAPI, which lags by up to a day).
def main():
    latest = get_json('https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?selectType=MS&response=json')
    ymd = latest['date']  # "20261007": the latest day with margin data (published ~21:00)
    date = f'{ymd[:4]}-{ymd[4:6]}-{ymd[6:]}'

    time.sleep(3)  # TWSE asks clients to keep request rates low
    margin = get_json(f'https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date={ymd}&selectType=ALL&response=json')
    amount_row = next(r for r in table(margin, '信用交易統計')['data'] if r[0].startswith('融資金額'))
    amount = num(amount_row[5]) * 1000       # 今日餘額 (仟元 -> 元)
    amount_prev = num(amount_row[4]) * 1000  # 前日餘額
    lots = {r[0]: num(r[6]) or 0 for r in table(margin, '融資融券彙總')['data']}  # 融資今日餘額 (張)

    time.sleep(3)
    quotes = get_json(f'https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date={ymd}&type=ALLBUT0999&response=json')
    price = {r[0]: num(r[8]) for r in table(quotes, '每日收盤行情')['data']}  # 收盤價
    if quotes.get('date') != ymd or not price:
        print(f'closing prices for {ymd} not available')
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

    # Daily balance changes, oldest first; the first run backfills the previous days.
    history = [h for h in old.get('history', []) if h['date'] < date] or backfill(date)
    result['history'] = (history + [{'date': date, 'balanceChange': result['balanceChange']}])[-HISTORY:]

    OUT.write_text(json.dumps(result, ensure_ascii=False) + '\n', encoding='utf-8')
    print(result)
    return 0


if __name__ == '__main__':
    sys.exit(main())
