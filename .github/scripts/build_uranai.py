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
SCRIPT_STYLE_RE = re.compile(r'<(script|style)\b.*?</\1>', re.S)


class BuildError(Exception):
    pass

# ==========================================================================
# 暦の計算テーブル（ここが「毎日まちがえる部分」を機械に任せるための土台）
# ==========================================================================
DAY_MASTER = "辛"          # 命式の日干（辛亥日主）
NATAL_TENCHUSATSU = "寅卯"  # 寅卯天中殺

# 辛（陰金）日主から見た十干の十神
TEN_GODS = {
    "甲": "正財", "乙": "偏財", "丙": "正官", "丁": "偏官（七殺）", "戊": "正印",
    "己": "偏印", "庚": "劫財", "辛": "比肩", "壬": "傷官", "癸": "食神",
}
TEN_GOD_MEANING = {
    "比肩": "対等な協力者・仲間。連携が力になる",
    "劫財": "競争と協力の両面。金銭の貸し借りに注意",
    "食神": "表現・楽しみ・食。おおらかに発信できる",
    "傷官": "表現力・アイデア・才能発揮／目上への反発・失言に注意",
    "偏財": "動く財・人脈・臨機応変な稼ぎ",
    "正財": "堅実な財・コツコツ積む・信用",
    "偏官（七殺）": "プレッシャー・責任・急な負荷",
    "正官": "評価・信用・社会的地位。目上からの引き立て",
    "偏印": "学び・内省・独自の発想",
    "正印": "守り・支援・目上からの庇護",
}
# 十二支の蔵干（主気を先頭に）
HIDDEN_STEMS = {
    "子": "癸", "丑": "己癸辛", "寅": "甲丙戊", "卯": "乙", "辰": "戊乙癸",
    "巳": "丙庚戊", "午": "丁己", "未": "己丁乙", "申": "庚壬戊", "酉": "辛",
    "戌": "戊辛丁", "亥": "壬甲",
}

# 六星占術の日運12周期（UNSEI）の意味と印
UNSEI_MEANING = {
    "種子": "新しい始まりの仕込み・種まきに向く日",
    "緑生": "少しずつ成長・発展していく好日",
    "立花": "運気最高潮・華やかに開花し人の縁が広がる。決断/勝負事に最適",
    "健弱": "体調を崩しやすい・無理は禁物・休養を優先",
    "達成": "積み上げが実を結ぶ・成果が出る日",
    "乱気": "波乱含み・トラブル注意＝大きな決断/投資/貸し借りは避ける",
    "再会": "旧い縁の再来・懐かしい人や案件との再会",
    "財成": "金運良好・臨時収入のチャンス",
    "安定": "落ち着いて地固め・堅実に進める好日",
    "陰影": "目立つ行動を控え内省へ",
    "停止": "立ち止まり・現状維持・新規は避ける",
    "減退": "体力・気力が低下しやすい・無理せず充電",
}
UNSEI_MARK = {"立花": "★", "財成": "★", "達成": "★",
              "健弱": "⚠", "乱気": "⚠", "陰影": "⚠", "停止": "⚠", "減退": "⚠"}

# 六星の基準日：2026-09-05 は 木星人＋＝立花 / 金星人（霊合）＝安定
ROKUSEI_ANCHOR = datetime.date(2026, 9, 5)
ROKUSEI_ANCHOR_MOKUSEI = 2   # UNSEI.index("立花")
ROKUSEI_ANCHOR_KINSEI = 8    # UNSEI.index("安定")

