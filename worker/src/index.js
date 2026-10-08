// Quote relay: aggregates Yahoo Finance + TAIFEX into one JSON for the dashboard.

const CACHE_SECONDS = 110;
const DELAY_GRACE_MIN = 20;

// delayMin: typical Yahoo feed delay, measured; shown when the market is not open.
const YAHOO = {
  sox: { name: '費半 SOX', symbol: '^SOX', digits: 2 },
  kospi: { name: 'KOSPI', symbol: '^KS11', digits: 2, delayMin: 20 },
  // Yahoo's trading period ignores the TSE lunch break (11:30-12:30 JST = 02:30-03:30 UTC).
  nikkei: { name: 'Nikkei 225', symbol: '^N225', digits: 2, delayMin: 15, breaksUtc: [[150, 210]] },
  tsm: { name: 'TSM', symbol: 'TSM', digits: 2 },
  brent: { name: 'Brent 原油', symbol: 'BZ=F', digits: 2, delayMin: 10 },
  usdtwd: { name: 'USD/TWD', symbol: 'TWD=X', digits: 3 },
  nq: { name: '小納 NQ', symbol: 'NQ=F', digits: 2, delayMin: 10 },
  us10y: { name: '美債 10Y', symbol: '^TNX', digits: 3, unit: 'yield' },
};

// Yahoo Taiwan: real-time TW indices and 台指期近一 (WTX&), fetched in one request.
const YAHOO_TW = {
  twii: { name: '加權指數', symbol: '^TWII', digits: 2 },
  otc: { name: '櫃買指數(OTC)', symbol: '^TWOII', digits: 2 },
  txf: { name: '台指期', symbol: 'WTX&', digits: 0 },
};

const BREADTH = { breadth: { name: '漲跌家數(上市)' } };

const CHIPS = {
  foreignOi: { name: '外資台指淨OI' },
  retailRatio: { name: '小台散戶多空比' },
};

const ORDER = ['twii', 'breadth', 'txf', 'otc', 'sox', 'tsm', 'nq', 'kospi', 'nikkei', 'usdtwd', 'brent', 'us10y', 'foreignOi', 'retailRatio'];

const NAMES = Object.fromEntries(
  Object.entries({ ...YAHOO, ...YAHOO_TW, ...BREADTH, ...CHIPS }).map(([id, cfg]) => [id, cfg.name]),
);

// TAIFEX publishes institutional positions once a day after the close (~15:00 Taipei).
const CHIPS_RETRY_SECONDS = 1800;
const HOLIDAYS_CACHE_SECONDS = 86400;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// Per-isolate fallback when an upstream call fails.
const lastGood = {};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(env) });
    if (url.pathname !== '/quotes') return new Response('Not found', { status: 404 });

    const cache = caches.default;
    const cacheKey = new Request(url.origin + '/quotes');
    const cached = await cache.match(cacheKey);
    if (cached) return withCors(cached, env);

    const body = JSON.stringify(await buildQuotes(url.origin, ctx));
    const response = new Response(body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
      },
    });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return withCors(response, env);
  },
};

async function buildQuotes(origin, ctx) {
  const tw = fetchYahooTw();
  const chips = fetchChips(origin, ctx);
  const pick = (promise, id) => promise.then((m) => m[id] ?? Promise.reject(new Error(`${id} no data`)));
  const jobs = {
    ...Object.fromEntries(Object.entries(YAHOO).map(([id, cfg]) => [id, fetchYahoo(cfg)])),
    twii: pick(tw, 'twii'),
    otc: pick(tw, 'otc'),
    txf: pick(tw, 'txf').catch(() => fetchTaifex()),
    breadth: fetchBreadth(),
    foreignOi: pick(chips, 'foreignOi'),
    retailRatio: pick(chips, 'retailRatio'),
  };

  const quotes = await Promise.all(
    ORDER.map(async (id) => {
      try {
        const q = { id, ...(await jobs[id]) };
        lastGood[id] = q;
        return q;
      } catch (err) {
        if (lastGood[id]) return { ...lastGood[id], stale: true };
        return { id, name: NAMES[id], error: String(err.message || err) };
      }
    }),
  );

  const [holidays, institutional, sectors, margin] = await Promise.all([
    fetchHolidays(origin, ctx).catch(() => []),
    fetchInstitutional(origin, ctx).catch(() => null),
    fetchSectors(origin, ctx).catch(() => null),
    fetchMargin(origin, ctx).catch(() => null),
  ]);
  return { updated: Date.now(), quotes, holidays, institutional, sectors, margin };
}

