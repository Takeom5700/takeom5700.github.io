// ===== データ鮮度チェック =====
// <meta name="data-date"> と Asia/Tokyo の「今日」を比較し、ズレていたら
// 最上部に赤帯を強制表示する。日付がページ内容と食い違ったまま
// 気づかずに読んでしまうのを防ぐための最後の砦。
(function () {
  var banner = document.getElementById('stale-banner');
  if (!banner) return;
  var meta = document.querySelector('meta[name="data-date"]');
  var dataDate = meta && meta.getAttribute('content');

  if (!dataDate || !/^\d{4}-\d{2}-\d{2}$/.test(dataDate)) {
    banner.textContent = '⚠ データ取得日を読み取れません（meta[name="data-date"] が未設定です）。'
      + '表示されている日付・運勢は信用しないでください。';
    banner.classList.add('is-visible');
    return;
  }

  // JSTの今日（UTC+9）
  var today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (dataDate === today) return;

  var diff = Math.round((Date.parse(today) - Date.parse(dataDate)) / 86400000);
  var jp = dataDate.slice(0, 4) + '年' + Number(dataDate.slice(5, 7)) + '月'
         + Number(dataDate.slice(8, 10)) + '日';
  banner.textContent = diff > 0
    ? '⚠ データは' + jp + '時点（' + diff + '日前）です。本日の運勢ではありません。'
    : '⚠ データは' + jp + '時点（未来の日付）です。本日の運勢ではありません。';
  banner.classList.add('is-visible');
})();
