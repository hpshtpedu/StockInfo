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
  /* 休息時間：開市日收盤後 13:45 起兩軍在戰場上睡覺的圖疊在亞空間上（睡到隔天 08:00，隔天休市就到午夜），淡入淡出；
     跟亞空間共用條子上緣 14px 的淡出遮罩，夜空接進上方戰場。圖比條子高，取下半部（睡著的部隊） */
  .wg-bar .zz { position: absolute; inset: 0; background: url(${A}sleep.webp) center 72% / cover; opacity: 0; transition: opacity 1.2s; }
  .wg-bar .zz.on { opacity: 1; }
  @media (min-width: 600px) { .wg-arena { height: 176px; } }
  .wg img { position: absolute; display: block; pointer-events: none; user-select: none; -webkit-user-select: none; }
  /* 跟亞空間條留 8px 空隙（素材已裁掉透明邊）。光暈畫在圖裡、四邊各多 10%：圖放大 1.2 倍、往下移 10%，人物大小位置跟以前一樣 */
  .wg-god { bottom: calc(32% + 8px - (68% - 14px) * .1); height: calc((68% - 14px) * 1.2); }
  .wg-guo { left: 0; } .wg-emp { right: 0; }
  /* 兩邊神祇的領地（1/4 圓，最底層）：大不淨者的腐爛花園貼左下、帝皇的巢都貼右下；調暗一點，不搶神祇和印章 */
  .wg-place { opacity: .7; z-index: 0; }
  .wg-pguo { left: 0; } .wg-pemp { right: 0; }
  .wg-place { bottom: calc(32% - 14px); height: calc(68% * 1.5 + 14px); }  /* 放大 1.5 倍往中間延伸，神站在地面上；上緣超出卡片的部分被切掉 */
  /* 帝皇敗北立繪比較大，縮成 8 成。王座底部是平的，貼底會看起來比對面低：取頭對齊（抬 20%）和底對齊（不抬）的中間，抬 10% */
  /* 帝皇勝利、大不淨者敗北立繪比較胖，縮成 82%，看起來跟盤中差不多大（底部照樣貼齊） */
  .wg-emp[src*="Emperor_win"], .wg-guo[src*="GUO_loss"] { height: calc((68% - 14px) * .82 * 1.2); bottom: calc(32% + 8px - (68% - 14px) * .082); }
  .wg-emp[src*="Emperor_loss"] { height: calc((68% - 14px) * .8 * 1.2); bottom: calc(32% + 8px + (68% - 14px) * .1 - (68% - 14px) * .08); }
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
  /* 兩軍：原本的大部隊圖（.wg-troop）只當隱形的定位點（前緣＝戰線），畫面上的是 .wg-unit——大部隊和小兵
     （6 成高）穿插排滿自家那半邊的亞空間。小兵 z 軸在大部隊前面（比較矮，只擋到坦克／機甲的下半）；越後面越小、
     越高，像有縱深。不加光暈（單位多，省效能），動畫只用 translate／rotate（不觸發重新排版） */
  .wg-troop { visibility: hidden; }
  .wg-unit { bottom: 0; z-index: 1; transition: left 2s ease-in-out, opacity 1s; }
  .wg-unit.mini { z-index: 2; }
  /* 台股休市（週末、國定假日、颱風假）：亞空間條正中間掛「CASINO CLOSED」招牌 */
  .wg .wg-closed { left: 50%; bottom: calc((32% - 14px) / 2);  /* 亞空間條上緣 14px 是淡出，扣掉後的可見部分置中 */ height: calc(32% * .72); max-width: 82%; object-fit: contain; transform: translate(-50%, 50%); z-index: 3; display: none; }
  .wg .wg-closed.on { display: block; }
  /* 休市日（跟招牌同時段）：上半部換成大家一起吃飯的休假圖，神祇和 VS／勝敗印章都不出現。
     桌腳站在亞空間條上緣（跟神祇一樣留 8px），寬度不超過卡片 92% */
  .wg .wg-dayoff { display: none; left: 50%; bottom: calc(32% + 4px - (68% - 10px) * .05); height: calc((68% - 10px) * 1.1); max-width: 100%; object-fit: contain; transform: translateX(-50%); z-index: 2; }
  .wg.wg-off .wg-dayoff { display: block; }  /* 薄薄一層金光（跟背景分開）畫在圖裡、四邊各多 5%：圖放大 1.1 倍、往下移抵銷 */
  .wg.wg-off .wg-god, .wg.wg-off .wg-result { visibility: hidden; }
  .wg.wg-off .wg-ticker { display: none; }  /* 休市：跑馬燈那列整條拿掉，卡片跟著變矮 */  /* 要寫 .wg 開頭：不然會被 .wg img { display: block } 蓋過，天天都出現 */
  .wg-cloud { bottom: -8%; height: 48%;  /* 往下沉一點（下緣被卡片切掉），雲跟部隊腳下同高 */ transform: translateX(-50%); transition: left 2s ease-in-out, opacity 1s; z-index: 30; }  /* 煙塵最上層：蓋在所有部隊、招式前面 */
  /* 神祇一直發光（帝皇金、大不淨者綠）；部隊只在大漲／大跌（±0.5% 以上）時發光 */
  /* 神祇的光暈（帝皇金、大不淨者綠）已經畫在圖裡，不用 CSS filter（動圖每格重算很吃 CPU） */
  .wg-march .wg-unit { animation: wg-step .5s steps(2) infinite; }
  @keyframes wg-step { 0% { translate: 0 0; rotate: 0deg; } 50% { translate: 0 -3px; rotate: -2deg; } }
  .wg-battle .wg-unit { animation: wg-jit 1.1s ease-in-out infinite; }  /* 交火時部隊慢慢前後頂（太快像抽風） */
  .wg-battle .wg-cloud { animation: wg-cjit .5s infinite; }
  @keyframes wg-jit { 0%,100% { translate: 0 0; } 50% { translate: 1.5px 0; } }
  @keyframes wg-cjit { 0%,100% { translate: 0 0; } 33% { translate: -2px 0; } 66% { translate: 2px 0; } }  /* 用 translate（不重排版面，省 CPU） */
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
  .wg-float.say { font-size: 22px; font-weight: 800; line-height: 1.15; text-align: center; animation: wg-up 2s ease-out forwards; }  /* 中文台詞：往上飄、淡出慢一點（2 秒）才讀得完 */
  /* 大招傷害（魔獸世界浮動戰鬥文字：×2 的巨大數字，先巨大彈出再縮回，發光描邊） */
  .wg-float.ult { top: 26% !important; font-size: 46px; text-align: center; animation: wg-ult 2s ease-out forwards;
    text-shadow: -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 0 10px currentColor; }
  .wg-float.say.hi { top: 3% !important; }  /* 大招台詞固定在最上面，不疊到大數字 */
  /* 必殺技的三個大傷害：上中下錯開，不疊在一起 */
  .wg-float.ult.n0 { top: 30% !important; } .wg-float.ult.n1 { top: 44% !important; } .wg-float.ult.n2 { top: 58% !important; }  /* 口號在最上面，數字往下排 */
  /* 必殺技：滅絕令（從天而降的能量炮，直接打在大不淨者身上）、憎惡鏈枷（鏈枷第一格先淡入，再播動畫往右撞帝皇） */
  .wg-sp { z-index: 5; pointer-events: none; }
  .wg-sp.fadein { opacity: 0; transition: opacity .35s ease-out; }
  .wg-sp.fadein.on { opacity: 1; }
  .wg-sp.slide { transition: left .45s ease-in; }
  /* 被必殺技打到：整個人變成白色剪影一閃（三次，對上三個傷害）；前後不寫 filter，保留原本的光暈 */
  .wg-god.wg-flashw { animation: wg-flashw .2s linear 1; }  /* 寫兩個 class：被普通攻擊打過會留著 .wg-hurt，它的 animation 不能蓋掉閃白 */
  @keyframes wg-flashw { 8%, 65% { filter: brightness(0) invert(1) drop-shadow(0 0 4px #fff); } }
  .wg-float.say.big { font-size: 46px; }  /* 必殺技口號：比一般台詞大很多 */
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
  .wg-shot { z-index: 4; transition: left 1.2s linear; }  /* 普通攻擊飛行 1.2 秒 */
  /* 大招：人物 2/3 大、飛 1.1 秒；納垢靈、靈能閃電都走直線 */
  .wg-shot.ult { z-index: 5; transition: left 1.1s linear; }
  .wg-shot.arc { animation: wg-arc 1.2s ease-in-out; }  /* 瘟疫蒼蠅：飛行中往上拱一下（納垢靈不會飛，走直線） */
  /* 招式外圈一層細光暈（陣營色，跟神祇的光同色），手搖鈴、瘟疫蒼蠅這種暗色圖在背景上才看得清楚 */
  .wg-shot.emp { filter: drop-shadow(0 0 1px #ffd700) drop-shadow(0 0 3px #ffd700); }
  .wg-shot.guo { filter: drop-shadow(0 0 1px #00ff00) drop-shadow(0 0 3px #00ff00); }
  /* 大不淨者大招二：手搖鈴像擲斧一樣順時針翻轉飛過去，帶一點拋物線（約 2.5 圈，1.6 秒） */
  .wg-shot.bell { transition: left 1.6s linear; animation: wg-bell 1.6s linear; }  /* 飛慢一點（1.6 秒），翻轉看得清楚 */
  @keyframes wg-bell { 0% { translate: 0 0; rotate: 0deg; } 25% { translate: 0 -13px; } 50% { translate: 0 -18px; }
    75% { translate: 0 -13px; } 100% { translate: 0 0; rotate: 900deg; } }
  /* 帝皇大招二：帝皇之爪不飛行，直接在大不淨者軀幹上抓兩下（第二下水平反轉）。
     每一下從右上角往左下斜著劃開（clip-path 展開）、亮一下再淡出；反轉的那張 clip 跟著鏡像，變成從左上劃下 */
  .wg-claw { z-index: 5; translate: -50% -50%; animation: wg-claw .7s ease-out both; }
  .wg-claw.flip { transform: scaleX(-1); }
  @keyframes wg-claw { 0% { opacity: 0; clip-path: inset(0 0 100% 100%); scale: 1.15; filter: brightness(1.6) drop-shadow(0 0 3px #ffd700); }
    20% { opacity: 1; clip-path: inset(0 0 0 0); scale: 1; filter: brightness(1.6) drop-shadow(0 0 3px #ffd700); }
    60% { opacity: 1; filter: brightness(1) drop-shadow(0 0 3px #ffd700); }
    100% { opacity: 0; clip-path: inset(0 0 0 0); scale: .97; filter: brightness(1) drop-shadow(0 0 3px #ffd700); } }
  /* 被帝皇之爪抓：每一爪震一下（第二爪時程式重新觸發一次，不靠同一段動畫的後半，比較可靠） */
  .wg-hurt-claw { animation: wg-hurtc .3s 1; }
  @keyframes wg-hurtc { 0%, 100% { translate: 0; } 20% { translate: -8px 1px; } 45% { translate: 5px 0; } 70% { translate: -3px 0; } }
  @keyframes wg-arc { 0% { translate: 0 0; } 50% { translate: 0 -22px; } 100% { translate: 0 0; } }
  /* 大招命中：明顯的三下（每 0.25 秒一下，左右交替），跟三個骷髏同步 */
  .wg-hurt-big { animation: wg-hurtb .75s 1; }
  @keyframes wg-hurtb { 0%, 22%, 33%, 55%, 66%, 88%, 100% { translate: 0; }
    6% { translate: -8px 1px; } 14% { translate: 5px 0; } 39% { translate: 8px -1px; } 47% { translate: -5px 0; } 72% { translate: -8px 1px; } 80% { translate: 5px 0; } }
  .wg-hurt { animation: wg-hurt .28s 1; }
  @keyframes wg-hurt { 0%,100% { translate: 0; } 20% { translate: -4px 0; } 40% { translate: 4px 0; } 60% { translate: -3px 0; } 80% { translate: 3px 0; } }
  .wg-skull { z-index: 4; animation: wg-skull 1s ease-out forwards; }
  @keyframes wg-skull { 0% { opacity: 0; transform: translateY(4px) scale(.7); } 15% { opacity: 1; transform: translateY(0) scale(1.05); } 100% { opacity: 0; transform: translateY(-22px) scale(1); } }
  /* 亂入：門（網道、戰艦、傳送門）和角色（光暈畫在圖裡）在畫面中間，蓋在部隊、煙塵上面；角色淡入淡出各 2 秒（門的時間寫在程式裡） */
  .wg-raid { z-index: 31; opacity: 0; transition: opacity 2s ease-in-out; }
  .wg-raid.on { opacity: 1; }
  .wg-webway { translate: -50% 0; }
  .wg-ghaz { z-index: 32; }
  .wg-float.raid { z-index: 33; } .wg-float.ork { color: #ff3b30; }
  /* 台詞（WAAAGH!! 等）：播動圖的期間每 0.9 秒從角色頭上彈出一個紅字，往上跳走淡出（中間的空檔看得到角色） */
  .wg-float.waagh { z-index: 33; color: #ff2a1a; animation: wg-waagh .9s ease-out forwards;
    text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 0 8px #ff2a1a; }
  .wg-float.waagh i { font-style: normal; color: var(--hi); }  /* 台詞中間那段字用角色的光暈色（RAIDERS 的 hi） */
  @keyframes wg-waagh { 0% { opacity: 0; transform: translate(-50%, 6px) scale(.6); } 15% { opacity: 1; transform: translate(-50%, 0) scale(1.15); }
    30% { transform: translate(-50%, -6px) scale(1); } 70% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -34px) scale(.95); } }
  .wg-dbg { display: flex; gap: 6px; align-items: center; padding: 4px 8px; font-size: 12px; color: var(--muted); }
  .wg-dbg input[type=range] { flex: 1; }
  .wg-dbg button { background: #20242c; color: var(--text); border: 1px solid var(--line); border-radius: 4px; padding: 2px 8px; font-size: 12px; }
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
    floatBull: ['忠誠推進！', '多單挺進！', '神聖護盤！'],
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

  // 兩軍的隊形：照種類字串從戰線往後一路排（B 大部隊、2／3 一般兵種、m／n 兩種小兵），間距平均（小兵 0.4、其他 0.55 倍
  // 條高，再加一點固定的亂數），所以從戰線到卡片邊緣一樣密、彼此疊在一起；排到約 12 倍條高，超出卡片的不畫。
  // 每個單位：[種類, 離戰線多遠（中心點，以亞空間條高度為單位）, 大小, 離底部幾 px（越高＝越遠，疊在越後面）]。
  // 前幾個一定有 2、3，手機上窄窄的一半也看得到新兵種
  function formation(kinds, seed) {
    const r = (i, n) => { const x = Math.sin(seed + i * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x); };
    let d = 0.25;
    return [...kinds].map((k, i) => {
      const u = [k, +d.toFixed(2), +(0.88 + 0.12 * r(i, 1)).toFixed(2), Math.floor(r(i, 2) * 6)];
      d += (k === 'm' || k === 'n' ? 0.4 : 0.55) + 0.2 * r(i, 3);
      return u;
    });
  }
  const ARMY = {
    guo: formation('m3nBm2nBm3nmB2mBn3mBn2mnB3m', 1),
    emp: formation('m2nB3mBn2mBn3mB2nmBn3mB2n', 2),
  };
  // 種類 → 圖檔、高度（大部隊的幾倍）。2：大不淨者的納垢獸／帝皇的坦克；3：大不淨者的騎士／帝皇的苦修戰士
  const UNIT = { m: ['mini_troops', 0.6], n: ['mini_troops2', 0.6], B: ['troops', 1], 2: ['troops2', 0.9], 3: ['troops3', 0.94] };
  const ASPECT = { GUO_troops: 1.969, Emperor_troops: 1.312, GUO_mini_troops: 0.698, Emperor_mini_troops: 1.365,
    GUO_mini_troops2: 0.823, Emperor_mini_troops2: 0.656,
    GUO_troops2: 0.961, GUO_troops3: 1.144, Emperor_troops2: 1.516, Emperor_troops3: 0.731 };

  // 亂入角色：門、角色、台詞（<i> 包住的字用 hi 色，跟光暈同色）、片長（格數 × 120ms）。
  // 光暈畫在圖裡；頭在圖上的位置（hx、hy）在 meta.json（scripts/build_game_assets.py 的 RAIDER_HEAD）
  const RAIDERS = [
    { gate: 'webway', who: 'Ghazghkull', yell: 'W<i>AAA</i>GH!!', hi: '#1edc78', ms: 33 * 120 },          // 碎骨者：綠
    { gate: 'VengefulSpirit', who: 'abaddon', yell: 'WWW<i>RRRR</i>YYYY!', hi: '#ff9a1a', ms: 44 * 120 },  // 阿巴頓：紅光、R 橘色
    { gate: 'portal', who: 'LordofChange', yell: 'KHR<i>AAAA</i>SH!', hi: '#5ab4ff', ms: 31 * 120 },       // 萬變魔君：藍
    { gate: 'HiveShip', who: 'tyranids', yell: 'G<i>AAA</i>GH!', hi: '#be50ff', ms: 42 * 120 },           // 泰倫武士：紫
  ];

  // ---- 畫面 ----
  const debug = new URLSearchParams(location.search).get('game') === 'debug';
  const el = document.createElement('div');
  el.className = 'card wide wg wg-paused';
  el.innerHTML = `<div class="wg-arena">
      <img class="wg-place wg-pguo" src="${A}GUO_place.webp" alt="">
      <img class="wg-place wg-pemp" src="${A}Emperor_place.webp" alt="">
      <div class="wg-bar"><b class="zz"></b><i class="l"></i><i class="r"></i><i class="edge"></i></div>
      <img class="wg-god wg-guo" alt="">
      <img class="wg-god wg-emp" alt="">
      <img class="wg-troop wg-tguo" src="${A}GUO_troops.webp" alt="">
      <img class="wg-troop wg-temp" src="${A}Emperor_troops.webp" alt="">
      ${['guo', 'emp'].map((side) => ARMY[side].map((u, i) => `<img class="wg-unit${'mn'.includes(u[0]) ? ' mini' : ''}" data-side="${side}" data-i="${i}" alt="">`).join('')).join('')}
      <img class="wg-cloud" src="${A}fight-cloud.webp" alt="">
      <img class="wg-closed" src="${A}casino_closed.webp" alt="休市">
      <img class="wg-dayoff" alt="">
      <img class="wg-result" alt="">
      <img class="wg-result wg-vsg g" src="${A}vs.webp" alt=""><img class="wg-result wg-vsg y" src="${A}vs.webp" alt="">
      <div class="wg-flash"></div>
    </div>
    <div class="wg-ticker"><span></span></div>
    ${debug ? '<div class="wg-dbg">時間<input type="range" min="470" max="815" step="1" value="600"><span class="t">10:00</span>漲跌%<input type="number" step="0.1" value="0"></div>'
      + '<div class="wg-dbg">必殺技<button type="button" data-sp="1">滅絕令</button><button type="button" data-sp="0">憎惡鏈枷</button></div>'
      + `<div class="wg-dbg">亂入${RAIDERS.map((r, i) => `<button type="button" data-raid="${i}">亂${i + 1}</button>`).join('')}</div>` : ''}`;
  const $ = (s) => el.querySelector(s);
  const arena = $('.wg-arena');
  const guo = $('.wg-guo'), emp = $('.wg-emp'), tg = $('.wg-tguo'), te = $('.wg-temp'), cloud = $('.wg-cloud');
  const setSrc = (img, src) => { if (img.getAttribute('src') !== src) img.src = src; };

  let data = { twii: null, tsmc: null, tradingDay: true };
  // 素材尺寸和人物中線（scripts/build_game_assets.py 產生）
  let meta = { Emperor: { w: 335, h: 288, cx: 0.53 }, GUO: { w: 419, h: 288, cx: 0.51 }, Emperor_win: { w: 391, h: 288 }, GUO_loss: { w: 299, h: 288 }, win: { w: 336, h: 120 } };
  // 招式圖先預載：第一次出招不會等下載
  for (const n of ['Emperor_attack', 'GUO_attack', 'Emperor_attack2', 'GUO_attack2', 'Emperor_attack1_2', 'GUO_attack1_2',
    'Emperor_attack2_2', 'GUO_attack2_2', 'damage', 'heart']) new Image().src = `${A}${n}.webp`;
  fetch(`${A}meta.json`).then((r) => r.json()).then((m) => { meta = m; draw(false); }).catch(() => {});
  // 中性新聞故事線（game/story.json，由 mini_game/storyline.txt 產生）：併進銀河快訊的抽選池
  fetch(`${A}story.json`).then((r) => r.json()).then((s) => { if (Array.isArray(s)) D.galaxy = D.galaxy.concat(s); }).catch(() => {});
  // 最近的波動度 σ：今天以前 20 個交易日日漲跌（%）的標準差，最低 0.8%（taiex_history.json，每晚更新）。
  // 戰線和情勢分數都先除以 σ（z-score）：大起大落的時期同樣 1% 推得少，平靜時推得多，只有罕見的大漲大跌才推到底
  let sigma = 1.3;
  fetch('taiex_history.json').then((r) => r.json()).then((j) => {
    const c = (j.closes ?? []).filter((x) => x.date < dayOffset(0)).slice(-21).map((x) => x.close);
    const r = c.slice(1).map((x, i) => (x / c[i] - 1) * 100);
    if (r.length < 10) return;
    const m = r.reduce((a, b) => a + b, 0) / r.length;
    sigma = Math.max(0.8, Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / r.length));
    draw(false);
  }).catch(() => {});
  let lastPrice = null;
  let resolvedShown = false;
  let lastPhase = null;   // 上一次畫的階段：用來判斷是不是「看著」收盤（要播轉場）
  let holdUntil = 0;
  let lastTickerKey = '';
  let tickerAt = 0;  // 盤中每 30 秒換一句戰報
  let counterShown = null;  // 這一波反攻號角播過了沒（同一波只播一次）
  let visible = true;
  let timer = null;

  // 台北日期加減 k 天（YYYY-MM-DD）
  const dayOffset = (k) => new Date(Date.now() + 8 * 3600000 + k * 86400000).toISOString().slice(0, 10);

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
    // 大招台詞飄 2 秒，下一句來了舊的先拿掉（固定在同一個位置，不會疊字）
    if (extra.includes('say hi')) arena.querySelectorAll('.wg-float.say.hi').forEach((o) => o.remove());
    const f = document.createElement('div');
    f.className = `wg-float ${cls}${crit ? ' crit' : ''}${extra}`;
    f.textContent = text;
    f.style.left = `${x ?? 32 + Math.random() * 36}%`;
    f.style.top = `${x == null ? 12 + Math.random() * 30 : 34 + Math.random() * 14}%`;
    f.style.setProperty('--dx', `${Math.round((Math.random() - 0.5) * 16)}px`);
    arena.appendChild(f);
    // 不蓋到兩尊神：量出大不淨者的右緣、帝皇的左緣，字（含爆擊放大、左右飄移）限制在中間。
    // 亂入的傷害（raid）、中文台詞（say，含必殺技口號）例外：放卡片正中間，可以跨到神祇身上；比卡片寬就拆兩行——
    // 優先拆在中間附近的「！」「，」後面，沒有就從正中間拆
    const a = arena.getBoundingClientRect();
    if (extra.includes('say')) {
      f.style.left = '50%';
      if (a.width && text.length >= 4 && f.offsetWidth * 1.1 + 16 > a.width) {
        const mid = text.length / 2;
        const cuts = [...text].map((ch, i) => i + 1).filter((i) => i < text.length && '！，、'.includes(text[i - 1]));
        const cut = cuts.length ? cuts.reduce((b, i) => (Math.abs(i - mid) < Math.abs(b - mid) ? i : b)) : Math.ceil(mid);
        f.textContent = '';
        f.append(text.slice(0, cut), document.createElement('br'), text.slice(cut));
      }
    } else if (a.width && !extra.includes('raid')) {  // 亂入的傷害直接跳在被打的神身上（中間是亂入角色）
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
    setTimeout(() => f.remove(), extra.includes('say') ? 2100 : extra.includes('ult') ? 2100 : 1700);
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
  // 情勢分數（-1 空 … +1 多）：今天漲跌幅（以波動度 σ 為單位）55%、短線動能 45%。漲多但正在下滑時，大不淨者出手變多（反撲）
  function score(pct) {
    return 0.55 * Math.tanh(pct / (1.1 * sigma)) + 0.45 * Math.tanh(momentum().mom / 0.25);
  }
  // 反攻號角：收漲但從高點回落 ≥0.4% 且短線在跌 → 空軍反攻；收跌但從低點反彈 ≥0.4% 且短線在漲 → 多軍反攻
  function counterattack(pct) {
    const m = momentum();
    if (pct > 0 && m.pull <= -0.4 && m.mom < 0) return 'bear';
    if (pct < 0 && m.bounce >= 0.4 && m.mom > 0) return 'bull';
    return null;
  }

  // 補血：逆勢上漲（收跌但從低點反彈 ≥0.4%、短線在漲，跟「多軍反攻」同一個條件）時帝皇身上冒愛心往上飄；
  // 反過來逆勢下跌（收漲但從高點回落 ≥0.4%、短線在跌，「空軍反攻」）換大不淨者補血。
  // 走法跟骷髏一樣；交火期間每次出手（約 3 秒）冒一顆
  function heal(bull) {
    const a = arena.getBoundingClientRect(), to = (bull ? emp : guo).getBoundingClientRect();
    if (!a.width || !to.width) return;
    const hv = document.createElement('img');
    hv.className = 'wg-skull';
    hv.src = `${A}heart.webp`;
    const sh = to.height / 5;
    hv.style.height = `${sh}px`;
    hv.style.left = `${to.left - a.left + Math.random() * Math.max(0, to.width - sh)}px`;
    hv.style.top = `${to.top - a.top + to.height * (0.1 + Math.random() * 0.3)}px`;
    arena.appendChild(hv);
    setTimeout(() => hv.remove(), 1100);
  }

  function hit() {
    if (raid) return;  // 亂入中：兩尊神暫停出手
    // 亂入（交火時每次 0.3%，大約 17 分鐘一次）
    if (el.classList.contains('wg-battle') && Math.random() < 0.003) { warp(); return; }
    const pct = pctNow();
    const counter = counterattack(pct);
    if (counter) heal(counter === 'bull');
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
    // 必殺技（5%，大約一分鐘一次；除錯模式 25%）：喊招式名、播動圖，被打方白閃三次、跳三個大傷害（各約 ×2）
    if (Math.random() < (debug ? 0.25 : 0.05)) {
      fireSpecial(bull, dmg, x);
      return;
    }
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
  // 招式（每次出手兩種隨機挑一種）：普通攻擊＝原本的口水／劍氣，或第二套（帝皇靈能骷髏、大不淨者瘟疫蒼蠅）；
  // 大招＝靈能閃電／投擲納垢靈，或第二套（帝皇之爪、大不淨者擲手搖鈴）
  function shot(bull, onHit, ult = false, alt = Math.random() < 0.5) {
    const a = arena.getBoundingClientRect();
    const from = (bull ? emp : guo).getBoundingClientRect();
    const to = (bull ? guo : emp).getBoundingClientRect();
    if (!a.width || !from.width || !to.width) return;
    const h = from.height;
    if (ult && bull && alt) return claw(a, to, h, onHit);
    const bell = ult && !bull && alt;
    const img = document.createElement('img');
    img.className = `wg-shot ${bull ? 'emp' : 'guo'}${ult ? ' ult' : ''}${bell ? ' bell' : !ult && !bull && alt ? ' arc' : ''}`;
    img.src = `${A}${bull ? 'Emperor' : 'GUO'}_attack${ult ? '2' : alt ? '1' : ''}${alt ? '_2' : ''}.webp`;
    // 高度：大招 2/3 人高（手搖鈴 1/2，轉起來夠大）；普通攻擊 1/4（第二套是方圖，1/3 才看得清楚）
    const sz = ult ? (bell ? 1 / 2 : 2 / 3) : alt ? 1 / 3 : 1 / 4;
    img.style.height = `${h * sz}px`;
    img.style.top = `${from.top - a.top + h * (ult ? (bell ? 0.22 : 0.18) : alt ? 0.32 : 0.38)}px`;
    // 大招圖很寬（靈能閃電 300×160）：中心飛到目標中心的話前緣會穿過軀幹打到另一邊的手臂，
    // 改成前緣剛好進到軀幹（人物重心再過去 10% 圖寬）就消失；手搖鈴差不多是方的，同樣前緣進到軀幹
    const tm = meta[bull ? 'GUO' : 'Emperor'];
    const torso = to.left + to.width * (tm?.cx ?? 0.5) - a.left;
    const iw = bell ? h / 2 : h * (2 / 3) * (bull ? 300 : 256) / 160;
    const target = ult ? torso + (bull ? 1 : -1) * iw * 0.4 : (to.left + to.right) / 2 - a.left;
    img.style.left = `${(bull ? from.left : from.right) - a.left}px`;
    img.style.transform = 'translateX(-50%)';
    // 圖還沒載入就開始飛的話，會在半路才突然出現（像從畫面中間飛出來）：等圖解碼好才起飛
    const go = () => {
      arena.appendChild(img);
      void img.offsetWidth;
      img.style.left = `${target}px`;
      setTimeout(() => {
        img.remove();
        impact(bull, ult, a, to, onHit);
      }, bell ? 1610 : ult ? 1110 : 1210);
    };
    if (img.complete) go(); else img.decode().then(go, go);
  }
  // 帝皇之爪：在大不淨者軀幹（人物重心、上下一半）抓兩下，第二下水平反轉、晚 0.5 秒（前一爪快淡掉時），
  // 看得出是兩下；大不淨者跟著震兩下、冒兩個骷髏
  function claw(a, to, h, onHit) {
    const x = to.left + to.width * (meta.GUO?.cx ?? 0.5) - a.left;
    const y = to.top - a.top + to.height * 0.5;
    [0, 500].forEach((d, i) => setTimeout(() => {
      const c = document.createElement('img');
      c.className = `wg-claw${i ? ' flip' : ''}`;
      c.src = `${A}Emperor_attack2_2.webp`;
      c.style.height = `${h * 0.6}px`;
      c.style.left = `${x}px`;
      c.style.top = `${y}px`;
      arena.appendChild(c);
      setTimeout(() => c.remove(), 720);
    }, d));
    setTimeout(() => impact(true, true, a, to, onHit, true), 100);  // 第一爪劃開的那一刻算命中
    // 第二爪：跟第一爪一樣，大不淨者震一下、整張卡片也震一下
    setTimeout(() => {
      guo.classList.remove('wg-hurt', 'wg-hurt-big', 'wg-hurt-claw'); void guo.offsetWidth; guo.classList.add('wg-hurt-claw');
      el.classList.remove('wg-shake'); void el.offsetWidth; el.classList.add('wg-shake');
    }, 600);
  }
  // 命中：被打的神震動、頭上冒骷髏；大招震三下、三個骷髏、卡片也震
  function impact(bull, ult, a, to, onHit, clawed = false) {
    const god = bull ? guo : emp;
    const hurt = clawed ? 'wg-hurt-claw' : ult ? 'wg-hurt-big' : 'wg-hurt';
    god.classList.remove('wg-hurt', 'wg-hurt-big', 'wg-hurt-claw'); void god.offsetWidth; god.classList.add(hurt);
    const sk = document.createElement('img');
    sk.className = 'wg-skull';
    sk.src = `${A}damage.webp`;
    const sh = to.height / 5;
    sk.style.height = `${sh}px`;
    sk.style.left = `${to.left - a.left + Math.random() * Math.max(0, to.width - sh)}px`;
    sk.style.top = `${to.top - a.top + to.height * 0.05}px`;
    arena.appendChild(sk);
    setTimeout(() => sk.remove(), 1100);
    if (ult) {  // 大招：再兩個骷髏，跟神祇的三下震動同步（0.25、0.5 秒）；帝皇之爪再一個（0.5 秒，第二爪）；卡片也震一下
      for (const d of clawed ? [0.5] : [0.25, 0.5]) {
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
  }
  function ultimate(bull, onHit) { shot(bull, onHit, true); }
  function fireSpecial(bull, dmg, x) {
    const side = bull ? 'up' : 'down';
    special(bull, (i) => float(`${Math.round(dmg * 2 * (0.85 + Math.random() * 0.3))}!`, side, true, x + (i - 1) * 3, ` ult n${i}`));
  }

  // 必殺技動圖每次都要從第一格播：先把檔案抓成 blob，每次放用新的 object URL（同一個網址的動圖會共用播放進度）
  const spBlob = {};
  for (const n of ['Emperor_attack_sp', 'GUO_attack_sp']) {
    fetch(`${A}${n}.webp`).then((r) => r.blob()).then((b) => { spBlob[n] = b; }).catch(() => {});
    new Image().src = `${A}${n}_still.webp`;
  }
  const freshSrc = (n) => (spBlob[n] ? URL.createObjectURL(spBlob[n]) : `${A}${n}.webp?${Date.now()}`);
  // 動圖每格 70ms（scripts/build_game_assets.py 的 SP_FRAME_MS）：
  //   滅絕令 16 格 1.12 秒，光柱第 8 格落地 → 0.56、0.76、0.96 秒命中
  //   憎惡鏈枷 先淡入 0.35 秒，18 格 1.26 秒，第 6 格骷髏撞上 → 淡入後 0.42、0.65、0.88 秒命中
  function special(bull, onHit) {
    const a = arena.getBoundingClientRect();
    const from = (bull ? emp : guo).getBoundingClientRect();
    const to = (bull ? guo : emp).getBoundingClientRect();
    if (!a.width || !from.width || !to.width) return;
    float(bull ? '滅絕令！' : '憎惡鏈枷！', bull ? 'up' : 'down', false, null, ' say hi big');
    const target = bull ? guo : emp;
    const tm = meta[bull ? 'GUO' : 'Emperor'];
    const torso = to.left + to.width * (tm?.cx ?? 0.5) - a.left;
    const name = bull ? 'Emperor_attack_sp' : 'GUO_attack_sp';
    const img = document.createElement('img');
    img.className = `wg-sp${bull ? '' : ' fadein'}`;
    let url = null;
    const hits = (t0, gaps) => gaps.forEach((g, i) => setTimeout(() => {
      target.classList.remove('wg-flashw', 'wg-hurt', 'wg-hurt-big', 'wg-hurt-claw'); void target.offsetWidth; target.classList.add('wg-flashw');
      el.classList.remove('wg-shake'); void el.offsetWidth; el.classList.add('wg-shake');
      // 每一下也冒一個骷髏（跟普通攻擊一樣，被打方身上隨機位置）
      const sk = document.createElement('img');
      sk.className = 'wg-skull';
      sk.src = `${A}damage.webp`;
      const sh = to.height / 5;
      sk.style.height = `${sh}px`;
      sk.style.left = `${to.left - a.left + Math.random() * Math.max(0, to.width - sh)}px`;
      sk.style.top = `${to.top - a.top + to.height * (0.05 + Math.random() * 0.35)}px`;
      arena.appendChild(sk);
      setTimeout(() => sk.remove(), 1100);
      onHit?.(i);
    }, t0 + g));
    if (bull) {
      // 光柱：寬高比 209:128，底部對齊大不淨者腳底，水平置中在他的人物重心
      const h = to.height * 1.15;
      img.style.height = `${h}px`;
      img.style.left = `${torso}px`;
      img.style.top = `${to.bottom - a.top - h}px`;
      img.style.transform = 'translateX(-50%)';
      img.src = url = freshSrc(name);
      arena.appendChild(img);
      hits(0, [560, 760, 960]);
      setTimeout(() => { img.remove(); if (url?.startsWith('blob:')) URL.revokeObjectURL(url); }, 1250);
      return;
    }
    // 鏈枷：寬高比 228:128，握把在左、骷髏在右（約圖寬 72% 處）；從大不淨者身前出發，
    // 骷髏碰不到帝皇的人物重心就在播的時候往右滑過去
    const h = from.height * 0.62;
    const w = (h * 228) / 128;
    const left = from.right - a.left - w * 0.08;
    img.style.height = `${h}px`;
    img.style.top = `${from.top - a.top + from.height * 0.5 - h / 2}px`;
    img.style.left = `${left}px`;
    img.src = `${A}${name}_still.webp`;
    arena.appendChild(img);
    void img.offsetWidth;
    img.classList.add('on');
    setTimeout(() => {
      img.src = url = freshSrc(name);
      const shift = torso - (left + w * 0.72);
      if (shift > 0) { img.classList.add('slide'); void img.offsetWidth; img.style.left = `${left + shift}px`; }
    }, 350);
    hits(350, [420, 650, 880]);
    setTimeout(() => { img.remove(); if (url?.startsWith('blob:')) URL.revokeObjectURL(url); }, 350 + 1400);
  }
  // 亂入：角色從門（網道、戰艦、傳送門）殺出來。門淡入 2 秒 → 角色（第一格）淡入 2 秒 → 播動圖，
  // 頭上一直彈出台詞，兩尊神輪流閃白、跳傷害、卡片震 → 停在最後一格淡出 2 秒 → 門淡出 1 秒。
  // 期間兩尊神暫停出手、停住不動（換靜止圖）。圖亂入時才下載（動圖在淡入的 4 秒內就下載好），每次用新的 blob 網址從第一格播
  const RAID_FADE = 2000, WEB_IN = 2000, WEB_OUT = 1000;  // 角色淡入淡出、門淡入、門淡出（ms）
  let raid = 0;  // 進行中的亂入編號（0＝沒有）；收盤時清掉，已經排好的計時器看到編號不對就不做
  // 兩尊神動圖 ↔ 靜止圖交叉淡化 0.5 秒（網頁上的動圖沒辦法真的暫停，直接換圖會跳一下）：
  // 同位置疊一張要換成的圖淡入，淡完才真的換圖（draw）、拿掉疊的那張
  function fadeGods(still) {
    still ||= el.classList.contains('wg-paused');
    for (const [g, n] of [[guo, 'GUO'], [emp, 'Emperor']]) {
      const c = g.cloneNode();
      c.className = g.className.replace(/ wg-(flashw|hurt\S*)/g, '');
      c.src = `${A}${n}${still ? '_still' : ''}.webp`;
      c.style.opacity = '0';
      c.style.transition = 'opacity .5s';
      g.after(c);
      void c.offsetWidth;
      c.style.opacity = '1';
      setTimeout(() => c.remove(), 520);
    }
    setTimeout(() => draw(false), 500);
  }
  function endRaid() {
    raid = 0;
    arena.querySelectorAll('.wg-raid, .wg-float.waagh').forEach((x) => x.remove());
    fadeGods(false);  // 兩尊神淡回動圖
  }
  function warp(k = Math.floor(Math.random() * RAIDERS.length)) {
    const a = arena.getBoundingClientRect();
    if (raid || !a.width) return;
    const id = raid = Date.now();
    fadeGods(true);  // 兩尊神淡成靜止圖
    const R = RAIDERS[k];
    const later = (ms, f) => setTimeout(() => { if (raid === id) f(); }, ms);
    const blob = fetch(`${A}${R.who}.webp`).then((r) => r.blob()).catch(() => null);
    new Image().src = `${A}${R.who}_end.webp`;
    const ww = document.createElement('img');
    ww.className = 'wg-raid wg-webway';
    ww.src = `${A}${R.gate}.webp`;
    // 只佔上半部（神祇那一層），不疊到下面的亞空間條
    const wh = a.height * 0.68 - 4, wtop = 2;
    ww.style.height = `${wh}px`;
    ww.style.left = '50%';
    ww.style.top = `${wtop}px`;
    arena.appendChild(ww);
    void ww.offsetWidth;
    ww.style.transitionDuration = `${WEB_IN}ms`;
    ww.classList.add('on');
    // 角色：撐滿上半部（圖上下各有 16px 的光暈留白，人物腳底踩在亞空間條上緣），頭對齊門的中線，可以蓋過門
    const gm = meta[R.who] ?? { w: 290, h: 192, hx: 0.45, hy: 0.3 };
    const gh = a.height * 0.68 * 1.08, gw = (gh * gm.w) / gm.h;
    const gtop = a.height * 0.68 - gh * (1 - 16 / gm.h);
    const gz = document.createElement('img');
    gz.className = 'wg-raid wg-ghaz';
    gz.src = `${A}${R.who}_still.webp`;
    gz.style.height = `${gh}px`;
    gz.style.left = `${a.width / 2 - gw * gm.hx}px`;
    gz.style.top = `${gtop}px`;
    later(WEB_IN, () => { arena.appendChild(gz); void gz.offsetWidth; gz.classList.add('on'); });
    later(WEB_IN + RAID_FADE, () => blob.then((b) => {
      if (raid !== id) return;
      const url = b ? URL.createObjectURL(b) : `${A}${R.who}.webp?${Date.now()}`;
      gz.src = url;
      gz.decode().catch(() => {}).then(() => { if (raid === id) play(url); });
    }));
    function play(url) {
      const fs = Math.round(a.height * 0.18);
      for (let t = 0; t < R.ms - 500; t += 900) later(t, () => {
        const yell = document.createElement('div');
        yell.className = 'wg-float waagh';
        yell.innerHTML = R.yell;
        yell.style.setProperty('--hi', R.hi);
        yell.style.fontSize = `${fs}px`;
        yell.style.left = '50%';
        yell.style.top = `${Math.max(0, gtop + gh * gm.hy - fs)}px`;  // 頭頂上面
        arena.appendChild(yell);
        setTimeout(() => yell.remove(), 950);
      });
      // 播的期間兩尊神輪流挨打：閃白、冒骷髏、卡片震、跳紅色傷害（每 0.36 秒一下）
      const ar = arena.getBoundingClientRect();
      const mid = (g) => { const r = g.getBoundingClientRect(); return ((r.left + r.right) / 2 - ar.left) / ar.width * 100; };
      for (let t = 150, i = 0; t < R.ms - 200; t += 360, i++) later(t, () => {
        const god = i % 2 ? emp : guo;
        const to = god.getBoundingClientRect();
        god.classList.remove('wg-flashw', 'wg-hurt', 'wg-hurt-big', 'wg-hurt-claw'); void god.offsetWidth; god.classList.add('wg-flashw');
        const sk = document.createElement('img');
        sk.className = 'wg-skull';
        sk.src = `${A}damage.webp`;
        const sh = to.height / 5;
        sk.style.height = `${sh}px`;
        sk.style.left = `${to.left - ar.left + Math.random() * Math.max(0, to.width - sh)}px`;
        sk.style.top = `${to.top - ar.top + to.height * (0.05 + Math.random() * 0.35)}px`;
        arena.appendChild(sk);
        setTimeout(() => sk.remove(), 1100);
        float(`${300 + Math.round(Math.random() * 600)}!`, 'ork', true, mid(god) + (Math.random() - 0.5) * 8, ' raid');
      });
      later(R.ms, () => {
        gz.src = `${A}${R.who}_end.webp`;
        if (url.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(url), 1000);
        gz.classList.remove('on');
      });
      later(R.ms + RAID_FADE, () => { gz.remove(); ww.style.transitionDuration = `${WEB_OUT}ms`; ww.classList.remove('on'); });
      later(R.ms + RAID_FADE + WEB_OUT, endRaid);
    }
  }
  function attack(bull, crit, onHit) {
    const alt = Math.random() < 0.5;
    shot(bull, () => onHit?.(0), false, alt);
    if (crit) setTimeout(() => shot(bull, () => onHit?.(1), false, alt), 250);  // 爆擊：同一招快速第二發，被打方連震兩下、兩個骷髏
  }
  let hitTimer = null;
  let chargeUntil = 0;  // 開盤衝鋒結束的時間
  let walkStarted = false;  // 這次行軍已經放好起點了沒

  function draw(fromData) {
    const { mins, hhmm } = now();
    const trading = debug || data.tradingDay;
    // 休市招牌：休市日 00:00 起掛到下一個開市日 08:00；休息時間：開市日 13:45 起睡覺，
    // 隔天開市睡到隔天 08:00，隔天休市睡到午夜（之後換亞空間＋休市招牌）
    const isTd = (k) => debug || (data.isTradingDay ? data.isTradingDay(dayOffset(k)) : true);
    const closedSign = !trading || (mins < 480 && !isTd(-1));
    const sleeping = trading && (mins >= 825 || (mins < 480 && isTd(-1)));
    $('.wg-closed').classList.toggle('on', closedSign);
    // 休假圖只在休市時才載入（約 250KB）；網頁在背景或卡片不在畫面上時換靜止圖
    el.classList.toggle('wg-off', closedSign);
    if (closedSign) setSrc($('.wg-dayoff'), `${A}day_off${document.hidden || !visible ? '_still' : ''}.webp`);
    $('.wg-bar .zz').classList.toggle('on', sleeping);
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
      // 亂入中兩尊神也換靜止圖（停住不動），亂入結束再接著播
      setSrc(emp, `${A}Emperor${paused || raid ? '_still' : ''}.webp`);
      setSrc(guo, `${A}GUO${paused || raid ? '_still' : ''}.webp`);
    }

    // 帝皇（一般／靜止圖）：人物中線到右緣的距離＝大不淨者人物中線到左緣的距離；勝敗立繪照舊貼右
    {
      const gh = guo.getBoundingClientRect().height || 0;
      // 圖四邊各有 24/288 的光暈留白：往外推出卡片邊緣，人物還是貼著左右邊（光暈超出的部分被切掉）
      const pad = Math.round(gh * 24 / 288);
      // DEFEAT 結算：兩尊神往中間收一點（光暈露出來，再多 4px），不貼著卡片左右邊
      const edge = done && !bullWin ? 4 : -pad;
      guo.style.left = `${edge}px`;
      if (!done && gh && meta.Emperor && meta.GUO) {
        const gw = gh * meta.GUO.w / meta.GUO.h, ew = gh * meta.Emperor.w / meta.Emperor.h;
        emp.style.right = `${Math.max(-pad, gw * meta.GUO.cx - ew * (1 - meta.Emperor.cx) - pad)}px`;  // 兩尊神的人物中線離左右邊一樣遠
      } else emp.style.right = `${edge}px`;
    }

    // 戰線：昨收在中間，漲往左推（帝皇在右邊進攻）；漲跌幅除以波動度 σ 再套 tanh，約 3σ 才接近邊界
    front = 50 - 40 * Math.tanh(pct / (1.6 * sigma));
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
    if (done && raid) {  // 收盤：亂入直接收掉（不呼叫 endRaid，免得在 draw 裡面再 draw 一次）
      raid = 0;
      arena.querySelectorAll('.wg-raid, .wg-float.waagh').forEach((x) => x.remove());
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
    // 兩軍：每個單位跟著自家定位點（隱形的大部隊圖，前緣＝戰線）走，同一個過渡；超出卡片的不畫；
    // 結算時一起淡出；盤外小兵換靜止圖
    {
      const a = arena.getBoundingClientRect();
      const H = a.height * 0.32;
      const still = paused ? '_still' : '';
      for (const u of el.querySelectorAll('.wg-unit')) {
        const side = u.dataset.side, isGuo = side === 'guo';
        const [kind, d, sc, up] = ARMY[side][Number(u.dataset.i)];
        const name = `${isGuo ? 'GUO' : 'Emperor'}_${UNIT[kind][0]}`;
        const h = H * UNIT[kind][1] * sc, w = h * ASPECT[name];
        const t = isGuo ? tg : te;
        const anchor = (parseFloat(t.style.left) / 100) * a.width;
        const cx = isGuo ? anchor - d * H : anchor + d * H;
        const show = !done && a.width && cx + w / 2 > 0 && cx - w / 2 < a.width;
        u.style.display = show ? '' : 'none';
        if (!show) continue;
        setSrc(u, `${A}${name}${'mn'.includes(kind) ? still : ''}.webp`);
        u.style.transition = t.style.transition;
        u.style.height = `${h}px`;
        u.style.left = `calc(${t.style.left} ${isGuo ? '-' : '+'} ${Math.round(isGuo ? d * H + w / 2 : d * H - w / 2)}px)`;
        u.style.bottom = `${name === 'Emperor_troops3' ? 0 : up}px`;  // 這張圖自帶地板，墊高會像浮在空中
        u.style.zIndex = 'mn'.includes(kind) ? 20 : (kind === 'B' ? 10 : 15) - up;  // 小兵最前、一般兵種其次、大部隊最後；同類近的（低的）蓋住遠的
        u.style.animationDelay = `${-0.11 * Number(u.dataset.i)}s`;
      }
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
        : closedSign ? ''  // 休市：跑馬燈那列空著
        : done ? (bullWin ? D.bullWin : D.bearWin)  // 收盤後（和開盤前）停在勝負台詞，不捲動
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
  // 除錯：按鈕直接放必殺技（傷害 150～300，數字在被打的神旁邊）
  if (debug) el.querySelectorAll('.wg-dbg button[data-sp]').forEach((b) => b.addEventListener('click', () => {
    const bull = b.dataset.sp === '1';
    const ar = arena.getBoundingClientRect();
    const gR = ((guo.getBoundingClientRect().right - ar.left) / ar.width) * 100;
    const eL = ((emp.getBoundingClientRect().left - ar.left) / ar.width) * 100;
    fireSpecial(bull, 150 + Math.round(Math.random() * 150), bull ? gR + 5 : eL - 5);
  }));
  if (debug) el.querySelectorAll('.wg-dbg button[data-raid]').forEach((b) => b.addEventListener('click', () => warp(Number(b.dataset.raid))));
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