// TWSE (上市) margin maintenance ratio and balance change, from the website reports published
// ~21:00 Taipei. ratio = sum(margin lots * 1000 * close) / total margin amount.
async function fetchMargin(origin, ctx) {
  const cache = caches.default;
  const key = new Request(origin + '/_margin');
  const lastKey = new Request(origin + '/_margin_last');
  const cached = await cache.match(key);
  if (cached) return cached.json();

  const last = await cache.match(lastKey).then((r) => (r ? r.json() : null));
  const get = async (url) => {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`TWSE HTTP ${res.status}`);
    return res.json();
  };
  const table = (report, title) => report.tables?.find((t) => (t.title ?? '').includes(title));
  const num = (s) => Number(String(s).replace(/,/g, ''));

  // Without a date the report returns the latest day that has margin data.
  const margin = await get('https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?selectType=ALL&response=json');
  if (margin.stat !== 'OK') throw new Error('TWSE MI_MARGN no data');
  const ymd = margin.date;
  if (last?.date === `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6)}`) {
    // Nothing new yet: keep serving the last result and check again later.
    ctx.waitUntil(cache.put(key, new Response(JSON.stringify(last), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${dailyTtl(ymd, 21, 900)}` },
    })));
    return last;
  }

  const amountRow = table(margin, '信用交易統計').data.find((r) => r[0].startsWith('融資金額'));
  const amount = num(amountRow[5]) * 1000;      // 今日餘額 (仟元 -> 元)
  const amountPrev = num(amountRow[4]) * 1000;  // 前日餘額
  const lots = table(margin, '融資融券彙總').data.map((r) => [r[0], num(r[6])]);  // 融資今日餘額 (張)

  const quotes = await get(`https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=${ymd}&type=ALLBUT0999&response=json`);
  const closeTable = table(quotes, '每日收盤行情');
  if (quotes.date !== ymd || !closeTable) throw new Error('TWSE MI_INDEX not ready');
  const price = new Map(closeTable.data.map((r) => [r[0], num(r[8])]));
  const marketValue = lots.reduce((s, [code, n]) => s + (price.get(code) > 0 ? n * 1000 * price.get(code) : 0), 0);

  const out = {
    date: `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6)}`,
    ratio: Math.round((marketValue / amount) * 10000) / 100,
    balance: Math.round(amount / 1e6) / 100,                       // 億元
    balanceChange: Math.round((amount - amountPrev) / 1e6) / 100,  // 億元
    prev: last?.ratio ?? null,  // previous trading day's ratio, if this colo still has it
  };
  const store = (k, ttl) => cache.put(k, new Response(JSON.stringify(out), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` },
  }));
  ctx.waitUntil(store(key, dailyTtl(ymd, 21, 900)));
  ctx.waitUntil(store(lastKey, 7 * 86400));
  return out;
}

// Every 30 min during the session, but expire right after the 13:30 close and retry every 5 min
// until the closing snapshot is in; then hold until the next morning.
function sectorsTtl(dataTime) {
  const tw = new Date(Date.now() + 8 * 3600 * 1000);
  const mins = tw.getUTCHours() * 60 + tw.getUTCMinutes();
  const weekday = tw.getUTCDay() >= 1 && tw.getUTCDay() <= 5;
  const CLOSE = 13 * 60 + 33;
  if (!weekday || mins < 9 * 60) return 6 * 3600;
  if (mins < CLOSE) return Math.max(60, Math.min(1800, (CLOSE - mins) * 60));
  const data = new Date(dataTime + 8 * 3600 * 1000);
  const today = data.getUTCDate() === tw.getUTCDate();
  if (!today) return 1800;  // market holiday: the page still shows the last session
  return data.getUTCHours() * 60 + data.getUTCMinutes() >= 13 * 60 + 30 ? 6 * 3600 : 300;
}

// Electronics = TWSE's eight electronic sub-industries.
const ELECTRONICS = new Set(['IX0028', 'IX0029', 'IX0030', 'IX0031', 'IX0032', 'IX0033', 'IX0034', 'IX0035']);

