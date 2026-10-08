"""Build docs/events.json: market-moving events in Taiwan time, for the dashboard calendar.

All sources are fetched automatically (run nightly by GitHub Actions):
  CPI / NFP / PCE / retail sales: FRED release calendar API (needs FRED_API_KEY)
  FOMC decisions: federalreserve.gov meeting calendar page; minutes = decision + 21 days
  ISM PMI: computed (1st / 3rd US business day; 2nd / 4th in January)
  TSMC earnings call, 2330/0056/00878 ex-dividend and pay dates: Yahoo TW company calendar
    pages (tw.stock.yahoo.com/quote/<symbol>.TW/calendar; not disallowed by robots.txt)
  US / Japan / Korea market holidays: computed with the `holidays` package (NYSE calendar;
    JP and KR public holidays plus exchange year-end and Labor Day closures)
  NVIDIA earnings call: official newsroom RSS (nvidianews.nvidia.com/releases.xml)
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


# English names from the holidays package -> everyday Traditional Chinese names.
HOLIDAY_ZH = {
    # US (NYSE)
    "New Year's Day": '元旦', 'Martin Luther King Jr. Day': '金恩紀念日', "Washington's Birthday": '總統日',
    'Good Friday': '耶穌受難日', 'Memorial Day': '陣亡將士紀念日', 'Juneteenth National Independence Day': '六月節',
    'Independence Day': '獨立紀念日', 'Labor Day': '勞動節', 'Thanksgiving Day': '感恩節', 'Christmas Day': '聖誕節',
    # Japan
    'Coming of Age Day': '成人日', 'Foundation Day': '建國紀念日', "Emperor's Birthday": '天皇誕辰',
    'Vernal Equinox Day': '春分', 'Showa Day': '昭和日', 'Constitution Day': '憲法紀念日', 'Greenery Day': '綠之日',
    "Children's Day": '兒童節', 'Marine Day': '海之日', 'Mountain Day': '山之日', 'Respect for the Aged Day': '敬老日',
    'Autumnal Equinox Day': '秋分', 'Sports Day': '體育日', 'Culture Day': '文化日',
    'Labor Thanksgiving Day': '勤勞感謝日', 'Substitute Holiday': '補假', 'National Holiday': '國民休日',
    # Korea
    'Korean New Year': '春節', 'The day preceding Korean New Year': '春節', 'The second day of Korean New Year': '春節',
    'Independence Movement Day': '三一節', "Buddha's Birthday": '佛誕日', 'Liberation Day': '光復節',
    'Chuseok': '中秋', 'The day preceding Chuseok': '中秋', 'The second day of Chuseok': '中秋',
    'National Foundation Day': '開天節', 'Hangul Day': '韓文日',
}


# Same English name, different holiday in Korea.
HOLIDAY_ZH_KR = {'Constitution Day': '制憲節'}


def holiday_zh(name, overrides=None):
    name = name.split(';')[0].strip()  # several holidays on one day: take the first
    for prefix in ('Alternative holiday for ', 'Substitute holiday for '):
        if name.startswith(prefix):
            return holiday_zh(name[len(prefix):], overrides) + '補假'
    if name.endswith(' (observed)'):
        return holiday_zh(name[:-len(' (observed)')], overrides) + '補假'
    if 'Election Day' in name:
        return '選舉日'
    return (overrides or {}).get(name) or HOLIDAY_ZH.get(name, name)


def market_holidays(today, until):
    """Weekday closures of the US (NYSE), Japanese (TSE) and Korean (KRX) markets. No network."""
    import holidays  # pip install holidays

    years = range(today.year, until.year + 1)
    jp = dict(holidays.country_holidays('JP', years=years, language='en_US'))
    kr = dict(holidays.country_holidays('KR', years=years, language='en_US'))
    for y in years:
        # TSE closes Dec 31 - Jan 3; KRX closes Labor Day and the last day of the year.
        jp.setdefault(dt.date(y, 12, 31), '年底')
        jp.setdefault(dt.date(y, 1, 2), '新年')
        jp.setdefault(dt.date(y, 1, 3), '新年')
        kr.setdefault(dt.date(y, 5, 1), 'Labor Day')
        kr.setdefault(dt.date(y, 12, 31), '年底')
    closed = {
        '美股': dict(holidays.financial_holidays('NYSE', years=years, language='en_US')),
        '日股': jp,
        '韓股': kr,
    }
    out = []
    for market, days in closed.items():
        for day, name in sorted(days.items()):
            if day.weekday() < 5 and today <= day <= until:
                label = f'{market}休市({holiday_zh(name, HOLIDAY_ZH_KR if market == "韓股" else None)})'
                out.append({'src': 'market_holidays', 'date': day.isoformat(), 'time': '', 'label': label})
    return out


PT = ZoneInfo('America/Los_Angeles')
MONTHS = {m: i for i, m in enumerate(
    ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'], 1)}


def nvidia(today, until):
    """NVIDIA's earnings call, from its official newsroom RSS ("NVIDIA Sets Conference Call for
    ...Financial Results", posted ~4 weeks ahead). The feed keeps only ~20 items, so a date found
    earlier is carried over from the previous events.json until it has passed."""
    import html as htmllib

    feed = get('https://nvidianews.nvidia.com/releases.xml', as_json=False)
    out = []
    for item in re.findall(r'<item>(.*?)</item>', feed, re.S):
        text = htmllib.unescape(re.sub(r'<!\[CDATA\[|\]\]>', '', item))
        title = re.search(r'<title>(.*?)</title>', text, re.S)
        if not title or not ('Conference Call' in title.group(1) and 'Financial Results' in title.group(1)):
            continue
        # e.g. "will host a conference call on Wednesday, Nov. 18, at 2 p.m. PT (5 p.m. ET)"
        when = re.search(r'conference call on \w+, (\w+)\.? (\d{1,2}),? at (\d{1,2})(?::(\d{2}))? ([ap])\.m\. PT', text)
        published = re.search(r'<pubDate>\w+, \d+ \w+ (\d{4})', text)
        if not when or not published:
            continue
        month, day = MONTHS[when.group(1)[:3].lower()], int(when.group(2))
        year = int(published.group(1))
        hour = int(when.group(3)) % 12 + (12 if when.group(5) == 'p' else 0)
        local = dt.datetime(year, month, day, hour, int(when.group(4) or 0), tzinfo=PT)
        if local.date() < today - dt.timedelta(days=60):  # e.g. a January call announced in December
            local = local.replace(year=year + 1)
        if today <= local.date() <= until:
            out.append(event('nvidia', '輝達財報', local.date(), local.strftime('%H:%M'), PT))

    if not out:
        old = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else []
        out = [e for e in old if e.get('src') == 'nvidia' and e['date'] >= today.isoformat()]
    return out


def main():
    today = dt.datetime.now(TW).date() - dt.timedelta(days=1)
    until = today + dt.timedelta(days=HORIZON_DAYS)
    old = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else []
    events, failed = [], []
    sources = (('fred', fred), ('fomc', fomc), ('ism', ism), ('tw_stocks', tw_stocks),
               ('market_holidays', market_holidays), ('nvidia', nvidia))
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
