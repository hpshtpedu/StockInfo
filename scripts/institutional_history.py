"""Keep a rolling history of TWSE foreign net buy/sell (億元) in docs/institutional.json.

Used by the dashboard to count the foreign investors' buying/selling streak. Only days not
yet recorded are fetched (BFI82U by date, 3 s apart), so a normal run makes 1-2 requests;
the first run backfills about two months.
"""
import datetime as dt
import json
import pathlib
import sys
import time
import urllib.request

OUT = pathlib.Path(__file__).resolve().parent.parent / 'docs' / 'institutional.json'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
KEEP_DAYS = 40      # trading days kept
LOOKBACK = 60       # calendar days scanned when backfilling


def fetch_foreign(day):
    url = f'https://www.twse.com.tw/rwd/zh/fund/BFI82U?type=day&dayDate={day:%Y%m%d}&response=json'
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as res:
        data = json.loads(res.read().decode('utf-8-sig'))
    if data.get('stat') != 'OK' or data.get('date') != f'{day:%Y%m%d}':
        return None  # holiday / not published
    # 外資及陸資 + 外資自營商, 元 -> 億元
    total = sum(float(r[3].replace(',', '')) for r in data['data'] if r[0].startswith('外資'))
    return round(total / 1e8, 2)


def main():
    old = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {'days': []}
    known = {d['date']: d['foreign'] for d in old['days']}
    tw_today = dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date()

    fetched = 0
    for back in range(LOOKBACK):
        day = tw_today - dt.timedelta(days=back)
        if day.weekday() >= 5 or day.isoformat() in known:
            continue
        # Stop once we're past the oldest day we'd keep and already have a full history.
        if len(known) >= KEEP_DAYS and day.isoformat() < min(known):
            break
        if fetched:
            time.sleep(3)  # TWSE asks clients to keep request rates low
        value = fetch_foreign(day)
        fetched += 1
        if value is not None:
            known[day.isoformat()] = value

    days = [{'date': d, 'foreign': known[d]} for d in sorted(known)][-KEEP_DAYS:]
    OUT.write_text(json.dumps({'days': days}, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'{fetched} requests, {len(days)} days, latest {days[-1] if days else None}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
