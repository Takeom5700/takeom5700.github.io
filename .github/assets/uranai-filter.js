(function () {
  // ラッキーカラー欄の絞り込み・並び替え。
  // 「期限切れ（日付範囲を過ぎた）」と「フィルタ対象外」は別々のクラスで管理し、
  // 片方を解除しても、もう片方の非表示が壊れないようにしている。
  var grid = document.querySelector('.color-grid');
  if (!grid) return;
  var chips = Array.prototype.slice.call(grid.querySelectorAll('.color-chip'));
  var countEl = document.getElementById('chip-count');
  var emptyEl = document.getElementById('chip-empty');

  var TYPE_ORDER = ['color', 'food', 'item', 'number', 'direction',
                    'fortune', 'caution', 'other'];
  var SOURCE_ORDER = ['しいたけ占い', 'Loveちゃん', '山田ありす', '六星占術',
                      '六龍法占い', '四柱推命', '中国式占い', 'その他'];
  var COLOR_WORDS = /赤|青|白|黒|緑|黄|金|銀|シルバー|ゴールド|エメラルド|紫|オレンジ|ピンク|クリーム|ベージュ|水色|ターコイズ|グリーン|ブルー|レッド/;

  function detectType(label, value) {
    var all = label + ' ' + value;
    if (/フード|食材|食べ物|料理|グルメ|ドリンク|☕/.test(all)) return 'food';
    if (/数字|ナンバー/.test(all)) return 'number';
    if (/方位/.test(all)) return 'direction';
    if (/カラー|色/.test(label)) return 'color';
    if (/アイテム|宝石|フラワー|花|パワーストーン/.test(label)) return 'item';
    if (/注意|警戒|トラブル|⚠/.test(label)) return 'caution';
    if (COLOR_WORDS.test(value)) return 'color';
    if (/開運|運気|アクション|テーマ|日運|チェックデー|十神/.test(label)) return 'fortune';
    return 'other';
  }

  function detectSource(label) {
    if (/^しいたけ/.test(label)) return 'しいたけ占い';
    if (/^Love/.test(label)) return 'Loveちゃん';
    if (/^山田ありす/.test(label)) return '山田ありす';
    if (/^六星占術/.test(label)) return '六星占術';
    if (/^六龍法/.test(label)) return '六龍法占い';
    if (/^四柱推命/.test(label)) return '四柱推命';
    if (/^中国式/.test(label)) return '中国式占い';
    return 'その他';
  }

  // 有効期限が切れたチップは常に非表示にする。
  // ラベルから「いつまで有効か」を読み取る。対応する書き方は4通り:
  //   月をまたぐ範囲 「8/30-9/1」「週8/31-9/6」 → 後ろの日付まで
  //   同じ月の範囲   「9/2-4」「（12星座・9/1-3）」 → その月の後ろの日まで
  //   月の指定       「9月」「9月予言」「（8月）」 → その月の末日まで
  //   単発の日付     「8/15 推奨行動」「10/24」 → その日まで
  // どれにも当てはまらないもの（年間・下半期・固定属性）は期限なしで出し続ける。
  var now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  var todayMonth = now.getUTCMonth() + 1;
  var todayDay = now.getUTCDate();

  function lastDayOf(month) {
    return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] || 31;
  }

  function chipEndDate(label) {
    var m = label.match(/(\d{1,2})\/(\d{1,2})\s*[-〜～]\s*(\d{1,2})\/(\d{1,2})/);
    if (m) return [parseInt(m[3], 10), parseInt(m[4], 10)];
    m = label.match(/(\d{1,2})\/(\d{1,2})\s*[-〜～]\s*(\d{1,2})(?!\s*\/)/);
    if (m) return [parseInt(m[1], 10), parseInt(m[3], 10)];
    m = label.match(/(\d{1,2})月(?!\d)/);
    if (m) {
      var mo = parseInt(m[1], 10);
      return [mo, lastDayOf(mo)];
    }
    m = label.match(/(^|[^\d/])(\d{1,2})\/(\d{1,2})([^\d/-]|$)/);
    if (m) return [parseInt(m[2], 10), parseInt(m[3], 10)];
    return null;
  }

  function isExpired(label) {
    var e = chipEndDate(label);
    if (!e) return false;
    return (e[0] < todayMonth) || (e[0] === todayMonth && e[1] < todayDay);
  }

  function textOf(chip, sel) {
    var el = chip.querySelector(sel);
    return el ? el.textContent : '';
  }

  chips.forEach(function (chip) {
    var label = textOf(chip, '.chip-label');
    var value = textOf(chip, '.chip-value');
    chip.dataset.type = detectType(label, value);
    chip.dataset.source = detectSource(label);
    if (isExpired(label)) chip.classList.add('is-expired');
  });

  var live = chips.filter(function (c) { return !c.classList.contains('is-expired'); });
  var state = { type: 'all', source: 'all', sort: 'type' };

  function matches(chip, type, source) {
    return (type === 'all' || chip.dataset.type === type)
        && (source === 'all' || chip.dataset.source === source);
  }

  function apply() {
    var shown = 0;
    chips.forEach(function (chip) {
      var ok = !chip.classList.contains('is-expired')
            && matches(chip, state.type, state.source);
      chip.classList.toggle('is-filtered-out', !ok);
      if (ok) shown++;
    });

    var key = state.sort === 'type' ? 'type' : 'source';
    var order = state.sort === 'type' ? TYPE_ORDER : SOURCE_ORDER;
    chips.slice().sort(function (a, b) {
      return order.indexOf(a.dataset[key]) - order.indexOf(b.dataset[key]);
    }).forEach(function (chip) { grid.appendChild(chip); });

    if (countEl) {
      countEl.textContent = shown + '件 / 全' + live.length + '件';
    }
    if (emptyEl) emptyEl.hidden = shown > 0;

    // 押しても0件になる選択肢を薄くする（相手側の絞り込みを考慮して数える）
    document.querySelectorAll('.sort-btn[data-filter]').forEach(function (btn) {
      var kind = btn.dataset.filter;
      var val = btn.dataset.value;
      var n = live.filter(function (c) {
        return kind === 'type'
          ? matches(c, val, state.source)
          : matches(c, state.type, val);
      }).length;
      btn.classList.toggle('is-empty', n === 0);
      btn.title = n + '件';
    });
  }

  function setActive(selector, btn) {
    document.querySelectorAll(selector).forEach(function (b) {
      b.classList.remove('active');
    });
    btn.classList.add('active');
  }

  document.querySelectorAll('.sort-btn[data-filter]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      // 0件になる選択肢は薄く表示するが、押せることは押せる。
      // 押しても無反応だと「壊れている」ように見えるので、空メッセージを出す。
      state[btn.dataset.filter] = btn.dataset.value;
      setActive('.sort-btn[data-filter="' + btn.dataset.filter + '"]', btn);
      apply();
    });
  });

  document.querySelectorAll('.sort-btn[data-sort]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.sort = btn.dataset.sort;
      setActive('.sort-btn[data-sort]', btn);
      apply();
    });
  });

  var resetBtn = document.querySelector('.sort-btn[data-reset]');
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      state.type = 'all';
      state.source = 'all';
      document.querySelectorAll('.sort-btn[data-filter]').forEach(function (b) {
        b.classList.toggle('active', b.dataset.value === 'all');
      });
      apply();
    });
  }

  apply();
})();
