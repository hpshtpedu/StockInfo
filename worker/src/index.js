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
  otc: { name: '櫃買指數', symbol: '^TWOII', digits: 2 },
  txf: { name: '台指期 近一', symbol: 'WTX&', digits: 0 },
};

const CHIPS = {
  foreignOi: { name: '外資台指淨OI' },
  retailRatio: { name: '小台散戶多空比' },
};

const ORDER = ['twii', 'otc', 'txf', 'sox', 'kospi', 'nikkei', 'tsm', 'usdtwd', 'brent', 'nq', 'us10y', 'foreignOi', 'retailRatio'];

const NAMES = Object.fromEntries(
  Object.entries({ ...YAHOO, ...YAHOO_TW, ...CHIPS }).map(([id, cfg]) => [id, cfg.name]),
);

// TAIFEX publishes institutional positions once a day after the close.
const CHIPS_CACHE_SECONDS = 1800;
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

  const holidays = await fetchHolidays(origin, ctx).catch(() => []);
  return { updated: Date.now(), quotes, holidays };
}

// TWSE market holidays as ["YYYY-MM-DD"], used by the settlement calendar.
async function fetchHolidays(origin, ctx) {
  const cache = caches.default;
  const key = new Request(origin + '/_holidays');
  const cached = await cache.match(key);
  if (cached) return cached.json();

  const res = await fetch('https://openapi.twse.com.tw/v1/holidaySchedule/holidaySchedule', { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`TWSE HTTP ${res.status}`);
  // Rows like 國曆新年開始交易日 / 農曆春節前最後交易日 are trading days; Date is ROC "1151009".
  const out = (await res.json())
    .filter((r) => !r.Name.includes('交易日'))
    .map((r) => `${1911 + Number(r.Date.slice(0, 3))}-${r.Date.slice(3, 5)}-${r.Date.slice(5, 7)}`);

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
  const bySymbol = Object.fromEntries((await res.json()).map((x) => [x.symbol, x.chart?.meta]));

  const out = {};
  for (const [id, { name, symbol, digits }] of Object.entries(YAHOO_TW)) {
    const meta = bySymbol[symbol];
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
  }
  return out;
}

// TAIFEX OpenAPI daily data: foreign net OI in TX, and the MTX retail long/short ratio
// = -(institutional MTX net OI) / (MTX total OI). Cached separately since it changes daily.
async function fetchChips(origin, ctx) {
  const cache = caches.default;
  const key = new Request(origin + '/_chips');
  const cached = await cache.match(key);
  if (cached) return cached.json();

  const base = 'https://openapi.taifex.com.tw/v1/';
  const [instRes, dailyRes] = await Promise.all([
    fetch(base + 'MarketDataOfMajorInstitutionalTradersDetailsOfFuturesContractsBytheDate', { headers: { 'User-Agent': UA } }),
    fetch(base + 'DailyMarketReportFut', { headers: { 'User-Agent': UA } }),
  ]);
  if (!instRes.ok || !dailyRes.ok) throw new Error(`TAIFEX OpenAPI HTTP ${instRes.status}/${dailyRes.status}`);

  const inst = JSON.parse((await instRes.text()).replace(/^﻿/, ''));
  const foreign = inst.find((r) => r.ContractCode === '臺股期貨' && r.Item === '外資及陸資');
  const mtxInstNet = inst
    .filter((r) => r.ContractCode === '小型臺指期貨')
    .reduce((sum, r) => sum + Number(r['OpenInterest(Net)']), 0);

  // Served as JSON or CSV depending on the edge. Normalize to [contract, month, openInterest].
  // After-hours rows carry "-" as OI and spreads have "/" in the month, so both drop out.
  const dailyText = (await dailyRes.text()).replace(/^﻿/, '').trim();
  const rows = dailyText.startsWith('[')
    ? JSON.parse(dailyText).map((r) => [r.Contract, r['ContractMonth(Week)'], r.OpenInterest])
    : dailyText.split(/\r?\n/).slice(1).map((l) => l.split(',')).map((r) => [r[1], r[2], r[11]]);
  const mtxOi = rows
    .filter(([contract, month, oi]) => contract === 'MTX' && !month.includes('/') && /^\d+$/.test(oi))
    .reduce((sum, [, , oi]) => sum + Number(oi), 0);
  if (!foreign || !mtxOi) throw new Error('TAIFEX OpenAPI no data');

  const date = foreign.Date; // YYYYMMDD
  const dataDate = `${+date.slice(4, 6)}/${+date.slice(6, 8)}`;
  const time = Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8), 15 - 8);
  const ratio = (-mtxInstNet / mtxOi) * 100;
  const out = {
    foreignOi: {
      name: CHIPS.foreignOi.name,
      symbol: 'TX',
      source: 'TAIFEX',
      kind: 'daily',
      unit: 'lots',
      digits: 0,
      price: Number(foreign['OpenInterest(Net)']),
      detail: `多${wan(foreign['OpenInterest(Long)'])} 空${wan(foreign['OpenInterest(Short)'])}`,
      dataDate,
      time,
    },
    retailRatio: {
      name: CHIPS.retailRatio.name,
      symbol: 'MTX',
      source: 'TAIFEX',
      kind: 'daily',
      unit: 'ratio',
      digits: 2,
      price: ratio,
      detail: ratio >= 0 ? '散戶偏多' : '散戶偏空',
      dataDate,
      time,
    },
  };

  ctx.waitUntil(cache.put(key, new Response(JSON.stringify(out), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CHIPS_CACHE_SECONDS}` },
  })));
  return out;
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
