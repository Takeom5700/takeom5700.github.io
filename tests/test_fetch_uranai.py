#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""fetch_uranai_sources.py の解析部分をオフラインで検証する。

取得そのもの（YouTube / しいたけ占い）はこの環境から遮断されているので、
実際の応答に近いサンプルを固定で置いて、解析と検査の挙動を確かめる。
特に「捨てるべきものを確実に捨てるか」を重点的に見る。
"""
import datetime
import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "f", ROOT / ".github" / "scripts" / "fetch_uranai_sources.py")
F = importlib.util.module_from_spec(spec)
spec.loader.exec_module(F)

TODAY = datetime.date(2026, 9, 17)
ok = fail = 0


def check(name, got, want):
    global ok, fail
    if got == want:
        ok += 1
        print(f"  OK  {name}")
    else:
        fail += 1
        print(f"  NG  {name}\n      got  = {got!r}\n      want = {want!r}")


def check_true(name, cond, detail=""):
    check(name, bool(cond), True) if cond else check(name + f" {detail}", cond, True)


# ---------------------------------------------------------------- channel id
check("チャンネルID（channelId）",
      F.parse_channel_id('x"channelId":"UCabcdefghijklmnopqrstuv"y'),
      "UCabcdefghijklmnopqrstuv")
check("チャンネルID（/channel/ 形式）",
      F.parse_channel_id('<link href="/channel/UC01234567890123456789ab">'),
      "UC01234567890123456789ab")
try:
    F.parse_channel_id("<html>なし</html>")
    check("チャンネルID無しは例外", False, True)
except F.FetchError:
    check("チャンネルID無しは例外", True, True)

# ---------------------------------------------------------------- RSS
RSS = """<feed><entry>
<yt:videoId>AAAAAAAAAAA</yt:videoId>
<title>【9/16-18】十二支別の運勢 &amp; 開運</title>
<published>2026-09-16T12:00:00+00:00</published>
</entry><entry>
<yt:videoId>BBBBBBBBBBB</yt:videoId>
<title>9月の運勢</title>
<published>2026-09-01T00:00:00+00:00</published>
</entry></feed>"""
vids = F.parse_rss(RSS)
check("RSS 件数", len(vids), 2)
check("RSS 動画ID", vids[0]["video_id"], "AAAAAAAAAAA")
check("RSS タイトルのエスケープ解除", vids[0]["title"], "【9/16-18】十二支別の運勢 & 開運")
check("RSS 公開日", vids[0]["published"], "2026-09-16")
check("RSS URL", vids[0]["url"], "https://www.youtube.com/watch?v=AAAAAAAAAAA")
check("RSS 壊れたentryは無視", len(F.parse_rss("<feed><entry><title>x</title></entry></feed>")), 0)

# ---------------------------------------------------------------- shiitake
check("しいたけ 牡牛座リンク（絶対URL）",
      F.parse_shiitake_sign_url('<a href="https://shiitakeuranai.jp/taurus/">牡牛座</a>'),
      "https://shiitakeuranai.jp/taurus/")
check("しいたけ 牡牛座リンク（相対URL）",
      F.parse_shiitake_sign_url('<a href="/taurus/weekly">牡牛座</a>'),
      "https://shiitakeuranai.jp/taurus/weekly")
try:
    F.parse_shiitake_sign_url('<a href="/leo/">獅子座</a>')
    check("該当星座が無ければ例外", False, True)
except F.FetchError:
    check("該当星座が無ければ例外", True, True)

check("HTMLからテキスト抽出",
      F.html_to_text("<p>あ<br>い</p><script>x=1</script>").split(),
      ["あ", "い"])

# ---------------------------------------------------------------- 期間の解析
check("期間 同月レンジ", F.parse_period("9/16-18", TODAY),
      (datetime.date(2026, 9, 16), datetime.date(2026, 9, 18)))
check("期間 月またぎ", F.parse_period("9/28〜10/4", TODAY),
      (datetime.date(2026, 9, 28), datetime.date(2026, 10, 4)))
check("期間 単日", F.parse_period("9/17", TODAY),
      (datetime.date(2026, 9, 17), datetime.date(2026, 9, 17)))
check("期間 月日表記", F.parse_period("9月16日-18日", TODAY),
      (datetime.date(2026, 9, 16), datetime.date(2026, 9, 18)))
check("期間 年またぎ（12月→1月に見る）",
      F.parse_period("12/28", datetime.date(2027, 1, 5)),
      (datetime.date(2026, 12, 28), datetime.date(2026, 12, 28)))
check("期間 空文字は None", F.parse_period("", TODAY), None)
check("期間 読めない文字列は None", F.parse_period("来週くらい", TODAY), None)
check("期間 終了が開始より前なら None", F.parse_period("9/20-9/10", TODAY), None)

# ---------------------------------------------------------------- 検査（捨てる判断）
good = {"period": "9/16-18", "items": [
    {"target": "牡牛座", "kind": "food", "value": "焼き鳥。手軽に食べられるもので運気が上がります。"}]}
got = F.coerce_items(good, "Loveちゃん", "12星座", "http://x", TODAY)
check("正常な項目は採用", len(got), 1)
check("期間が入る", (got[0]["period_start"], got[0]["period_end"]),
      ("2026-09-16", "2026-09-18"))

check("期間なしは全部捨てる",
      len(F.coerce_items({"period": "", "items": good["items"]},
                         "Loveちゃん", "12星座", "http://x", TODAY)), 0)
check("未知の kind は捨てる",
      len(F.coerce_items({"period": "9/16-18", "items": [
          {"target": "牡牛座", "kind": "lucky_pet", "value": "犬を飼うとよい"}]},
          "Loveちゃん", "12星座", "http://x", TODAY)), 0)
check("value が短すぎるものは捨てる",
      len(F.coerce_items({"period": "9/16-18", "items": [
          {"target": "牡牛座", "kind": "food", "value": "米"}]},
          "Loveちゃん", "12星座", "http://x", TODAY)), 0)
check("target が空なら捨てる",
      len(F.coerce_items({"period": "9/16-18", "items": [
          {"target": "", "kind": "food", "value": "焼き鳥がよいでしょう"}]},
          "Loveちゃん", "12星座", "http://x", TODAY)), 0)
check("古すぎる期間は捨てる",
      len(F.coerce_items({"period": "7/1-3", "items": good["items"]},
                         "Loveちゃん", "12星座", "http://x", TODAY)), 0)
check("未来すぎる期間は捨てる",
      len(F.coerce_items({"period": "12/1-3", "items": good["items"]},
                         "Loveちゃん", "12星座", "http://x", TODAY)), 0)
check("dict でない戻りは捨てる",
      len(F.coerce_items("なにか", "Loveちゃん", "12星座", "http://x", TODAY)), 0)
check("items が無くても落ちない",
      len(F.coerce_items({"period": "9/16-18"}, "Loveちゃん", "12星座", "http://x", TODAY)), 0)

# ---------------------------------------------------------------- ラベル組み立て
lab = F.build_label(got[0])
check("ラベルの形", lab, "Loveちゃん 牡牛座（12星座・9/16-18）ラッキーフード🍜")

# 既存の期限切れ判定・種類フィルタと噛み合うか
spec2 = importlib.util.spec_from_file_location(
    "r", ROOT / ".github" / "scripts" / "repair_uranai.py")
R = importlib.util.module_from_spec(spec2)
spec2.loader.exec_module(R)
check("期限切れ判定が期間を読める", R.chip_end_date(lab, TODAY), datetime.date(2026, 9, 18))
check("期限切れ判定（月またぎ）",
      R.chip_end_date(F.build_label({**got[0], "period_start": "2026-09-28",
                                     "period_end": "2026-10-04"}), TODAY),
      datetime.date(2026, 10, 4))
check("ソース判定", R.chip_source(lab), "Loveちゃん")
check("粒度判定", R.chip_kind(lab), "range")
for kind, word in (("color", "ラッキーカラー"), ("food", "ラッキーフード"),
                   ("number", "ラッキーナンバー"), ("direction", "ラッキー方位"),
                   ("item", "ラッキーアイテム"), ("caution", "注意")):
    l = F.build_label({**got[0], "kind": kind})
    check(f"ラベルに『{word}』が入る（絞り込み用）", word in l, True)

print(f"\n合計 {ok + fail} 件 / 成功 {ok} / 失敗 {fail}")
sys.exit(1 if fail else 0)
