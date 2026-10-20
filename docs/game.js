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
  /* 帝皇敗北立繪比較大，縮成 8 成；底部照樣跟其他神祇切齊（站在亞空間條上方） */
  .wg-emp[src*="Emperor_loss"] { height: calc((68% - 14px) * .8); }
  /* 收盤結果印章（win／loss）：上方兩尊神中間的空白正中央，寬度依實際空間調整（不蓋到神），結算時才出現 */
  .wg-result { left: 50%; top: calc((68% - 8px) / 2); width: 40%; height: auto; transform: translate(-50%, -50%) scale(.6); opacity: 0; z-index: 3;
    transition: opacity .6s, transform .6s cubic-bezier(.2, 1.6, .4, 1); }
  .wg-result.on { opacity: 1; transform: translate(-50%, -50%) scale(1); }
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
  .wg-float { position: absolute; z-index: 4; font: 900 28px/1 Impact, "Arial Black", "Microsoft JhengHei", sans-serif; white-space: nowrap;
    letter-spacing: .5px; pointer-events: none; --dx: 0px;
    text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 2px 3px rgba(0,0,0,.8);
    animation: wg-up 1.4s ease-out forwards; }
  .wg-float.up { color: #ff6a5c; } .wg-float.down { color: #3fdc8a; }
  .wg-float.crit { font-size: 40px; animation: wg-crit 1.6s ease-out forwards; }
  .wg-float.crit.up { color: #ffd100; } .wg-float.crit.down { color: #8dff3a; }
  .wg-float.say { font-size: 13px; font-weight: 800; }
  @keyframes wg-up { 0% { opacity: 0; transform: translate(-50%, 4px) scale(.7); } 12% { opacity: 1; transform: translate(-50%, 0) scale(1.1); }
    22% { transform: translate(-50%, -4px) scale(1); } 100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), -38px) scale(.95); } }
  @keyframes wg-crit { 0% { opacity: 0; transform: translate(-50%, 0) scale(2.4); } 10% { opacity: 1; transform: translate(-50%, -2px) scale(1.5); }
    25% { transform: translate(-50%, -6px) scale(1.2); } 70% { opacity: 1; } 100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), -42px) scale(1.1); } }
  .wg-ticker { height: 22px; line-height: 22px; padding: 0 10px; font-size: 13px;  /* 跟分類標題「台股盤中」同字級 */ color: #d6dbe3; background: #111419;
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

  function report(pct, hhmm, rare) {
    if (hhmm >= '09:00' && hhmm <= '09:05') return `${D.open}`;
    if (hhmm >= '13:25' && hhmm < '13:30') return `${D.climax}`;
    if (hhmm >= '13:30') return pct >= 0 ? D.bullWin : D.bearWin;
    if (rare) return pick(D.rare[rare]);
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
      <div class="wg-bar"><i class="l"></i><i class="r"></i><i class="edge"></i></div>
      <img class="wg-god wg-guo" alt="">
      <img class="wg-god wg-emp" alt="">
      <img class="wg-troop wg-tguo" src="${A}GUO_troops.webp" alt="">
      <img class="wg-troop wg-temp" src="${A}Emperor_troops.webp" alt="">
      <img class="wg-cloud" src="${A}fight-cloud.webp" alt="">
      <img class="wg-result" alt="">
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
  let tickerAt = 0;  // 盤中每 30 秒換一句戰報
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
    const crit = Math.random() < (favored ? 0.15 + 0.2 * edge : 0.08);
    let dmg = Math.round((40 + Math.random() * 160) * (favored ? 1 + edge : 1 - 0.4 * edge));
    if (crit) dmg = Math.round(dmg * (2 + Math.random()));
    const x = bull ? Math.max(8, front - 6 - Math.random() * 10) : Math.min(92, front + 6 + Math.random() * 10);
    float(crit ? `${dmg}!` : String(dmg), bull ? 'up' : 'down', crit, x);
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
    const stamp = $('.wg-result');
    if (done) setSrc(stamp, `${A}${bullWin ? 'win' : 'loss'}.webp`);
    stamp.onload = () => draw(false);  // 圖載完才知道比例，重排一次
    stamp.classList.toggle('on', done);
    if (done) {
      // 以卡片中線置中，左右空隙一樣：寬度＝離中線最近的神祇邊緣到中線的距離 × 2。
      // 用「收漲」那組立繪（帝皇勝利立繪最寬）算，收跌的 DEFEAT 也用同一個大小
      const a = arena.getBoundingClientRect();
      if (a.width) {
        const h = a.height * 0.68 - 14;                                    // 神祇顯示高度
        const widest = Math.max(h * (343 / 240), h * (251 / 240));         // Emperor_win、GUO_loss 的寬高比
        const ratio = stamp.naturalWidth && stamp.naturalHeight ? stamp.naturalWidth / stamp.naturalHeight : 3;
        const w = Math.min(2 * (a.width / 2 - widest) - 12, (a.height * 0.68 - 16) * ratio);
        stamp.style.width = `${Math.max(40, w)}px`;
        stamp.style.left = '50%';
      }
    }
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
    if (fromData || !lastTickerKey.startsWith(phase) || (live && !paused && Date.now() - tickerAt > 30000)) {
      tickerAt = Date.now();
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