# 節入り日（JST・概算。境界±1日は警告を出す）
SETSUIRI = {
    2026: [("小寒", 1, 5), ("立春", 2, 4), ("啓蟄", 3, 5), ("清明", 4, 5),
           ("立夏", 5, 5), ("芒種", 6, 5), ("小暑", 7, 7), ("立秋", 8, 7),
           ("白露", 9, 7), ("寒露", 10, 8), ("立冬", 11, 7), ("大雪", 12, 7)],
    2027: [("小寒", 1, 5), ("立春", 2, 4), ("啓蟄", 3, 6), ("清明", 4, 5),
           ("立夏", 5, 6), ("芒種", 6, 6), ("小暑", 7, 7), ("立秋", 8, 8),
           ("白露", 9, 8), ("寒露", 10, 8), ("立冬", 11, 7), ("大雪", 12, 7)],
}
# 節 → 月支（立春が寅月の始まり）
SETSU_BRANCH = {"立春": "寅", "啓蟄": "卯", "清明": "辰", "立夏": "巳",
                "芒種": "午", "小暑": "未", "立秋": "申", "白露": "酉",
                "寒露": "戌", "立冬": "亥", "大雪": "子", "小寒": "丑"}
WEEKDAYS = "月火水木金土日"


def ten_god(stem: str) -> str:
    return TEN_GODS[stem]


def branch_gods(branch: str) -> list[tuple[str, str]]:
    """十二支の蔵干とその十神（主気が先頭）。"""
    return [(s, ten_god(s)) for s in HIDDEN_STEMS[branch]]


def unsei_label(u: str) -> str:
    return u + UNSEI_MARK.get(u, "")


def rokusei_for(d: datetime.date) -> tuple[str, str]:
    """(木星人＋の日運, 金星人（霊合）の日運)"""
    n = (d - ROKUSEI_ANCHOR).days
    return (UNSEI[(ROKUSEI_ANCHOR_MOKUSEI + n) % 12],
            UNSEI[(ROKUSEI_ANCHOR_KINSEI + n) % 12])


def solar_terms(year: int) -> list[tuple[str, datetime.date]]:
    if year not in SETSUIRI:
        raise BuildError(
            f"{year}年の節入り表がありません。build_uranai.py の SETSUIRI に追記してください。")
    return [(n, datetime.date(year, m, dd)) for n, m, dd in SETSUIRI[year]]


def month_pillar(d: datetime.date) -> tuple[str, str, datetime.date, str, datetime.date]:
    """(月柱, 現在の節, 節入り日, 次の節, 次の節入り日)"""
    terms = []
    for y in (d.year - 1, d.year, d.year + 1):
        if y in SETSUIRI:
            terms += solar_terms(y)
    terms.sort(key=lambda t: t[1])
    cur = nxt = None
    for i, (name, day) in enumerate(terms):
        if day <= d:
            cur = (name, day)
            nxt = terms[i + 1] if i + 1 < len(terms) else None
    if cur is None or nxt is None:
        raise BuildError(f"{d} の節入りを決められません。SETSUIRI の範囲を広げてください。")

    branch = SETSU_BRANCH[cur[0]]
    # 立春を年の境にした年干支
    risshun = next(day for name, day in terms
                   if name == "立春" and day.year == d.year)
    solar_year = d.year if d >= risshun else d.year - 1
    year_stem_idx = (solar_year - 4) % 10
    base = (year_stem_idx % 5) * 2 + 2          # 寅月の月干
    n = (BRANCHES.index(branch) - 2) % 12       # 寅=0 起算
    stem = STEMS[(base + n) % 10]
    return stem + branch, cur[0], cur[1], nxt[0], nxt[1]