// Intraday turnover share by industry, from the TWSE industry indices embedded in Fugle's public
// heat map page (robots.txt allows all). Cached 30 min in market hours, 6 h otherwise.
async function fetchSectors(origin, ctx) {
  const cache = caches.default;
  const key = new Request(origin + '/_sectors');
  const lastKey = new Request(origin + '/_sectors_last');
  const cached = await cache.match(key);
  if (cached) return cached.json();

  try {
    const res = await fetch('https://heatmap.fugle.tw/', { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`Fugle heatmap HTTP ${res.status}`);
    const html = await res.text();
    const head = html.match(/"heatmap":\{"date":"(\d{4})-(\d{2})-(\d{2})","time":"(\d{2})(\d{2})(\d{2})"/);
    // Pick out only the ~33 index rows instead of parsing the whole page (Worker CPU limit).
    const rows = [...html.matchAll(/"type":"INDEX","symbol":"(IX\d+)","name":"([^"]+)"[^{}]*?"tradeValue":(\d+)/g)]
      .map(([, symbol, name, value]) => ({ symbol, name: name.replace(/類指數$|指數$/, ''), value: Number(value) }));
    const total = rows.find((r) => r.symbol === 'IX0001')?.value;
    if (!head || !total) throw new Error('Fugle heatmap: no data');

    const industries = rows.filter((r) => r.symbol !== 'IX0001');
    const electronics = industries.filter((r) => ELECTRONICS.has(r.symbol)).reduce((s, r) => s + r.value, 0);
    const [, y, mo, d, h, mi, s] = head.map(Number);
    const out = {
      time: Date.UTC(y, mo - 1, d, h - 8, mi, s),
      electronics: (electronics / total) * 100,
      top: industries
        .sort((a, b) => b.value - a.value)
        .slice(0, 8)
        .map((r) => ({ name: r.name, share: (r.value / total) * 100 })),
    };

    const store = (k, ttl) => cache.put(k, new Response(JSON.stringify(out), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` },
    }));
    ctx.waitUntil(store(key, sectorsTtl(out.time)));
    ctx.waitUntil(store(lastKey, 3 * 86400));
    return out;
  } catch (err) {
    const last = await cache.match(lastKey);
    if (!last) throw err;
    return { ...(await last.json()), stale: true };
  }
}

// TWSE 三大法人買賣金額 (BFI82U), latest trading day, in NT$ 億. Published ~15:00 Taipei.
async function fetchInstitutional(origin, ctx) {
  const cache = caches.default;
  const key = new Request(origin + '/_institutional');
  const cached = await cache.match(key);
  if (cached) return cached.json();

  const res = await fetch('https://www.twse.com.tw/rwd/zh/fund/BFI82U?type=day&response=json', { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`TWSE BFI82U HTTP ${res.status}`);
  const data = await res.json();
  if (data.stat !== 'OK') throw new Error('TWSE BFI82U no data');

  const net = Object.fromEntries(data.data.map((r) => [r[0], Number(r[3].replace(/,/g, '')) / 1e8]));
  const sum = (prefix) => Object.entries(net).filter(([k]) => k.startsWith(prefix)).reduce((s, [, v]) => s + v, 0);
  const out = {
    date: `${data.date.slice(0, 4)}-${data.date.slice(4, 6)}-${data.date.slice(6, 8)}`,
    foreign: sum('外資'),   // 外資及陸資 + 外資自營商
    trust: sum('投信'),
    dealer: sum('自營商'),  // 自行買賣 + 避險
    total: net['合計'],
  };

  ctx.waitUntil(cache.put(key, new Response(JSON.stringify(out), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${dailyTtl(data.date, 15)}` },
  })));
  return out;
}

// Cache TTL for data published once per trading day at publishHour (Taipei).
function dailyTtl(dataDate, publishHour, retrySeconds = 300) {
  const tw = new Date(Date.now() + 8 * 3600 * 1000);
  const today = tw.toISOString().slice(0, 10).replace(/-/g, '');
  const secondsUntil = (dayOffset, hour) =>
    Math.round(Math.max(60, (Date.UTC(tw.getUTCFullYear(), tw.getUTCMonth(), tw.getUTCDate() + dayOffset, hour) - tw.getTime()) / 1000));
  const weekend = tw.getUTCDay() === 0 || tw.getUTCDay() === 6;
  if (dataDate === today || weekend) return secondsUntil(1, publishHour);
  if (tw.getUTCHours() < publishHour) return secondsUntil(0, publishHour);
  return retrySeconds;
}

