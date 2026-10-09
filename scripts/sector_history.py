"""Daily closing turnover share per TWSE industry index; appends to docs/sector_history.json.

Source: the Fugle heatmap page (one request a day, after the close). It has no history, so
this builds it up day by day for the 金融接棒 / 資金過度集中 badges (20-day averages).
"""
import json
import pathlib
import re
import sys
import urllib.request

OUT = pathlib.Path(__file__).resolve().parent.parent / 'docs' / 'sector_history.json'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
KEEP = 60


def main():
    req = urllib.request.Request('https://heatmap.fugle.tw/', headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as res:
        html = res.read().decode('utf-8', 'replace')
    head = re.search(r'"heatmap":\{"date":"(\d{4}-\d{2}-\d{2})","time":"(\d{2})(\d{2})', html)
    rows = re.findall(r'"type":"INDEX","symbol":"(IX\d+)","name":"([^"]+)"[^{}]*?"tradeValue":(\d+)', html)
    total = next((int(v) for s, _, v in rows if s == 'IX0001'), 0)
    if not head or not total:
        print('Fugle heatmap: no data')
        return 0
    date, hh, mm = head.group(1), int(head.group(2)), int(head.group(3))
    if hh * 60 + mm < 13 * 60 + 30:
        print(f'{date} {hh:02}:{mm:02}: not the closing snapshot yet')
        return 0

    shares = {re.sub(r'類指數$|指數$', '', name): round(int(v) / total * 100, 2)
              for s, name, v in rows if s != 'IX0001'}
    old = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {'days': []}
    days = [d for d in old['days'] if d['date'] != date] + [{'date': date, 'shares': shares}]
    days = sorted(days, key=lambda d: d['date'])[-KEEP:]
    OUT.write_text(json.dumps({'days': days}, ensure_ascii=False) + '\n', encoding='utf-8')
    print(date, len(days), {k: shares.get(k) for k in ('半導體', '金融保險')})
    return 0


if __name__ == '__main__':
    sys.exit(main())