def describe_day(d: datetime.date) -> dict:
    """その日の「計算で決まる」値をすべて求める。"""
    pillar = day_pillar(d)
    stem, branch = pillar[0], pillar[1]
    g = ten_god(stem)
    bgs = branch_gods(branch)
    mp, cur_setsu, cur_day, nxt_setsu, nxt_day = month_pillar(d)
    mok, kin = rokusei_for(d)
    nmok, nkin = rokusei_for(d + datetime.timedelta(days=1))
    nxt_pillar = day_pillar(d + datetime.timedelta(days=1))
    return {
        "date": d, "pillar": pillar, "stem": stem, "branch": branch,
        "stem_god": g, "branch_gods": bgs,
        "month_pillar": mp, "month_god": ten_god(mp[0]),
        "cur_setsu": cur_setsu, "cur_setsu_day": cur_day,
        "next_setsu": nxt_setsu, "next_setsu_day": nxt_day,
        "next_month_pillar": month_pillar(nxt_day)[0],
        "mokusei": mok, "kinsei": kin,
        "next_mokusei": nmok, "next_kinsei": nkin,
        "next_pillar": nxt_pillar,
        "tenchusatsu": branch in NATAL_TENCHUSATSU,
    }



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
def visible_text(html: str) -> str:
    """検証対象の本文。script/style は落とす。

    以前は過去日の記録を置く「アーカイブ領域」を検証から除外していたが、
    期限切れチップを全て削除したため領域ごと廃止した。
    いまはページ全体が検証対象＝チェックはより厳しくなっている。
    """
    return SCRIPT_STYLE_RE.sub(" ", html)


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
    try:
        calc_month = month_pillar(date)[0]
        if not slots.get("shichu.month", "").startswith(calc_month):
            errors.append(
                f'V0 daily.json の月柱が節入りの計算値と違います: '
                f'shichu.month="{slots.get("shichu.month")}" / 計算値={calc_month}月')
    except BuildError as e:
        errors.append(f"V0 月柱を検証できません: {e}")
    calc_mok, calc_kin = rokusei_for(date)
    for key, want in (("rokusei.today", unsei_label(calc_mok)),
                      ("rokusei.today", unsei_label(calc_kin))):
        if want not in slots.get(key, ""):
            errors.append(
                f'V0 六星の日運が12周期の計算値と違います: '
                f'{key} に "{want}" が含まれていません')

    # --- V7: 埋め忘れ（TODO）が残っていないか ---
    todo_keys = [k for k, v in slots.items() if "TODO" in str(v)]
    todo_keys += [f"scores[{i}].comment" for i, sc in enumerate(data.get("scores", []))
                  if "TODO" in str(sc.get("comment", ""))]
    todo_keys += [f"daily_chips[{i}]" for i, c in enumerate(data.get("daily_chips", []))
                  if "TODO" in json.dumps(c, ensure_ascii=False)]
    if todo_keys:
        errors.append(
            "V7 daily.json に埋め忘れ（TODO）が残っています: "
            + ", ".join(todo_keys))

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

    # --- V3: meta / title ---
    m = re.search(r'<meta name="data-date" content="([^"]*)">', html)
    if not m:
        errors.append('V3 <meta name="data-date"> がありません')
    elif m.group(1) != data["date"]:
        errors.append(f'V3 meta data-date={m.group(1)} が daily.json の {data["date"]} と不一致')
    m = re.search(r"<title>(.*?)</title>", html, re.S)
    if not m or slots["date.title"] not in m.group(1):
        errors.append(f'V3 <title> に {slots["date.title"]} が入っていません')

    live = visible_text(html)

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
    stripped = visible_text(stripped)
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



# ==========================================================================
# --roll : 翌日以降へ日付を進める（計算で決まる値は自動、判断が要る値はTODO）
# ==========================================================================
TODO = "TODO"

# 計算で決まるので毎回上書きするスロット
COMPUTED_SLOTS = [
    "date.long", "date.title", "week.range",
    "rokusei.today", "rokusei.today.short", "rokusei.today.mokusei",
    "rokusei.today.kinsei", "rokusei.today.detail", "rokusei.tomorrow",
    "shichu.day", "shichu.day.detail", "shichu.month", "shichu.month.note",
    "shichu.tenchusatsu", "shichu.tomorrow", "score.tag",
]
# 人（またはエージェント）がその日を見て書くスロット → TODO を入れて更新を強制する
TODO_SLOTS = ["summary.headline", "summary.caution", "summary.policy"]
# 前日から引き継ぐが、必ず見直してほしいスロット
REVIEW_SLOTS = [
    "rokusei.year", "rokusei.month", "rokusei.month.note",
    "bazi.lucky", "bazi.color", "shiitake.week", "shiitake.month",
    "love.latest", "love.latest.short", "love.status",
    "yamada.checkday", "source.checked", "mirai.latest",
]