// TWSE market holidays as [{ date: "YYYY-MM-DD", name }], used by the calendar.
async function fetchHolidays(origin, ctx) {
  const cache = caches.default;
  const key = new Request(origin + '/_holidays_v2');
  const cached = await cache.match(key);
  if (cached) return cached.json();

  const res = await fetch('https://openapi.twse.com.tw/v1/holidaySchedule/holidaySchedule', { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`TWSE HTTP ${res.status}`);
  // Rows like 國曆新年開始交易日 / 農曆春節前最後交易日 are trading days; Date is ROC "1151009".
  const out = (await res.json())
    .filter((r) => !r.Name.includes('交易日'))
    .map((r) => {
      const [m, d] = [Number(r.Date.slice(3, 5)), Number(r.Date.slice(5, 7))];
      // e.g. "國慶日為10月10日適逢星期六，於10月9日（星期五）補假。"
      const bridge = (r.Description ?? '').includes(`於${m}月${d}日`) && r.Description.includes('補假');
      return {
        date: `${1911 + Number(r.Date.slice(0, 3))}-${r.Date.slice(3, 5)}-${r.Date.slice(5, 7)}`,
        // "市場無交易，僅辦理結算交割作業" (days around Lunar New Year) has no holiday name.
        name: r.Name.includes('無交易') ? '' : r.Name.replace(/\s+/g, '') + (bridge ? '補假' : ''),
      };
    });

  ctx.waitUntil(cache.put(key, new Response(JSON.stringify(out), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${HOLIDAYS_CACHE_SECONDS}` },
  })));
  return out;
}

async function fetchYahoo({ name, symbol, digits, unit, delayMin, breaksUtc }) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=1d`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Yahoo ${symbol} HTTP ${res.status}`);
  const meta = (await res.json())?.chart?.result?.[0]?.meta;
  if (!meta || meta.regularMarketPrice == null) throw new Error(`Yahoo ${symbol} no data`);

  const price = meta.regularMarketPrice;
  const prev = meta.chartPreviousClose ?? meta.previousClose;
  return {
    name,
    symbol,
    source: 'Yahoo',
    digits,
    unit,
    delayMin,
    price,
    prev,
    change: prev != null ? price - prev : null,
    changePct: prev ? ((price - prev) / prev) * 100 : null,
    time: meta.regularMarketTime * 1000,
    state: marketState(meta, breaksUtc),
  };
}

// 'open' | 'lunch' | 'closed' (outside the session) | 'holiday' (in session, no trades yet).
// Breaks are [startMin, endMin] in minutes after 00:00 UTC.
function marketState(meta, breaksUtc = []) {
  const period = meta.currentTradingPeriod?.regular;
  if (!period) return undefined;
  const now = Date.now() / 1000;
  if (now < period.start || now >= period.end) return 'closed';
  const d = new Date();
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000;
  // Delayed feeds keep showing pre-break trades for a while, so stretch the break
  // until a post-break trade shows up (at most DELAY_GRACE_MIN).
  const inBreak = breaksUtc.some(([s, e]) =>
    mins >= s && (mins < e || (mins < e + DELAY_GRACE_MIN && meta.regularMarketTime < midnight + e * 60)));
  if (inBreak) return 'lunch';
  // No trade since the session started means a holiday (or delayed data not yet past the open).
  if (meta.regularMarketTime < period.start) return 'holiday';
  return 'open';
}

// Yahoo Taiwan works from Cloudflare egress, unlike TAIFEX MIS. Returns { id: quote }.
async function fetchYahooTw() {
  const symbols = encodeURIComponent(JSON.stringify(Object.values(YAHOO_TW).map((c) => c.symbol)));
  const url = `https://tw.stock.yahoo.com/_td-stock/api/resource/FinanceChartService.ApacLibraCharts;symbols=${symbols};type=tick`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Yahoo TW HTTP ${res.status}`);
  const bySymbol = Object.fromEntries((await res.json()).map((x) => [x.symbol, x.chart]));

  const out = {};
  for (const [id, { name, symbol, digits }] of Object.entries(YAHOO_TW)) {
    const chart = bySymbol[symbol];
    const meta = chart?.meta;
    if (!meta || meta.regularMarketPrice == null) continue;
    const price = meta.regularMarketPrice;
    const prev = meta.previousClose ?? meta.chartPreviousClose;
    out[id] = {
      name,
      symbol,
      source: 'Yahoo TW',
      digits,
      price,
      prev,
      change: prev != null ? price - prev : null,
      changePct: prev ? ((price - prev) / prev) * 100 : null,
      // Yahoo TW stamps the end of the current minute bar, which can be ahead of now.
      time: Math.min(meta.regularMarketTime * 1000, Date.now()),
      state: marketState(meta),
    };
    // TAIEX per-minute volume is turnover in NT$ millions; the sum is today's cumulative turnover.
    if (id === 'twii') {
      out[id].turnover = (chart.indicators?.quote?.[0]?.volume ?? []).reduce((sum, v) => sum + (v || 0), 0);
      out[id].candles = candles30(chart);
    }
  }
  return out;
}

// 1-minute bars -> 30-minute [open, high, low, close] for the 09:00-13:30 session (9 slots,
// null where no trades yet). The 13:30 closing auction is folded into the last slot.
function candles30(chart) {
  const ts = chart.timestamp ?? [];
  const q = chart.indicators?.quote?.[0] ?? {};
  const slots = Array(9).fill(null);
  ts.forEach((t, i) => {
    const [o, h, l, c] = [q.open?.[i], q.high?.[i], q.low?.[i], q.close?.[i]];
    if ([o, h, l, c].some((v) => v == null)) return;
    const tw = new Date((t + 8 * 3600) * 1000);
    const slot = Math.min(8, Math.floor((tw.getUTCHours() * 60 + tw.getUTCMinutes() - 540) / 30));
    if (slot < 0) return;
    const s = slots[slot];
    slots[slot] = s ? [s[0], Math.max(s[1], h), Math.min(s[2], l), c] : [o, h, l, c];
  });
  return slots.map((s) => s && s.map((v) => Math.round(v * 100) / 100));
}

// Listed (TWSE) advancers/decliners from Yahoo TW's index metadata, intraday.
async function fetchBreadth() {
  const url = 'https://tw.stock.yahoo.com/_td-stock/api/resource/StockServices.stockList;fields=indexMeta;symbols=%5ETWII';
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Yahoo TW breadth HTTP ${res.status}`);
  const [row] = await res.json();
  const im = row?.indexMeta;
  if (!im?.upCount) throw new Error('Yahoo TW breadth no data');
  const n = (k) => Number(im[k]?.raw ?? 0);
  return {
    name: BREADTH.breadth.name,
    symbol: '^TWII',
    source: 'Yahoo TW',
    kind: 'breadth',
    up: n('upCount'),
    down: n('downCount'),
    flat: n('unchangeCount'),
    limitUp: n('limitUpCount'),
    limitDown: n('limitDownCount'),
    time: Math.min(Date.parse(row.regularMarketTime), Date.now()),
  };
}

// TAIFEX OpenAPI daily data: foreign net OI in TX, and the MTX retail long/short ratio
// = -(institutional MTX net OI) / (MTX total OI). Cached separately since it changes daily.
async function fetchChips(origin, ctx) {
  const cache = caches.default;
  const key = new Request(origin + '/_chips_v2');
  const lastKey = new Request(origin + '/_chips_last');
  const cached = await cache.match(key);
  if (cached) return cached.json();

  try {
    const { out, date } = await computeChips();
    const store = (k, ttl) => cache.put(k, new Response(JSON.stringify(out), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` },
    }));
    // The daily report is ~800KB, so avoid refetching it once today's data is in hand.
    ctx.waitUntil(store(key, dailyTtl(date, 14, CHIPS_RETRY_SECONDS)));
    ctx.waitUntil(store(lastKey, 7 * 86400));
    return out;
  } catch (err) {
    // Fall back to the last good result so a bad upstream response does not blank the cards.
    const last = await cache.match(lastKey);
    if (!last) throw err;
    const out = await last.json();
    for (const q of Object.values(out)) q.stale = true;
    return out;
  }
}

