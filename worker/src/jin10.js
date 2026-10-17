// 金十 xnews（xnews.jin10.com）的文章列表：xnews 沒有 robots.txt；頁面是伺服器輸出的 HTML，標題、時間、連結都在列表裡。

// 新聞快訊：金十 xnews 首頁＋「特朗普動態」專題（文章列表，每則都有標題，伺服器輸出的 HTML，各 20 則）。
// 兩邊都套同一套規則：標題含關鍵字才留，含排除字的不要（比對簡體原文），合併後依時間排
export const NEWS_URLS = ['https://xnews.jin10.com/', 'https://xnews.jin10.com/topic/418'];
const KEYWORDS = ['美联储', '黄仁勋', '特朗普', 'Anthropic', '英伟达', '马斯克', '台积电'];
const EXCLUDE = ['国内新闻', '精选：', '日程一览', '黄金头条', '早餐', '分析汇总', 'Plus日报', '夜读', '财料', '一图读懂',
  '看点', '速递', '决战', '复盘', '数据表', '金十'];
// 金十快訊（jin10.com 首頁自己用的快訊 API，robots.txt 沒限制、沒有公開文件，改版可能失效），一次約 1 小時的 20 則。
// 不限「重要」（10/17 馬斯克談美債那則沒標重要，但有【】標題），只留有真正標題（【…】或 title 欄位）的；廣告不要
export const FLASH_URL = 'https://flash-api.jin10.com/get_flash_list?channel=-8200&vip=1';
export const FLASH_HEADERS = { 'x-app-id': 'bVBF4FyRTn5NJF5n', 'x-version': '1.0.0', Referer: 'https://www.jin10.com/' };
export function parseImportant(json) {
  const clean = (v) => String(v ?? '').replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').trim();
  const out = [];
  for (const x of json?.data ?? []) {
    if (x?.extras?.ad) continue;
    const title = (clean(x.data?.content).match(/^【(.+?)】/)?.[1] ?? clean(x.data?.title)).trim();
    const t = String(x.time ?? '').match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
    if (title && t) out.push({ title, time: Date.UTC(t[1], t[2] - 1, t[3], t[4] - 8, t[5], t[6]), url: `https://flash.jin10.com/detail/${x.id}` });
  }
  return out;
}

export const newsMatch = (title) => KEYWORDS.some((k) => title.includes(k)) && !EXCLUDE.some((k) => title.includes(k));

// 譯名與台灣用語：OpenCC 的字詞表不會處理人名，這裡先蓋過去（在簡體原文上比對，最長優先）
const NAMES = {
  特朗普: '川普', 美联储: '聯準會', 普京: '普丁', 泽连斯基: '澤倫斯基', 内塔尼亚胡: '納坦雅胡',
  鲍威尔: '鮑爾', 沃什: '華許', 哈里斯: '賀錦麗', 万斯: '范斯', 鲁比奥: '盧比歐', 贝森特: '貝森特',
  卢特尼克: '盧特尼克', 莱维特: '李維特', 埃尔多安: '艾爾多安', 马斯克: '馬斯克', 五角大楼: '五角大廈',
  中期选举: '期中選舉', 加息: '升息', 航母: '航艦', 导弹: '飛彈', 无人机: '無人機', 硅谷: '矽谷',
  芯片: '晶片', 社交媒体: '社群媒體', 朝鲜: '北韓', 韩国: '南韓', 悉尼: '雪梨',
  制裁: '制裁', 俄制裁: '俄制裁',  // 字典會把「俄制」轉成「俄製」
  英伟达: '輝達', 黄仁勋: '黃仁勳', 恢复: '恢復', 宣布: '宣布', 金十数据: '金十數據',
};
// OpenCC 台灣詞表裡不適合新聞的條目（例如「聲明」會變「宣告」）
const TW_SKIP = ['聲明'];

// 簡體 → 繁體（台灣）：最長詞優先比對（譯名 > 詞組 > 單字），再套台灣慣用詞與異體字
export function makeConverter(dict) {
  const first = { ...dict.c, ...dict.p, ...NAMES };
  const maxLen = (m) => Math.max(...Object.keys(m).map((k) => k.length));
  const L1 = maxLen(first);
  const tw = { ...dict.t };
  for (const k of TW_SKIP) delete tw[k];
  const L2 = maxLen(tw);
  const longest = (s, map, L) => {
    let out = '';
    for (let i = 0; i < s.length;) {
      let hit = false;
      for (let n = Math.min(L, s.length - i); n >= 1; n--) {
        const v = map[s.slice(i, i + n)];
        if (v !== undefined) { out += v; i += n; hit = true; break; }
      }
      if (!hit) out += s[i++];
    }
    return out;
  };
  // 台灣日常寫「台」不寫「臺」
  return (s) => [...longest(longest(s, first, L1), tw, L2)].map((c) => dict.v[c] ?? c).join('').replace(/臺/g, '台');
}

// 列表項目 → [{ title, time, url }]（簡體原文）。時間有「N分钟前」「N小时前」「MM-DD HH:mm」幾種寫法，
// 都換成毫秒時間戳（北京時間 = 台灣時間）
export function parseJin10(html, now = Date.now()) {
  const tw = new Date(now + 8 * 3600000);
  const out = [];
  const re = /class="jin10-news-list-item[^"]*">\s*<a href="([^"]+)"[\s\S]*?jin10-news-list-item-title">\s*([\s\S]*?)\s*<\/p>[\s\S]*?display_datetime">[\s\S]*?<span>([^<]+)<\/span>/g;
  for (const m of html.matchAll(re)) {
    const raw = m[3].trim();
    let time = null;
    let r;
    if ((r = raw.match(/^(\d+)\s*分钟前$/))) time = now - r[1] * 60000;
    else if ((r = raw.match(/^(\d+)\s*小时前$/))) time = now - r[1] * 3600000;
    else if (/^刚刚|秒前$/.test(raw)) time = now;
    else if ((r = raw.match(/^(?:(\d{4})-)?(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/))) {
      let year = r[1] ? Number(r[1]) : tw.getUTCFullYear();
      if (!r[1] && Number(r[2]) > tw.getUTCMonth() + 1) year -= 1;  // 年初看到去年 12 月的新聞
      time = Date.UTC(year, r[2] - 1, r[3], r[4] - 8, r[5]);
    }
    const title = m[2].replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim();
    if (title && time) out.push({ title, time, url: m[1] });
  }
  return out.sort((a, b) => b.time - a.time);
}
