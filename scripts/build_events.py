"""Build docs/events.json: market-moving events in Taiwan time, for the dashboard calendar.

Dates come from official schedules and must be updated by hand when agencies publish new
ones (usually late in the prior year). US releases are listed in US Eastern time and
converted to Taipei time here, so daylight saving is handled automatically.

Sources:
  CPI, Employment Situation: https://www.bls.gov/schedule/news_release/
  PCE (Personal Income and Outlays): https://www.bea.gov/news/schedule
  Retail sales: https://www.census.gov/retail/release_schedule.html
  ISM PMI: https://www.ismworld.org/supply-management-news-and-reports/reports/rob-report-calendar/
  FOMC: https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
  TSMC: https://investor.tsmc.com/english/quarterly-results/teleconference
  NVIDIA: https://investor.nvidia.com (announced ~1 month ahead)
"""
import datetime as dt
import json
import pathlib
from zoneinfo import ZoneInfo

OUT = pathlib.Path(__file__).resolve().parent.parent / 'docs' / 'events.json'
ET = ZoneInfo('America/New_York')
TW = ZoneInfo('Asia/Taipei')

# (label, local time, timezone, [dates])
SCHEDULE = [
    ('美國CPI', '08:30', ET, ['2026-10-14', '2026-11-10', '2026-12-10']),
    ('非農就業', '08:30', ET, ['2026-11-06', '2026-12-04']),
    ('PCE物價', '08:30', ET, ['2026-10-29', '2026-11-25', '2026-12-23']),
    ('零售銷售', '08:30', ET, [
        '2026-10-15', '2026-11-17',  # Dec 2026 release: to be announced
        '2027-01-15', '2027-02-17', '2027-03-16', '2027-04-16', '2027-05-14', '2027-06-16',
        '2027-07-16', '2027-08-16', '2027-09-16', '2027-10-15', '2027-11-16', '2027-12-15',
    ]),
    ('ISM製造業PMI', '10:00', ET, ['2026-11-02', '2026-12-01']),
    ('ISM服務業PMI', '10:00', ET, ['2026-11-04', '2026-12-03']),
    # Decision at 14:00 ET on the second day of each meeting.
    ('FOMC利率決議', '14:00', ET, [
        '2026-10-28', '2026-12-09',
        '2027-01-27', '2027-03-17', '2027-04-28', '2027-06-09',
        '2027-07-28', '2027-09-15', '2027-10-27', '2027-12-08',
    ]),
    ('台積電法說會', '14:00', TW, ['2026-10-15']),
    # Not yet confirmed by NVIDIA; after the US close.
    ('輝達財報(預估)', '16:20', ET, ['2026-11-17']),
]


def main():
    events = []
    for label, hhmm, tz, dates in SCHEDULE:
        h, m = map(int, hhmm.split(':'))
        for d in dates:
            local = dt.datetime.fromisoformat(d).replace(hour=h, minute=m, tzinfo=tz)
            tw = local.astimezone(TW)
            events.append({'date': tw.strftime('%Y-%m-%d'), 'time': tw.strftime('%H:%M'), 'label': label})
    events.sort(key=lambda e: (e['date'], e['time']))
    OUT.write_text(json.dumps(events, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'{len(events)} events')
    for e in events[:12]:
        print(e)


if __name__ == '__main__':
    main()
