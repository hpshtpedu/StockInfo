"""Build docs/events.json: market-moving events in Taiwan time, for the dashboard calendar.

All sources are fetched automatically (run nightly by GitHub Actions):
  CPI / NFP / PCE / retail sales: FRED release calendar API (needs FRED_API_KEY)
  FOMC decisions: federalreserve.gov meeting calendar page; minutes = decision + 21 days
  ISM PMI: computed (1st / 3rd US business day; 2nd / 4th in January)
  TSMC earnings call, 2330/0056/00878 ex-dividend and pay dates: Yahoo TW company calendar
    pages (tw.stock.yahoo.com/quote/<symbol>.TW/calendar; not disallowed by robots.txt)
If a source fails, its events from the previous run are kept.
"""
import datetime as dt
import json
import os
import pathlib
import re
import sys
import time
import urllib.request
from zoneinfo import ZoneInfo

OUT = pathlib.Path(__file__).resolve().parent.parent / 'docs' / 'events.json'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
ET = ZoneInfo('America/New_York')
TW = ZoneInfo('Asia/Taipei')
HORIZON_DAYS = 120

# FRED release ids; all are published at 08:30 ET.
FRED_RELEASES = {10: '美國CPI', 50: '非農就業', 54: 'PCE物價', 9: '零售銷售'}


def get(url, as_json=True):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json, text/html'})
    with urllib.request.urlopen(req, timeout=60) as res:
        body = res.read().decode('utf-8-sig')
    return json.loads(body) if as_json else body


def event(src, label, day, hhmm, tz):
    h, m = map(int, hhmm.split(':'))
    tw = dt.datetime.combine(day, dt.time(h, m), tz).astimezone(TW)
    return {'src': src, 'date': tw.strftime('%Y-%m-%d'), 'time': tw.strftime('%H:%M'), 'label': label}


def fred(today, until):
    key = os.environ['FRED_API_KEY']
    out = []
    for rid, label in FRED_RELEASES.items():
        data = get('https://api.stlouisfed.org/fred/release/dates'
                   f'?release_id={rid}&api_key={key}&file_type=json'
                   '&include_release_dates_with_no_data=true&sort_order=desc&limit=40')
        for r in data['release_dates']:
            day = dt.date.fromisoformat(r['date'])
            if today <= day <= until:
                out.append(event('fred', label, day, '08:30', ET))
        time.sleep(1)
    return out


def fomc(today, until):
    html = get('https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm', as_json=False)
    out = []
    # Each year's panel lists meetings as month ("Apr/May") + days ("28-29", "30-1*").
    for year, panel in re.findall(r'(\d{4}) FOMC Meetings(.*?)(?=\d{4} FOMC Meetings|$)', html, re.S):
        pairs = re.findall(r'fomc-meeting__month[^>]*>\s*<strong>([^<]+)</strong>.*?fomc-meeting__date[^>]*>([^<]+)<', panel, re.S)
        for month, days in pairs:
            if re.search(r'unscheduled|notation', days, re.I):
                continue
            last_month = month.split('/')[-1].strip()
            last_day = int(re.findall(r'\d+', days)[-1])
            day = dt.datetime.strptime(f'{year} {last_month[:3]} {last_day}', '%Y %b %d').date()
            if today <= day <= until:
                out.append(event('fomc', 'FOMC利率決議', day, '14:00', ET))  # decision on the last day
            # Minutes come out three weeks after the decision, also at 14:00 ET.
            minutes = day + dt.timedelta(days=21)
            if today <= minutes <= until:
                out.append(event('fomc', 'FOMC會議紀要', minutes, '14:00', ET))
    if not out:
        raise ValueError('no FOMC meetings parsed')
    return out