def computed_slots(info: dict) -> dict:
    d = info["date"]
    mok, kin = info["mokusei"], info["kinsei"]
    bg = "・".join(f"{st}＝{g}" for st, g in info["branch_gods"])
    bg_main = info["branch_gods"][0][1]
    week_end = d + datetime.timedelta(days=6)
    nd = d + datetime.timedelta(days=1)

    return {
        "date.long": f"{d.year}年{d.month}月{d.day}日（{WEEKDAYS[d.weekday()]}）",
        "date.title": f"{d.year}/{d.month}/{d.day}",
        "week.range": f"{d.month}/{d.day}〜{week_end.month}/{week_end.day}",

        "rokusei.today": f"{unsei_label(mok)}（木星人＋） / {unsei_label(kin)}（金星人・霊合）",
        "rokusei.today.short": f"{unsei_label(mok)} / {unsei_label(kin)}",
        "rokusei.today.mokusei": f"{unsei_label(mok)}＝{UNSEI_MEANING[mok]}",
        "rokusei.today.kinsei": f"{unsei_label(kin)}＝{UNSEI_MEANING[kin]}",
        "rokusei.today.detail": (
            f"木星人＋：{unsei_label(mok)}＝{UNSEI_MEANING[mok]}。"
            f"金星人（霊合）：{unsei_label(kin)}＝{UNSEI_MEANING[kin]}。"),
        "rokusei.tomorrow": (
            f"翌日（{nd.month}/{nd.day}）は木星人＋：{unsei_label(info['next_mokusei'])}"
            f"＝{UNSEI_MEANING[info['next_mokusei']]} / "
            f"金星人：{unsei_label(info['next_kinsei'])}"
            f"＝{UNSEI_MEANING[info['next_kinsei']]}"),

        "shichu.day": f"{info['pillar']}日＝{info['stem_god']}＋{bg_main}",
        "shichu.day.detail": (
            f"{info['stem']}＝{info['stem_god']}（{TEN_GOD_MEANING[info['stem_god']]}）"
            f"＋{info['branch']}中の{bg}"),
        "shichu.month": f"{info['month_pillar']}月（{info['month_god']}）",
        "shichu.month.note": (
            f"{info['cur_setsu']}（{info['cur_setsu_day'].month}/"
            f"{info['cur_setsu_day'].day}）から{info['month_pillar']}月。"
            f"{info['next_setsu']}（{info['next_setsu_day'].month}/"
            f"{info['next_setsu_day'].day}）で{info['next_month_pillar']}月へ"),
        "shichu.tenchusatsu": (
            f"⚠{NATAL_TENCHUSATSU}天中殺の{info['branch']}日＝天中殺日。"
            "大きな契約・出発・新規・散財は見送り、守り・仕込みに"
            if info["tenchusatsu"] else
            f"{NATAL_TENCHUSATSU}天中殺は明けており本日（{info['branch']}日）も対象外"
            "＝通常どおり行動してよい日"),
        "shichu.tomorrow": (
            f"翌日（{nd.month}/{nd.day}）＝{info['next_pillar']}日："
            f"{info['next_pillar'][0]}＝{ten_god(info['next_pillar'][0])}／"
            f"{info['next_pillar'][1]}中 "
            + "・".join(f"{st}＝{g}" for st, g in branch_gods(info['next_pillar'][1]))),

        "score.tag": f"【日運：{unsei_label(mok)}/{unsei_label(kin)}】",
    }


