#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""占いソースの新しい回を取りこんで uranai/data/fetched.json に書く。

この環境（Claude Code のコンテナ）からは YouTube も しいたけ占いも
ポリシーで遮断されているので、**GitHub Actions 上でしか実走できない**。
そのため次の方針で書いてある。

- 解析部分は純粋関数に切り出し、保存済みのサンプルでオフライン検証できる
  （tests/test_fetch_uranai.py）
- **取れなかったら何も書かない。** 推測で埋めない。
  占いの中身を捏造するのが一番の害なので、失敗時は「取れなかった」と
  記録して終わる。ページ側は「届いていない」と正直に表示する。
- 期間（いつからいつまでの回か）が確定できない項目は捨てる。
  期間が無いとチップの期限切れ判定ができず、古い内容が居座るため。

  python3 .github/scripts/fetch_uranai_sources.py            # 取得して書き出す
  python3 .github/scripts/fetch_uranai_sources.py --dry-run  # 書き出さずに表示
"""
from __future__ import annotations

import argparse
import datetime
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FETCHED_PATH = ROOT / "uranai" / "data" / "fetched.json"
SOURCES_PATH = ROOT / "uranai" / "data" / "sources.json"

LOVE_HANDLE = "lovemedolovechan"
LOVE_CHANNEL_URL = f"https://www.youtube.com/@{LOVE_HANDLE}"
SHIITAKE_TOP = "https://shiitakeuranai.jp/"

SIGN = "牡牛座"          # 依頼者の星座
ETO = "寅年"             # 十二支
KYUSEI = "五黄土星"       # 九星

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

# Gemini に返させる種類。ラベルはこちらで組み立てるので、
# モデルには「どの種類か」だけを選ばせる（表記ゆれで分類が壊れないように）。
KIND_LABEL = {
    "color":     ("ラッキーカラー", "🎨"),
    "food":      ("ラッキーフード", "🍜"),
    "item":      ("ラッキーアイテム", "💎"),
    "number":    ("ラッキーナンバー", "🔢"),
    "direction": ("ラッキー方位", "🧭"),
    "action":    ("開運アクション", "✨"),
    "theme":     ("運気テーマ", "🌅"),
    "caution":   ("注意", "⚠"),
}
KIND_COLOR = {
    "color": ("#a8762b", "#7e5a1e"), "food": ("#b5651d", "#8a4a10"),
    "item": ("#2b8ab0", "#1a6285"), "number": ("#5a6b8c", "#3c4a66"),
    "direction": ("#1e7a6a", "#125548"), "action": ("#7d3fb0", "#5a2888"),
    "theme": ("#1e7a48", "#145a34"), "caution": ("#b3402e", "#8a2c1e"),
}


class FetchError(Exception):
    pass


# --------------------------------------------------------------------------
# 純粋関数（オフラインで検証できる部分）
# --------------------------------------------------------------------------
def parse_channel_id(html: str) -> str:
    """チャンネルページの HTML から UC... の ID を取り出す。"""
    for pat in (r'"channelId"\s*:\s*"(UC[\w-]{22})"',
                r'"externalId"\s*:\s*"(UC[\w-]{22})"',
                r'channel_id=(UC[\w-]{22})',
                r'/channel/(UC[\w-]{22})'):
        m = re.search(pat, html)
        if m:
            return m.group(1)
    raise FetchError("チャンネルIDが見つかりません")


def parse_rss(xml: str) -> list[dict]:
    """YouTube の RSS から動画一覧を取り出す（新しい順）。"""
    out = []
    for entry in re.findall(r"<entry>(.*?)</entry>", xml, re.S):
        vid = re.search(r"<yt:videoId>([\w-]+)</yt:videoId>", entry)
        title = re.search(r"<title>(.*?)</title>", entry, re.S)
        pub = re.search(r"<published>([\d\-T:+.Z]+)</published>", entry)
        if not (vid and title and pub):
            continue
        out.append({
            "video_id": vid.group(1),
            "title": unescape(title.group(1).strip()),
            "published": pub.group(1)[:10],
            "url": f"https://www.youtube.com/watch?v={vid.group(1)}",
        })
    return out


def unescape(s: str) -> str:
    for a, b in (("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"),
                 ("&quot;", '"'), ("&#39;", "'")):
        s = s.replace(a, b)
    return s


def parse_shiitake_sign_url(html: str, sign: str = SIGN) -> str:
    """しいたけ占いトップから、その星座の週間ページURLを探す。"""
    romaji = {"牡牛座": "taurus", "牡羊座": "aries", "双子座": "gemini",
              "蟹座": "cancer", "獅子座": "leo", "乙女座": "virgo",
              "天秤座": "libra", "蠍座": "scorpio", "射手座": "sagittarius",
              "山羊座": "capricorn", "水瓶座": "aquarius", "魚座": "pisces"}[sign]
    for m in re.finditer(r'href="([^"]*)"', html):
        href = m.group(1)
        if romaji in href.lower():
            if href.startswith("http"):
                return href
            return SHIITAKE_TOP.rstrip("/") + "/" + href.lstrip("/")
    raise FetchError(f"{sign}（{romaji}）のページが見つかりません")


def html_to_text(html: str) -> str:
    html = re.sub(r"<(script|style)\b.*?</\1>", " ", html, flags=re.S | re.I)
    html = re.sub(r"<br\s*/?>|</p>|</div>|</li>", "\n", html, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", html)
    text = unescape(text)
    return re.sub(r"[ \t　]+", " ", text)


def parse_period(text: str, today: datetime.date):
    """「9/16-18」「9/14〜9/20」などから (開始, 終了) を日付で返す。"""
    if not text:
        return None
    t = text.replace("月", "/").replace("日", "")
    m = re.search(r"(\d{1,2})/(\d{1,2})\s*[-〜～~]\s*(\d{1,2})/(\d{1,2})", t)
    if m:
        a = (int(m.group(1)), int(m.group(2)))
        b = (int(m.group(3)), int(m.group(4)))
    else:
        m = re.search(r"(\d{1,2})/(\d{1,2})\s*[-〜～~]\s*(\d{1,2})(?!\s*/)", t)
        if m:
            a = (int(m.group(1)), int(m.group(2)))
            b = (int(m.group(1)), int(m.group(3)))
        else:
            m = re.search(r"(\d{1,2})/(\d{1,2})", t)
            if not m:
                return None
            a = b = (int(m.group(1)), int(m.group(2)))

    def to_date(md):
        mo, day = md
        year = today.year
        if mo - today.month > 6:
            year -= 1
        elif today.month - mo > 6:
            year += 1
        try:
            return datetime.date(year, mo, day)
        except ValueError:
            return None
    s, e = to_date(a), to_date(b)
    if not s or not e or e < s:
        return None
    return s, e


def coerce_items(raw, source: str, scope: str, url: str,
                 today: datetime.date) -> list[dict]:
    """モデルの戻りを、そのまま信じずに厳しく検査して項目に整える。

    期間が読めないもの・種類が未知のもの・中身が短すぎるものは捨てる。
    ここを緩めると、根拠のない内容がページに載る。
    """
    if not isinstance(raw, dict):
        return []
    period = parse_period(str(raw.get("period") or ""), today)
    if not period:
        return []
    start, end = period
    # 期間が今日から見て未来すぎる／古すぎるものは取り違えとみなす
    if end < today - datetime.timedelta(days=31) or start > today + datetime.timedelta(days=31):
        return []

    out = []
    for it in raw.get("items") or []:
        if not isinstance(it, dict):
            continue
        kind = str(it.get("kind") or "").strip()
        value = str(it.get("value") or "").strip()
        target = str(it.get("target") or "").strip()
        if kind not in KIND_LABEL or len(value) < 2 or len(value) > 300:
            continue
        if not target:
            continue
        out.append({
            "source": source, "scope": scope, "target": target, "kind": kind,
            "value": value,
            "period_start": start.isoformat(), "period_end": end.isoformat(),
            "url": url,
        })
    return out


def build_label(item: dict) -> str:
    """チップのラベルを組み立てる。

    期限切れ判定と種類フィルタがラベルの文言に依存しているので、
    ここで決まった形に揃える（モデルに書かせない）。
    """
    name, emoji = KIND_LABEL[item["kind"]]
    s = datetime.date.fromisoformat(item["period_start"])
    e = datetime.date.fromisoformat(item["period_end"])
    if (s.month, s.day) == (e.month, e.day):
        period = f"{s.month}/{s.day}"
    elif s.month == e.month:
        period = f"{s.month}/{s.day}-{e.day}"
    else:
        period = f"{s.month}/{s.day}-{e.month}/{e.day}"
    return (f'{item["source"]} {item["target"]}'
            f'（{item["scope"]}・{period}）{name}{emoji}')


# --------------------------------------------------------------------------
# 取得（ネットワーク）
# --------------------------------------------------------------------------
# YouTube はデータセンターからの素の GET に 404 を返すことがある。
# 同意 Cookie と言語指定を付けると通ることが多い。
YT_COOKIE = "CONSENT=YES+cb.20210328-17-p0.ja+FX+888; SOCS=CAISEwgDEgk0ODE3Nzk3MjQaAmphIAEaBgiA_LyaBg"


def get(url: str, timeout: int = 30, cookie: str | None = None) -> str:
    headers = {"User-Agent": UA, "Accept-Language": "ja,en;q=0.8"}
    if cookie:
        headers["Cookie"] = cookie
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def rss_url(channel_id: str) -> str:
    return f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"


def verify_channel_id(cid: str):
    """RSS が実際に引けるかで、チャンネルIDが本物かを確かめる。

    検索や推測で出てきた ID をそのまま信じないための関門。
    引けたらチャンネル名を返し、駄目なら None。
    """
    if not re.fullmatch(r"UC[\w-]{22}", cid or ""):
        return None
    try:
        xml = get(rss_url(cid), timeout=20)
    except Exception:  # noqa: BLE001
        return None
    if "<entry>" not in xml:
        return None
    m = re.search(r"<title>(.*?)</title>", xml, re.S)
    return unescape(m.group(1).strip()) if m else None


CHANNEL_URL_VARIANTS = (
    "https://www.youtube.com/@{h}",
    "https://www.youtube.com/@{h}/videos",
    "https://m.youtube.com/@{h}",
    "https://www.youtube.com/c/{h}",
)

CHANNEL_ID_PROMPT = """YouTube のチャンネル「@{handle}」のチャンネルID
（UC で始まる24文字）を Google 検索で調べて、次の JSON だけを返してください。

