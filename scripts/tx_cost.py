"""外資台指期（TX）淨部位的推估均價 -> docs/tx_cost.json（台指期卡片「外資空單成本（估）」）。

這是自訂的估算模型（3d_rollover_net_oi_proxy_v1），不是期交所公布的外資持倉成本：
期交所只公布外資每天的買／賣方成交口數與契約金額、多／空未平倉口數，分不出開倉、平倉或換月。

資料：期交所「三大法人－區分各期貨契約－依日期」下載（futContractsDateDown，TXF），一次日期區間查詢。
模型：
  1. cycleStart＝最近一個「盤後資料已公布」的月結算日（每月第三個星期三，遇休市順延到下一個有資料的交易日）。
  2. 定錨：cycleStart 當天與前兩個交易日（共 3 天），依 cycleStart 淨部位方向，取該方向成交
     契約金額總和 ÷ 成交口數總和 ÷ 200（TX 每點 200 元）當初始均價。
  3. 之後每天：淨部位同方向且絕對值增加 → 增加的口數以當天該方向成交均價加權進去；
     減少或持平 → 均價不變；歸零 → flat；翻向或從 0 開始 → 用當天該方向成交均價重新定錨。
  淨 OI 的增減不等於真的新開倉口數，這只是可重現的估算規則。
資料有缺（交易日缺列、多空未平倉對不上）就不覆寫既有的 tx_cost.json。
"""
import datetime as dt
import json
import os
import pathlib
import sys
import tempfile
import urllib.parse
import urllib.request

DOCS = pathlib.Path(__file__).resolve().parent.parent / 'docs'
OUT = DOCS / 'tx_cost.json'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
TW = dt.timezone(dt.timedelta(hours=8))
MULT = 200  # TX：每指數點新臺幣 200 元；契約金額單位是千元
METHOD = '3d_rollover_net_oi_proxy_v1'
NEED = ['日期', '商品名稱', '身份別', '多方交易口數', '多方交易契約金額(千元)', '空方交易口數',
        '空方交易契約金額(千元)', '多方未平倉口數', '空方未平倉口數', '多空未平倉口數淨額']


def fetch_csv(start, end):
    body = urllib.parse.urlencode({'queryStartDate': f'{start:%Y/%m/%d}', 'queryEndDate': f'{end:%Y/%m/%d}',
                                   'commodityId': 'TXF'}).encode()
    req = urllib.request.Request('https://www.taifex.com.tw/cht/3/futContractsDateDown', data=body,
                                 headers={'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded'})
    with urllib.request.urlopen(req, timeout=60) as res:
        raw = res.read()
    for enc in ('utf-8-sig', 'cp950'):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    raise ValueError('CSV 無法解碼')


def parse(text):
    """CSV -> {date: row}，只留臺股期貨／外資，欄位依名稱對應。格式不對就丟例外。"""
    import csv
    lines = [l for l in text.splitlines() if l.strip()]
    if not lines or '<html' in text[:500].lower():
        raise ValueError('不是 CSV（可能是錯誤頁）')
    rows = list(csv.reader(lines))
    head = [h.strip().replace('（', '(').replace('）', ')') for h in rows[0]]
    missing = [k for k in NEED if k not in head]
    if missing:
        raise ValueError(f'CSV 缺欄位：{missing}')
    col = {k: head.index(k) for k in NEED}
    num = lambda r, k: int(r[col[k]].replace(',', '').strip())
    out = {}
    for r in rows[1:]:
        if len(r) < len(head):
            continue
        product, who = r[col['商品名稱']].strip(), r[col['身份別']].strip()
        if product not in ('臺股期貨', '台股期貨', 'TX') or who not in ('外資及陸資', '外資'):
            continue
        day = dt.datetime.strptime(r[col['日期']].strip(), '%Y/%m/%d').date()
        if day in out:
            raise ValueError(f'{day} 有重複的外資列')
        d = {k: num(r, k) for k in NEED[3:]}
        # 期交所公布過程中，當天那列可能先出現、未平倉卻還是 0（10/15 就遇到）：外資不可能多空單都 0，當作還沒公布
        if d['多方未平倉口數'] == 0 and d['空方未平倉口數'] == 0:
            continue
        if d['多方未平倉口數'] - d['空方未平倉口數'] != d['多空未平倉口數淨額']:
            raise ValueError(f'{day} 多空未平倉對不上')
        out[day] = d
    if not out:
        raise ValueError('CSV 裡沒有臺股期貨的外資資料')
    return out


