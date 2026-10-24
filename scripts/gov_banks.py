"""八大公股行庫 daily net buy/sell (億元) from HiStock; writes docs/gov_banks.json.

Source: histock.tw/stock/broker8.aspx (allowed by its robots.txt). The page embeds ~6 months of
daily totals, so one request a day is enough: the attempt date is recorded and any later run on
the same day (the nightly job runs twice, and also on script pushes) is skipped.
HiStock sums the trades at the government banks' brokerages: it includes their own and their
clients' trades, so it is not purely "national team" buying.
"""
import datetime as dt
import json
import pathlib
import re
import sys
import urllib.request

OUT = pathlib.Path(__file__).resolve().parent.parent / 'docs' / 'gov_banks.json'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
KEEP = 60
TW = dt.timezone(dt.timedelta(hours=8))


def latest_session(closes, now):
    """The trading day whose after-hours data is due: the latest TAIEX close if it is today, or
    yesterday's while it is still before 09:00 (GitHub's nightly cron often runs after midnight)."""
    if not closes:
        return None
    last = closes[-1]['date']
    today = now.date().isoformat()
    yesterday = (now.date() - dt.timedelta(days=1)).isoformat()
    return last if last == today or (last == yesterday and now.hour < 9) else None


def main():
    old = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {'days': []}
    now = dt.datetime.now(TW)
    # Market holidays have nothing new: skip unless today's TAIEX close is in (taiex_history.py runs
    # earlier in the same job), without asking anyone.
    taiex = OUT.parent / 'taiex_history.json'
    closes = json.loads(taiex.read_text(encoding='utf-8'))['closes'] if taiex.exists() else []
    today = latest_session(closes, now)  # the trading day due (cron often runs after midnight)
    if not today:
        print('no TAIEX close for today (holiday or not out yet): skip')
        return 0
    if old.get('fetched') == today:
        print('already have this trading day')
        return 0
    # 'fetched' means "today's figure is in": it is only set after a fetch that returned today's date,
    # so a run before HiStock updates (or a failed one) leaves the 23:00 run free to try again.

    req = urllib.request.Request('https://histock.tw/stock/broker8.aspx', headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as res:
        html = res.read().decode('utf-8', 'replace')
    m = re.search(r'loadChart\((.*?)\);', html, re.S)
    if not m:
        print('HiStock: chart data not found')
        return 0
    series = json.loads(json.loads(m.group(1))['SumMoney'])
    # Days without trading show up as 0; a real day is never exactly 0.
    days = [{'date': dt.datetime.fromtimestamp(t / 1000, TW).date().isoformat(), 'net': round(v, 2)}
            for t, v in series if v != 0]
    if not days:
        print('HiStock: no data')
        return 0
    # Our own stored days are the history (the 連N買/賣 streak counts on them); each fetch adds the
    # days we don't have yet, and refreshes the last few in case HiStock revised them.
    known = {d['date']: d for d in old.get('days', [])}
    for i, d in enumerate(days):
        if d['date'] not in known or i >= len(days) - 5:
            known[d['date']] = d
    merged = [known[k] for k in sorted(known)][-KEEP:]
    got_today = merged[-1]['date'] == today
    # TSMC: only when it is in the page's top-30 buy or sell list (萬元 -> 億元); otherwise None
    g = re.search(r'title="(\d{4}-\d\d-\d\d) [^"]*?\(2330\)[^"]*?(-?[\d,]+)萬', html)
    tsmc = {'date': g.group(1), 'net': round(int(g.group(2).replace(',', '')) / 10000, 1)} if g else None
    OUT.write_text(json.dumps({'fetched': today if got_today else old.get('fetched'), 'days': merged,
                               'tsmc': tsmc}) + '\n', encoding='utf-8')
    if not got_today:
        print('HiStock has no figure for today yet; the next run will try again')
    days = merged
    print(days[-3:])
    return 0


if __name__ == '__main__':
    sys.exit(main())
