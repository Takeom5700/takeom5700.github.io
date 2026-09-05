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
| アーカイブ | `<!-- uranai:archive-start -->` … `<!-- uranai:archive-end -->` | 過去日の記録。検証対象外だが「本日」と書いてはいけない |

`index.html` の日付を手で書き換えないこと。必ず `daily.json` を直してから再生成する。

## 更新手順

```bash
# 1. その日のデータを書く
vim uranai/data/daily.json

# 2. 差し込み＋検証＋書き出し（検証に落ちたら index.html は一切書き換わらない）
python3 .github/scripts/build_uranai.py

# 3. コミット
git add uranai/data/daily.json uranai/index.html && git commit
```

検証だけしたいときは `python3 .github/scripts/build_uranai.py --check`。
同じものを GitHub Actions（`.github/workflows/uranai-validate.yml`）も push のたびに走らせる。

## 検証項目

| | 内容 |
|---|---|
| V0 | `daily.json` の日干支・翌日干支が暦の計算値（JDN基準）と一致するか |
| V1 | `daily.json` の全スロットが HTML に配置され、HTML 側に未知のスロットが無いか（＝更新漏れセクションの検出） |
| V2 | 生成ブロックとアーカイブマーカーが揃っているか |
| V3 | `<meta name="data-date">` と `<title>` が対象日と一致するか |
| V4 | 「本日 / 現在 / 時点」と併記された日付が対象日以外に無いか。アーカイブに「本日」が無いか |
| V5 | 対象日・翌日・命式（辛亥）以外の日干支が本文に残っていないか |
| V6 | 六星の運気名（減退・乱気など）が「六星」「日運」を含む行にベタ書きされていないか |
| ―  | `--check` では、生成結果とコミット済み `index.html` が完全一致するか（部分更新の検出） |

## 古さの可視化

`<meta name="data-date" content="YYYY-MM-DD">` を生成側が書き出し、
ページ末尾のスクリプトが Asia/Tokyo の「今日」と比較する。
一致しない場合はページ最上部に赤帯で
「⚠ データは○○時点（N日前）です」を強制表示する。
更新が止まっていても、古いデータを本日の運勢として読んでしまうことはない。
