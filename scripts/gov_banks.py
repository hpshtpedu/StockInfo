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


def main():
    old = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {'days': []}
    today = dt.datetime.now(TW).date().isoformat()
    if old.get('fetched') == today:
        print('already fetched today')
        return 0
    # Record the attempt first, so a failed or empty fetch also counts as today's one request.
    old['fetched'] = today
    OUT.write_text(json.dumps(old) + '\n', encoding='utf-8')

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
    OUT.write_text(json.dumps({'fetched': today, 'days': days[-KEEP:]}) + '\n', encoding='utf-8')
    print(days[-3:])
    return 0


if __name__ == '__main__':
    sys.exit(main())
