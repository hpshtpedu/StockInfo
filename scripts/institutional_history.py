"""Keep a rolling history of TWSE foreign net buy/sell (億元) in docs/institutional.json.

Used by the dashboard to count the foreign investors' buying/selling streak. Only days not
yet recorded are fetched (BFI82U by date, 3 s apart), so a normal run makes 1-2 requests;
the first run backfills about two months.

Also the year-to-date totals per institution (本年度, 億元) from BFI82U's monthly report: each past
month of this year is fetched once and kept in 'months'; the current month (month-to-date) is
fetched on every run. 'ytd' carries the date it runs to, so the page can add a newer day on top.
"""
import datetime as dt
import re
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


def fetch_month(first):
    """BFI82U monthly report for the month starting at `first`:
    ({foreign, trust, dealer, total} 億元, last date covered), or None."""
    url = f'https://www.twse.com.tw/rwd/zh/fund/BFI82U?type=month&monthDate={first:%Y%m%d}&response=json'
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as res:
        data = json.loads(res.read().decode('utf-8-sig'))
    end = re.search(r'至(\d+)年(\d+)月(\d+)日', data.get('title', ''))
    if data.get('stat') != 'OK' or not end:
        return None
    to = dt.date(1911 + int(end[1]), int(end[2]), int(end[3]))
    if to.month != first.month:
        return None
    net = {r[0]: float(r[3].replace(',', '')) / 1e8 for r in data['data']}
    pick = lambda p: round(sum(v for k, v in net.items() if k.startswith(p)), 2)
    # 外資 = 外資及陸資 + 外資自營商；自營商 = 自行買賣 + 避險（跟卡片的當日數字同一個分法）
    return {'foreign': pick('外資'), 'trust': pick('投信'), 'dealer': pick('自營商'), 'total': round(net['合計'], 2)}, to


def year_to_date(old, today):
    """Past months of this year from the cache (each fetched once), plus the current month fresh."""
    months = {k: v for k, v in old.get('months', {}).items() if k.startswith(f'{today.year}-')}
    asof = dt.date.fromisoformat(old['ytd']['asOf']) if old.get('ytd') else None
    for m in range(1, today.month + 1):
        key = f'{today.year}-{m:02d}'
        if key in months and m < today.month:
            continue
        time.sleep(3)  # TWSE asks clients to keep request rates low
        got = fetch_month(dt.date(today.year, m, 1))
        if got:
            months[key], to = got
            asof = max(asof, to) if asof and asof.year == today.year else to
    if not months or not asof:
        return months, None
    ytd = {k: round(sum(v[k] for v in months.values()), 2) for k in ('foreign', 'trust', 'dealer', 'total')}
    return months, {'asOf': asof.isoformat(), **ytd}


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
    months, ytd = year_to_date(old, tw_today)
    OUT.write_text(json.dumps({'days': days, 'months': months, 'ytd': ytd}, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'{fetched} requests, {len(days)} days, latest {days[-1] if days else None}, ytd {ytd}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
