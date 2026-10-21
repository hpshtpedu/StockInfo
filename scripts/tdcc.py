"""集保戶股權分散表（TDCC 開放資料，每週更新上週五的資料）-> docs/tdcc.json：持股四檔各級距的人數、股數。

網頁在登入（私人頁解鎖）後，用自己的張數算「股東 PR」（贏過多少 % 的股東）；張數不離開瀏覽器。
來源：https://opendata.tdcc.com.tw/getOD.ashx?id=1-5（全市場一個 CSV，約 2.4MB）。資料日期是週五，集保週日更新，
所以只在手上的資料超過 8 天（下一週的應該出來了）才下載，一週約一次；抓不到或格式不對就保留舊檔。
"""
import csv
import datetime as dt
import io
import json
import pathlib
import sys
import urllib.request

OUT = pathlib.Path(__file__).resolve().parent.parent / 'docs' / 'tdcc.json'
URL = 'https://opendata.tdcc.com.tw/getOD.ashx?id=1-5'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
CODES = ['2330', '0056', '00878', '00685L']
TW = dt.timezone(dt.timedelta(hours=8))


def main():
    old = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {}
    today = dt.datetime.now(TW).date()
    if old.get('date') and (today - dt.date.fromisoformat(old['date'])).days < 9:
        print(f"tdcc: have {old['date']}, next week's not due yet")
        return 0
    try:
        req = urllib.request.Request(URL, headers={'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=120) as res:
            text = res.read().decode('utf-8-sig')
        rows = list(csv.reader(io.StringIO(text)))
        if rows[0][:4] != ['資料日期', '證券代號', '持股分級', '人數']:
            raise ValueError(f'unexpected header {rows[0]}')
        out = {}
        date = None
        for r in rows[1:]:
            code = r[1].strip()
            if code in CODES:
                date = r[0]
                level = int(r[2])
                if 1 <= level <= 15:  # 16 差異數調整、17 合計不要
                    out.setdefault(code, [0] * 15)[level - 1] = int(r[3])
        if not date or any(c not in out for c in CODES):
            raise ValueError(f'missing codes: {[c for c in CODES if c not in out]}')
    except Exception as err:
        print(f'tdcc: fetch/parse failed, keeping old file: {err}')
        return 0
    iso = f'{date[:4]}-{date[4:6]}-{date[6:]}'
    if iso == old.get('date'):
        print(f'tdcc: still {iso}')
        return 0
    OUT.write_text(json.dumps({'date': iso, 'people': out}) + '\n', encoding='utf-8')
    print(iso, {c: sum(v) for c, v in out.items()})
    return 0


if __name__ == '__main__':
    sys.exit(main())
