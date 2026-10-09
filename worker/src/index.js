// Quote relay: aggregates Yahoo Finance + TAIFEX into one JSON for the dashboard.

const CACHE_SECONDS = 110;
const DELAY_GRACE_MIN = 20;

// delayMin: typical Yahoo feed delay, measured; shown when the market is not open.
const YAHOO = {
  sox: { name: '費半 SOX', symbol: '^SOX', digits: 2 },
  kospi: { name: '韓股 KOSPI', symbol: '^KS11', digits: 2, delayMin: 20 },
  // Yahoo's trading period ignores the TSE lunch break (11:30-12:30 JST = 02:30-03:30 UTC).
  nikkei: { name: '日經 Nikkei', symbol: '^N225', digits: 2, delayMin: 15, breaksUtc: [[150, 210]] },
  tsm: { name: 'TSM', symbol: 'TSM', digits: 2 },
  brent: { name: '布蘭特原油', symbol: 'BZ=F', digits: 2, delayMin: 10 },
  usdtwd: { name: 'USD/TWD', symbol: 'TWD=X', digits: 3 },
  nq: { name: '小納 NQ', symbol: 'NQ=F', digits: 2, delayMin: 10 },
  us10y: { name: '美債 10Y', symbol: '^TNX', digits: 3, unit: 'yield' },
};

// Yahoo Taiwan: real-time TW indices and 台指期近一 (WTX&), fetched in one request.
const YAHOO_TW = {
  twii: { name: '加權指數', symbol: '^TWII', digits: 2 },
  txf: { name: '台指期', symbol: 'WTX&', digits: 0 },
  // Holdings card (tw2330 also feeds the TSM ADR premium).
  tw2330: { name: '台積電', symbol: '2330.TW', digits: 0 },
  tw0056: { name: '元大高股息', symbol: '0056.TW', digits: 2 },
  tw00878: { name: '國泰永續高股息', symbol: '00878.TW', digits: 2 },
  tw00685L: { name: '群益臺灣加權正2', symbol: '00685L.TW', digits: 2 },
};

const BREADTH = { breadth: { name: '漲跌家數(上市)' } };

const CHIPS = {
  foreignOi: { name: '外資台指淨OI' },
  retailRatio: { name: '小台散戶多空比' },
};

const ORDER = ['twii', 'txf', 'breadth', 'usdtwd', 'sox', 'tsm', 'nq', 'kospi', 'nikkei', 'brent', 'us10y', 'foreignOi', 'retailRatio'];

const NAMES = Object.fromEntries(
  Object.entries({ ...YAHOO, ...YAHOO_TW, ...BREADTH, ...CHIPS }).map(([id, cfg]) => [id, cfg.name]),
);

// TAIFEX publishes institutional positions once a day after the close (~15:00 Taipei).
const CHIPS_RETRY_SECONDS = 600;  // retry every 10 min after 14:00 until the day's data is in
const HOLIDAYS_CACHE_SECONDS = 86400;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// Per-isolate fallback when an upstream call fails.
const lastGood = {};

// TWSE holidays ("YYYY-MM-DD"), refreshed at the start of each build. The cache TTL helpers treat
// them like weekends, so nothing TW-only is refetched on a day with no new data.
let twHolidays = new Set();

