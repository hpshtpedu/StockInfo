// 颱風停班：臺北市宣布全日（或上午）停止上班時台股休市。人事行政總處「天然災害停止上班及上課情形」頁，
// 4/1～10/31 每晚 21:30 看一次（臺北市實務上都在 22:00 前宣布隔天，不會拖到當天清晨）。
export const DGPA_URL = 'https://www.dgpa.gov.tw/typh/daily/nds.html';

// 頁面 → { 'YYYY-MM-DD': true/false }：頁首日期（民國）的今天、明天臺北市是否全日停班。
// 下午、晚上才停班的不算（上午照常交易）；只有部分行政區停班的不算。頁面格式不對回 null
export function parseTyphoon(html) {
  const ymd = html.match(/(\d{2,3})年\s*(\d{1,2})月\s*(\d{1,2})日\s*天然災害/);
  if (!ymd) return null;
  const base = Date.UTC(1911 + Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  const today = iso(base), tomorrow = iso(base + 86400000);
  const out = { [today]: false, [tomorrow]: false };
  const row = html.match(/>\s*[臺台]北市\s*<\/FONT>\s*<\/TD>\s*<TD[^>]*>([\s\S]*?)<\/TD>/i);
  if (!row) return out;  // 臺北市沒列出來＝照常上班
  for (const f of row[1].matchAll(/<FONT[^>]*>([\s\S]*?)<\/FONT>/gi)) {
    const t = f[1].replace(/<[^>]+>/g, '').trim();
    if (/^[^:：。]{1,8}[區里]\s*[:：]/.test(t)) continue;  // 「文山區:…」只有部分行政區
    for (const s of t.split(/[。；;]/)) {
      if (!s.includes('停止上班')) continue;
      if (/下午|晚上|夜間/.test(s) && !/上午|全日|全天/.test(s)) continue;
      if (/明天|明日/.test(s)) out[tomorrow] = true;
      else if (/今天|今日/.test(s)) out[today] = true;
    }
  }
  return out;
}

// 查一次，結果併進 KV 的 typhoon：{ at, days: [{ date, name: '颱風假' }] }（留 30 天，夜盤歸日要往回看）
export async function checkTyphoon(env, ua) {
  const tw = new Date(Date.now() + 8 * 3600000);
  const month = tw.getUTCMonth() + 1;
  if (month < 4 || month > 10) return;
  const res = await fetch(DGPA_URL, { headers: { 'User-Agent': ua } });
  if (!res.ok) return;
  const found = parseTyphoon(await res.text());
  if (!found) return;
  const since = new Date(tw - 30 * 86400000).toISOString().slice(0, 10);
  const old = (await env.NEWS_KV.get('typhoon', 'json'))?.days ?? [];
  const days = new Map(old.filter((d) => d.date >= since).map((d) => [d.date, d]));
  // 只加不刪：過了午夜頁面可能換成新的一天、清掉昨晚的公告，不能因此把今天的颱風假拿掉
  for (const [date, closed] of Object.entries(found)) if (closed) days.set(date, { date, name: '颱風假' });
  if (days.size !== old.length || [...days.keys()].some((d) => !old.some((o) => o.date === d))) {
    await env.NEWS_KV.put('typhoon', JSON.stringify({ at: Date.now(), days: [...days.values()] }));
  }
}
