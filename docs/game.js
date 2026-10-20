// 戰鎚 40K × 台股盤中：加權指數的盤中走勢畫成帝皇（多，右）對納垢大不淨者（空，左）的亞空間戰線。
// 登入（私人頁解鎖）後才載入。企畫書：mini_game/warhammer_40k.md（素材原檔不進 repo，縮好的放 docs/game/）。
// 省電：戰線每 2 分鐘隨資料移動一次（CSS 過渡），行軍／交戰晃動用 CSS 動畫；09:00-13:31 以外、網頁在背景、
// 卡片不在畫面上時全部暫停，神祇換成靜止圖。除錯：網址加 ?game=debug 出現時間滑桿和漲跌幅輸入。
(() => {
  const A = 'game/';
  const css = `
  .card.wg { padding: 0; overflow: hidden; gap: 0; max-height: none; }
  .wg-arena { position: relative; height: 128px; overflow: hidden; }
  /* 亞空間＝底部的戰線條（像內外盤比例條）：高度跟部隊一樣，戰線左邊淡綠（空方佔領）、右邊淡紅（多方佔領） */
  .wg-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 32%; background: url(${A}Immaterium.webp) center / cover; }
  .wg-bar i { position: absolute; top: 0; bottom: 0; transition: width 2s ease-in-out, left 2s ease-in-out; }
  .wg-bar .l { left: 0; background: rgba(47, 194, 127, .28); }
  .wg-bar .r { right: 0; background: rgba(255, 92, 92, .28); }
  .wg-bar .edge { width: 2px; margin-left: -1px; background: rgba(255,255,255,.55); }
  @media (min-width: 600px) { .wg-arena { height: 176px; } }
  .wg img { position: absolute; display: block; pointer-events: none; user-select: none; -webkit-user-select: none; }
  .wg-god { bottom: calc(32% + 8px); height: calc(68% - 14px); transition: filter .6s; }  /* 跟亞空間條留 8px 空隙（素材已裁掉透明邊） */
  .wg-guo { left: 0; } .wg-emp { right: 0; }
  .wg-emp[src*="Emperor_loss"] { height: calc((68% - 14px) * .8); }  /* 帝皇敗北立繪比較大，縮成 8 成（腳底一樣貼著亞空間條上方） */
  .wg-troop { bottom: 0; height: 32%; transition: left 2s ease-in-out, opacity 1s, transform .6s; }
  .wg-tguo { transform: translateX(-100%); } .wg-temp { transform: translateX(0); }
  .wg-cloud { bottom: 0; height: 48%; transform: translateX(-50%); transition: left 2s ease-in-out, opacity 1s; z-index: 2; }
  .wg-glow-bull .wg-emp, .wg-glow-bull .wg-temp { filter: drop-shadow(0 0 6px #ffd700); }
  .wg-glow-bear .wg-guo, .wg-glow-bear .wg-tguo { filter: drop-shadow(0 0 6px #00ff00); }
  .wg-march .wg-troop { animation: wg-step .5s steps(2) infinite; }
  @keyframes wg-step { 0% { margin-bottom: 0; rotate: 0deg; } 50% { margin-bottom: 3px; rotate: -2deg; } }
  .wg-battle .wg-troop { animation: wg-jit .35s infinite; }
  .wg-battle .wg-cloud { animation: wg-cjit .5s infinite; }
  @keyframes wg-jit { 0%,100% { margin-left: 0; } 50% { margin-left: 1.5px; } }
  @keyframes wg-cjit { 0%,100% { margin-left: 0; } 33% { margin-left: -2px; } 66% { margin-left: 2px; } }
  .wg-tension .wg-cloud { animation: wg-cjit .15s infinite; }
  .wg-tension .wg-arena { animation: wg-shake .4s infinite; }
  .wg-paused * { animation-play-state: paused !important; }
  .wg-shake .wg-arena { animation: wg-shake .25s 1; }
  @keyframes wg-shake { 0%,100% { translate: 0; } 25% { translate: -2px 1px; } 75% { translate: 2px -1px; } }
  .wg-flash { position: absolute; inset: 0; background: #fff; opacity: 0; pointer-events: none; z-index: 5; }
  .wg-flash.on { animation: wg-flash .5s 1; }
  @keyframes wg-flash { 0% { opacity: .9; } 100% { opacity: 0; } }
  /* 魔獸世界風格戰鬥跳字：粗體黑描邊，從被打的一方頭上冒出往上飄；爆擊先放大彈出再縮回 */
  .wg-float { position: absolute; z-index: 4; font: 900 14px/1 Impact, "Arial Black", "Microsoft JhengHei", sans-serif; white-space: nowrap;
    letter-spacing: .5px; pointer-events: none; --dx: 0px;
    text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 2px 3px rgba(0,0,0,.8);
    animation: wg-up 1.4s ease-out forwards; }
  .wg-float.up { color: #ff6a5c; } .wg-float.down { color: #3fdc8a; }
  .wg-float.crit { font-size: 20px; animation: wg-crit 1.6s ease-out forwards; }
  .wg-float.crit.up { color: #ffd100; } .wg-float.crit.down { color: #8dff3a; }
  .wg-float.say { font-size: 12px; font-weight: 800; }
  @keyframes wg-up { 0% { opacity: 0; transform: translate(-50%, 4px) scale(.7); } 12% { opacity: 1; transform: translate(-50%, 0) scale(1.1); }
    22% { transform: translate(-50%, -4px) scale(1); } 100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), -38px) scale(.95); } }
  @keyframes wg-crit { 0% { opacity: 0; transform: translate(-50%, 0) scale(2.4); } 10% { opacity: 1; transform: translate(-50%, -2px) scale(1.5); }
    25% { transform: translate(-50%, -6px) scale(1.2); } 70% { opacity: 1; } 100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), -42px) scale(1.1); } }
  .wg-ticker { height: 22px; line-height: 22px; padding: 0 10px; font-size: 12.5px; color: #d6dbe3; background: #111419;
    border-top: 1px solid var(--line); white-space: nowrap; overflow: hidden; }
  .wg-ticker span { display: inline-block; vertical-align: top; }
  .wg-ticker .tz { color: #b06cff; } .wg-ticker .tb { color: var(--up); } .wg-ticker .tr { color: var(--down); }  /* 奸奇紫、多軍紅、空軍綠 */
  .wg-ticker span.scroll { animation: wg-marq 14s linear infinite; padding-left: 100%; }
  @keyframes wg-marq { to { transform: translateX(-100%); } }
  .wg-dbg { display: flex; gap: 6px; align-items: center; padding: 4px 8px; font-size: 12px; color: var(--muted); }
  .wg-dbg input[type=range] { flex: 1; }
  .wg-dbg input[type=number] { width: 4.5em; background: #20242c; color: var(--text); border: 1px solid var(--line); border-radius: 4px; }`;
  document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`);

  // ---- 戰報與跳字（企畫書 4.1、4.2、5）----
  const D = {
    bull: {
      actors: ['極限戰士突擊隊', '泰拉禁衛軍主力', '靈能泰坦', '機械神教軍團', '神聖艦隊', '忠誠連隊'],
      major: ['啟動軌道滅絕令轟炸', '揮動燃燒的帝皇之劍斬斷', '以狂暴的熱熔重砲貫穿', '全員上膛爆彈槍強行突破'],
      minor: ['以鏈鋸劍推進戰線並壓制', '構建堅不可摧的靈能護盾阻擋', '逐步收縮包圍網並蠶食'],
      targets: ['空頭異端的停損防線', '慈父花園的腐敗壕溝', '外資空單的亞空間據點', '大不淨者的劇毒堡壘'],
      results: ['迫使空軍斷頭倉皇逃竄', '引發空頭大規模回補踩踏', '將盤面染上一層神聖長紅', '強行收復關鍵均線陣地'],
    },
    bear: {
      actors: ['大不淨者親衛隊', '死亡守衛重裝疫車', '外資提款收割艦隊', '隔日衝混沌瘟疫軍', '亞空間借券空軍部隊', '納垢靈綠色賣壓潮'],
      major: ['傾倒萬噸腐蝕性毒液淹沒', '降下劇烈亞空間風暴撕裂', '引爆連環違約毒氣彈瓦解', '釋放瘋狂跳水瘟疫吞噬'],
      minor: ['散播陰冷瘴氣侵蝕', '發動零星毒液滲透干擾', '釋放高檔解套賣壓阻滯'],
      targets: ['多頭的生命線支撐位', '護國神山的靈能防線', '散戶追高的脆弱防區', '多方均線結構成形處'],
      results: ['多軍陣線節節敗退向後潰散', '追高散戶化為納垢花園肥料', '盤面瞬間籠罩在慘綠陰霾之中', '引發恐慌性停損多殺多慘劇'],
    },
    stalemate: {
      scenarios: ['雙方在平盤隘口陷入焦土泥淖戰', '多空主力於平盤線上下反覆拉鋸', '亞空間靈能風暴暫歇，戰場陷入詭異死寂', '鏈鋸劍與生鏽鐮刀卡在戰壕中動彈不得'],
      states: ['散戶屏息觀望不敢輕舉妄動', '戰線僵持在昨收點位毫釐不讓', '多軍無法突破毒牆'],
    },
    open: '亞空間裂隙開啟！',
    climax: '【最後試撮倒數】 亞空間靈能核心嚴重過載！',
    bullWin: '【帝皇之光普照】 空軍異端盡數伏誅！',
    bearWin: '【慈父賜福全場】 帝皇回歸黃金王座！',
    rare: {
      tsmcLimitUp: ['【星炬超載】 空頭異端瞬間汽化灰飛煙滅！', '【原體歸來】 泰拉全境進入絕對忠誠狂歡！', '【神聖光鑄】 機械神教啟動萬機神泰坦！'],
      tsmcLimitDown: ['【卡迪亞破碎】 恐懼之眼裂隙直撲泰拉皇宮！', '【王座悲鳴】 慈父毒液倒灌黃金王座大廳！', '【泰拉陷落】 阿斯塔特忠誠軍團瀕臨全滅！'],
      megaBull: ['【不屈大遠征】 帝皇戰艦遮天蔽日！', '【神聖裁決】 百萬靈能泰坦踏碎一切技術阻力！', '【泰拉長紅】 帝皇意志燃燒納垢花園！'],
      megaBear: ['【伊斯特凡大屠殺】 多軍主力深陷綠色毒沼血肉磨坊！', '【混沌浩劫】 四神共選之毀滅風暴橫掃全場！', '【慈父滅世】 融資多軍盡數化為亞空間死靈！'],
      upperShadow: ['【高地血祭】 阿斯塔特前鋒覆沒！', '【靈能反噬】 多方遭遇萬噸毒霧伏擊！', '【虛假破曉】 衝鋒號角變成了輓歌！'],
      lowerShadow: ['【原體甦醒·馬庫拉格之光】 基里曼自萬年靜滯力場中赫然睜眼！', '【終局豪賭·突入復仇之魂】 帝皇率軍發動絕境傳送直插空頭心臟！',
        '【絕地突擊·渥姆伍德烈焰】 天際驟然爆發刺目空投火光！在暴跌廢墟上築起百點鋼鐵下影線！', '【999.M41·終焉時刻的咆哮】 百萬忠誠買盤築起永不陷落的奇蹟防線！'],
    },
    floatBull: ['忠誠推進！', '多單挺進！', '為了帝皇！', '神聖護盤！'],
    floatBullCrit: ['異端！通通淨化！', '神皇之怒！', '靈能滅絕！', '全面軋空！'],
    floatBear: ['慈父賜福！', '瘟疫蔓延！', '主力倒貨！', '賣壓湧現！'],
    floatBearCrit: ['慈父包容世間一切生靈！', '納垢大瘟疫！', '亞空間風暴逆襲！', '加入慈父納垢與他的「快樂大家庭」！'],
  };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  function report(pct, hhmm, rare) {
    if (hhmm >= '09:00' && hhmm <= '09:05') return `${D.open}`;
    if (hhmm >= '13:25' && hhmm < '13:30') return `${D.climax}`;
    if (hhmm >= '13:30') return pct >= 0 ? D.bullWin : D.bearWin;
    if (rare) return pick(D.rare[rare]);
    const { bull, bear, stalemate } = D;
    if (pct >= 0.8) return `${pick(bull.actors)}${pick(bull.major)}${pick(bull.targets)}，${pick(bull.results)}！`;
    if (pct > 0.1) return `${pick(bull.actors)}${pick(bull.minor)}${pick(bull.targets)}，多方持續推進。`;
    if (pct <= -0.8) return `${pick(bear.actors)}${pick(bear.major)}${pick(bear.targets)}，${pick(bear.results)}！`;
    if (pct < -0.1) return `${pick(bear.actors)}${pick(bear.minor)}${pick(bear.targets)}，多方陣線感受沉重壓迫。`;
    return `${pick(stalemate.scenarios)}，${pick(stalemate.states)}！`;
  }

  // 罕見事件：台積電漲跌停、大盤 ±3%、長上／下影線（加權 15 分 K 的開高低；影線 ≥ 實體 2 倍且 ≥ 昨收 0.8%）
  function rareEvent(twii, tsmc, pct) {
    if (tsmc?.changePct >= 9.5) return 'tsmcLimitUp';
    if (tsmc?.changePct <= -9.5) return 'tsmcLimitDown';
    if (pct >= 3) return 'megaBull';
    if (pct <= -3) return 'megaBear';
    const k = (twii?.candles ?? []).filter(Boolean);
    if (k.length >= 4 && twii.prev) {
      const o = k[0][0], c = twii.price, hi = Math.max(c, ...k.map((x) => x[1])), lo = Math.min(c, ...k.map((x) => x[2]));
      const body = Math.abs(c - o), min = twii.prev * 0.008;
      if (hi - Math.max(o, c) >= Math.max(2 * body, min)) return 'upperShadow';
      if (Math.min(o, c) - lo >= Math.max(2 * body, min)) return 'lowerShadow';
    }
    return null;
  }

  // ---- 畫面 ----
  const debug = new URLSearchParams(location.search).get('game') === 'debug';
  const el = document.createElement('div');
  el.className = 'card wide wg wg-paused';
  el.innerHTML = `<div class="wg-arena">
      <div class="wg-bar"><i class="l"></i><i class="r"></i><i class="edge"></i></div>
      <img class="wg-god wg-guo" alt="">
      <img class="wg-god wg-emp" alt="">
      <img class="wg-troop wg-tguo" src="${A}GUO_troops.webp" alt="">
      <img class="wg-troop wg-temp" src="${A}Emperor_troops.webp" alt="">
      <img class="wg-cloud" src="${A}fight-cloud.webp" alt="">
      <div class="wg-flash"></div>
    </div>
    <div class="wg-ticker"><span></span></div>
    ${debug ? '<div class="wg-dbg">時間<input type="range" min="535" max="815" step="1" value="600"><span class="t">10:00</span>漲跌%<input type="number" step="0.1" value="0"></div>' : ''}`;
  const $ = (s) => el.querySelector(s);
  const arena = $('.wg-arena');
  const guo = $('.wg-guo'), emp = $('.wg-emp'), tg = $('.wg-tguo'), te = $('.wg-temp'), cloud = $('.wg-cloud');
  const setSrc = (img, src) => { if (img.getAttribute('src') !== src) img.src = src; };

  let data = { twii: null, tsmc: null, tradingDay: true };
  let lastPrice = null;
  let resolvedShown = false;
  let lastTickerKey = '';
  let visible = true;
  let timer = null;

  function now() {
    if (debug) {
      const m = Number($('.wg-dbg input[type=range]').value);
      return { mins: m, hhmm: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` };
    }
    const tw = new Date(Date.now() + 8 * 3600000);
    const mins = tw.getUTCHours() * 60 + tw.getUTCMinutes();
    return { mins, hhmm: tw.toISOString().slice(11, 16) };
  }
  const pctNow = () => (debug ? Number($('.wg-dbg input[type=number]').value) || 0 : data.twii?.changePct ?? 0);
  // 除錯：用輸入的漲跌幅換算成「現價」，調漲跌幅時就會有跳字
  const priceNow = () => (debug && data.twii?.prev ? data.twii.prev * (1 + pctNow() / 100) : data.twii?.price);

  // 跳字：x＝出現的水平位置（%），預設在兩尊神中間的空白區
  function float(text, cls, crit, x, extra = '') {
    const f = document.createElement('div');
    f.className = `wg-float ${cls}${crit ? ' crit' : ''}${extra}`;
    f.textContent = text;
    f.style.left = `${x ?? 32 + Math.random() * 36}%`;
    f.style.top = `${x == null ? 12 + Math.random() * 30 : 34 + Math.random() * 14}%`;
    f.style.setProperty('--dx', `${Math.round((Math.random() - 0.5) * 16)}px`);
    arena.appendChild(f);
    // 不蓋到兩尊神：量出大不淨者的右緣、帝皇的左緣，字（含爆擊放大、左右飄移）限制在中間
    const a = arena.getBoundingClientRect();
    if (a.width) {
      const lo = guo.getBoundingClientRect().right - a.left + 4;
      const hi = emp.getBoundingClientRect().left - a.left - 4;
      let half = (f.offsetWidth * (crit ? 1.5 : 1.1)) / 2 + 8;
      if (hi - lo < 2 * half) {  // 比中間的空間寬：字縮小到放得下
        const size = parseFloat(getComputedStyle(f).fontSize) * (hi - lo) / (2 * half);
        f.style.fontSize = `${Math.max(9, size)}px`;
        half = (f.offsetWidth * (crit ? 1.5 : 1.1)) / 2 + 8;
      }
      const want = (parseFloat(f.style.left) / 100) * a.width;
      const cx = hi - lo < 2 * half ? (lo + hi) / 2 : Math.min(hi - half, Math.max(lo + half, want));
      f.style.left = `${(cx / a.width) * 100}%`;
    }
    setTimeout(() => f.remove(), 1700);
    if (crit) { el.classList.remove('wg-shake'); void el.offsetWidth; el.classList.add('wg-shake'); }
  }

  // 戰鬥：交火期間每 3 秒（試撮 1.5 秒）跳一次傷害，跟著大盤情勢：漲越多多方越常出手、傷害越大、越容易爆擊。
  // 多方打納垢 → 戰線左邊紅字；空方打帝皇 → 戰線右邊綠字。數字是效果，不是真實點數
  let front = 50;
  function hit() {
    const pct = pctNow();
    const bull = Math.random() < 0.5 + 0.4 * Math.tanh(pct / 0.8);
    const edge = Math.min(1, Math.abs(pct) / 1.5);                      // 情勢一面倒的程度
    const favored = bull === pct >= 0;
    const crit = Math.random() < (favored ? 0.1 + 0.15 * edge : 0.06);
    let dmg = Math.round((40 + Math.random() * 160) * (favored ? 1 + edge : 1 - 0.4 * edge));
    if (crit) dmg = Math.round(dmg * (2 + Math.random()));
    const x = bull ? Math.max(8, front - 6 - Math.random() * 10) : Math.min(92, front + 6 + Math.random() * 10);
    float(String(dmg), bull ? 'up' : 'down', crit, x);
    if (crit && Math.random() < 0.5) float(pick(bull ? D.floatBullCrit : D.floatBearCrit), bull ? 'up' : 'down', false, null, ' say');
  }
  let hitTimer = null;

  function draw(fromData) {
    const { mins, hhmm } = now();
    const trading = debug || data.tradingDay;
    const pct = pctNow();
    const live = trading && mins >= 540 && mins < 811;          // 09:00-13:31 動畫
    const phase = !trading || mins < 540 ? 'pre' : mins < 550 ? 'march' : mins < 805 ? 'battle' : mins < 810 ? 'tension' : 'resolved';
    const done = phase === 'resolved' || (!trading);              // 休市日：停在上一個交易日的結果
    const bullWin = pct >= 0;
    const paused = !live || document.hidden || !visible;
    el.classList.toggle('wg-paused', paused);
    el.classList.toggle('wg-march', phase === 'march');
    el.classList.toggle('wg-battle', phase === 'battle');
    el.classList.toggle('wg-tension', phase === 'tension');
    arena.classList.toggle('wg-glow-bull', pct > 0.5 && !done);
    arena.classList.toggle('wg-glow-bear', pct < -0.5 && !done);

    // 神祇：盤中播動畫，暫停時靜止圖，結算後換勝／敗立繪
    if (done && (phase === 'resolved' || data.twii?.changePct != null)) {
      setSrc(emp, `${A}Emperor_${bullWin ? 'win' : 'loss'}.webp`);
      setSrc(guo, `${A}GUO_${bullWin ? 'loss' : 'win'}.webp`);
    } else {
      setSrc(emp, `${A}Emperor${paused ? '_still' : ''}.webp`);
      setSrc(guo, `${A}GUO${paused ? '_still' : ''}.webp`);
    }

    // 戰線：昨收在中間，漲往左推（帝皇在右邊進攻），tanh 讓 ±2% 接近邊界
    front = 50 - 40 * Math.tanh(pct / 1.2);
    const p = phase === 'pre' ? 0.12 : phase === 'march' ? 0.12 + 0.88 * Math.min(1, (mins - 540) / 10) : 1;
    tg.style.left = `${front * p}%`;
    te.style.left = `${100 - (100 - front) * p}%`;
    cloud.style.left = `${front}%`;
    // 戰線條：開打後（進軍完成）照戰線分紅綠；行軍、待命時只有亞空間底圖
    const split = phase === 'battle' || phase === 'tension' || done ? front : null;
    $('.wg-bar .l').style.width = split == null ? '0' : `${split}%`;
    $('.wg-bar .r').style.width = split == null ? '0' : `${100 - split}%`;
    $('.wg-bar .edge').style.left = split == null ? '-10px' : `${split}%`;
    const fighting = phase === 'battle' || phase === 'tension';
    cloud.style.opacity = fighting ? 1 : 0;
    if (done) {
      tg.style.opacity = te.style.opacity = 0;
      (bullWin ? te : tg).style.transform = bullWin ? 'translateX(-12px)' : 'translateX(calc(-100% + 12px))';
      if (phase === 'resolved' && !resolvedShown && live) {   // 現場看到收盤：閃光一次
        resolvedShown = true;
        $('.wg-flash').classList.remove('on'); void el.offsetWidth; $('.wg-flash').classList.add('on');
      }
    } else {
      tg.style.opacity = te.style.opacity = 1;
      tg.style.transform = 'translateX(-100%)';
      te.style.transform = 'translateX(0)';
      resolvedShown = false;
    }

    // 跳字：每次新資料，跟上一筆比的點數
    const price = priceNow();
    if (fromData && fighting && price != null && lastPrice != null && !paused) {
      const dp = Math.round(price - lastPrice);
      // 真實點數：數字（大漲跌用爆擊大字）＋一句台詞（小字）
      if (dp >= 1) { float(`+${dp} pt`, 'up', dp >= 25); float(pick(dp >= 25 ? D.floatBullCrit : D.floatBull), 'up', false, null, ' say'); }
      else if (dp <= -1) { float(`${dp} pt`, 'down', dp <= -25); float(pick(dp <= -25 ? D.floatBearCrit : D.floatBear), 'down', false, null, ' say'); }
    }
    if (price != null) lastPrice = price;

    // 戰報：資料更新或階段改變才換一句
    const key = `${phase}|${Math.round(pct * 10)}|${fromData ? Date.now() : ''}`;
    if (fromData || !lastTickerKey.startsWith(phase)) {
      const text = !trading && !debug ? (bullWin ? D.bullWin : D.bearWin)
        : phase === 'pre' ? '【待命】雙方大軍集結於亞空間兩端，等待 09:00 開盤號角'
          : report(pct, hhmm, rareEvent(data.twii, data.tsmc, pct));
      const span = $('.wg-ticker span');
      span.textContent = text;
      span.innerHTML = span.innerHTML.replace('【最後試撮倒數】', '<b class="tz">【最後試撮倒數】</b>')
        .replace('【帝皇之光普照】', '<b class="tb">【帝皇之光普照】</b>').replace('【慈父賜福全場】', '<b class="tr">【慈父賜福全場】</b>');
      span.classList.remove('scroll');
      if (span.scrollWidth > $('.wg-ticker').clientWidth) span.classList.add('scroll');
      lastTickerKey = key;
    }

    // 盤中每 15 秒看一次階段（進軍位置、試撮、結算），其他時間不跑
    clearInterval(timer);
    timer = live && !document.hidden ? setInterval(() => draw(false), debug ? 1000 : 15000) : null;
    // 交火時每 3 秒（試撮 1.5 秒）打一下；暫停時不打
    const every = fighting && !paused ? (phase === 'tension' ? 1500 : 3000) : 0;
    if (every !== (hitTimer?.every ?? 0)) {
      clearInterval(hitTimer?.id);
      hitTimer = every ? { every, id: setInterval(hit, every) } : null;
    }
  }

  const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; draw(false); });
  io.observe(el);
  document.addEventListener('visibilitychange', () => draw(false));
  if (debug) el.querySelectorAll('.wg-dbg input').forEach((i) => i.addEventListener('input', () => {
    $('.wg-dbg .t').textContent = now().hhmm; draw(true);
  }));

  window.WarGame = {
    // slot：render 每次重畫留的位置；同一個元素搬過去，動畫不會重來
    attach(slot, d) {
      slot.replaceWith(el);
      data = d;
      draw(true);
    },
  };
})();
