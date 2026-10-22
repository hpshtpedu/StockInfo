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
  .wg-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 32%; background: url(${A}Immaterium.webp) center / cover;
    /* 上緣 14px 漸層淡出：亞空間像霧往上散進戰場，不是一條硬切的線（不加光暈，發光的只有神祇） */
    -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 14px); mask-image: linear-gradient(to bottom, transparent 0, #000 14px); }
  .wg-bar i { position: absolute; top: 0; bottom: 0; transition: width 2s ease-in-out, left 2s ease-in-out; }
  .wg-bar .l { left: 0; background: rgba(47, 194, 127, .28); }
  .wg-bar .r { right: 0; background: rgba(255, 92, 92, .28); }
  .wg-bar .edge { width: 2px; margin-left: -1px; background: rgba(255,255,255,.55); }
  @media (min-width: 600px) { .wg-arena { height: 176px; } }
  .wg img { position: absolute; display: block; pointer-events: none; user-select: none; -webkit-user-select: none; }
  .wg-god { bottom: calc(32% + 8px); height: calc(68% - 14px); transition: filter .6s; }  /* 跟亞空間條留 8px 空隙（素材已裁掉透明邊） */
  .wg-guo { left: 0; } .wg-emp { right: 0; }
  /* 兩邊神祇的領地（1/4 圓，最底層）：大不淨者的腐爛花園貼左下、帝皇的巢都貼右下；調暗一點，不搶神祇和印章 */
  .wg-place { opacity: .7; z-index: 0; }
  .wg-pguo { left: 0; } .wg-pemp { right: 0; }
  .wg-place { bottom: calc(32% - 14px); height: calc(68% * 1.5 + 14px); }  /* 放大 1.5 倍往中間延伸，神站在地面上；上緣超出卡片的部分被切掉 */
  /* 帝皇敗北立繪比較大，縮成 8 成。王座底部是平的，貼底會看起來比對面低：取頭對齊（抬 20%）和底對齊（不抬）的中間，抬 10% */
  /* 帝皇勝利、大不淨者敗北立繪比較胖，縮成 82%，看起來跟盤中差不多大（底部照樣貼齊） */
  .wg-emp[src*="Emperor_win"], .wg-guo[src*="GUO_loss"] { height: calc((68% - 14px) * .82); }
  .wg-emp[src*="Emperor_loss"] { height: calc((68% - 14px) * .8); bottom: calc(32% + 8px + (68% - 14px) * .1); }
  /* 收盤結果印章（win／loss）：上方兩尊神中間的空白正中央，寬度依實際空間調整（不蓋到神），結算時才出現 */
  .wg-result { left: 50%; top: calc((68% - 8px) / 2); width: 40%; height: auto; transform: translate(-50%, -50%) scale(.6); opacity: 0; z-index: 3;
    transition: opacity .6s, transform .6s cubic-bezier(.2, 1.6, .4, 1); }
  .wg-result.on { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  /* 盤前 VS：V 包納垢綠、S 包帝皇金（跟神祇的光一樣），字邊先一圈黑暈跟背景隔開（左邊背景也是綠的），再兩層光暈往外散，字才浮得出來。
     做法：上層是沒加光的原圖；下面兩張光暈層用漸層遮罩在中間（43%～57%）交叉淡化，綠光慢慢過渡成金光，沒有切線。
     padding 讓遮罩範圍比圖大一圈，外側光暈不被截掉 */
  .wg-vsg { z-index: 2; padding: 24px; box-sizing: content-box; }  /* 網頁全域是 border-box，不改的話 padding 會吃掉圖，光暈層變小整個被上層蓋住 */
  .wg-vsg.g { filter: drop-shadow(0 0 1px #000) drop-shadow(0 0 2px #000) drop-shadow(0 0 1px #00ff00) drop-shadow(0 0 3px #00ff00) drop-shadow(0 0 6px #00ff00);
    -webkit-mask-image: linear-gradient(to right, #000 43%, transparent 57%); mask-image: linear-gradient(to right, #000 43%, transparent 57%); }
  .wg-vsg.y { filter: drop-shadow(0 0 1px #000) drop-shadow(0 0 2px #000) drop-shadow(0 0 1px #ffd700) drop-shadow(0 0 3px #ffd700) drop-shadow(0 0 6px #ffd700);
    -webkit-mask-image: linear-gradient(to right, transparent 43%, #000 57%); mask-image: linear-gradient(to right, transparent 43%, #000 57%); }
  .wg-troop { bottom: 0; height: 32%; transition: left 2s ease-in-out, opacity 1s, transform .6s; }
  .wg-tguo { transform: translateX(-100%); } .wg-temp { transform: translateX(0); }
  /* 台股休市（週末、國定假日、颱風假）：亞空間條正中間掛「CASINO CLOSED」招牌 */
  .wg-closed { left: 50%; bottom: calc((32% - 14px) / 2);  /* 亞空間條上緣 14px 是淡出，扣掉後的可見部分置中 */ height: calc(32% * .72); max-width: 82%; object-fit: contain; transform: translate(-50%, 50%); z-index: 3; display: none; }
  .wg-closed.on { display: block; }
  .wg-cloud { bottom: -8%; height: 48%;  /* 往下沉一點（下緣被卡片切掉），雲跟部隊腳下同高 */ transform: translateX(-50%); transition: left 2s ease-in-out, opacity 1s; z-index: 2; }
  /* 神祇一直發光（帝皇金、大不淨者綠）；部隊只在大漲／大跌（±0.5% 以上）時發光 */
  .wg-emp { filter: drop-shadow(0 0 6px #ffd700); } .wg-guo { filter: drop-shadow(0 0 6px #00ff00); }
  .wg-glow-bull .wg-temp { filter: drop-shadow(0 0 6px #ffd700); }
  .wg-glow-bear .wg-tguo { filter: drop-shadow(0 0 6px #00ff00); }
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
  .wg-flash.on { animation: wg-flash .6s 1; }
  .wg-paused .wg-flash { animation-play-state: running !important; }  /* 收盤閃光不能被暫停凍住（13:31 後暫停，會卡在一片白） */
  @keyframes wg-flash { 0% { opacity: 0; } 40% { opacity: 1; } 100% { opacity: 0; } }  /* 先亮到全白，最白時底下換成結算，再淡出 */
  /* 魔獸世界風格戰鬥跳字：粗體黑描邊，從被打的一方頭上冒出往上飄；爆擊先放大彈出再縮回 */
  .wg-float { position: absolute; z-index: 4; font: 900 28px/1 Impact, "Arial Black", "Microsoft JhengHei", sans-serif; white-space: nowrap;
    letter-spacing: .5px; pointer-events: none; --dx: 0px;
    text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 2px 3px rgba(0,0,0,.8);
    animation: wg-up 1.4s ease-out forwards; }
  .wg-float.up { color: #ffd100; } .wg-float.down { color: #3fdc8a; }  /* 帝皇方一律金黃（跟爆擊、大招同色），大不淨者方綠色 */
  .wg-float.crit { font-size: 40px; animation: wg-crit 1.6s ease-out forwards; }
  .wg-float.crit.up { color: #ffd100; } .wg-float.crit.down { color: #8dff3a; }
  .wg-float.say { font-size: 19px; font-weight: 800; }
  /* 大招傷害（魔獸世界浮動戰鬥文字：×2 的巨大數字，先巨大彈出再縮回，發光描邊） */
  .wg-float.ult { top: 26% !important; font-size: 46px; text-align: center; animation: wg-ult 2s ease-out forwards;
    text-shadow: -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 0 10px currentColor; }
  .wg-float.say.hi { top: 3% !important; }  /* 大招台詞固定在最上面，不疊到大數字 */
  .wg-float.ult.up { color: #ffd100; } .wg-float.ult.down { color: #8dff3a; }
  @keyframes wg-ult { 0% { opacity: 0; transform: translate(-50%, 0) scale(3); } 8% { opacity: 1; transform: translate(-50%, -2px) scale(1.6); }
    20% { transform: translate(-50%, -4px) scale(1.25); } 65% { opacity: 1; transform: translate(-50%, -10px) scale(1.2); }
    100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), -40px) scale(1.15); } }
  @keyframes wg-up { 0% { opacity: 0; transform: translate(-50%, 4px) scale(.7); } 12% { opacity: 1; transform: translate(-50%, 0) scale(1.1); }
    22% { transform: translate(-50%, -4px) scale(1); } 100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), -38px) scale(.95); } }
  @keyframes wg-crit { 0% { opacity: 0; transform: translate(-50%, 0) scale(2.4); } 10% { opacity: 1; transform: translate(-50%, -2px) scale(1.5); }
    25% { transform: translate(-50%, -6px) scale(1.2); } 70% { opacity: 1; } 100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), -42px) scale(1.1); } }
  .wg-ticker { height: 24px; line-height: 24px; padding: 0 10px; font-size: 14px; font-weight: 600;  /* 跟卡片標題（例如「台指期」）同字級 */ color: #d6dbe3; background: #111419;
    border-top: 1px solid var(--line); white-space: nowrap; overflow: hidden; }
  .wg-ticker span { display: inline-block; vertical-align: top; }
  .wg-ticker .tz { color: #b06cff; } .wg-ticker .tb { color: var(--up); } .wg-ticker .tr { color: var(--down); }  /* 奸奇紫、多軍紅、空軍綠 */
  /* 跑馬燈：放不下的長句接成「句子＋空白＋同一句」，一直往左等速捲，捲完一輪剛好接回開頭，無縫循環。
     先從頭顯示停 1.5 秒才開始捲（不從右邊外面捲進來，否則開頭的「【」會在右下角露出一槓） */
  .wg-ticker span.scroll { animation: wg-marq var(--dur, 14s) linear 1.5s infinite; }
  .wg-ticker .gap { display: inline-block; width: 3em; }
  @keyframes wg-marq { from { transform: translateX(0); } to { transform: translateX(var(--shift, 0)); } }
  /* 普通攻擊：口水／劍氣從攻擊方身前水平飛向對方人物中線；被打的一方震動、頭上冒骷髏 */
  .wg-shot { z-index: 4; transition: left .9s linear; }  /* 飛行 0.9 秒 */
  /* 大招：人物 2/3 大、飛 1.1 秒；大不淨者丟納垢靈走拋物線，帝皇的靈能閃電直線 */
  .wg-shot.ult { z-index: 5; transition: left 1.1s linear; }
  .wg-shot.arc { animation: wg-arc 1.1s ease-in-out; }
  @keyframes wg-arc { 0% { translate: 0 0; } 50% { translate: 0 -22px; } 100% { translate: 0 0; } }
  /* 大招命中：明顯的三下（每 0.25 秒一下，左右交替），跟三個骷髏同步 */
  .wg-hurt-big { animation: wg-hurtb .75s 1; }
  @keyframes wg-hurtb { 0%, 22%, 33%, 55%, 66%, 88%, 100% { translate: 0; }
    6% { translate: -8px 1px; } 14% { translate: 5px 0; } 39% { translate: 8px -1px; } 47% { translate: -5px 0; } 72% { translate: -8px 1px; } 80% { translate: 5px 0; } }
  .wg-hurt { animation: wg-hurt .28s 1; }
  @keyframes wg-hurt { 0%,100% { translate: 0; } 20% { translate: -4px 0; } 40% { translate: 4px 0; } 60% { translate: -3px 0; } 80% { translate: 3px 0; } }
  .wg-skull { z-index: 4; animation: wg-skull 1s ease-out forwards; }
  @keyframes wg-skull { 0% { opacity: 0; transform: translateY(4px) scale(.7); } 15% { opacity: 1; transform: translateY(0) scale(1.05); } 100% { opacity: 0; transform: translateY(-22px) scale(1); } }
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
    counterBear: '【反攻號角】大不淨者吹響腐爛號角，納垢大軍趁多軍追高時全面反撲！',
    counterBull: '【反攻號角】帝皇之劍再度出鞘，忠誠軍團自谷底發動絕地反攻！',
    rare: {
      tsmcLimitUp: ['【星炬超載】 空頭異端瞬間汽化灰飛煙滅！', '【原體歸來】 泰拉全境進入絕對忠誠狂歡！', '【神聖光鑄】 機械神教啟動萬機神泰坦！'],
      tsmcLimitDown: ['【卡迪亞破碎】 恐懼之眼裂隙直撲泰拉皇宮！', '【王座悲鳴】 慈父毒液倒灌黃金王座大廳！', '【泰拉陷落】 阿斯塔特忠誠軍團瀕臨全滅！'],
      megaBull: ['【不屈大遠征】 帝皇戰艦遮天蔽日！', '【神聖裁決】 百萬靈能泰坦踏碎一切技術阻力！', '【泰拉長紅】 帝皇意志燃燒納垢花園！'],
      megaBear: ['【伊斯特凡大屠殺】 多軍主力深陷綠色毒沼血肉磨坊！', '【混沌浩劫】 四神共選之毀滅風暴橫掃全場！', '【慈父滅世】 融資多軍盡數化為亞空間死靈！'],
      upperShadow: ['【高地血祭】 阿斯塔特前鋒覆沒！', '【靈能反噬】 多方遭遇萬噸毒霧伏擊！', '【虛假破曉】 衝鋒號角變成了輓歌！'],
      lowerShadow: ['【原體甦醒·馬庫拉格之光】 基里曼自萬年靜滯力場中赫然睜眼！', '【終局豪賭·突入復仇之魂】 帝皇率軍發動絕境傳送直插空頭心臟！',
        '【絕地突擊·渥姆伍德烈焰】 天際驟然爆發刺目空投火光！在暴跌廢墟上築起百點鋼鐵下影線！', '【999.M41·終焉時刻的咆哮】 百萬忠誠買盤築起永不陷落的奇蹟防線！'],
    },
    // 擴充戰報（gemini-code 附件）：多方、空方情勢各一池，銀河快訊隨機穿插
    bullNews: ['基因原體基里曼頒布《不屈遠征令》，百萬戰艦自泰拉全線啟航，多軍士氣突破天際！', '禁軍統領瓦洛里斯率領泰拉禁衛走出皇宮，以不可撼動之勢粉碎空方先鋒！',
      '獅王萊恩·艾爾莊森自密林迷霧中甦醒，忠誠重誓響徹泰拉星區！', '聖吉列斯的血脈在戰場上爆發神聖狂怒，血天使黑色狂怒部隊將綠色賣壓徹底撕碎！',
      '血鴉戰團『意外尋獲』遺失千年的帝皇級泰坦，反手將重砲對準空頭陣地！', '極限戰士一連老兵誓死固守極地堡壘，頑強粉碎空軍三輪猛烈攻勢！',
      '太空狼雷狼騎兵撕裂亞空間凍土，以凶暴狂飆擊潰敵軍側翼！', '黑色聖堂發動永恆十字軍誓約，鏈鋸劍與熱熔火光將異端退路盡數封死！',
      '暗黑天使內環部隊成功捕獲一名墮落天使，多方防線重歸絕對肅正！', '火蜥蜴戰團噴火小隊以救世之火清空戰壕，在暴跌邊緣守下平民據點！',
      '白疤摩步連發動狂風閃電突擊，在空軍來不及撤單前完成萬手穿插！', '審判庭異端審問官拔槍處決內鬼交易員，肅清潛伏在多軍內部的空頭奸細！',
      '大賢者考爾成功研發全新原鑄武裝，神聖產能指數級爆發！', '機械神教勘探隊挖掘出古老 STC 標準建造模板碎片，科技蠻力強勢拉盤！',
      '戰將級泰坦『神聖復仇號』鳴響破天汽笛，火山砲一擊抹平空軍整條陣線！', '卡塔昌叢林鬥士在盤面密林佈下致命陷阱，空方追殺部隊全軍覆沒！',
      '塔蘭沙漠騎兵奇襲截斷混沌補給線，綠色賣壓瞬間後繼無力！', '國教聖女賽勒斯汀展開金色羽翼降臨，以神聖真火淨化一切看空悲觀思潮！',
      '刺客庭凡迪卡刺客於三千碼外精準爆頭空頭指揮官，空軍陣型大亂！'],
    bearNews: ['掠奪者阿巴頓發動第十三次黑暗遠征，黑石要塞殘骸撞穿多方核心均線！', '安格隆在努西利亞的血誓中覺醒，紅砂奴隸狂怒引爆停損斷頭潮！',
      '莫塔里安在查拉頓星區散播七重瘟疫，多軍戰壕全面潰爛流膿！', '馬格努斯在普羅斯佩羅燃燒的灰燼中吟唱咒文，千子靈能風暴撕裂多頭均線！',
      '福格瑞姆沉溺於極致感官殺戮，紫金魔光所過之處多方陣容盡數瓦解！', '荷魯斯叛變了！半數軍團反戈一擊，伊斯塔梵三號軌道滅絕毒彈傾瀉而下！',
      '懷言者在考斯星系點燃背叛之火，恆星輻射重創多軍主力艦隊！', '佩圖拉博佈設『鋼鐵之籠』死局，鋼鐵勇士重砲日夜轟擊將多頭碾成齏粉！',
      '午夜領主在巢都散播極致恐懼，恐慌拋售情緒如瘟疫般光速擴散！', '『我是阿爾法瑞斯！』潛伏在多軍總部的休眠特工集體啟動，後台掛單全部逆轉！',
      '恐虐嗜血狂魔率領放血鬼大軍突入獅門，泰拉外層防線血流成河！', '混沌騎士泰坦踏碎帝國聖堂，褻瀆鳴笛聲震散了所有抄底買盤！',
      '奸奇命運編織者吹亂因果絲線，多方技術指標全面失真破底！', '色孽尋歡魔女奏響刺耳尖嘯，融資散戶心智崩潰引發踩踏！',
      '亞空間大裂隙橫貫銀河，無數多軍補給艦隊迷失在虛空暴風雨中！', '腐敗的變異教派在鑄造世界地底暴動，多軍後勤彈藥全面告急！'],
    galaxy: ['【銀河快訊】碎骨者高格庫爾向全銀河發動 WAAAGH！無數太空廢船正朝戰場全速前進！', '【銀河快訊】碎骨者在哈米吉多頓前線與亞瑞克政委隔空互瞪，雙方部隊暫時按兵不動！',
      '【銀河快訊】技師小子發動『俺尋思之力』，用路邊撿來的廢鐵拼出了一架超大型古巨基！', '【銀河快訊】瘋狂飛行小子因方向盤卡死，直接駕機撞進了不知哪一邊的主力戰艦！',
      '【銀河快訊】血斧氏族傭兵向路過的交戰雙方收取十袋牙齒，聲稱這是『合法過路費』！', '【銀河快訊】歐克獸人發現紅色載具跑得比較快，全軍正忙著把裝甲塗成大紅色！',
      '【銀河快訊】機械神教勘探隊誤觸古老開關，地底深處整座太空死靈墓穴悄然甦醒！', '【銀河快訊】無盡者塔拉辛路過戰場，順手把交戰中的一整支連隊收進了靜滯立方體當展品！',
      '【銀河快訊】神諭者歐拉坎夜觀星象，算出一萬年後的今天星圖排列極度不吉利！', '【銀河快訊】寂靜王薩雷赫率領巨型王權駁船自星系邊緣歸來，冷漠注視著下方的凡人廝殺！',
      '【銀河快訊】索特克王朝法皇伊莫特克發出跨星系通訊，勒令交戰雙方立刻滾出他的領地！', '【銀河快訊】碎裂星神『欺詐者』的虛影在星圖中一閃而過，留下一串意味深長的冷笑！',
      '【銀河快訊】審判庭在邊境星域發現蟲巢艦隊利維坦先遣觸角，整片星系生物質警報大作！', '【銀河快訊】巢都底層下水道爆發基因竊取者教團武裝起義，三臂礦工高呼四臂神皇聖名！',
      '【銀河快訊】亞空間陰影籠罩戰場上空，全體靈能者集體偏頭痛！', '【銀河快訊】蟲巢艦隊克拉肯兵臨伊揚登方舟世界，靈族遊俠急召幽冥衛士出陣！',
      '【銀河快訊】歐克蠻牛在奧克塔流斯星區狂扁泰倫蟲族，雙方打得難分難解忘了誰才是入侵者！', '【銀河快訊】死神軍團嘗試喚醒死神伊亞奈登，網道深處傳來未知靈能震顫！',
      '【銀河快訊】科摩羅暗黑靈族突擊艦自陰影裂隙殺出，抓走了幾百名倒楣的後勤人員回去競技場！', '【銀河快訊】先知艾爾德拉德再次波動命運之線，沒人知道這老頭到底想坑誰！',
      '【銀河快訊】遠見指揮官拔出黎明之刃，帶領遠見飛地戰隊脫離以太議會的控制！', '【銀河快訊】暗影之日指揮官運用隱形匿蹤戰術，在無人察覺之際滲透了側翼防禦塔！',
      '【銀河快訊】帝皇在黃金王座深處持續開發網道，神聖靈能光芒在王座廳周圍忽明忽暗！', '【銀河快訊】馬格努斯自亞空間看到了未來！',
      '【銀河快訊】奸奇正在亞空間深處偷偷注視著戰場', '【銀河快訊】帝國內務部經過三百年嚴格審核，終於將第一批爆彈槍彈藥送達早已覆滅的要塞！',
      '【銀河快訊】審判官懷疑自己的機械左手可能被混沌腐化，正在召集審問庭開會調查自己！', '【銀河快訊】行商浪人艦隊宣稱發現一顆由純金打造的未開化星球，正私下向各方兜售座標！',
      '【銀河快訊】導航員家族回報星炬光芒微幅晃動，建議全銀河艦長在亞空間航行時握緊扶手！',
      '【爆彈神話】極限老兵馬拉姆·凱多單槍匹馬擊殺三隻大不淨者、四隻萬變魔君與五隻地獄獸！', '【個人秀時間】戰場傳來怒吼！馬拉姆·凱多手持爆彈槍突入空軍指揮所，三隻大不淨者慘遭鏈鋸劍原地大卸八塊！',
      '【格拉亞大捷】監測到一名叫馬拉姆·凱多的阿斯塔特獨自踏平空軍重鎮，屠盡五隻地獄獸與四隻萬變魔君，多軍士氣突破天際！', '【忠誠暴走】馬拉姆·凱多：『我的仇恨就是我的護盾！』'],
    floatBull: ['忠誠推進！', '多單挺進！', '為了帝皇！', '神聖護盤！'],
    floatBullCrit: ['異端！通通淨化！', '神皇之怒！', '靈能滅絕！', '全面軋空！'],
    floatBear: ['慈父賜福！', '瘟疫蔓延！', '主力倒貨！', '賣壓湧現！'],
    floatBearCrit: ['慈父包容世間一切生靈！', '納垢大瘟疫！', '亞空間風暴逆襲！', '加入慈父納垢與他的「快樂大家庭」！'],
  };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  let lastRare = null;
  function report(pct, hhmm, rare) {
    if (hhmm >= '09:00' && hhmm <= '09:05') return `${D.open}`;
    if (hhmm >= '13:25' && hhmm < '13:30') return `${D.climax}`;
    if (hhmm >= '13:30') return pct >= 0 ? D.bullWin : D.bearWin;
    // 罕見事件（長影線常常整天成立）：剛出現時播一次，之後只佔四分之一，不然整天都是同一類戰報
    if (rare && (rare !== lastRare || Math.random() < 0.25)) { lastRare = rare; return pick(D.rare[rare]); }
    lastRare = rare;
    const { bull, bear, stalemate } = D;
    // 兩成機率插播銀河快訊；有方向時一半用擴充戰報、一半用組句
    if (Math.random() < 0.2) return pick(D.galaxy);
    if (pct > 0.1 && Math.random() < 0.5) return pick(D.bullNews);
    if (pct < -0.1 && Math.random() < 0.5) return pick(D.bearNews);
    if (pct >= -0.1 && pct <= 0.1 && Math.random() < 0.5) return pick(D.galaxy);
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
      <img class="wg-place wg-pguo" src="${A}GUO_place.webp" alt="">
      <img class="wg-place wg-pemp" src="${A}Emperor_place.webp" alt="">
      <div class="wg-bar"><i class="l"></i><i class="r"></i><i class="edge"></i></div>
      <img class="wg-god wg-guo" alt="">
      <img class="wg-god wg-emp" alt="">
      <img class="wg-troop wg-tguo" src="${A}GUO_troops.webp" alt="">
      <img class="wg-troop wg-temp" src="${A}Emperor_troops.webp" alt="">
      <img class="wg-cloud" src="${A}fight-cloud.webp" alt="">
      <img class="wg-closed" src="${A}casino_closed.webp" alt="休市">
      <img class="wg-result" alt="">
      <img class="wg-result wg-vsg g" src="${A}vs.webp" alt=""><img class="wg-result wg-vsg y" src="${A}vs.webp" alt="">
      <div class="wg-flash"></div>
    </div>
    <div class="wg-ticker"><span></span></div>
    ${debug ? '<div class="wg-dbg">時間<input type="range" min="470" max="815" step="1" value="600"><span class="t">10:00</span>漲跌%<input type="number" step="0.1" value="0"></div>' : ''}`;
  const $ = (s) => el.querySelector(s);
  const arena = $('.wg-arena');
  const guo = $('.wg-guo'), emp = $('.wg-emp'), tg = $('.wg-tguo'), te = $('.wg-temp'), cloud = $('.wg-cloud');
  const setSrc = (img, src) => { if (img.getAttribute('src') !== src) img.src = src; };

  let data = { twii: null, tsmc: null, tradingDay: true };
  // 素材尺寸和人物中線（scripts/build_game_assets.py 產生）
  let meta = { Emperor: { w: 287, h: 240, cx: 0.54 }, GUO: { w: 371, h: 240, cx: 0.53 }, Emperor_win: { w: 343, h: 240 }, GUO_loss: { w: 251, h: 240 }, win: { w: 336, h: 120 } };
  fetch(`${A}meta.json`).then((r) => r.json()).then((m) => { meta = m; draw(false); }).catch(() => {});
  // 中性新聞故事線（game/story.json，由 mini_game/storyline.txt 產生）：併進銀河快訊的抽選池
  fetch(`${A}story.json`).then((r) => r.json()).then((s) => { if (Array.isArray(s)) D.galaxy = D.galaxy.concat(s); }).catch(() => {});
  let lastPrice = null;
  let resolvedShown = false;
  let lastPhase = null;   // 上一次畫的階段：用來判斷是不是「看著」收盤（要播轉場）
  let holdUntil = 0;
  let lastTickerKey = '';
  let tickerAt = 0;  // 盤中每 30 秒換一句戰報
  let counterShown = null;  // 這一波反攻號角播過了沒（同一波只播一次）
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
      const k = extra.includes('ult') ? 1.65 : crit ? 1.5 : 1.1;
      let half = (f.offsetWidth * k) / 2 + 8;
      if (hi - lo < 2 * half) {  // 比中間的空間寬：字縮小到放得下
        const size = parseFloat(getComputedStyle(f).fontSize) * (hi - lo) / (2 * half);
        f.style.fontSize = `${Math.max(9, size)}px`;
        half = (f.offsetWidth * k) / 2 + 8;
      }
      const want = (parseFloat(f.style.left) / 100) * a.width;
      const cx = hi - lo < 2 * half ? (lo + hi) / 2 : Math.min(hi - half, Math.max(lo + half, want));
      f.style.left = `${(cx / a.width) * 100}%`;
    }
    setTimeout(() => f.remove(), extra.includes('ult') ? 2100 : 1700);
    if (crit) { el.classList.remove('wg-shake'); void el.offsetWidth; el.classList.add('wg-shake'); }
  }

  // 戰鬥：交火期間每 3 秒（試撮 1.5 秒）跳一次傷害，跟著大盤情勢：漲越多多方越常出手、傷害越大、越容易爆擊。
  // 多方打納垢 → 戰線左邊紅字；空方打帝皇 → 戰線右邊綠字。數字是效果，不是真實點數
  let front = 50;
  // 短線動能（加權 15 分 K）：現價跟約 30 分鐘前（兩根之前的收盤）比的 %；今天高點回落、低點反彈的 %
  function momentum() {
    const t = data.twii;
    const k = (t?.candles ?? []).filter(Boolean);
    const price = priceNow();
    if (!t?.prev || price == null || k.length < 3) return { mom: 0, pull: 0, bounce: 0 };
    const ref = k[k.length - 3][3];
    const hi = Math.max(price, ...k.map((x) => x[1])), lo = Math.min(price, ...k.map((x) => x[2]));
    return { mom: (price - ref) / t.prev * 100, pull: (price - hi) / t.prev * 100, bounce: (price - lo) / t.prev * 100 };
  }
  // 情勢分數（-1 空 … +1 多）：今天漲跌幅 55%、短線動能 45%。漲多但正在下滑時，大不淨者出手變多（反撲）
  function score(pct) {
    return 0.55 * Math.tanh(pct / 0.8) + 0.45 * Math.tanh(momentum().mom / 0.25);
  }
  // 反攻號角：收漲但從高點回落 ≥0.4% 且短線在跌 → 空軍反攻；收跌但從低點反彈 ≥0.4% 且短線在漲 → 多軍反攻
  function counterattack(pct) {
    const m = momentum();
    if (pct > 0 && m.pull <= -0.4 && m.mom < 0) return 'bear';
    if (pct < 0 && m.bounce >= 0.4 && m.mom > 0) return 'bull';
    return null;
  }

  function hit() {
    const pct = pctNow();
    const sc = score(pct);
    const bull = Math.random() < 0.5 + 0.42 * sc;
    const edge = Math.min(1, Math.abs(sc) * 1.4);                       // 情勢一面倒的程度
    const favored = bull === sc >= 0;
    const crit = Math.random() < (favored ? 0.25 + 0.25 * edge : 0.12);  // 爆擊率：優勢方 25-50%、劣勢方 12%
    let dmg = Math.round((40 + Math.random() * 160) * (favored ? 1 + edge : 1 - 0.4 * edge));
    if (crit) dmg = Math.round(dmg * (2 + Math.random()));
    // 數字出現在被打的一方旁邊：打大不淨者 → 他的右邊；打帝皇 → 帝皇的左邊（float 會再限制在兩尊神中間）
    const ar = arena.getBoundingClientRect();
    const gR = ar.width ? ((guo.getBoundingClientRect().right - ar.left) / ar.width) * 100 : 30;
    const eL = ar.width ? ((emp.getBoundingClientRect().left - ar.left) / ar.width) * 100 : 70;
    const x = bull ? gR + 2 + Math.random() * 8 : eL - 2 - Math.random() * 8;
    // 神祇出手：多方＝帝皇揮劍氣打大不淨者，空方＝大不淨者吐口水打帝皇；爆擊連打兩發
    const side = bull ? 'up' : 'down';
    // 大招（三成）：喊中文台詞＋放大招打一發，傷害 ×2（跟爆擊同時發生就用爆擊台詞）
    if (Math.random() < 0.3) {
      ultimate(bull, () => {
        float(`${dmg * 2}!`, side, true, x, ' ult');
        float(pick(bull ? (crit ? D.floatBullCrit : D.floatBull) : (crit ? D.floatBearCrit : D.floatBear)), side, false, null, ' say hi');
      });
      return;
    }
    // 普通攻擊：每一發命中各跳一個數字；爆擊兩發 → 兩個數字（第二發傷害略有差異）
    attack(bull, crit, (i) => {
      const n = i ? Math.round(dmg * (0.75 + Math.random() * 0.5)) : dmg;
      float(crit ? `${n}!` : String(n), side, crit, x + (i ? (bull ? -4 : 4) : 0));
    });
  }

  // 一發攻擊：攻擊特效（人物 1/4 高）從攻擊方身前水平飛到被打方的人物中線，命中時被打方震動、頭上冒骷髏（人物 1/5 高）
  function shot(bull, onHit, ult = false) {
    const a = arena.getBoundingClientRect();
    const from = (bull ? emp : guo).getBoundingClientRect();
    const to = (bull ? guo : emp).getBoundingClientRect();
    if (!a.width || !from.width || !to.width) return;
    const h = from.height;
    const img = document.createElement('img');
    img.className = `wg-shot${ult ? ' ult' : ''}${ult && !bull ? ' arc' : ''}`;
    img.src = `${A}${bull ? 'Emperor' : 'GUO'}_attack${ult ? '2' : ''}.webp`;
    img.style.height = `${h * (ult ? 2 / 3 : 1 / 4)}px`;
    img.style.top = `${from.top - a.top + h * (ult ? 0.18 : 0.38)}px`;
    // 大招圖很寬（靈能閃電 300×160）：中心飛到目標中心的話前緣會穿過軀幹打到另一邊的手臂，
    // 改成前緣剛好進到軀幹（人物重心再過去 10% 圖寬）就消失
    const tm = meta[bull ? 'GUO' : 'Emperor'];
    const torso = to.left + to.width * (tm?.cx ?? 0.5) - a.left;
    const iw = h * (2 / 3) * (bull ? 300 : 256) / 160;
    const target = ult ? torso + (bull ? 1 : -1) * iw * 0.4 : (to.left + to.right) / 2 - a.left;
    img.style.left = `${(bull ? from.left : from.right) - a.left}px`;
    img.style.transform = 'translateX(-50%)';
    arena.appendChild(img);
    void img.offsetWidth;
    img.style.left = `${target}px`;
    setTimeout(() => {
      img.remove();
      const god = bull ? guo : emp;
      const hurt = ult ? 'wg-hurt-big' : 'wg-hurt';
      god.classList.remove('wg-hurt', 'wg-hurt-big'); void god.offsetWidth; god.classList.add(hurt);
      const sk = document.createElement('img');
      sk.className = 'wg-skull';
      sk.src = `${A}damage.webp`;
      const sh = to.height / 5;
      sk.style.height = `${sh}px`;
      sk.style.left = `${to.left - a.left + Math.random() * Math.max(0, to.width - sh)}px`;
      sk.style.top = `${to.top - a.top + to.height * 0.05}px`;
      arena.appendChild(sk);
      setTimeout(() => sk.remove(), 1100);
      if (ult) {  // 大招：再兩個骷髏，跟神祇的三下震動同步（0.25、0.5 秒），卡片也震一下
        for (const d of [0.25, 0.5]) {
          const s2 = sk.cloneNode();
          s2.style.left = `${to.left - a.left + Math.random() * Math.max(0, to.width - sh)}px`;
          s2.style.top = `${to.top - a.top + to.height * (0.05 + Math.random() * 0.3)}px`;
          s2.style.opacity = '0';  // 輪到它之前先不顯示（動畫延遲期間）
          s2.style.animationDelay = `${d}s`;
          s2.style.animationFillMode = 'both';
          arena.appendChild(s2);
          setTimeout(() => s2.remove(), 1000 + d * 1000 + 50);
        }
        el.classList.remove('wg-shake'); void el.offsetWidth; el.classList.add('wg-shake');
      }
      onHit?.();
    }, ult ? 1110 : 910);
  }
  function ultimate(bull, onHit) { shot(bull, onHit, true); }
  function attack(bull, crit, onHit) {
    shot(bull, () => onHit?.(0));
    if (crit) setTimeout(() => shot(bull, () => onHit?.(1)), 250);  // 爆擊：快速第二發，被打方連震兩下、兩個骷髏
  }
  let hitTimer = null;
  let chargeUntil = 0;  // 開盤衝鋒結束的時間
  let walkStarted = false;  // 這次行軍已經放好起點了沒

  function draw(fromData) {
    const { mins, hhmm } = now();
    const trading = debug || data.tradingDay;
    $('.wg-closed').classList.toggle('on', !trading);
    const pct = pctNow();
    const live = trading && mins >= 540 && mins < 811;          // 09:00-13:31 動畫
    // 交易日 08:00 前和休市日：停在上一個交易日的結算畫面；08:00-09:00 待命（兩軍貼兩側、中間 VS）；
    // 09:00 起行軍（兩軍同速慢慢往中間走，不碰撞），第一次抓到今天的加權指數才衝 2 秒碰撞開打（開盤後才打開網頁就直接交火）
    const t = data.twii?.time ? new Date(data.twii.time + 8 * 3600000) : null;
    const opened = mins >= 540 && (debug || (t && t.toISOString().slice(0, 10) === new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
      && t.getUTCHours() * 60 + t.getUTCMinutes() >= 540));
    if (mins < 540) chargeUntil = 0;
    if (opened && !chargeUntil && (lastPhase === 'pre' || lastPhase === 'march') && mins < 805) {
      chargeUntil = Date.now() + 2000;
      setTimeout(() => draw(false), 2050);
    }
    const phase = !trading || mins < 480 ? 'last' : mins < 540 ? 'pre' : mins < 805 ? (!opened || Date.now() < chargeUntil ? 'march' : 'battle')
      : mins < 810 ? 'tension' : 'resolved';
    const done = phase === 'resolved' || phase === 'last';
    // 收盤轉場：親眼看著交火進入收盤時，先打白光（保留盤中畫面），最白的那一刻（0.24 秒）才換成結算畫面
    if (phase === 'resolved' && (lastPhase === 'battle' || lastPhase === 'tension') && !resolvedShown) {
      resolvedShown = true;
      holdUntil = Date.now() + 240;
      const fl = $('.wg-flash');
      fl.classList.remove('on'); void el.offsetWidth; fl.classList.add('on');
      setTimeout(() => fl.classList.remove('on'), 700);
      setTimeout(() => draw(false), 250);
    }
    lastPhase = phase;
    if (Date.now() < holdUntil) return;  // 白光還沒到最亮：畫面先停在盤中
    const bullWin = pct >= 0;
    const paused = !live || document.hidden || !visible;
    el.classList.toggle('wg-paused', paused);
    el.classList.toggle('wg-march', phase === 'march');
    el.classList.toggle('wg-battle', phase === 'battle');
    el.classList.toggle('wg-tension', phase === 'tension');
    arena.classList.toggle('wg-glow-bull', pct > 0.5 && !done);
    arena.classList.toggle('wg-glow-bear', pct < -0.5 && !done);

    // 神祇：盤中播動畫，暫停時靜止圖，結算後換勝／敗立繪
    if (done) {
      setSrc(emp, `${A}Emperor_${bullWin ? 'win' : 'loss'}.webp`);
      setSrc(guo, `${A}GUO_${bullWin ? 'loss' : 'win'}.webp`);
    } else {
      setSrc(emp, `${A}Emperor${paused ? '_still' : ''}.webp`);
      setSrc(guo, `${A}GUO${paused ? '_still' : ''}.webp`);
    }

    // 帝皇（一般／靜止圖）：人物中線到右緣的距離＝大不淨者人物中線到左緣的距離；勝敗立繪照舊貼右
    {
      const gh = guo.getBoundingClientRect().height || 0;
      if (!done && gh && meta.Emperor && meta.GUO) {
        const gw = gh * meta.GUO.w / meta.GUO.h, ew = gh * meta.Emperor.w / meta.Emperor.h;
        emp.style.right = `${Math.max(0, gw * meta.GUO.cx - ew * (1 - meta.Emperor.cx))}px`;
      } else emp.style.right = '0';
    }

    // 戰線：昨收在中間，漲往左推（帝皇在右邊進攻），tanh 讓 ±2% 接近邊界
    front = 50 - 40 * Math.tanh(pct / 1.2);
    // 部隊：待命時完整貼在兩側；抓到指數後 2 秒 CSS 過渡衝到戰線開打。
    // 09:00 起還沒有今天的指數時行軍：兩邊同一速度往中間走，09:05（最晚一定抓得到指數）走完，
    // 走的距離＝離中線較近那邊的 85%，所以抓到指數前一定不會碰撞，之後停住等
    const aw = arena.getBoundingClientRect().width || 1;
    const gW = (tg.getBoundingClientRect().width / aw) * 100 || 25, eW = (te.getBoundingClientRect().width / aw) * 100 || 20;
    const walking = phase === 'march' && !opened;
    if (walking) {
      const sec = debug ? mins * 60 : (Date.now() / 1000 + 8 * 3600) % 86400;
      const walk = 0.85 * Math.min(50 - gW, 100 - eW - 50);         // 兩邊走一樣遠
      const at = (k) => { tg.style.left = `${gW + walk * k}%`; te.style.left = `${100 - eW - walk * k}%`; };
      if (!walkStarted) {  // 中途才打開：先放到現在該在的位置，再接著走
        walkStarted = true;
        for (const x of [tg, te]) x.style.transition = 'none';
        at(Math.min(1, Math.max(0, (sec - 540 * 60) / 300)));
        void tg.offsetWidth;
      }
      for (const x of [tg, te]) x.style.transition = `left ${Math.max(1, 545 * 60 - sec)}s linear, opacity 1s, transform .6s`;
      at(1);
    } else {
      walkStarted = false;
      for (const x of [tg, te]) x.style.transition = '';
      const q = phase === 'pre' ? 0 : 1;
      tg.style.left = `${gW + (front - gW) * q}%`;
      te.style.left = `${100 - eW + (front - (100 - eW)) * q}%`;
    }
    cloud.style.left = `${front}%`;
    // 戰線條：交火時照戰線分紅綠＋白色拉扯線；行軍、待命、收盤後只有亞空間底圖
    const split = phase === 'battle' || phase === 'tension' ? front : null;
    $('.wg-bar .l').style.width = split == null ? '0' : `${split}%`;
    $('.wg-bar .r').style.width = split == null ? '0' : `${100 - split}%`;
    $('.wg-bar .edge').style.left = split == null ? '-10px' : `${split}%`;
    const fighting = phase === 'battle' || phase === 'tension';
    cloud.style.opacity = fighting ? 1 : 0;
    const stamp = $('.wg-result');
    const standby = phase === 'pre';
    if (done) setSrc(stamp, `${A}${bullWin ? 'win' : 'loss'}.webp`);
    else if (standby) setSrc(stamp, `${A}vs.webp`);
    stamp.classList.toggle('on', done || standby);
    const vsg = el.querySelectorAll('.wg-vsg');
    for (const g of vsg) g.classList.toggle('on', standby && !done);
    if (done || standby) {
      // 以卡片中線置中，左右空隙一樣：寬度＝離中線最近的神祇邊緣到中線的距離 × 2。
      // 用「收漲」那組立繪（帝皇勝利立繪最寬）算，收跌的 DEFEAT 也用同一個大小
      const a = arena.getBoundingClientRect();
      if (a.width) {
        const h = a.height * 0.68 - 14;                                    // 神祇顯示高度
        const widest = Math.max(h * 0.82 * (343 / 240), h * 0.82 * (251 / 240));  // Emperor_win、GUO_loss（顯示 82%）的寬
        const ratio = meta.win ? meta.win.w / meta.win.h : 2.8;  // 一律照 win 的大小：DEFEAT、VS 用同樣高度
        const w = Math.max(40, Math.min(2 * (a.width / 2 - widest) - 12, (a.height * 0.68 - 16) * ratio));
        stamp.style.width = 'auto';
        stamp.style.height = `${w / ratio}px`;
        stamp.style.left = '50%';
        for (const g of vsg) { g.style.width = 'auto'; g.style.height = stamp.style.height; }
      }
    }
    if (done) {
      tg.style.opacity = te.style.opacity = 0;
      (bullWin ? te : tg).style.transform = bullWin ? 'translateX(-12px)' : 'translateX(calc(-100% + 12px))';
    } else {
      tg.style.opacity = te.style.opacity = 1;
      tg.style.transform = 'translateX(-100%)';
      te.style.transform = 'translateX(0)';
      if (!done) resolvedShown = false;
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
    // 反攻號角：交火中情勢剛翻轉時插播一次
    const counter = fighting ? counterattack(pct) : null;
    const newCounter = counter && counter !== counterShown;
    if (!counter) counterShown = null;
    if (newCounter || fromData || !lastTickerKey.startsWith(phase) || (live && !paused && Date.now() - tickerAt > 30000)) {
      tickerAt = Date.now();
      if (newCounter) counterShown = counter;
      const text = newCounter ? (counter === 'bear' ? D.counterBear : D.counterBull)
        : phase === 'last' ? (bullWin ? D.bullWin : D.bearWin)
        : phase === 'pre' ? '【待命】雙方大軍集結於亞空間兩端，等待 09:00 開盤號角'
          : report(pct, hhmm, rareEvent(data.twii, data.tsmc, pct));
      const span = $('.wg-ticker span');
      span.textContent = text;
      span.innerHTML = span.innerHTML.replace('【最後試撮倒數】', '<b class="tz">【最後試撮倒數】</b>')
        .replace('【帝皇之光普照】', '<b class="tb">【帝皇之光普照】</b>').replace('【慈父賜福全場】', '<b class="tr">【慈父賜福全場】</b>')
        .replace('【反攻號角】', `<b class="${counter === 'bear' ? 'tr' : 'tb'}">【反攻號角】</b>`);
      span.classList.remove('scroll');
      const w = span.scrollWidth;
      if (w > $('.wg-ticker').clientWidth - 20) {  // 放不下才捲：接一份同樣的句子，捲一輪（句子＋空白）剛好無縫，約每秒 35px
        span.innerHTML += `<i class="gap"></i>${span.innerHTML}`;
        const loop = span.scrollWidth - w;
        span.style.setProperty('--shift', `${-loop}px`);
        span.style.setProperty('--dur', `${loop / 35}s`);
        span.classList.add('scroll');
      }
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