def vwap(d, side):
    lots = d['多方交易口數' if side == 'long' else '空方交易口數']
    amount = d['多方交易契約金額(千元)' if side == 'long' else '空方交易契約金額(千元)']
    return amount * 1000 / (lots * MULT) if lots > 0 and amount > 0 else None


def third_wednesday(year, month):
    d = dt.date(year, month, 1)
    d += dt.timedelta(days=(2 - d.weekday()) % 7)
    return d + dt.timedelta(days=14)


def settlement(days, year, month):
    """該月結算日：第三個星期三，遇休市順延到下一個有資料的交易日（同月內）。沒資料回 None。"""
    wed = third_wednesday(year, month)
    later = [d for d in days if d >= wed and d.month == month]
    return min(later) if later else None


def estimate(data, trading_days=None):
    """data: {date: row}。回傳輸出 dict（cost 可能是 None）。trading_days 用來檢查有沒有缺交易日。"""
    days = sorted(data)
    as_of = days[-1]
    this_month = settlement(days, as_of.year, as_of.month)
    if this_month and this_month <= as_of:
        cycle = this_month
    else:
        prev = (as_of.replace(day=1) - dt.timedelta(days=1))
        cycle = settlement(days, prev.year, prev.month)
    out = {'asOf': as_of.isoformat(), 'cycleStart': cycle.isoformat() if cycle else None,
           'netOi': data[as_of]['多空未平倉口數淨額'], 'side': None, 'cost': None,
           'status': 'unavailable', 'method': METHOD}
    net = out['netOi']
    out['side'] = 'short' if net < 0 else 'long' if net > 0 else 'flat'
    if net == 0:
        out['status'] = 'flat'
        return out
    if not cycle:
        return out
    # 缺交易日就不推估（用加權指數有收盤的日子當交易日曆）
    if trading_days:
        span = [d for d in trading_days if cycle <= d <= as_of]
        if any(d not in data for d in span):
            return out
    window = [d for d in days if d <= cycle][-3:]
    if len(window) < 3:
        return out
    c_net = data[cycle]['多空未平倉口數淨額']
    if c_net == 0:
        return out
    side = 'short' if c_net < 0 else 'long'
    lots = sum(data[d]['空方交易口數' if side == 'short' else '多方交易口數'] for d in window)
    amount = sum(data[d]['空方交易契約金額(千元)' if side == 'short' else '多方交易契約金額(千元)'] for d in window)
    if lots <= 0 or amount <= 0:
        return out
    cost, prev_oi = amount * 1000 / (lots * MULT), c_net
    for d in [x for x in days if cycle < x <= as_of]:
        today = data[d]['多空未平倉口數淨額']
        if today == 0:
            cost = None
        elif prev_oi == 0 or (prev_oi > 0) != (today > 0) or cost is None:
            cost = vwap(data[d], 'short' if today < 0 else 'long')   # 翻向／從 0 開始：重新定錨
        elif abs(today) > abs(prev_oi):
            v = vwap(data[d], 'short' if today < 0 else 'long')
            if v is None:
                return out
            cost = (cost * abs(prev_oi) + v * (abs(today) - abs(prev_oi))) / abs(today)
        prev_oi = today
    if cost is not None and cost > 0:
        out['cost'] = round(cost, 2)
        out['status'] = 'ok'
    return out


def write_atomic(obj):
    text = json.dumps(obj, ensure_ascii=False) + '\n'
    json.loads(text)
    fd, tmp = tempfile.mkstemp(dir=DOCS, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(text)
    os.replace(tmp, OUT)


def main():
    today = dt.datetime.now(TW).date()
    # 一次查詢：涵蓋上個月結算日前兩個交易日到今天
    start = (today.replace(day=1) - dt.timedelta(days=1)).replace(day=1) - dt.timedelta(days=14)
    try:
        # 期交所不接受「還沒公布資料」的結束日期（回 DateTime error 的錯誤頁），就往前退一天，最多 4 天（週末）
        for back in range(5):
            text = fetch_csv(start, today - dt.timedelta(days=back))
            if 'DateTime error' not in text:
                break
        data = parse(text)
    except Exception as err:
        print(f'tx_cost: 資料抓取／解析失敗，不覆寫：{err}')
        return 0
    taiex = DOCS / 'taiex_history.json'
    trading = None
    if taiex.exists():
        trading = [dt.date.fromisoformat(c['date']) for c in json.loads(taiex.read_text(encoding='utf-8'))['closes']]
    out = estimate(data, trading)
    if out['status'] == 'unavailable' and OUT.exists():
        print(f'tx_cost: 無法推估（{out}），保留舊檔')
        return 0
    write_atomic(out)
    print(out)
    return 0


if __name__ == '__main__':
    sys.exit(main())
