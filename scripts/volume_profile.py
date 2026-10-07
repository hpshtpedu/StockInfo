"""Build the TWSE intraday turnover profile and write docs/volume_profile.json.

For each minute 09:00-13:30, the average share of the day's final turnover already traded,
over the last N trading days (TWSE MI_5MINS). The dashboard estimates full-day turnover as
current cumulative turnover / share at the current minute. Stdlib only.
"""
import datetime as dt
import json
import pathlib
import sys
import time
import urllib.request

OUT = pathlib.Path(__file__).resolve().parent.parent / 'docs' / 'volume_profile.json'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
DAYS = 5


def fetch_day(day):
    url = f'https://www.twse.com.tw/rwd/zh/afterTrading/MI_5MINS?date={day:%Y%m%d}&response=json'
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as res:
        data = json.loads(res.read().decode('utf-8-sig'))
    if data.get('stat') != 'OK' or not data.get('data'):
        return None
    # Rows every 5 seconds: [時間, ..., 累積成交金額(百萬)]; keep whole minutes only.
    cum = {r[0][:5]: float(r[-1].replace(',', '')) for r in data['data'] if r[0].endswith(':00')}
    final = cum.get('13:30')
    return {m: v / final for m, v in cum.items()} if final else None


def main():
    shares, dates = [], []
    day = dt.date.today()
    for _ in range(14):  # look back far enough to find DAYS trading days
        if len(shares) == DAYS:
            break
        if day.weekday() < 5:
            share = fetch_day(day)
            if share:
                shares.append(share)
                dates.append(day.isoformat())
            time.sleep(3)  # TWSE asks clients to keep request rates low
        day -= dt.timedelta(days=1)

    if not shares:
        print('no data')
        return 1
    minutes = sorted(set.intersection(*(set(s) for s in shares)))
    profile = {m: round(sum(s[m] for s in shares) / len(shares), 4) for m in minutes}
    OUT.write_text(json.dumps({'dates': dates, 'share': profile}) + '\n', encoding='utf-8')
    print(dates, len(profile), 'minutes;', {m: profile[m] for m in ('09:30', '11:00', '13:00', '13:25') if m in profile})
    return 0


if __name__ == '__main__':
    sys.exit(main())