{{"channel_id": "UC..."}}

確信が持てない場合は {{"channel_id": ""}} と返してください。推測で埋めないこと。
"""


def resolve_love_channel_id(client, notes: list[str]) -> str:
    """Loveちゃんのチャンネル ID を、必ず RSS で裏取りしてから返す。"""
    sources = json.loads(SOURCES_PATH.read_text(encoding="utf-8"))
    cached = sources.get("love_channel_id")
    if cached:
        name = verify_channel_id(cached)
        if name:
            print(f"  記録済みのIDを使用: {cached}（{name}）")
            return cached
        notes.append(f"記録済みID {cached} が使えなくなっていたので取り直します")

    found = None
    for tmpl in CHANNEL_URL_VARIANTS:
        url = tmpl.format(h=LOVE_HANDLE)
        try:
            html = get(url, cookie=YT_COOKIE)
        except Exception as e:  # noqa: BLE001
            code = getattr(e, "code", type(e).__name__)
            print(f"  {url} → {code}")
            continue
        try:
            cid = parse_channel_id(html)
        except FetchError:
            print(f"  {url} → ID を取り出せず")
            continue
        name = verify_channel_id(cid)
        if name:
            print(f"  {url} → {cid}（{name}）")
            found = cid
            break
        print(f"  {url} → {cid} は RSS で確認できず")

    if not found:
        print("  ページから取れないので検索で探します")
        raw = gemini_json(client, CHANNEL_ID_PROMPT.format(handle=LOVE_HANDLE),
                          search=True)
        for cid in re.findall(r"UC[\w-]{22}", json.dumps(raw or {})):
            name = verify_channel_id(cid)
            if name:
                print(f"  検索結果 {cid}（{name}）を RSS で確認")
                found = cid
                break

    if not found:
        raise FetchError("チャンネルIDを特定できませんでした")

    sources["love_channel_id"] = found
    SOURCES_PATH.write_text(json.dumps(sources, ensure_ascii=False, indent=2)
                            + "\n", encoding="utf-8")
    return found


def gemini_json(client, prompt: str, video_url: str | None = None,
                search: bool = False):
    """Gemini に JSON だけを返させる。失敗したら None（＝何も書かない）。"""
    from google.genai import types
    parts = []
    if video_url:
        parts.append(types.Part(file_data=types.FileData(
            file_uri=video_url, mime_type="video/*")))
    parts.append(types.Part(text=prompt))
    contents = [types.Content(role="user", parts=parts)]
    for model in ("gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash"):
        try:
            resp = client.models.generate_content(
                model=model, contents=contents,
                config=types.GenerateContentConfig(
                    **({"tools": [types.Tool(google_search=types.GoogleSearch())]}
                       if search else
                       {"response_mime_type": "application/json"}),
                    max_output_tokens=4000, temperature=0.0))
            text = (resp.text or "").strip()
            if not text:
                continue
            if search:  # 検索つきだと JSON 以外が混ざるので抜き出す
                m = re.search(r"\{.*\}", text, re.S)
                if not m:
                    continue
                text = m.group(0)
            print(f"    モデル {model} から応答 ({len(text)}文字)")
            return json.loads(text)
        except Exception as e:  # noqa: BLE001
            print(f"    モデル {model} 失敗: {type(e).__name__}: {e}")
    return None


LOVE_PROMPT = """この動画は日本の占い師「Loveちゃん」の運勢動画です。
動画の内容だけにもとづいて、次の対象について述べられていることを抜き出してください。

