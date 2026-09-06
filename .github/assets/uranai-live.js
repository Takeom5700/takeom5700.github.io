// ===== ページ自身が「見た日」を計算する =====
//
// 自動修復（.github/workflows/uranai-repair.yml）が止まっても、
// 日付・日干支・六星の日運だけは開いた日のものを表示する最後の砦。
// 修復スクリプトが data-uranai-live 属性を付けた箇所を、
// ここで計算し直して差し替える。
//
// 計算式は .github/scripts/build_uranai.py と同じ。
// 食い違わないよう、テストで全日付を突き合わせている。
(function () {
  var STEMS = '甲乙丙丁戊己庚辛壬癸';
  var BRANCHES = '子丑寅卯辰巳午未申酉戌亥';
  var DAY_MASTER_GODS = {
    '甲': '正財', '乙': '偏財', '丙': '正官', '丁': '偏官（七殺）', '戊': '正印',
    '己': '偏印', '庚': '劫財', '辛': '比肩', '壬': '傷官', '癸': '食神'
  };
  var GOD_MEANING = {
    '比肩': '対等な協力者・仲間。連携が力になる',
    '劫財': '競争と協力の両面。金銭の貸し借りに注意',
    '食神': '表現・楽しみ・食。おおらかに発信できる',
    '傷官': '表現力・アイデア・才能発揮／目上への反発・失言に注意',
    '偏財': '動く財・人脈・臨機応変な稼ぎ',
    '正財': '堅実な財・コツコツ積む・信用',
    '偏官（七殺）': 'プレッシャー・責任・急な負荷',
    '正官': '評価・信用・社会的地位。目上からの引き立て',
    '偏印': '学び・内省・独自の発想',
    '正印': '守り・支援・目上からの庇護'
  };
  var HIDDEN = {
    '子': '癸', '丑': '己癸辛', '寅': '甲丙戊', '卯': '乙', '辰': '戊乙癸',
    '巳': '丙庚戊', '午': '丁己', '未': '己丁乙', '申': '庚壬戊', '酉': '辛',
    '戌': '戊辛丁', '亥': '壬甲'
  };
  var UNSEI = ['種子', '緑生', '立花', '健弱', '達成', '乱気',
               '再会', '財成', '安定', '陰影', '停止', '減退'];
  var UNSEI_MEANING = {
    '種子': '新しい始まりの仕込み・種まきに向く日',
    '緑生': '少しずつ成長・発展していく好日',
    '立花': '運気最高潮・華やかに開花し人の縁が広がる。決断/勝負事に最適',
    '健弱': '体調を崩しやすい・無理は禁物・休養を優先',
    '達成': '積み上げが実を結ぶ・成果が出る日',
    '乱気': '波乱含み・トラブル注意＝大きな決断/投資/貸し借りは避ける',
    '再会': '旧い縁の再来・懐かしい人や案件との再会',
    '財成': '金運良好・臨時収入のチャンス',
    '安定': '落ち着いて地固め・堅実に進める好日',
    '陰影': '目立つ行動を控え内省へ',
    '停止': '立ち止まり・現状維持・新規は避ける',
    '減退': '体力・気力が低下しやすい・無理せず充電'
  };
  var MARK = { '立花': '★', '財成': '★', '達成': '★',
               '健弱': '⚠', '乱気': '⚠', '陰影': '⚠', '停止': '⚠', '減退': '⚠' };
  var WEEKDAYS = '日月火水木金土';
  var NATAL_TENCHUSATSU = '寅卯';

  // 基準：2026-09-05 は 木星人＋＝立花(2) / 金星人（霊合）＝安定(8)
  var ROKUSEI_ANCHOR = Date.UTC(2026, 8, 5);
  // 六星の月運：2026年9月＝乱気(5) / 減退(11)　年運：2026年＝立花(2) / 安定(8)
  var MONTH_ANCHOR = { y: 2026, m: 9, a: 5, b: 11 };
  var YEAR_ANCHOR = { y: 2026, a: 2, b: 8 };

  // 節入り日（JST・概算）。build_uranai.py の SETSUIRI と同じ表
  var SETSUIRI = {
    2026: [['小寒',1,5],['立春',2,4],['啓蟄',3,5],['清明',4,5],['立夏',5,5],['芒種',6,5],
           ['小暑',7,7],['立秋',8,7],['白露',9,7],['寒露',10,8],['立冬',11,7],['大雪',12,7]],
    2027: [['小寒',1,5],['立春',2,4],['啓蟄',3,6],['清明',4,5],['立夏',5,6],['芒種',6,6],
           ['小暑',7,7],['立秋',8,8],['白露',9,8],['寒露',10,8],['立冬',11,7],['大雪',12,7]],
    2028: [['小寒',1,6],['立春',2,4],['啓蟄',3,5],['清明',4,4],['立夏',5,5],['芒種',6,5],
           ['小暑',7,6],['立秋',8,7],['白露',9,7],['寒露',10,8],['立冬',11,7],['大雪',12,6]]
  };
  var SETSU_BRANCH = { '立春':'寅','啓蟄':'卯','清明':'辰','立夏':'巳','芒種':'午','小暑':'未',
                       '立秋':'申','白露':'酉','寒露':'戌','立冬':'亥','大雪':'子','小寒':'丑' };

  function mark(u) { return u + (MARK[u] || ''); }

  function jdn(y, m, d) {
    var a = Math.floor((14 - m) / 12);
    var yy = y + 4800 - a;
    var mm = m + 12 * a - 3;
    return d + Math.floor((153 * mm + 2) / 5) + 365 * yy
         + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  }

  function dayPillar(y, m, d) {
    var n = ((jdn(y, m, d) + 49) % 60 + 60) % 60;
    return STEMS[n % 10] + BRANCHES[n % 12];
  }

  function rokuseiDay(y, m, d) {
    var n = Math.round((Date.UTC(y, m - 1, d) - ROKUSEI_ANCHOR) / 86400000);
    return [UNSEI[((2 + n) % 12 + 12) % 12], UNSEI[((8 + n) % 12 + 12) % 12]];
  }

  function rokuseiMonth(y, m) {
    var n = (y - MONTH_ANCHOR.y) * 12 + (m - MONTH_ANCHOR.m);
    return [UNSEI[((MONTH_ANCHOR.a + n) % 12 + 12) % 12],
            UNSEI[((MONTH_ANCHOR.b + n) % 12 + 12) % 12]];
  }

  function rokuseiYear(y) {
    var n = y - YEAR_ANCHOR.y;
    return [UNSEI[((YEAR_ANCHOR.a + n) % 12 + 12) % 12],
            UNSEI[((YEAR_ANCHOR.b + n) % 12 + 12) % 12]];
  }

  function terms(y) {
    var out = [];
    [y - 1, y, y + 1].forEach(function (yy) {
      (SETSUIRI[yy] || []).forEach(function (t) {
        out.push({ name: t[0], y: yy, m: t[1], d: t[2], key: yy * 10000 + t[1] * 100 + t[2] });
      });
    });
    out.sort(function (a, b) { return a.key - b.key; });
    return out;
  }

  function monthPillar(y, m, d) {
    var list = terms(y);
    var key = y * 10000 + m * 100 + d;
    var cur = null, nxt = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].key <= key) { cur = list[i]; nxt = list[i + 1] || null; }
    }
    if (!cur || !nxt) return null;
    var risshun = null;
    for (var j = 0; j < list.length; j++) {
      if (list[j].name === '立春' && list[j].y === y) { risshun = list[j]; break; }
    }
    var solarYear = (risshun && key >= risshun.key) ? y : y - 1;
    var ys = ((solarYear - 4) % 10 + 10) % 10;
    var base = (ys % 5) * 2 + 2;
    var branch = SETSU_BRANCH[cur.name];
    var n = ((BRANCHES.indexOf(branch) - 2) % 12 + 12) % 12;
    return {
      pillar: STEMS[(base + n) % 10] + branch,
      cur: cur, next: nxt,
      nextPillar: (function () {
        var b2 = SETSU_BRANCH[nxt.name];
        var n2 = ((BRANCHES.indexOf(b2) - 2) % 12 + 12) % 12;
        var sy2 = (nxt.name === '立春') ? nxt.y : solarYear;
        var ys2 = ((sy2 - 4) % 10 + 10) % 10;
        return STEMS[((ys2 % 5) * 2 + 2 + n2) % 10] + b2;
      })()
    };
  }

  function describe(y, m, d) {
    var pillar = dayPillar(y, m, d);
    var stem = pillar[0], branch = pillar[1];
    var god = DAY_MASTER_GODS[stem];
    var hidden = HIDDEN[branch].split('').map(function (s) {
      return s + '＝' + DAY_MASTER_GODS[s];
    });
    var mp = monthPillar(y, m, d);
    var day = rokuseiDay(y, m, d);
    var nx = new Date(Date.UTC(y, m - 1, d + 1));
    var ny = nx.getUTCFullYear(), nm = nx.getUTCMonth() + 1, nd = nx.getUTCDate();
    var nextDay = rokuseiDay(ny, nm, nd);
    var nextPillar = dayPillar(ny, nm, nd);
    var mo = rokuseiMonth(y, m), yr = rokuseiYear(y);
    var wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    var tenchu = NATAL_TENCHUSATSU.indexOf(branch) >= 0
      ? '⚠' + NATAL_TENCHUSATSU + '天中殺の' + branch + '日＝天中殺日。'
        + '大きな契約・出発・新規・散財は見送り、守り・仕込みに'
      : NATAL_TENCHUSATSU + '天中殺は明けており本日（' + branch + '日）も対象外'
        + '＝通常どおり行動してよい日';

    var v = {};
    v['date.long'] = y + '年' + m + '月' + d + '日（' + wd + '）';
    v['date.title'] = y + '/' + m + '/' + d;
    v['md'] = m + '/' + d;
    v['rokusei.today'] = mark(day[0]) + '（木星人＋） / ' + mark(day[1]) + '（金星人・霊合）';
    v['rokusei.today.short'] = mark(day[0]) + ' / ' + mark(day[1]);
    v['mok.detail'] = mark(day[0]) + '＝' + UNSEI_MEANING[day[0]];
    v['kin.detail'] = mark(day[1]) + '＝' + UNSEI_MEANING[day[1]];
    v['rokusei.month'] = mark(mo[0]) + '（木星人＋） / ' + mark(mo[1]) + '（金星人）';
    v['rokusei.year'] = mark(yr[0]) + ' / ' + mark(yr[1]);
    v['rokusei.tomorrow'] = '翌日（' + nm + '/' + nd + '）は木星人＋：' + mark(nextDay[0])
      + ' / 金星人：' + mark(nextDay[1]);
    v['shichu.day'] = pillar + '日＝' + god + '＋' + DAY_MASTER_GODS[HIDDEN[branch][0]];
    v['shichu.detail'] = stem + '＝' + god + '（' + GOD_MEANING[god] + '）＋'
      + branch + '中の' + hidden.join('・');
    v['tenchusatsu'] = tenchu;
    v['shichu.tomorrow'] = '翌日（' + nm + '/' + nd + '）＝' + nextPillar + '日：'
      + nextPillar[0] + '＝' + DAY_MASTER_GODS[nextPillar[0]] + '／' + nextPillar[1] + '中 '
      + HIDDEN[nextPillar[1]].split('').map(function (s) {
          return s + '＝' + DAY_MASTER_GODS[s]; }).join('・');
    if (mp) {
      v['shichu.month'] = mp.pillar + '月（' + DAY_MASTER_GODS[mp.pillar[0]] + '）';
      v['shichu.month.note'] = mp.cur.name + '（' + mp.cur.m + '/' + mp.cur.d + '）から'
        + mp.pillar + '月。' + mp.next.name + '（' + mp.next.m + '/' + mp.next.d + '）で'
        + mp.nextPillar + '月へ';
    }
    return v;
  }

  // 修復スクリプト（repair_uranai.py の build_blocks）と一字一句同じ文字列を作る。
  // 食い違うとページが直らないので、テストで全日付を突き合わせている。
  function buildBlocks(v) {
    return {
      lead: v['date.long'] + '｜ 六星占術の日運は<strong>' + v['rokusei.today'] + '</strong>'
        + '＝木星人＋：' + v['mok.detail'] + '／金星人（霊合）：' + v['kin.detail'] + '。'
        + '今月の月運は<strong>' + v['rokusei.month'] + '</strong>、年運は' + v['rokusei.year'] + '。'
        + '四柱推命は<strong>' + v['shichu.day'] + '</strong>＝' + v['shichu.detail'] + '。'
        + '今月＝' + v['shichu.month'] + '（' + v['shichu.month.note'] + '）。' + v['tenchusatsu'] + '。'
        + v['rokusei.tomorrow'] + '／' + v['shichu.tomorrow'] + '。',
      alertRokusei: '<strong>本日の六星占術 日運：' + v['rokusei.today'] + '</strong>'
        + '（木星人＋：' + v['mok.detail'] + '／金星人（霊合）：' + v['kin.detail'] + '）'
        + '／月運は' + v['rokusei.month'] + '・年運は' + v['rokusei.year'] + '。',
      alertShichu: '四柱推命（辛亥日主）：今月＝' + v['shichu.month'] + '。本日は'
        + '<strong>' + v['shichu.day'] + '</strong>。' + v['shichu.detail'] + '。'
        + v['tenchusatsu'] + '。',
      alertBazi: '中国式占い（八字）：<strong>今月＝' + v['shichu.month'] + '</strong>。本日'
        + '<strong>' + v['shichu.day'] + '</strong>。' + v['shichu.detail'] + '。'
        + v['tenchusatsu'] + '。吉方位：西・北。ラッキー数字：4・9（金）・1・6（水）。',
      footerDate: v['date.long']
    };
  }

  // ---- ここから DOM 側 ----
  window.uranaiDescribe = describe;      // テスト用に公開
  window.uranaiBuildBlocks = buildBlocks;
  if (typeof document === 'undefined') return;

  var meta = document.querySelector('meta[name="data-date"]');
  var dataDate = meta && meta.getAttribute('content');
  var now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  var y = now.getUTCFullYear(), m = now.getUTCMonth() + 1, d = now.getUTCDate();
  var todayIso = y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2);
  var banner = document.getElementById('stale-banner');

  function showBanner(text) {
    if (!banner) return;
    banner.textContent = text;
    banner.classList.add('is-visible');
  }

  if (!dataDate || !/^\d{4}-\d{2}-\d{2}$/.test(dataDate)) {
    showBanner('⚠ データ取得日を読み取れません。表示されている日付・運勢は信用しないでください。');
    return;
  }
  if (dataDate === todayIso) return;   // 修復済み＝そのまま表示

  // --- 自動修復が止まっている。計算できるところだけ本日ぶんに差し替える ---
  var blocks = buildBlocks(describe(y, m, d));
  var filled = 0;
  document.querySelectorAll('[data-uranai-live]').forEach(function (el) {
    var key = el.getAttribute('data-uranai-live');
    if (blocks[key] !== undefined) { el.innerHTML = blocks[key]; filled++; }
  });
  var v = describe(y, m, d);
  document.title = '占いダッシュボード ' + v['date.title'];

  var diff = Math.round((Date.parse(todayIso) - Date.parse(dataDate)) / 86400000);
  var jp = dataDate.slice(0, 4) + '年' + Number(dataDate.slice(5, 7)) + '月'
         + Number(dataDate.slice(8, 10)) + '日';
  if (filled > 0) {
    showBanner('⚠ 自動更新が' + (diff > 0 ? diff + '日前（' + jp + '）' : jp)
      + 'で止まっています。日付・日干支・六星の運勢は本日ぶんを自動計算して表示しています。'
      + '占いソースの文章・スコアは' + jp + '時点のものなので参考程度に。');
  } else {
    showBanner('⚠ データは' + jp + '時点（' + diff + '日前）です。本日の運勢ではありません。');
  }
})();