def computed_chips(info: dict) -> list[dict]:
    mok, kin = info["mokusei"], info["kinsei"]
    nd = info["date"] + datetime.timedelta(days=1)
    bg = "・".join(f"{st}＝{g}" for st, g in info["branch_gods"])
    return [
        {"color": "#1e7a48", "border": "#145a34",
         "label": "六星占術 木星人＋ 日運",
         "value": (f"{unsei_label(mok)}＝{UNSEI_MEANING[mok]}。"
                   f"翌{nd.month}/{nd.day}は{unsei_label(info['next_mokusei'])}"
                   f"＝{UNSEI_MEANING[info['next_mokusei']]}")},
        {"color": "#2b8ab0", "border": "#1a6285",
         "label": "六星占術 霊合（金星人） 日運",
         "value": (f"{unsei_label(kin)}＝{UNSEI_MEANING[kin]}。"
                   f"翌{nd.month}/{nd.day}は{unsei_label(info['next_kinsei'])}"
                   f"＝{UNSEI_MEANING[info['next_kinsei']]}")},
        {"color": "#3b3226", "border": "#1c1810",
         "label": f"四柱推命 辛亥（{info['pillar']}日）十神",
         "value": (f"{info['stem']}＝{info['stem_god']}"
                   f"（{TEN_GOD_MEANING[info['stem_god']]}）＋{info['branch']}中の{bg}。"
                   f"今月＝{info['month_pillar']}月（{info['month_god']}）")},
        {"color": "#a8762b", "border": "#7e5a1e",
         "label": f"中国式占い 辛亥（{info['pillar']}日）ラッキー数字/方位🔢",
         "value": TODO + "（bazi.lucky を確認して転記）"},
    ]


def roll(target: datetime.date) -> None:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    info = describe_day(target)

    prev_date = data.get("date")
    data["date"] = target.isoformat()
    data["slots"].update(computed_slots(info))
    for k in TODO_SLOTS:
        data["slots"][k] = f"{TODO}: {k} を、その日の六星日運と四柱の十神から書き直す"

    chips = computed_chips(info)
    chips[3]["value"] = data["slots"].get("bazi.lucky", TODO)
    data["daily_chips"] = chips

    for sc in data.get("scores", []):
        sc["comment"] = (f"{TODO}: 「{sc['label']}」の理由を、"
                         f"日運{unsei_label(info['mokusei'])}/{unsei_label(info['kinsei'])}と"
                         f"{info['pillar']}日＝{info['stem_god']}から書く"
                         "（点数と band も見直すこと）")

    data["_review"] = (
        [f"{k}（前日から引き継ぎ）" for k in REVIEW_SLOTS]
        + ["scores の点数と band（日運が変わったので見直す）"])

    DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                         encoding="utf-8")

    print(f"📅 {prev_date} → {target.isoformat()} へ日付を進めました。")
    print(f"   日干支 : {info['pillar']}日（{info['stem_god']}）")
    print(f"   六星   : 木星人＋ {unsei_label(info['mokusei'])} / "
          f"金星人 {unsei_label(info['kinsei'])}")
    print(f"   月柱   : {info['month_pillar']}月（{info['month_god']}）"
          f"／{info['cur_setsu']}〜{info['next_setsu']}")
    if abs((target - info["cur_setsu_day"]).days) <= 1 or \
            abs((target - info["next_setsu_day"]).days) <= 1:
        print("   ⚠ 節入りの境界（±1日）です。月柱が正しいか暦で確認してください。")
    print()
    print("次にやること:")
    print(f"  1. uranai/data/daily.json の「{TODO}」を全て埋める")
    print("  2. _review に挙がった項目（Loveちゃん・しいたけ等）を最新か確認する")
    print("  3. python3 .github/scripts/build_uranai.py を実行する")
    print(f"     ※ {TODO} が残っているとビルドは失敗します")

# --------------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="書き出さずに、コミット済みHTMLが daily.json と同期しているか検証する")
    ap.add_argument("--roll", metavar="YYYY-MM-DD",
                    help="daily.json をその日付へ進める（日干支・六星・月柱は自動計算）")
    args = ap.parse_args()

    if args.roll:
        try:
            roll(datetime.date.fromisoformat(args.roll))
        except (BuildError, ValueError) as e:
            print(f"❌ {e}", file=sys.stderr)
            return 1
        return 0

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
