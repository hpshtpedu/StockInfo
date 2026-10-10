"""Daily closing turnover share per TWSE industry index; writes docs/sector_history.json.

Source: TWSE 各類指數日成交量值 (BFIAMU). Share = an industry's turnover / the sum over all
industries (the 電子類 and 化學生技醫療類 aggregates are left out of the sum). Used for the
金融接棒 / 資金過度集中 badges (vs the 20-day average).

Each trading-day run fetches today, then backfills up to BACKFILL_PER_RUN older days towards
START, 3 s apart, so a year of history builds up over a few weeks without a burst.
"""
import datetime as dt
import json
import pathlib
import sys
import time
import urllib.request

OUT = pathlib.Path(__file__).resolve().parent.parent / 'docs' / 'sector_history.json'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
AGGREGATES = {'電子類指數', '化學生技醫療類指數'}
START = dt.date(2025, 1, 2)
BACKFILL_PER_RUN = 5
TW = dt.timezone(dt.timedelta(hours=8))


def is_trading_day():
    """Today's TAIEX close is in (taiex_history.py runs earlier in the same job): not a holiday."""
    taiex = OUT.parent / 'taiex_history.json'
    closes = json.loads(taiex.read_text(encoding='utf-8'))['closes'] if taiex.exists() else []
    return bool(closes) and closes[-1]['date'] == dt.datetime.now(TW).date().isoformat()


def shares_from_rows(rows):
    """[(name, turnover)] -> {short name: share %}, or None if empty."""
    value = {name.strip(): turnover for name, turnover in rows}
    total = sum(v for k, v in value.items() if k not in AGGREGATES)
    if not total:
        return None
    return {k.replace('類指數', ''): round(v / total * 100, 3) for k, v in value.items()}


def fetch(day):
    url = f'https://www.twse.com.tw/rwd/zh/afterTrading/BFIAMU?date={day:%Y%m%d}&response=json'
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=60) as res:
        data = json.loads(res.read().decode('utf-8-sig'))
    if data.get('stat') != 'OK' or data.get('date') != f'{day:%Y%m%d}':
        return None  # holiday or not published
    return shares_from_rows((r[0], float(r[2].replace(',', ''))) for r in data.get('data') or [])


def main():
    old = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {}
    days = {d['date']: d['shares'] for d in old.get('days', [])}
    closed = set(old.get('closed', []))  # weekdays with no data (holidays), so they aren't retried
    if not is_trading_day():
        print('market holiday: skip')
        return 0

    todo = [dt.datetime.now(TW).date()]
    day = min((dt.date.fromisoformat(d) for d in days), default=todo[0])
    while len(todo) < 1 + BACKFILL_PER_RUN and day > START:
        day -= dt.timedelta(days=1)
        if day.weekday() < 5 and day.isoformat() not in days and day.isoformat() not in closed:
            todo.append(day)

    for i, day in enumerate(todo):
        if i:
            time.sleep(3)  # TWSE asks clients to keep request rates low
        try:
            got = fetch(day)
        except Exception as err:
            print(f'{day}: {err}')
            continue
        if got:
            days[day.isoformat()] = got
        elif i:
            closed.add(day.isoformat())

    out = {'days': [{'date': d, 'shares': days[d]} for d in sorted(days)], 'closed': sorted(closed)}
    OUT.write_text(json.dumps(out, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'{len(days)} days, {sorted(days)[0]} .. {sorted(days)[-1]}; fetched {[d.isoformat() for d in todo]}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