対象: {targets}

**重要な決まり**
- 動画で実際に言われていないことは絶対に書かない。触れられていない対象は items に含めない。
- period は、この回が対象としている期間を動画の記載どおりに（例 "9/16-18" や "9/14〜9/20"）。
  期間が分からなければ period を空文字にすること。推測しない。
- value は日本語で40〜120字程度。動画の言い回しを要約する。

次の JSON だけを返す:
{{"period": "9/16-18",
  "items": [{{"target": "牡牛座", "kind": "food", "value": "..."}}]}}

kind は color(ラッキーカラー) / food(ラッキーフード) / item(アイテム) /
number(数字) / direction(方位) / action(開運行動) / theme(運気テーマ) /
caution(注意) のいずれか。
"""

SHIITAKE_PROMPT = """次は「しいたけ占い」の{sign}の週間ページから抜き出した文章です。
この文章だけにもとづいて内容を整理してください。

**重要な決まり**
- 文章に無いことは絶対に書かない。
- period はこの回が対象とする週を文章の記載どおりに（例 "9/14〜9/20"）。
  分からなければ空文字。推測しない。
- value は日本語で40〜120字程度。

次の JSON だけを返す:
{{"period": "9/14〜9/20",
  "items": [{{"target": "{sign}", "kind": "theme", "value": "..."}}]}}

