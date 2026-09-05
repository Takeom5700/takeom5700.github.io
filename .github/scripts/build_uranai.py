#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""占いダッシュボード (uranai/index.html) のビルド＆検証。

日付・日干支・六星の日運は uranai/data/daily.json だけを唯一のデータ源とし、
HTML 側は <span data-uranai="KEY"></span> のスロットと
<!-- uranai:begin NAME --> ... <!-- uranai:end NAME --> の生成ブロックだけを持つ。

  python3 .github/scripts/build_uranai.py            # 差し込み＋検証＋書き出し
  python3 .github/scripts/build_uranai.py --check    # 書き出さずに検証のみ

検証に1つでも失敗したら HTML は一切書き換えず exit 1 で止まる。
セクションを部分的にしか更新できなかった状態でコミットされるのを防ぐため。
"""
from __future__ import annotations

import argparse
import datetime
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_PATH = ROOT / "uranai" / "data" / "daily.json"
HTML_PATH = ROOT / "uranai" / "index.html"

STEMS = "甲乙丙丁戊己庚辛壬癸"
BRANCHES = "子丑寅卯辰巳午未申酉戌亥"
# 六星占術の日運12周期（このどれかが本文にベタ書きされていたら部分更新の疑い）
UNSEI = ["種子", "緑生", "立花", "健弱", "達成", "乱気",
         "再会", "財成", "安定", "陰影", "停止", "減退"]

SLOT_RE = re.compile(r'(<span data-uranai="([^"]+)"\s*>)(.*?)(</span>)', re.S)
# <span> スロット以外の場所で使うキー（V1 の未配置チェックから除外する）
NON_SPAN_SLOTS = {"date.title", "score.tag"}
BLOCK_RE_TMPL = r'(<!-- uranai:begin {name} -->)(.*?)(<!-- uranai:end {name} -->)'
ARCHIVE_RE = re.compile(
    r'<!-- uranai:archive-start -->.*?<!-- uranai:archive-end -->', re.S)
SCRIPT_STYLE_RE = re.compile(r'<(script|style)\b.*?</\1>', re.S)


class BuildError(Exception):
    pass


def day_pillar(d: datetime.date) -> str:
    """日干支。JDN 基準（1949-10-01=甲子日 / 2000-01-01=戊午日 で検証済み）。"""
    a = (14 - d.month) // 12
    y = d.year + 4800 - a
    m = d.month + 12 * a - 3
    jdn = (d.day + (153 * m + 2) // 5 + 365 * y
           + y // 4 - y // 100 + y // 400 - 32045)
    n = (jdn + 49) % 60
    return STEMS[n % 10] + BRANCHES[n % 12]


def esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


# --------------------------------------------------------------------------
# 生成ブロック
# --------------------------------------------------------------------------
def render_scores(data: dict) -> str:
    band_cls = {"low": ("s-low", "bar-low"), "mid": ("s-mid", "bar-mid"),
                "high": ("s-high", "bar-high")}
    tag = data["slots"]["score.tag"]
    out = ["\n"]
    for s in data["scores"]:
        if s["band"] not in band_cls:
            raise BuildError(f'スコア "{s["label"]}" の band が不正: {s["band"]}')
        num_cls, bar_cls = band_cls[s["band"]]
        pct = round(float(s["value"]) * 10)
        out.append(
            '  <div class="score-card">\n'
            f'    <div class="label">{esc(s["label"])}</div>\n'
            f'    <div class="score-num {num_cls}">{float(s["value"]):.1f}</div>\n'
            f'    <div class="score-bar-bg"><div class="score-bar-fill {bar_cls}" '
            f'style="width:{pct}%"></div></div>\n'
            f'    <div class="comment">{esc(tag)}{esc(s["comment"])}</div>\n'
            '  </div>\n\n'
        )
    return "".join(out)


def render_daily_chips(data: dict) -> str:
    out = ["\n",
           "    <!-- 本日分の六星日運・四柱推命・中国式チップ（daily.json から生成） -->\n"]
    for c in data["daily_chips"]:
        out.append(
            '    <div class="color-chip">\n'
            f'      <div class="color-dot" style="background:{c["color"]};'
            f'border:1px solid {c["border"]};"></div>\n'
            f'      <div><div class="chip-label">{esc(c["label"])}</div>'
            f'<div class="chip-value">{esc(c["value"])}</div></div>\n'
            '    </div>\n'
        )
    out.append("    ")
    return "".join(out)


BLOCKS = {"scores": render_scores, "daily-chips": render_daily_chips}


# --------------------------------------------------------------------------
# 差し込み
# --------------------------------------------------------------------------
def render(html: str, data: dict) -> str:
    slots = data["slots"]
    date = data["date"]

    missing: list[str] = []

    def sub_slot(m: re.Match) -> str:
        key = m.group(2)
        if key not in slots:
            missing.append(key)
            return m.group(0)
        return m.group(1) + esc(slots[key]) + m.group(4)

    html = SLOT_RE.sub(sub_slot, html)
    if missing:
        raise BuildError(
            "HTML に daily.json へ存在しないスロットがあります: "
            + ", ".join(sorted(set(missing))))

    for name, fn in BLOCKS.items():
        pattern = re.compile(BLOCK_RE_TMPL.format(name=re.escape(name)), re.S)
        if not pattern.search(html):
            raise BuildError(f"生成ブロック <!-- uranai:begin {name} --> が見つかりません")
        html = pattern.sub(
            lambda m, fn=fn: m.group(1) + fn(data) + m.group(3), html, count=1)

    html, n = re.subn(r'<meta name="data-date" content="[^"]*">',
                      f'<meta name="data-date" content="{date}">', html)
    if n != 1:
        raise BuildError('<meta name="data-date"> がちょうど1つ必要です（見つかった数: %d）' % n)

    html, n = re.subn(r"<title>.*?</title>",
                      f'<title>占いダッシュボード {esc(slots["date.title"])}</title>',
                      html, flags=re.S)
    if n != 1:
        raise BuildError("<title> がちょうど1つ必要です（見つかった数: %d）" % n)

    return html


# --------------------------------------------------------------------------
# 検証
# --------------------------------------------------------------------------
def split_regions(html: str) -> tuple[str, str]:
    """(live, archive) に分割。live からは script/style も落とす。"""
    archives = ARCHIVE_RE.findall(html)
    live = ARCHIVE_RE.sub(" ", html)
    live = SCRIPT_STYLE_RE.sub(" ", live)
    return live, "\n".join(archives)


def validate(html: str, data: dict) -> list[str]:
    errors: list[str] = []
    slots = data["slots"]
    date = datetime.date.fromisoformat(data["date"])
    today_md = f"{date.month}/{date.day}"
    tomorrow = date + datetime.timedelta(days=1)

    # --- V0: daily.json 自体の整合（日干支は計算値と一致すること） ---
    calc = day_pillar(date)
    if not slots.get("shichu.day", "").startswith(calc):
        errors.append(
            f'V0 daily.json の日干支が暦の計算値と違います: '
            f'shichu.day="{slots.get("shichu.day")}" / 計算値={calc}日')
    calc_next = day_pillar(tomorrow)
    if calc_next not in slots.get("shichu.tomorrow", ""):
        errors.append(
            f'V0 daily.json の翌日干支が計算値と違います: '
            f'shichu.tomorrow に "{calc_next}" が含まれていません')

    # --- V1: スロット網羅（HTML側とJSON側が完全一致すること） ---
    used = {m.group(2) for m in SLOT_RE.finditer(html)}
    unknown = used - set(slots)
    unplaced = set(slots) - used - NON_SPAN_SLOTS
    if unknown:
        errors.append("V1 HTML にある未知のスロット: " + ", ".join(sorted(unknown)))
    if unplaced:
        errors.append(
            "V1 daily.json にあるのに HTML へ差し込まれていないスロット"
            "（＝更新されていないセクションがある可能性）: "
            + ", ".join(sorted(unplaced)))

    # --- V2: 生成ブロック・アーカイブマーカーの存在 ---
    for name in BLOCKS:
        if not re.search(BLOCK_RE_TMPL.format(name=re.escape(name)), html, re.S):
            errors.append(f"V2 生成ブロック {name} が見つかりません")
    if not ARCHIVE_RE.search(html):
        errors.append("V2 アーカイブ領域のマーカーが見つかりません")

    # --- V3: meta / title ---
    m = re.search(r'<meta name="data-date" content="([^"]*)">', html)
    if not m:
        errors.append('V3 <meta name="data-date"> がありません')
    elif m.group(1) != data["date"]:
        errors.append(f'V3 meta data-date={m.group(1)} が daily.json の {data["date"]} と不一致')
    m = re.search(r"<title>(.*?)</title>", html, re.S)
    if not m or slots["date.title"] not in m.group(1):
        errors.append(f'V3 <title> に {slots["date.title"]} が入っていません')

    live, archive = split_regions(html)

    # --- V4: 「本日」と併記された日付が対象日以外に無いか ---
    strays: set[str] = set()
    for mm in re.finditer(r"本日[^。<]{0,24}?(\d{1,2})/(\d{1,2})", live):
        if f"{int(mm.group(1))}/{int(mm.group(2))}" != today_md:
            strays.add(mm.group(0))
    for mm in re.finditer(r"(\d{1,2})/(\d{1,2})[^。<]{0,10}?(?:本日|現在|時点)", live):
        if f"{int(mm.group(1))}/{int(mm.group(2))}" != today_md:
            strays.add(mm.group(0))
    if strays:
        errors.append(
            f"V4 対象日({today_md})以外の日付が「本日/現在/時点」と併記されています: "
            + " / ".join(sorted(strays)))
    if "本日" in archive:
        errors.append(
            "V4 アーカイブ領域に「本日」が残っています（過去日の記録に本日と書かないこと）")

    # --- V5: 日干支の混在 ---
    allowed_pillars = {calc, calc_next}
    natal = data.get("natal_day_pillar")
    if natal:
        allowed_pillars.add(natal)   # 命式の日柱は毎日不変なので除外
    bad = {p for p in re.findall(rf"([{STEMS}][{BRANCHES}])日", live)
           if p not in allowed_pillars}
    if bad:
        errors.append(
            "V5 対象日/翌日以外の日干支が本文に残っています: "
            + " / ".join(f"{p}日" for p in sorted(bad))
            + f"（対象日={calc}日・翌日={calc_next}日）")

    # --- V6: 六星の日運がスロット外にベタ書きされていないか ---
    stripped = SLOT_RE.sub(" ", html)
    for name in BLOCKS:
        stripped = re.sub(BLOCK_RE_TMPL.format(name=re.escape(name)), " ",
                          stripped, flags=re.S)
    stripped, _ = split_regions(stripped)
    leaked = set()
    for line in stripped.split("\n"):
        # 「六星」「日運」が出てくる行に運気名が生で残っていたら部分更新の疑い。
        # （「達成感」「再会」などの日常語を誤検出しないよう文脈で絞る）
        if "六星" not in line and "日運" not in line:
            continue
        leaked |= {u for u in UNSEI if u in line}
    if leaked:
        errors.append(
            "V6 六星の日運/運気名がスロット外にベタ書きされています: "
            + " / ".join(sorted(leaked))
            + "（daily.json のスロット経由で表示すること）")

    return errors


# --------------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="書き出さずに、コミット済みHTMLが daily.json と同期しているか検証する")
    args = ap.parse_args()

    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    original = HTML_PATH.read_text(encoding="utf-8")

    try:
        rendered = render(original, data)
    except BuildError as e:
        print(f"❌ ビルド失敗: {e}", file=sys.stderr)
        print("   → HTML は書き換えていません。", file=sys.stderr)
        return 1

    errors = validate(rendered, data)
    if errors:
        print("❌ 検証に失敗しました（中途半端な更新を防ぐため書き出しを中止します）:",
              file=sys.stderr)
        for e in errors:
            print("   - " + e, file=sys.stderr)
        return 1

    if args.check:
        if rendered != original:
            print("❌ uranai/index.html が uranai/data/daily.json と同期していません。",
                  file=sys.stderr)
            print("   一部のセクションだけが手で書き換えられた可能性があります。",
                  file=sys.stderr)
            print("   → python3 .github/scripts/build_uranai.py で再生成してください。",
                  file=sys.stderr)
            return 1
        print(f"✅ 検証OK: uranai/index.html は daily.json（{data['date']}）と一致しています。")
        return 0

    if rendered == original:
        print(f"✅ 変更なし（すでに {data['date']} で同期済み）。")
    else:
        HTML_PATH.write_text(rendered, encoding="utf-8")
        print(f"✅ uranai/index.html を {data['date']} で再生成しました。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