// TAIFEX OpenAPI serves JSON or CSV (Chinese headers) depending on the edge.
// fields: { name: [jsonKey, csvHeaderRegex] } -> rows of { name: string }.
function parseTaifex(text, fields) {
  text = text.replace(/^﻿/, '').trim();
  const entries = Object.entries(fields);
  if (text.startsWith('[')) {
    return JSON.parse(text).map((r) => Object.fromEntries(entries.map(([k, [jsonKey]]) => [k, String(r[jsonKey] ?? '')])));
  }
  const [header, ...rows] = text.split(/\r?\n/).map((l) => l.split(',').map((c) => c.trim().replace(/^"|"$/g, '')));
  const idx = entries.map(([k, [, re]]) => [k, header.findIndex((h) => re.test(h))]);
  const missing = idx.filter(([, i]) => i < 0).map(([k]) => k);
  if (missing.length) throw new Error(`TAIFEX CSV missing ${missing.join(',')}`);
  return rows.map((r) => Object.fromEntries(idx.map(([k, i]) => [k, r[i] ?? ''])));
}

// TAIFEX website CSV downloads (Big5). They publish ~15:00, hours before the OpenAPI catches up.
async function taifexWebCsv(path, form) {
  const res = await fetch(`https://www.taifex.com.tw/cht/3/${path}`, {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
  });
  if (!res.ok) throw new Error(`TAIFEX web HTTP ${res.status}`);
  const text = new TextDecoder('big5').decode(await res.arrayBuffer());
  if (text.trim().split(/\r?\n/).length < 2) throw new Error('TAIFEX web: not published yet');
  return text;
}