kind は color / food / item / number / direction / action / theme / caution。
POWER UP や COOL DOWN の色は kind を color にする。

--- 本文ここから ---
{body}
--- 本文ここまで ---
"""


def fetch_love(client, today: datetime.date, days: int = 5) -> tuple[list[dict], list[str]]:
    notes = []
    cid = resolve_love_channel_id(client, notes)
    rss = get(rss_url(cid), cookie=YT_COOKIE)
    videos = parse_rss(rss)
    recent = [v for v in videos
              if (today - datetime.date.fromisoformat(v["published"])).days <= days]
    print(f"  直近{days}日の動画: {len(recent)}本 / 全{len(videos)}本")
    items = []
    for v in recent[:4]:
        print(f"  - {v['published']} {v['title'][:50]}")
        raw = gemini_json(client,
                          LOVE_PROMPT.format(targets=f"{SIGN}、{ETO}、{KYUSEI}、全体"),
                          video_url=v["url"])
        if not raw:
            notes.append(f"{v['video_id']}: 解析できず")
            continue
        got = coerce_items(raw, "Loveちゃん", scope_of(v["title"]), v["url"], today)
        print(f"    採用 {len(got)} 件")
        items += got
    return items, notes


def scope_of(title: str) -> str:
    if "十二支" in title or "干支" in title:
        return "十二支"
    if "星座" in title:
        return "12星座"
    if "九星" in title:
        return "九星"
    return "全体"


def fetch_shiitake(client, today: datetime.date) -> tuple[list[dict], list[str]]:
    notes = []
    url = parse_shiitake_sign_url(get(SHIITAKE_TOP))
    print(f"  {SIGN}のページ: {url}")
    body = html_to_text(get(url))[:6000]
    raw = gemini_json(client, SHIITAKE_PROMPT.format(sign=SIGN, body=body))
    if not raw:
        notes.append("しいたけ: 解析できず")
        return [], notes
    got = coerce_items(raw, "しいたけ", "週間", url, today)
    print(f"  採用 {len(got)} 件")
    return got, notes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--date", help="YYYY-MM-DD（省略時は Asia/Tokyo の今日）")
    args = ap.parse_args()

    today = (datetime.date.fromisoformat(args.date) if args.date else
             (datetime.datetime.now(datetime.timezone.utc)
              + datetime.timedelta(hours=9)).date())

    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        print("❌ GEMINI_API_KEY が設定されていません。", file=sys.stderr)
        return 1
    from google import genai
    client = genai.Client(api_key=key)

    items, notes = [], []
    for name, fn in (("Loveちゃん", lambda: fetch_love(client, today)),
                     ("しいたけ占い", lambda: fetch_shiitake(client, today))):
        print(f"▶ {name}")
        try:
            got, n = fn()
            items += got
            notes += n
        except Exception as e:  # noqa: BLE001
            print(f"  ❌ {type(e).__name__}: {e}")
            notes.append(f"{name}: 取得失敗（{type(e).__name__}）")

    for it in items:
        it["label"] = build_label(it)
    # 同じラベルが重なったら新しい期間を優先
    dedup: dict[str, dict] = {}
    for it in sorted(items, key=lambda x: x["period_end"]):
        dedup[it["label"]] = it
    items = sorted(dedup.values(), key=lambda x: (x["source"], x["period_end"]))

    print(f"\n取りこめた項目: {len(items)} 件")
    for it in items:
        print(f"  {it['label']}")
        print(f"    {it['value'][:70]}")
    if notes:
        print("\nメモ:")
        for n in notes:
            print("  - " + n)

    if args.dry_run:
        print("\n--dry-run のため書き出しません。")
        return 0

    if not items:
        # 取れなかった。**既存の内容は消さない**し、新しく作りもしない。
        print("\n⚠ 新しく取りこめた項目がありません。fetched.json は据え置きます。")
        return 0

    FETCHED_PATH.write_text(json.dumps(
        {"fetched_at": today.isoformat(), "notes": notes, "items": items},
        ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\n✅ {FETCHED_PATH.relative_to(ROOT)} に {len(items)} 件を書き出しました。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