function twMarketClosedToday() {
  const tw = new Date(Date.now() + 8 * 3600 * 1000);
  return tw.getUTCDay() === 0 || tw.getUTCDay() === 6 || twHolidays.has(tw.toISOString().slice(0, 10));
}

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
  twHolidays = new Set((await fetchHolidays(origin, ctx).catch(() => [])).map((h) => h.date ?? h));
  // On a TW market holiday or weekend, once the previous night session has closed (05:00) nothing
  // on Yahoo TW changes until the next trading day, so the batch and breadth are fetched hourly.
  const twNow = new Date(Date.now() + 8 * 3600 * 1000);
  const quiet = twMarketClosedToday() && twNow.getUTCHours() >= 5;
  const day = twNow.toISOString().slice(0, 10);
  const tw = quiet ? cached(origin, ctx, `/_tw_quiet/${day}`, () => 3600, fetchYahooTw) : fetchYahooTw();
  const chips = fetchChips(origin, ctx);
  const pick = (promise, id) => promise.then((m) => m[id] ?? Promise.reject(new Error(`${id} no data`)));
  const jobs = {
    ...Object.fromEntries(Object.entries(YAHOO).map(([id, cfg]) => [id, fetchYahoo(cfg)])),
    twii: pick(tw, 'twii'),
    txf: pick(tw, 'txf').catch(() => fetchTaifex()),
    breadth: quiet ? cached(origin, ctx, `/_breadth_quiet/${day}`, () => 3600, fetchBreadth) : fetchBreadth(),
    foreignOi: pick(chips, 'foreignOi'),
    retailRatio: pick(chips, 'retailRatio'),
  };

  const quotes = await Promise.all(
    ORDER.map(async (id) => {
      try {
        let q = { id, ...(await jobs[id]) };
        if (YAHOO_TW[id]) q = await keepSessionQuote(origin, ctx, q);
        lastGood[id] = q;
        return q;
      } catch (err) {
        if (lastGood[id]) return { ...lastGood[id], stale: true };
        return { id, name: NAMES[id], error: String(err.message || err) };
      }
    }),
  );

  // TSM ADR premium: ADR price in TWD per share (1 ADR = 5 shares) vs 2330 on the TWSE.
  const tsm = quotes.find((q) => q.id === 'tsm');
  const usdtwd = quotes.find((q) => q.id === 'usdtwd');
  const tw2330 = await pick(tw, 'tw2330').catch(() => null);
  if (tsm?.price && usdtwd?.price && tw2330?.price) {
    tsm.adrPremium = ((tsm.price * usdtwd.price) / 5 / tw2330.price - 1) * 100;
  }

  const [holidays, institutional, sectors, margin] = await Promise.all([
    fetchHolidays(origin, ctx).catch(() => []),
    fetchInstitutional(origin, ctx).catch(() => null),
    fetchSectors(origin, ctx).catch(() => null),
    fetchMargin(origin, ctx).catch(() => null),
  ]);
  const announcements = await fetchAnnouncements(origin, ctx, holidays).catch(() => null);
  const vix = await fetchVix(origin, ctx).catch(() => null);
  const holdings = (await Promise.all(['tw2330', 'tw0056', 'tw00878', 'tw00685L'].map(async (id) => {
    const q = await pick(tw, id).catch(() => null);
    return q && { code: q.symbol.replace('.TW', ''), name: q.name, price: q.price, change: q.change, changePct: q.changePct, time: q.time };
  }))).filter(Boolean);
  return { updated: Date.now(), quotes, holidays, institutional, sectors, margin, announcements, vix, holdings };
}

// TAIFEX 臺指選擇權波動率指數: daily 13:45 closes from TAIFEX's monthly files (a few hundred
// bytes each). Returns the latest ~10 closes; the nightly vix_history.json supplies the rest.
async function fetchVix(origin, ctx) {
  const key = new Request(origin + '/_vix');
  const cached = await caches.default.match(key);
  if (cached) return cached.json();

  const tw = new Date(Date.now() + 8 * 3600 * 1000);
  const ym = (y, m) => `${y}${String(m).padStart(2, '0')}`;
  const [y, m] = [tw.getUTCFullYear(), tw.getUTCMonth() + 1];
  const months = [m === 1 ? ym(y - 1, 12) : ym(y, m - 1), ym(y, m)];
  const closes = [];
  for (const month of months) {
    const res = await fetch(`https://www.taifex.com.tw/file/taifex/Dailydownload/vix/log2data/${month}new.txt`, { headers: { 'User-Agent': UA } });
    if (!res.ok) continue;
    for (const [, d, v] of (await res.text()).matchAll(/^(\d{8})\s+\d+\s+([\d.]+)/gm)) {
      closes.push({ date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`, close: Number(v) });
    }
  }
  if (!closes.length) throw new Error('TAIFEX VIX no data');
  const out = { closes: closes.slice(-10) };
  const last = out.closes.at(-1).date.replace(/-/g, '');
  ctx.waitUntil(caches.default.put(key, new Response(JSON.stringify(out), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${dailyTtl(last, 14, 600)}` },
  })));
  return out;
}

// ---- Same-day announcements for the calendar ----
// Each check runs only in its window and caches its own result, so most refreshes make no
// upstream request at all.

const MOPS = 'https://mops.twse.com.tw/mops/api/';
const ETF_DIVIDEND_MONTHS = { '0056': [1, 4, 7, 10], '00878': [2, 5, 8, 11] };