// Today's data from the website when available, else the OpenAPI (usually the previous day).
async function fetchChipsSources() {
  const tw = new Date(Date.now() + 8 * 3600 * 1000);
  const day = tw.toISOString().slice(0, 10).replace(/-/g, '/');
  try {
    const [inst, daily] = await Promise.all([
      taifexWebCsv('futContractsDateDown', { queryStartDate: day, queryEndDate: day, commodityId: '' }),
      taifexWebCsv('futDataDown', { down_type: '1', commodity_id: 'MTX', commodity_id2: '', queryStartDate: day, queryEndDate: day }),
    ]);
    return { inst, daily, source: 'TAIFEX web' };
  } catch {
    const base = 'https://openapi.taifex.com.tw/v1/';
    const [instRes, dailyRes] = await Promise.all([
      fetch(base + 'MarketDataOfMajorInstitutionalTradersDetailsOfFuturesContractsBytheDate', { headers: { 'User-Agent': UA } }),
      fetch(base + 'DailyMarketReportFut', { headers: { 'User-Agent': UA } }),
    ]);
    if (!instRes.ok || !dailyRes.ok) throw new Error(`TAIFEX OpenAPI HTTP ${instRes.status}/${dailyRes.status}`);
    return { inst: await instRes.text(), daily: await dailyRes.text(), source: 'TAIFEX' };
  }
}

