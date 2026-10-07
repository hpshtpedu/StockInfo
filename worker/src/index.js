// Quote relay: aggregates Yahoo Finance + TAIFEX into one JSON for the dashboard.

const CACHE_SECONDS = 110;

const YAHOO = {
  kospi: { name: 'KOSPI', symbol: '^KS11', digits: 2 },
  nikkei: { name: 'Nikkei 225', symbol: '^N225', digits: 2 },
  tsm: { name: 'TSM', symbol: 'TSM', digits: 2 },
  brent: { name: 'Brent 原油', symbol: 'BZ=F', digits: 2 },
  usdtwd: { name: 'USD/TWD', symbol: 'TWD=X', digits: 3 },
};

const ORDER = ['kospi', 'txf', 'nikkei', 'tsm', 'brent', 'usdtwd'];

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

    const body = JSON.stringify(await buildQuotes());
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

async function buildQuotes() {
  const jobs = {
    ...Object.fromEntries(Object.entries(YAHOO).map(([id, cfg]) => [id, fetchYahoo(cfg)])),
    txf: fetchTaifex(),
  };

  const quotes = await Promise.all(
    ORDER.map(async (id) => {
      try {
        const q = { id, ...(await jobs[id]) };
        lastGood[id] = q;
        return q;
      } catch (err) {
        if (lastGood[id]) return { ...lastGood[id], stale: true };
        return { id, name: YAHOO[id]?.name ?? '台指期', error: String(err.message || err) };
      }
    }),
  );

  return { updated: Date.now(), quotes };
}

async function fetchYahoo({ name, symbol, digits }) {
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
    price,
    prev,
    change: prev != null ? price - prev : null,
    changePct: prev ? ((price - prev) / prev) * 100 : null,
    time: meta.regularMarketTime * 1000,
  };
}

// TAIFEX MIS: MarketType 0 = day session (08:45-13:45 TW), 1 = night session.
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
