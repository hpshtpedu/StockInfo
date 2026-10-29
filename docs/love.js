// love 帳號的放置型小遊戲：男生從最左邊、女生從最右邊，兩人一起往中間用愛心（親親）攻擊：
// 先各打一面牆（兩面牆血量一樣、各吃一半傷害，所以一定一起倒），再一起打中間的大不淨者（血量＝一面牆 1.5 倍），
// 打倒後兩人走回原本結局的位置親親。
// 只有 love 帳號登入才載入（素材在 docs/love/，跟戰鎚的 docs/game/ 分開）。每天一定破關。
//
// 進度不是「開著網頁才累積」：任何時間打開，都用今天的盤中 15 分 K（加權）＋日期當種子，從 09:00 一分鐘一分鐘
// 重算到現在，所以手機、電腦看到的進度一樣，重新整理也不會重來。
//
// 每分鐘的傷害（盤勢 mood：-1 很差 … +1 很好）
//   mood  = 0.6·tanh(今天漲跌% / 1.0) + 0.4·tanh(這 15 分鐘的漲跌% / 0.25)
//   射速  = 18 顆/分 × (1 + 0.5·mood)            （兩人合計；加持時 ×1.4）
//   每顆  = 12 × (1 + 0.35·mood)                 （愛心大小跟著變）
//   爆擊率 = 8% + 17%·max(0, mood)                （加持時 +15%；爆擊 ×2）
//   每分鐘傷害 = 射速 × 每顆 × (1 + 爆擊率) × 隨機 0.85～1.15
// 加持（兩人發金光）：每 15 分鐘有 25% + 30%·max(0, mood) 的機率，在那段裡持續 3～5 分鐘。
// 牆的血量：總共 48,000（平盤日約 12:00 破關，漲 1.5% 的日子 11:10 左右，大跌日靠最後衝刺）
//   × 每天隨機 0.85～1.15 × 連漲／連跌加減（前幾個交易日連漲 N 天 +5%·N、連跌 −5%·N，最多 ±20%：
//   連漲的日子盤勢好打得快，牆就厚一點；連跌的日子讓她輕鬆一點）。
//   兩面牆各 1/3.5、大不淨者 1.5/3.5。
// 保證破關：13:00 起若照目前速度趕不上，傷害自動提高到剛好 13:27 前打完（最後衝刺），13:29 前兩人會合。
// 靠自己（沒用到最後衝刺）破關才顯示「大成功！費時 X 時 Y 分」（從 09:00 算到大不淨者倒下）。
(() => {
  const A = 'love/';
  const STANDBY = 535, OPEN = 540, CLOSE = 810, CATCH = 780, DEADLINE = 807;  // 台北時間的分鐘數（08:55 待命）
  const WALK = 1, FINAL = 2;            // 走到下一個目標 1 分鐘；最後兩人走到一起 2 分鐘
  const WALLS = [25, 50, 75];           // 左牆、大不淨者、右牆的中心（卡片寬度 %）
  const BOY = 7, GIRL0 = 93;            // 兩人的起點（打的時候站哪見 spots()）
  const BASE_HP = 48000;
  const STAGES = 2;                     // 第 0 關：兩面牆（一起打、一起倒）；第 1 關：大不淨者

  const css = `
  .card.lv { padding: 0; overflow: hidden; gap: 0; max-height: none; }
  .lv-arena { position: relative; height: 61px; overflow: hidden; background: url(${A}Immaterium.webp) center / cover; }
  @media (min-width: 600px) { .lv-arena { height: 84px; } }
  .lv img { position: absolute; display: block; pointer-events: none; user-select: none; -webkit-user-select: none; }
  .lv-boy, .lv-girl { bottom: 2px; height: 88%; transform: translateX(-50%); transition: left 1s linear, filter .4s; z-index: 3; }
  .lv-boy.flip { transform: translateX(-50%) scaleX(-1); }  /* 最後往左走 */
  /* 走路時一步一步上下晃（跟戰鎚部隊行軍一樣） */
  .lv-boy.walking, .lv-girl.walking { animation: lv-step .5s steps(2) infinite; }
  @keyframes lv-step { 0% { translate: 0 0; rotate: 0deg; } 50% { translate: 0 -3px; rotate: -2deg; } }  /* translate／rotate 不重排版面 */
  /* 加持中：兩人發帝皇那種金光（亞空間背景是粉紅的，粉紅光看不出來） */
  .lv-boy.buff, .lv-girl.buff { filter: drop-shadow(0 0 3px #ffd700) drop-shadow(0 0 6px #ffd700); }
  .lv-wall { position: absolute; bottom: 2px; height: 76%; aspect-ratio: 97 / 96; transform: translateX(-50%); z-index: 2;
    transition: opacity .7s, scale .7s; }
  .lv-wall img { position: static; width: 100%; height: 100%; }
  /* 大不淨者：圖四周各有 1/6 是綠光，本體約卡片高 80%，所以整張 120%、往下沉 20% 讓腳貼地 */
  .lv-wall.guo { height: 120%; bottom: calc(2px - 20%); aspect-ratio: 197 / 144; }
  .lv-wall.hit { animation: lv-shake .3s 1; }
  .lv-wall.hit img { animation: lv-flash .25s 1; }
  .lv-wall.broken { opacity: 0; scale: .7; }
  @keyframes lv-shake { 0%,100% { translate: 0; } 25% { translate: -3px 0; } 50% { translate: 3px 0; } 75% { translate: -2px 0; } }
  @keyframes lv-flash { 0%,100% { filter: none; } 30% { filter: brightness(2.6) saturate(.3); } }
  .lv-shot { z-index: 4; transform: translate(-50%, -50%); transition: left .8s linear; filter: drop-shadow(0 0 2px #ff7eb9); }
  .lv-float { position: absolute; z-index: 5; top: 2px; transform: translateX(-50%); white-space: nowrap; pointer-events: none;
    font: 900 17px/1 Impact, "Arial Black", sans-serif; color: #ff8cc2; animation: lv-up 1.3s ease-out forwards;
    text-shadow: -1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000; }
  .lv-float.crit { font-size: 23px; color: #ffd36e; animation: lv-crit 1.3s ease-out forwards; }
  @keyframes lv-up { 0% { opacity: 0; translate: 0 6px; } 15% { opacity: 1; translate: 0 0; } 100% { opacity: 0; translate: 0 -10px; } }
  @keyframes lv-crit { 0% { opacity: 0; scale: 2; } 12% { opacity: 1; scale: 1.15; } 30% { scale: 1; } 100% { opacity: 0; translate: 0 -10px; } }
  .lv-rise { z-index: 4; animation: lv-rise 1.6s ease-out forwards; }
  .lv-rise.buff { animation-duration: 2.8s; filter: drop-shadow(0 0 2px #ffd700) drop-shadow(0 0 5px #ffd700); }  /* 加持時頭上冒的愛心：飄慢一點、包金光 */
  @keyframes lv-rise { 0% { opacity: 0; translate: -50% 0; scale: .6; } 20% { opacity: 1; } 100% { opacity: 0; translate: -50% -34px; scale: 1; } }
  .lv-msg { position: absolute; left: 66%; top: 50%; transform: translate(-50%, -50%); z-index: 5; white-space: nowrap;
    font: 800 clamp(13px, 4vw, 16px)/1.2 "Microsoft JhengHei", sans-serif; color: #fff;
    text-shadow: 0 0 4px #ff4f9a, 0 0 8px #ff4f9a, 0 1px 2px #000; }
  .lv-msg.big { font-size: clamp(24px, 7.5vw, 34px); letter-spacing: 3px; }  /* 「今天休息」字少，放大 */
  .lv-paused * { animation-play-state: paused !important; }
  .lv-dbg { display: flex; gap: 6px; align-items: center; padding: 4px 8px; font-size: 12px; color: var(--muted); }
  .lv-dbg input[type=range] { flex: 1; }
  .lv-dbg input[type=number] { width: 4.5em; background: #20242c; color: var(--text); border: 1px solid var(--line); border-radius: 4px; }`;
  document.head.appendChild(Object.assign(document.createElement('style'), { textContent: css }));

  // 隨機：同一天、同一分鐘、同一用途永遠是同一個數（跟抽的順序無關）
  function rnd(seed, a, b) {
    let t = (seed ^ Math.imul(a + 1, 0x9E3779B1) ^ Math.imul(b + 7, 0x85EBCA77)) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const debugT = (() => {  // ?love=debug&t=10:30：除錯用，假裝現在是那個時間（之後照真實時間往前走）
    const q = new URLSearchParams(location.search);
    const m = q.get('love') === 'debug' && /^(\d+):(\d+)$/.exec(q.get('t') ?? '');
    return m ? { at: Date.now(), mins: Number(m[1]) * 60 + Number(m[2]) } : null;
  })();
  // 網址加 ?game=debug：跟戰鎚一樣出現時間滑桿和漲跌幅輸入（用假的 15 分 K：一路平穩走到輸入的漲跌幅）
  const debug = new URLSearchParams(location.search).get('game') === 'debug';
  function now() {
    const tw = new Date(Date.now() + 8 * 3600000);
    if (debug) return { mins: Number(el.querySelector('.lv-dbg input[type=range]').value), day: tw.toISOString().slice(0, 10) };
    const mins = debugT ? debugT.mins + (Date.now() - debugT.at) / 60000
      : tw.getUTCHours() * 60 + tw.getUTCMinutes() + tw.getUTCSeconds() / 60;
    return { mins, day: tw.toISOString().slice(0, 10) };
  }

  let data = {};
  let closes = [];  // taiex_history.json：算前幾天連漲／連跌
  fetch('taiex_history.json').then((r) => r.json()).then((j) => { closes = j.closes ?? []; draw(); }).catch(() => {});

  // 今天的血量：每一關各多少
  function setup(day) {
    const seed = Number(day.replace(/-/g, ''));
    const past = closes.filter((c) => c.date < day);
    let streak = 0;
    for (let i = past.length - 1; i > 0; i--) {
      const s = Math.sign(past[i].close - past[i - 1].close);
      if (!s || (streak && Math.sign(streak) !== s)) break;
      streak += s;
    }
    const total = BASE_HP * (0.85 + 0.3 * rnd(seed, 1, 0)) * (1 + clamp(0.05 * streak, -0.2, 0.2));
    const w = total / 3.5;  // 一面牆
    return { seed, max: [2 * w, 1.5 * w] };  // 第 0 關記兩面牆的合計：傷害一人一半打一面，所以兩面一起倒
  }

  // 09:00 起第 m 分鐘的盤勢：用那根 15 分 K 從開到收線性內插
  function fakeTwii() {
    const pct = Number(el.querySelector('.lv-dbg input[type=number]').value) || 0;
    const prev = 23000, at = (f) => prev * (1 + (pct / 100) * f + 0.002 * Math.sin(f * 9));
    const candles = Array.from({ length: 18 }, (_, i) => {
      const o = at(i / 18), c = at((i + 1) / 18);
      return [o, Math.max(o, c), Math.min(o, c), c];
    });
    return { prev, price: at(1), changePct: pct, candles };
  }
  function market(m) {
    const t = debug ? fakeTwii() : data.twii;
    const k = t?.candles ?? [];
    const slot = clamp(Math.floor(m / 15), 0, 17);
    const c = k[slot];
    if (!t?.prev) return { pct: t?.changePct ?? 0, ret: 0 };
    if (!c) return { pct: ((t.price - t.prev) / t.prev) * 100, ret: 0 };
    const f = clamp((m - slot * 15) / 15, 0, 1);
    return { pct: ((c[0] + (c[3] - c[0]) * f - t.prev) / t.prev) * 100, ret: ((c[3] - c[0]) / t.prev) * 100 };
  }
  const moodOf = ({ pct, ret }) => clamp(0.6 * Math.tanh(pct / 1.0) + 0.4 * Math.tanh(ret / 0.25), -1, 1);
  // 這一分鐘有沒有加持：每 15 分鐘抽一次（盤勢越好越常有），持續 3～5 分鐘
  function kissing(S, m) {
    const slot = Math.floor(m / 15);
    const mood = moodOf(market(slot * 15 + 14.99));
    if (rnd(S.seed, 3, slot) >= 0.25 + 0.3 * Math.max(0, mood)) return false;
    const start = slot * 15 + 2 + Math.floor(rnd(S.seed, 4, slot) * 9);
    return m >= start && m < start + 3 + Math.floor(rnd(S.seed, 5, slot) * 3);
  }
  function stats(mood, kiss) {
    return {
      rate: 18 * (1 + 0.5 * mood) * (kiss ? 1.4 : 1),
      dmg: 12 * (1 + 0.35 * mood),
      crit: Math.min(0.6, 0.08 + 0.17 * Math.max(0, mood) + (kiss ? 0.15 : 0)),
    };
  }

  // 從 09:00 重算到 t（台北時間分鐘數，可帶小數）
  function simulate(day, t) {
    const S = setup(day);
    const hp = [...S.max];
    const broken = [];
    let k = 0, phase = 'walk', since = OPEN, caught = false, cur = null;
    let x = OPEN;
    const end = Math.min(t, CLOSE);
    while (x < end - 1e-9 && phase !== 'end') {
      const x1 = Math.min(end, Math.floor(x + 1e-9) + 1);
      if (phase === 'walk' || phase === 'final') {
        const done = since + (phase === 'final' ? FINAL : WALK);
        if (done <= x1) { x = Math.max(x, done); since = done; phase = phase === 'final' ? 'end' : 'shoot'; continue; }
        x = x1; continue;
      }
      const mi = Math.floor(x + 1e-9) - OPEN;
      const mood = moodOf(market(mi));
      const kiss = kissing(S, mi);
      const st = stats(mood, kiss);
      let dpm = st.rate * st.dmg * (1 + st.crit) * (0.85 + 0.3 * rnd(S.seed, 6, mi));
      let boost = 1;
      if (x >= CATCH) {  // 最後衝刺：照目前速度趕不上 13:27 就提高傷害
        const left = hp.slice(k).reduce((a, b) => a + b, 0);
        const need = left / Math.max(0.25, DEADLINE - x - (STAGES - 1 - k) * WALK);
        if (need > dpm) { boost = need / dpm; dpm = need; caught = true; }
      }
      cur = { mood, kiss, ...st, boost, dpm };
      if (dpm * (x1 - x) >= hp[k]) {
        const tb = x + hp[k] / dpm;
        hp[k] = 0;
        broken[k] = tb;
        k++;
        since = tb;
        phase = k >= STAGES ? 'final' : 'walk';
        x = tb;
        continue;
      }
      hp[k] -= dpm * (x1 - x);
      x = x1;
    }
    return { S, hp, broken, k, phase, since, caught, cur, t: end };
  }

  // ---- 畫面 ----
  const el = document.createElement('div');
  el.className = 'card wide lv lv-paused';
  el.innerHTML = `<div class="lv-arena">
      ${WALLS.map((x, i) => `<div class="lv-wall${i === 1 ? ' guo' : ''}" style="left:${x}%"><img src="${A}${i === 1 ? 'GUO_still' : 'wall'}.webp" alt=""></div>`).join('')}
      <img class="lv-boy" alt="">
      <img class="lv-girl" alt="">
      <div class="lv-msg"></div>
    </div>
    ${debug ? '<div class="lv-dbg">時間<input type="range" min="480" max="825" step="1" value="600"><span class="t">10:00</span>漲跌%<input type="number" step="0.1" value="0"></div>' : ''}`;
  const arena = el.querySelector('.lv-arena');
  const boy = el.querySelector('.lv-boy'), girl = el.querySelector('.lv-girl');
  const walls = [...el.querySelectorAll('.lv-wall')];
  const guo = walls[1].querySelector('img');
  const msg = el.querySelector('.lv-msg');
  const setSrc = (img, src) => { if (img.getAttribute('src') !== src) img.src = src; };
  for (const n of ['m_walk', 'm_kiss', 'f_walk', 'f_kiss', 'GUO']) new Image().src = `${A}${n}.webp`;
  new Image().src = `${A}heart.webp`;

  let visible = true, timer = null, endTimer = null, last = null;
  const fireTimers = { boy: null, girl: null };
  const live = () => {
    const { mins } = now();
    return (debug || debugT || data.tradingDay) && mins >= OPEN && mins < CLOSE + 1;
  };
  const active = () => live() && visible && !document.hidden;
  // 打每一關時兩人站的地方（卡片寬 %）：目標半寬＋人半寬＋14px，手機窄也不會貼著牆像在親牆。
  // 結局的位置跟舊版（四面牆、最左邊那面在 26%）一樣：男生起點和「女生打最左邊那面牆的位置」中間
  function spots() {
    const a = arena.getBoundingClientRect();
    const h = a.height || 61, w = a.width || 320;
    const off = (t, p) => ((h * t / 2 + h * p / 2 + 14) / w) * 100;
    const WALL = 0.76 * (97 / 96), GUO = 1.2 * (113 / 144), M = 0.88 * (56 / 128), F = 0.88 * (69 / 128);  // 大不淨者只算本體不算光
    return { boy: [WALLS[0] - off(WALL, M), WALLS[1] - off(GUO, M)], girl: [WALLS[2] + off(WALL, F), WALLS[1] + off(GUO, F)],
      meet: (26 + off(WALL, F) + BOY) / 2 };
  }

  // 朝目標射一顆愛心：飛 0.8 秒，打到震一下、閃白、跳傷害。兩人各射一半（射速各一半）
  function fire(who) {
    clearTimeout(fireTimers[who]);
    if (!active() || last?.phase !== 'shoot' || !last.cur) return;
    const { cur, k } = last;
    const crit = Math.random() < cur.crit;
    const a = arena.getBoundingClientRect();
    const h = a.height;
    const size = h * (0.2 + 0.1 * (cur.mood + 1) / 2) * (crit ? 1.3 : 1) * Math.min(1.5, Math.sqrt(cur.boost));
    const shot = document.createElement('img');
    shot.className = 'lv-shot';
    shot.src = `${A}heart.webp`;
    shot.style.height = `${size}px`;
    shot.style.top = `${h * 0.55}px`;  // 打在牆身中間
    const g = (who === 'boy' ? boy : girl).getBoundingClientRect();
    shot.style.left = `${g.left - a.left + g.width * (who === 'boy' ? 0.8 : 0.2)}px`;
    arena.appendChild(shot);
    void shot.offsetWidth;
    const i = k === 1 ? 1 : who === 'boy' ? 0 : 2;
    const w = walls[i];
    shot.style.left = `${(WALLS[i] / 100) * a.width}px`;
    setTimeout(() => {
      shot.remove();
      w.classList.remove('hit'); void w.offsetWidth; w.classList.add('hit');
      const f = document.createElement('div');
      f.className = `lv-float${crit ? ' crit' : ''}`;
      const n = Math.round((cur.dpm / cur.rate / cur.boost / (1 + cur.crit)) * cur.boost * (crit ? 2 : 1) * (0.9 + Math.random() * 0.2));
      f.textContent = crit ? `${n}!` : String(n);
      f.style.left = `${WALLS[i] + (Math.random() - 0.5) * 6}%`;
      arena.appendChild(f);
      setTimeout(() => f.remove(), 1350);
    }, 800);
    fireTimers[who] = setTimeout(() => fire(who), Math.max(350, 120000 / (cur.rate * cur.boost)) * (0.8 + Math.random() * 0.4));
  }

  // 結局：兩人中間一直冒愛心
  function rise(x, y, size, cls = '') {
    const r = document.createElement('img');
    r.className = `lv-rise${cls}`;
    r.src = `${A}heart.webp`;
    r.style.height = `${size}px`;
    r.style.left = `${x}%`;
    r.style.top = `${y}px`;
    arena.appendChild(r);
    setTimeout(() => r.remove(), cls ? 2850 : 1650);
  }
  function endHearts() {
    clearTimeout(endTimer);
    if (!active() || last?.phase !== 'end') return;
    const h = arena.getBoundingClientRect().height;
    rise(spots().meet + (Math.random() - 0.5) * 4, h * 0.15, h * (0.27 + Math.random() * 0.15));  // 親親的愛心大一點（1.5 倍）
    endTimer = setTimeout(endHearts, 650);
  }
  // 加持時頭上冒一顆小愛心
  function buffHeart(x) {
    const h = arena.getBoundingClientRect().height;
    rise(x, h * 0.05, h * 0.24, ' buff');
  }

  function place(img, x) { img.style.left = `${x}%`; }
  // 最後兩人中心的距離（卡片寬 %）：兩張親嘴圖各一半寬再收 10%，臉貼臉但身體不疊在一起
  function gap() {
    const a = arena.getBoundingClientRect();
    if (!a.width) return 8;
    const h = a.height * 0.88;
    return ((h * (56 / 128) + h * (69 / 128)) / 2 * 0.9 / a.width) * 100;
  }
  function draw() {
    const { mins, day } = now();
    const paused = !active();
    el.classList.toggle('lv-paused', paused);
    const still = paused ? '_still' : '';
    const trading = debug || debugT || data.tradingDay;
    let st;
    // 開市日 08:55 前還是前一天的畫面：前一天開市＝停在那天的結局（盤前的加權報價還是前一個交易日的 15 分 K，
    // 用那天的日期重算一次），前一天休市＝繼續休息；08:55 起才進待命（兩人站兩端、牆完整）
    const yday = new Date(Date.parse(`${day}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    const ydayTrading = debug || debugT || (data.isTradingDay ? data.isTradingDay(yday) : true);
    if (!trading || (mins < STANDBY && !ydayTrading)) {  // 休市：兩人在一起休息（今天開市、只是前一天休市的話不寫字）
      st = { phase: 'rest', quiet: trading };
    } else if (mins < STANDBY) {
      st = simulate(yday, CLOSE);
      st.phase = 'end';
    } else if (mins < OPEN) {
      st = { phase: 'pre', hp: setup(day).max, k: 0 };
    } else {
      st = simulate(day, mins);
      if (st.phase !== 'end' && mins >= CLOSE) st.phase = 'end';  // 保險：收盤一定是結局
    }
    const prevPhase = last?.phase;
    last = st;
    const G = gap(), P = spots(), meet = P.meet;

    // 牆、大不淨者
    walls.forEach((w, i) => {
      const gone = st.phase === 'rest' || st.phase === 'end' || st.phase === 'final' || (st.broken?.[i === 1 ? 1 : 0] != null);
      w.classList.toggle('broken', gone);
    });
    setSrc(guo, `${A}GUO${paused ? '_still' : ''}.webp`);

    // 人物
    let boyThere = false;  // 最後往左走：男生已經走到定位
    const kiss = st.cur?.kiss && (st.phase === 'shoot' || st.phase === 'walk');
    girl.classList.toggle('buff', !!kiss);
    boy.classList.toggle('buff', !!kiss);
    if (st.phase === 'rest' || st.phase === 'end') {
      // 結局（收盤後、休市也是）一直親：卡片在畫面上就播動圖，只有網頁在背景或卡片捲走才換靜止圖
      const kissStill = document.hidden || !visible ? '_still' : '';
      setSrc(boy, `${A}m_kiss${kissStill}.webp`); setSrc(girl, `${A}f_kiss${kissStill}.webp`);
      const at = st.quiet ? 50 : meet;  // 不寫字的時候（開市日、前一天休市的清晨）站到正中間；有字就靠左讓位給字
      place(boy, at - G / 2); place(girl, at + G / 2);
    } else if (st.phase === 'final') {
      const f = clamp((st.t - st.since) / FINAL, 0, 1);
      // 兩人同速往左走（女生走 FINAL 分鐘）：男生路短先到，停下轉回來面向右邊、切成親親等她
      const dg = P.girl[1] - meet - G / 2, db = P.boy[1] - meet + G / 2;
      const fb = clamp(dg > 0 ? (f * dg) / Math.max(db, 1e-6) : 1, 0, 1);
      boyThere = fb >= 1;
      setSrc(boy, `${A}${boyThere ? 'm_kiss' : 'm_walk'}${still}.webp`); setSrc(girl, `${A}f_walk${still}.webp`);
      place(boy, P.boy[1] - db * fb);
      place(girl, P.girl[1] - dg * f);
    } else if (st.phase === 'pre') {
      setSrc(boy, `${A}m_walk_still.webp`); setSrc(girl, `${A}f_walk_still.webp`);
      place(boy, BOY); place(girl, GIRL0);
    } else if (st.phase === 'walk') {
      const f = clamp((st.t - st.since) / WALK, 0, 1);
      const b0 = st.k ? P.boy[st.k - 1] : BOY, g0 = st.k ? P.girl[st.k - 1] : GIRL0;
      setSrc(boy, `${A}m_walk${still}.webp`); setSrc(girl, `${A}f_walk${still}.webp`);
      place(boy, b0 + (P.boy[st.k] - b0) * f); place(girl, g0 + (P.girl[st.k] - g0) * f);
    } else {
      setSrc(boy, `${A}m_kiss${still}.webp`); setSrc(girl, `${A}f_kiss${still}.webp`);
      place(boy, P.boy[st.k]); place(girl, P.girl[st.k]);
    }
    if (kiss && !paused && Math.random() < 0.35) buffHeart(parseFloat(Math.random() < 0.5 ? boy.style.left : girl.style.left));

    const walking = !paused && (st.phase === 'walk' || st.phase === 'final');
    girl.classList.toggle('walking', walking);
    boy.classList.toggle('walking', walking && !boyThere);
    boy.classList.toggle('flip', st.phase === 'final' && !boyThere);
    // 結局文字：靠自己破關寫「大成功！費時…」，最後衝刺才破的寫「成功！」；休市寫「今天休息」
    msg.classList.toggle('big', st.phase === 'rest');
    if (st.phase === 'rest') msg.textContent = st.quiet ? '' : '今天休息';
    else if (st.phase === 'end') {
      const used = (st.broken?.[STAGES - 1] ?? CLOSE) - OPEN;
      const hh = Math.floor(used / 60), mm = Math.floor(used % 60);
      msg.textContent = st.caught || st.broken?.[STAGES - 1] == null ? '成功！'
        : `大成功！費時 ${hh ? `${hh} 時 ` : ''}${mm} 分`;
    } else msg.textContent = '';

    // 動作：射愛心、結局冒愛心（只在盤中、畫面上才跑）
    for (const who of ['boy', 'girl']) {
      if (st.phase === 'shoot' && !paused) { if (!fireTimers[who] || prevPhase !== 'shoot') fire(who); }
      else { clearTimeout(fireTimers[who]); fireTimers[who] = null; }
    }
    if (st.phase === 'end' && !paused) { if (!endTimer || prevPhase !== 'end') endHearts(); }
    else { clearTimeout(endTimer); endTimer = null; }

    clearInterval(timer);
    timer = !paused ? setInterval(draw, 1000) : null;
  }

  if (debug) el.querySelectorAll('.lv-dbg input').forEach((i) => i.addEventListener('input', () => {
    const m = Number(el.querySelector('.lv-dbg input[type=range]').value);
    el.querySelector('.lv-dbg .t').textContent = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    draw();
  }));
  const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; draw(); });
  io.observe(el);
  document.addEventListener('visibilitychange', draw);

  window.LoveGame = {
    attach(slot, d) {
      slot.replaceWith(el);
      data = d;
      draw();
    },
  };
})();