async function computeChips() {
  const src = await fetchChipsSources();
  const inst = parseTaifex(src.inst, {
    date: ['Date', /^日期$/],
    contract: ['ContractCode', /^商品名稱$/],
    item: ['Item', /^身份/],
    oiLong: ['OpenInterest(Long)', /^多方未平倉口數$/],
    oiShort: ['OpenInterest(Short)', /^空方未平倉口數$/],
    oiNet: ['OpenInterest(Net)', /^多空未平倉口數淨額$/],
  });
  const foreign = inst.find((r) => r.contract === '臺股期貨' && r.item.startsWith('外資'));
  const mtxInstNet = inst
    .filter((r) => r.contract.startsWith('小型臺指'))
    .reduce((sum, r) => sum + Number(r.oiNet), 0);

  // After-hours rows carry "-" as OI and spreads have "/" in the month, so both drop out.
  const daily = parseTaifex(src.daily, {
    contract: ['Contract', /^契約/],
    month: ['ContractMonth(Week)', /^到期月份/],
    oi: ['OpenInterest', /^未沖銷契約數$/],
  });
  const mtxOi = daily
    .filter((r) => r.contract === 'MTX' && !r.month.includes('/') && /^\d+$/.test(r.oi))
    .reduce((sum, r) => sum + Number(r.oi), 0);
  if (!foreign || !mtxOi || Number.isNaN(mtxInstNet)) throw new Error('TAIFEX OpenAPI no data');

  const date = foreign.date.replace(/\D/g, ''); // YYYYMMDD
  const dataDate = `${+date.slice(4, 6)}/${+date.slice(6, 8)}`;
  const time = Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8), 15 - 8);
  const ratio = (-mtxInstNet / mtxOi) * 100;
  const out = {
    foreignOi: {
      name: CHIPS.foreignOi.name,
      symbol: 'TX',
      source: src.source,
      kind: 'daily',
      unit: 'lots',
      digits: 0,
      price: Number(foreign.oiNet),
      detail: `多${wan(foreign.oiLong)} 空${wan(foreign.oiShort)}`,
      dataDate,
      time,
    },
    retailRatio: {
      name: CHIPS.retailRatio.name,
      symbol: 'MTX',
      source: src.source,
      kind: 'daily',
      unit: 'ratio',
      digits: 2,
      price: ratio,
      detail: ratio >= 0 ? '散戶偏多' : '散戶偏空',
      dataDate,
      time,
    },
  };
  return { out, date };
}

// TAIFEX MIS (fallback): MarketType 0 = day session (08:45-13:45 TW), 1 = night session.
async function fetchTaifex() {
  const first = isDaySession() ? '0' : '1';
  const second = first === '0' ? '1' : '0';
  return (await queryTaifex(first)) ?? (await queryTaifex(second)) ?? Promise.reject(new Error('TAIFEX no data'));
}

async function queryTaifex(marketType) {
  const res = await fetch('https://mis.taifex.com.tw/futures/api/getQuoteList', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({
      MarketType: marketType,
      SymbolType: 'F',
      KindID: '1',
      CID: 'TXF',
      ExpireMonth: '',
      RowSize: '全部',
      PageNo: '',
      SortColumn: '',
      AscDesc: 'A',
    }),
  });
  if (!res.ok) throw new Error(`TAIFEX HTTP ${res.status}`);
  const list = (await res.json())?.RtData?.QuoteList ?? [];

  // First entry is the spot index (TXF-S); the next one is the near-month contract.
  const near = list.find((q) => q.SymbolID !== 'TXF-S' && !q.SymbolID.includes('/'));
  const price = parseFloat(near?.CLastPrice);
  if (!near || Number.isNaN(price)) return null;

  const prev = parseFloat(near.CRefPrice);
  return {
    name: marketType === '0' ? '台指期 近月' : '台指期 近月(夜)',
    symbol: near.SymbolID,
    source: 'TAIFEX',
    digits: 0,
    price,
    prev,
    change: price - prev,
    changePct: ((price - prev) / prev) * 100,
    time: taipeiTime(near.CDate, near.CTime),
  };
}

function isDaySession() {
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const weekday = now.getUTCDay();
  return weekday >= 1 && weekday <= 5 && mins >= 8 * 60 + 45 && mins <= 13 * 60 + 45;
}

// CDate "YYYYMMDD", CTime "HHMMSS" in Taipei time (UTC+8).
function taipeiTime(cdate, ctime) {
  const today = new Date(Date.now() + 8 * 3600 * 1000);
  const d = /^\d{8}$/.test(cdate ?? '')
    ? [+cdate.slice(0, 4), +cdate.slice(4, 6), +cdate.slice(6, 8)]
    : [today.getUTCFullYear(), today.getUTCMonth() + 1, today.getUTCDate()];
  const t = (ctime ?? '000000').padStart(6, '0');
  return Date.UTC(d[0], d[1] - 1, d[2], +t.slice(0, 2) - 8, +t.slice(2, 4), +t.slice(4, 6));
}

// 12968 -> "1.3萬", 8500 -> "8,500"
function wan(n) {
  n = Number(n);
  return n >= 10000 ? `${(n / 10000).toFixed(1)}萬` : n.toLocaleString('en-US');
}

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };
}

function withCors(response, env) {
  const r = new Response(response.body, response);
  for (const [k, v] of Object.entries(corsHeaders(env))) r.headers.set(k, v);
  return r;
}
