# 占いダッシュボード（uranai/）

公開URL: https://takeom5700.github.io/uranai/
（GitHub Pages の公開元は `main` ブランチのルート。実体は `uranai/index.html`）

## 日付は1か所でしか持たない

日付・日干支・六星占術の日運・スコアは **`uranai/data/daily.json` だけ** が持つ。
`index.html` 側は差し込み口しか持たない。

| 仕組み | 書き方 | 用途 |
|---|---|---|
| スロット | `<span data-uranai="KEY"></span>` | 文中に値を1つ差し込む |
| 生成ブロック | `<!-- uranai:begin NAME -->` … `<!-- uranai:end NAME -->` | 中身をまるごと生成（`scores` / `daily-chips`） |

`index.html` の日付を手で書き換えないこと。必ず `daily.json` を直してから再生成する。

## 更新手順

```bash
# 1. 日付を進める（日干支・十神・六星の日運・月柱・天中殺は全部自動計算）
python3 .github/scripts/build_uranai.py --roll 2026-09-06

# 2. daily.json の "TODO" を全部埋める（総合方針とスコアのコメント）
#    "_review" に挙がった項目が最新かどうかもここで確認する
vim uranai/data/daily.json

# 3. 差し込み＋検証＋書き出し（検証に落ちたら index.html は一切書き換わらない）
python3 .github/scripts/build_uranai.py

# 4. コミット
git add uranai/ && git commit
```

`--roll` を使わず日付だけ手で変えるのは不可（日干支と六星がずれる）。

### 自動計算される値

`--roll` が暦から計算するので手で書かない（手で書くと V0 検証で落ちる）。

- 日付表示・週の範囲
- 日干支と十神（命式は辛亥日主）／翌日の日干支
- 六星占術の日運（木星人＋ / 金星人・霊合。12日周期）と翌日の日運
- 月柱（節入り表ベース。境界±1日は警告が出るので暦で確認する）
- 寅卯天中殺の該当/非該当

計算値はページの過去の記録と照合済み（9/2 己卯・9/4 辛巳・9/5 壬午、
8/20 丙寅、8/21 丁卯、8/30 丙子、および 8/7 立秋→丙申月・9/7 白露→丁酉月）。

検証だけしたいときは `python3 .github/scripts/build_uranai.py --check`。
同じものを GitHub Actions（`.github/workflows/uranai-validate.yml`）も push のたびに走らせる。

## 検証項目

| | 内容 |
|---|---|
| V0 | `daily.json` の日干支・翌日干支・月柱・六星日運が暦の計算値と一致するか |
| V1 | `daily.json` の全スロットが HTML に配置され、HTML 側に未知のスロットが無いか（＝更新漏れセクションの検出） |
| V2 | 生成ブロックが揃っているか |
| V3 | `<meta name="data-date">` と `<title>` が対象日と一致するか |
| V4 | 「本日 / 現在 / 時点」と併記された日付が対象日以外に無いか |
| V5 | 対象日・翌日・命式（辛亥）以外の日干支が本文に残っていないか |
| V6 | 六星の運気名（減退・乱気など）が「六星」「日運」を含む行にベタ書きされていないか |
| V7 | `daily.json` に埋め忘れ（TODO）が残っていないか |
| ―  | `--check` では、生成結果とコミット済み `index.html` が完全一致するか（部分更新の検出） |

## 古さの可視化

`<meta name="data-date" content="YYYY-MM-DD">` を生成側が書き出し、
ページ末尾のスクリプトが Asia/Tokyo の「今日」と比較する。
一致しない場合はページ最上部に赤帯で
「⚠ データは○○時点（N日前）です」を強制表示する。
更新が止まっていても、古いデータを本日の運勢として読んでしまうことはない。