async function cached(origin, ctx, path, ttlFor, compute) {
  const key = new Request(origin + path);
  const hit = await caches.default.match(key);
  if (hit) return hit.json();
  const value = await compute();
  ctx.waitUntil(caches.default.put(key, new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttlFor(value)}` },
  })));
  return value;
}

async function mops(api, body) {
  const res = await fetch(MOPS + api, {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`MOPS ${api} HTTP ${res.status}`);
  const data = await res.json();
  if (data.code !== 200) throw new Error(`MOPS ${api}: ${data.message}`);
  return data.result;
}

async function fetchAnnouncements(origin, ctx, holidays) {
  const tw = new Date(Date.now() + 8 * 3600 * 1000);
  const [y, m, d] = [tw.getUTCFullYear(), tw.getUTCMonth() + 1, tw.getUTCDate()];
  const mins = tw.getUTCHours() * 60 + tw.getUTCMinutes();
  const today = tw.toISOString().slice(0, 10);
  const holidaySet = new Set(holidays.map((h) => h.date ?? h));
  const isBusinessDay = (t) => ![0, 6].includes(t.getUTCDay()) && !holidaySet.has(t.toISOString().slice(0, 10));
  const out = { date: today, revenue: null, dividends: [] };

  // TSMC monthly revenue: released on the 10th (or the previous business day) at ~13:30.
  let revDay = new Date(Date.UTC(y, m - 1, 10));
  while (!isBusinessDay(revDay)) revDay = new Date(revDay.getTime() - 86400000);
  if (revDay.toISOString().slice(0, 10) === today && mins >= 13 * 60 + 45) {
    out.revenue = await cached(origin, ctx, `/_ann/rev/${today}`, (v) => (v ? 2 * 86400 : 600), async () => {
      const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
      const [qy, qm] = pm === 1 ? [py - 1, 12] : [py, pm - 1];
      const revenue = (yy, mm) => mops('t05st10_ifrs', {
        companyId: '2330', dataType: '2', season: '', year: String(yy - 1911), month: String(mm), subsidiaryCompanyId: '',
      });
      try {
        const cur = await revenue(py, pm);
        const prev = await revenue(qy, qm);
        const num = (s) => Number(String(s).replace(/,/g, ''));
        const thisMonth = num(cur.data.find((r) => r[0] === '本月')[1]);
        const lastMonth = num(prev.data.find((r) => r[0] === '本月')[1]);
        const yoy = num(cur.data.find((r) => r[0] === '增減百分比')[1]);  // first one: vs same month last year
        return { month: pm, yoy, mom: (thisMonth / lastMonth - 1) * 100 };
      } catch {
        return null;  // not published yet: retry in 10 min
      }
    });
  }

  // TSMC dividend: a board resolution on 股利 in today's MOPS material news, weekdays 14:00-19:00.
  if (isBusinessDay(new Date(Date.UTC(y, m - 1, d))) && mins >= 14 * 60 && mins < 19 * 60) {
    const div = await cached(origin, ctx, `/_ann/tsmcdiv/${today}`, (v) => (v.amount ? 86400 : 3600), async () => {
      const news = await mops('t146sb05', { companyId: '2330' });
      const rocToday = `${y - 1911}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
      const item = (news.recent_important_news?.data ?? [])
        .find(([date, title]) => date === rocToday && title.includes('股利') && title.includes('決議'));
      if (!item) return {};
      const detail = await mops('t05st01_detail', item[2].parameters);
      const text = detail.data?.[0]?.at(-1) ?? '';
      const amount = text.match(/每股(?:配發|現金股利)?\s*(?:新台幣)?\s*([\d.]+)\s*元/)?.[1];
      return amount ? { amount: Number(amount) } : {};
    }).catch(() => ({}));
    if (div.amount) out.dividends.push(`台積電宣布配息${+div.amount.toFixed(2)}元`);
  }

  // ETF distributions: announced around 17:00 on the 1st of the distribution month. Shown on the
  // day the amount first appears on the Yahoo TW calendar page.
  for (const [code, months] of Object.entries(ETF_DIVIDEND_MONTHS)) {
    if (!months.includes(m) || d > 4 || (d === 1 && mins < 17 * 60)) continue;
    const found = await cached(origin, ctx, `/_ann/etf/${code}/${today}`, (v) => (v.cash ? 86400 : 1800), async () => {
      const html = await fetch(`https://tw.stock.yahoo.com/quote/${code}.TW/calendar`, { headers: { 'User-Agent': UA } }).then((r) => r.text());
      for (const chunk of html.split('"eventType":"').slice(1)) {
        if (!chunk.startsWith('dividend"')) continue;
        const detail = chunk.match(/"detail":(\{[^}]*\})/);
        if (!detail) continue;
        const dv = JSON.parse(detail[1]);
        const ex = (dv.exDate ?? '').slice(0, 10);
        if (dv.cash && ex.slice(0, 7) === today.slice(0, 7) && ex >= today) return { cash: Number(dv.cash), exDate: ex };
      }
      return {};
    }).catch(() => ({}));
    if (!found.cash) continue;
    // Only on the first day it was seen, remembered per ex-date.
    const seen = await cached(origin, ctx, `/_ann/etfseen/${code}/${found.exDate}`, () => 40 * 86400, async () => ({ first: today }));
    if (seen.first === today) out.dividends.push(`${code}宣布配息${+found.cash.toFixed(4)}元`);
  }
  return out;
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
  const CLOSE = 13 * 60 + 33;
  if (twMarketClosedToday() || mins < 9 * 60) return 6 * 3600;
  if (mins < CLOSE) return Math.max(60, Math.min(1800, (CLOSE - mins) * 60));
  const data = new Date(dataTime + 8 * 3600 * 1000);
  const today = data.getUTCDate() === tw.getUTCDate();
  if (!today) return 1800;  // no snapshot for today yet (e.g. Fugle late after the open)
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
      // Every industry's share, for the 金融接棒 / 資金過度集中 badges.
      shares: Object.fromEntries(industries.map((r) => [r.name, Math.round((r.value / total) * 10000) / 100])),
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
  const key = new Request(origin + '/_institutional_v2');
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
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${institutionalTtl(data.date)}` },
  })));
  return out;
}

// TWSE sometimes corrects the day's numbers in the evening (e.g. 投信), so after today's data is
// in, recheck once at 18:00 and once at 21:00, then hold it until the next afternoon.
function institutionalTtl(dataDate) {
  const tw = new Date(Date.now() + 8 * 3600 * 1000);
  const today = tw.toISOString().slice(0, 10).replace(/-/g, '');
  if (dataDate !== today) return dailyTtl(dataDate, 15);
  const untilHour = (h) => Math.max(60, Math.round((Date.UTC(tw.getUTCFullYear(), tw.getUTCMonth(), tw.getUTCDate(), h) - tw.getTime()) / 1000));
  if (tw.getUTCHours() < 18) return untilHour(18);
  if (tw.getUTCHours() < 21) return untilHour(21);
  return dailyTtl(dataDate, 15);
}

// Cache TTL for data published once per trading day at publishHour (Taipei).
function dailyTtl(dataDate, publishHour, retrySeconds = 300) {
  const tw = new Date(Date.now() + 8 * 3600 * 1000);
  const today = tw.toISOString().slice(0, 10).replace(/-/g, '');
  const secondsUntil = (dayOffset, hour) =>
    Math.round(Math.max(60, (Date.UTC(tw.getUTCFullYear(), tw.getUTCMonth(), tw.getUTCDate() + dayOffset, hour) - tw.getTime()) / 1000));
  // Weekends and TWSE holidays bring nothing new: check again at the next day's publish hour.
  if (dataDate === today || twMarketClosedToday()) return secondsUntil(1, publishHour);
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
    sessionStart: (meta.currentTradingPeriod?.regular?.start ?? 0) * 1000,
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
      // Yahoo TW stamps the end of the current minute bar (up to a minute ahead), but after a
      // session it can jump to the next session's end (e.g. 10/12 05:00 on the 10/9 holiday):
      // anything more than 2 minutes ahead is not a trade time.
      time: meta.regularMarketTime * 1000 <= Date.now() + 120000 ? Math.min(meta.regularMarketTime * 1000, Date.now()) : 0,
      state: marketState(meta),
    };
    // Yahoo's trading period for WTX& covers only the day session, so judge TXF by its last
    // trade instead: trading if it printed within 10 minutes, and 15:00-05:00 is the night session.
    if (id === 'txf') {
      const recent = out[id].time && Date.now() - out[id].time < 10 * 60 * 1000;
      const hour = new Date(Date.now() + 8 * 3600 * 1000).getUTCHours();
      out[id].state = !recent ? 'closed' : hour >= 15 || hour < 5 ? 'night' : 'open';
    }
    // TAIEX per-minute volume is turnover in NT$ millions; the sum is today's cumulative turnover.
    if (id === 'twii') {
      out[id].turnover = (chart.indicators?.quote?.[0]?.volume ?? []).reduce((sum, v) => sum + (v || 0), 0);
      out[id].candles = candles15(chart);
    }
  }
  return out;
}

// After a session ends Yahoo TW rolls WTX& over to the next one: no trade time yet and the
// settlement price as the new reference, so the day's change collapses to a few points.
// Remember the last quote that had a trade time and serve it until the new session trades.
async function keepSessionQuote(origin, ctx, q) {
  const key = new Request(`${origin}/_session2/${q.id}`);
  if (q.time) {
    ctx.waitUntil(caches.default.put(key, new Response(JSON.stringify(q), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=345600' },  // 4 days: covers long weekends
    })));
    return q;
  }
  const last = await caches.default.match(key);
  if (last) return { ...(await last.json()), state: 'closed' };
  // Nothing remembered. Between the 13:45 day close and the 15:00 night open Yahoo compares the
  // close with that day's settlement (a few points, not the day's change), so hide it then.
  // After the 05:00 night close the change vs the day settlement is the night session's change.
  // On holidays there is no day session, so Yahoo's change is still the last night session's.
  const tw = new Date(Date.now() + 8 * 3600 * 1000);
  const mins = tw.getUTCHours() * 60 + tw.getUTCMinutes();
  if (mins < 13 * 60 + 45 || mins >= 15 * 60) return q;
  const [lastTradingDay] = await recentTradingDays(origin, ctx, 1);
  if (lastTradingDay !== tw.toISOString().slice(0, 10)) return q;
  return { ...q, change: null, changePct: null };
}

// 1-minute bars -> 15-minute [open, high, low, close] for the 09:00-13:30 session (18 slots,
// null where no trades yet). The 13:30 closing auction is folded into the last slot.
function candles15(chart) {
  const ts = chart.timestamp ?? [];
  const q = chart.indicators?.quote?.[0] ?? {};
  const slots = Array(18).fill(null);
  ts.forEach((t, i) => {
    const [o, h, l, c] = [q.open?.[i], q.high?.[i], q.low?.[i], q.close?.[i]];
    if ([o, h, l, c].some((v) => v == null)) return;
    const tw = new Date((t + 8 * 3600) * 1000);
    const slot = Math.min(17, Math.floor((tw.getUTCHours() * 60 + tw.getUTCMinutes() - 540) / 15));
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
  const key = new Request(origin + '/_chips_v4');
  const lastKey = new Request(origin + '/_chips_last_v2');
  const cached = await cache.match(key);
  if (cached) return cached.json();

  const last = await cache.match(lastKey).then((r) => (r ? r.json() : null));
  const lastDate = last?.foreignOi?.time ? new Date(last.foreignOi.time + 8 * 3600 * 1000).toISOString().slice(0, 10) : null;
  const days = await recentTradingDays(origin, ctx, 3);
  // The newest trading day whose data should already be out (published ~15:00).
  const tw = new Date(Date.now() + 8 * 3600 * 1000);
  const expected = days[0] === tw.toISOString().slice(0, 10) && tw.getUTCHours() < 15 ? days[1] : days[0];

  // Already holding the newest published day (e.g. on a market holiday): don't refetch.
  if (last && lastDate >= expected) {
    delete last.foreignOi.stale; delete last.retailRatio.stale;
    ctx.waitUntil(cache.put(key, new Response(JSON.stringify(last), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CHIPS_RETRY_SECONDS * 3}` },
    })));
    return last;
  }

  try {
    const { out, date } = await computeChips(days.filter((d) => !lastDate || d > lastDate), !last);
    // Day-over-day change, against the previous trading day's numbers.
    const prev = await previousChips(origin, ctx, date).catch(() => null);
    if (prev) {
      out.foreignOi.change = out.foreignOi.price - prev.foreignOi;
      out.retailRatio.change = out.retailRatio.price - prev.ratio;
    }
    const store = (k, ttl) => cache.put(k, new Response(JSON.stringify(out), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` },
    }));
    // The daily report is ~800KB, so avoid refetching it once today's data is in hand.
    ctx.waitUntil(store(key, dailyTtl(date, 14, CHIPS_RETRY_SECONDS)));
    ctx.waitUntil(store(lastKey, 7 * 86400));
    return out;
  } catch (err) {
    // Fall back to the last good result so a bad upstream response does not blank the cards.
    if (!last) throw err;
    const out = structuredClone(last);
    // Yesterday's numbers while today's aren't out yet are normal; only older data is stale.
    const isStale = !lastDate || lastDate < days[1];
    for (const q of Object.values(out)) {
      if (isStale) q.stale = true;
      q.staleReason = String(err?.message || err);
    }
    // Serve the fallback for 10 min instead of retrying TAIFEX on every refresh.
    ctx.waitUntil(cache.put(key, new Response(JSON.stringify(out), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=600' },
    })));
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

// The trading day before `date` (YYYYMMDD): its foreign net OI and retail ratio, from the website
// CSVs for that date. Cached per date, so retries before the 15:00 publication don't refetch it.
async function previousChips(origin, ctx, date) {
  const holidays = new Set((await fetchHolidays(origin, ctx).catch(() => [])).map((h) => h.date ?? h));
  let t = Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8));
  let iso;
  do {
    t -= 86400000;
    iso = new Date(t).toISOString().slice(0, 10);
  } while ([0, 6].includes(new Date(t).getUTCDay()) || holidays.has(iso));

  const cache = caches.default;
  const key = new Request(`${origin}/_chips_day/${iso}`);
  const cached = await cache.match(key);
  if (cached) return cached.json();

  const { out } = parseChips(await fetchChipsWeb(iso.replace(/-/g, '/')));
  const prev = { foreignOi: out.foreignOi.price, ratio: out.retailRatio.price };
  ctx.waitUntil(cache.put(key, new Response(JSON.stringify(prev), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=259200' },
  })));
  return prev;
}

// One day's data from the website (default: today), day as "YYYY/MM/DD".
async function fetchChipsWeb(day = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '/')) {
  const [inst, daily] = await Promise.all([
    taifexWebCsv('futContractsDateDown', { queryStartDate: day, queryEndDate: day, commodityId: '' }),
    taifexWebCsv('futDataDown', { down_type: '1', commodity_id: 'MTX', commodity_id2: '', queryStartDate: day, queryEndDate: day }),
  ]);
  return { inst, daily, source: 'TAIFEX web' };
}

// The OpenAPI, usually a day behind the website.
async function fetchChipsOpenApi() {
  const base = 'https://openapi.taifex.com.tw/v1/';
  const [instRes, dailyRes] = await Promise.all([
    fetch(base + 'MarketDataOfMajorInstitutionalTradersDetailsOfFuturesContractsBytheDate', { headers: { 'User-Agent': UA } }),
    fetch(base + 'DailyMarketReportFut', { headers: { 'User-Agent': UA } }),
  ]);
  if (!instRes.ok || !dailyRes.ok) throw new Error(`TAIFEX OpenAPI HTTP ${instRes.status}/${dailyRes.status}`);
  return { inst: await instRes.text(), daily: await dailyRes.text(), source: 'TAIFEX' };
}

// Trading days ("YYYY-MM-DD", newest first) from today back, skipping weekends and TWSE holidays.
async function recentTradingDays(origin, ctx, count) {
  const holidays = new Set((await fetchHolidays(origin, ctx).catch(() => [])).map((h) => h.date ?? h));
  const tw = new Date(Date.now() + 8 * 3600 * 1000);
  let t = Date.UTC(tw.getUTCFullYear(), tw.getUTCMonth(), tw.getUTCDate());
  const out = [];
  while (out.length < count) {
    const d = new Date(t);
    const iso = d.toISOString().slice(0, 10);
    if (![0, 6].includes(d.getUTCDay()) && !holidays.has(iso)) out.push(iso);
    t -= 86400000;
  }
  return out;
}

// Website CSVs for the given trading days, newest first, taking the first complete one. Before
// the ~15:00 publication the day's file is partial (open interest all zero) and is skipped.
// The OpenAPI (a day or more behind) is only a last resort when nothing is cached yet.
async function computeChips(days, allowOpenApi) {
  const errors = [];
  for (const day of days) {
    try {
      return parseChips(await fetchChipsWeb(day.replace(/-/g, '/')));
    } catch (err) {
      errors.push(`${day}: ${err.message}`);
    }
  }
  if (!allowOpenApi) throw new Error(`web ${errors.join('; ') || 'nothing newer'}`);
  try {
    return parseChips(await fetchChipsOpenApi());
  } catch (err) {
    throw new Error(`web ${errors.join('; ')}; openapi: ${err.message}`);
  }
}

function parseChips(src) {
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
  const foreignOi = foreign ? Number(foreign.oiLong) + Number(foreign.oiShort) : 0;
  if (!foreignOi || !mtxOi || Number.isNaN(mtxInstNet)) throw new Error(`${src.source}: incomplete data`);

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