def us_holidays(year):
    def nth_weekday(month, weekday, n):
        d = dt.date(year, month, 1)
        return d + dt.timedelta(days=(weekday - d.weekday()) % 7 + 7 * (n - 1))

    def observed(d):
        return d - dt.timedelta(days=1) if d.weekday() == 5 else d + dt.timedelta(days=1) if d.weekday() == 6 else d

    # Easter (anonymous Gregorian algorithm) for Good Friday, which ISM treats as a holiday.
    a, b, c = year % 19, year // 100, year % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    n = h + l - 7 * m + 114
    easter = dt.date(year, n // 31, n % 31 + 1)
    return {
        observed(dt.date(year, 1, 1)), easter - dt.timedelta(days=2), observed(dt.date(year, 7, 4)),
        nth_weekday(9, 0, 1), observed(dt.date(year, 12, 25)),
    }


def ism(today, until):
    out = []
    month = dt.date(today.year, today.month, 1)
    while month <= until:
        holidays = us_holidays(month.year)
        business = [month + dt.timedelta(days=i) for i in range(10)]
        business = [d for d in business if d.weekday() < 5 and d not in holidays and d.month == month.month]
        shift = 1 if month.month == 1 else 0  # January reports come one business day later
        for label, nth in (('ISM製造業PMI', 0), ('ISM服務業PMI', 2)):
            day = business[nth + shift]
            if today <= day <= until:
                out.append(event('ism', label, day, '10:00', ET))
        month = (month + dt.timedelta(days=32)).replace(day=1)
    return out


def yahoo_tw_calendar(symbol):
    """Events embedded as JSON in a Yahoo TW company calendar page: [(eventType, detail)]."""
    html = get(f'https://tw.stock.yahoo.com/quote/{symbol}.TW/calendar', as_json=False)
    # Split at each event so an event without "detail" (e.g. 停券) can't borrow the next one's.
    chunks = re.split(r'(?="eventType":")', html)[1:]
    out = []
    for chunk in chunks:
        kind = re.match(r'"eventType":"(\w+)"', chunk).group(1)
        detail = re.search(r'"detail":(\{[^}]*\})', chunk)
        if detail:
            out.append((kind, json.loads(detail.group(1))))
    return out


DIVIDEND_STOCKS = {'2330': '台積電', '0056': '0056', '00878': '00878'}


def tw_stocks(today, until):
    out = []
    for i, (symbol, name) in enumerate(DIVIDEND_STOCKS.items()):
        if i:
            time.sleep(3)
        for kind, d in yahoo_tw_calendar(symbol):
            if kind == 'dividend':
                cash = f'{float(d["cash"]):g}元' if d.get('cash') else ''
                for field, what in (('exDate', '除息'), ('payDate', '配息')):
                    if d.get(field):
                        day = dt.datetime.fromisoformat(d[field]).date()
                        if today <= day <= until:
                            out.append({'src': 'tw_stocks', 'date': day.isoformat(), 'time': '',
                                        'label': f'{name}{what}{cash}'})
            # Investor meetings include brokers' conferences; keep only TSMC's own quarterly calls.
            elif kind == 'earningsCall' and symbol == '2330':
                info = d.get('information', '')
                if info.startswith('本公司') and '法人說明會' in info:
                    when = dt.datetime.fromisoformat(d['date']).astimezone(TW)
                    if today <= when.date() <= until:
                        out.append(event('tw_stocks', '台積電法說會', when.date(), when.strftime('%H:%M'), TW))
    # The page lists some events twice (e.g. upcoming and past sections).
    return [dict(t) for t in {tuple(e.items()) for e in out}]


def main():
    today = dt.datetime.now(TW).date() - dt.timedelta(days=1)
    until = today + dt.timedelta(days=HORIZON_DAYS)
    old = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else []
    events, failed = [], []
    sources = (('fred', fred), ('fomc', fomc), ('ism', ism), ('tw_stocks', tw_stocks))
    for name, fn in sources:
        try:
            got = fn(today, until)
            print(f'{name}: {len(got)} events')
            events += got
        except Exception as err:  # keep the previous run's events for this source
            print(f'{name}: FAILED ({err!r}); keeping previous events')
            failed.append(name)
            events += [e for e in old if e.get('src') == name and e['date'] >= today.isoformat()]

    events.sort(key=lambda e: (e['date'], e['time']))
    OUT.write_text(json.dumps(events, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    for e in events[:15]:
        print(e)
    return 1 if len(failed) == len(sources) else 0


if __name__ == '__main__':
    sys.exit(main())
