#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""uranai/index.html を「見た日の情報」に自動修復する。

外部の自動更新スクリプトが uranai/index.html を毎日まるごと上書きしてくる。
そのスクリプトには手を出せないので、上書きされない .github/ 側から
後追いで直す。何度実行しても同じ結果になる（冪等）ように書いてある。

外部スクリプトが直すところ : title / 六星の日運 / 日干支 / スコア / 週の範囲
外部スクリプトが直し忘れるところ（＝ここで直す）:
  - フッターの「データ取得日」
  - 冒頭リード文と注意欄の「本日9/2」などの固い日付
  - 四柱推命・中国式カードの「9/2（本日）＝己卯日」
  - 「今月＝辛丑月」（節入り的に誤り）
  - 期限切れのラッキーカラー欄チップ
  - データ鮮度の赤帯・絞り込みUI（毎回消される）

  python3 .github/scripts/repair_uranai.py            # 修復して書き出す
  python3 .github/scripts/repair_uranai.py --check    # 修復が要るかだけ見る
"""
from __future__ import annotations

import argparse
import datetime
import importlib.util
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HTML_PATH = ROOT / "uranai" / "index.html"
ASSETS = ROOT / ".github" / "assets"

_spec = importlib.util.spec_from_file_location(
    "build_uranai", Path(__file__).with_name("build_uranai.py"))
B = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(B)


class RepairError(Exception):
    pass


def today_jst() -> datetime.date:
    return (datetime.datetime.now(datetime.timezone.utc)
            + datetime.timedelta(hours=9)).date()


# 六星占術の月運・年運も12周期。基準：2026年9月＝乱気/減退、2026年＝立花/安定
MONTH_ANCHOR = (2026, 9, 5, 11)   # 年, 月, 木星人＋のindex(乱気), 金星人のindex(減退)
YEAR_ANCHOR = (2026, 2, 8)        # 年, 木星人＋(立花), 金星人(安定)


def rokusei_month(d: datetime.date) -> tuple[str, str]:
    ay, am, im, ik = MONTH_ANCHOR
    n = (d.year - ay) * 12 + (d.month - am)
    return B.UNSEI[(im + n) % 12], B.UNSEI[(ik + n) % 12]


def rokusei_year(d: datetime.date) -> tuple[str, str]:
    ay, im, ik = YEAR_ANCHOR
    n = d.year - ay
    return B.UNSEI[(im + n) % 12], B.UNSEI[(ik + n) % 12]


def mark(u: str) -> str:
    return u + B.UNSEI_MARK.get(u, "")


def build_texts(d: datetime.date) -> dict:
    i = B.describe_day(d)
    mok, kin = i["mokusei"], i["kinsei"]
    mm, mk = rokusei_month(d)
    ym, yk = rokusei_year(d)
    bg = "・".join(f"{st}＝{g}" for st, g in i["branch_gods"])
    nd = d + datetime.timedelta(days=1)
    tenchu = (f"⚠{B.NATAL_TENCHUSATSU}天中殺の{i['branch']}日＝天中殺日。"
              "大きな契約・出発・新規・散財は見送り、守り・仕込みに"
              if i["tenchusatsu"] else
              f"{B.NATAL_TENCHUSATSU}天中殺は明けており本日（{i['branch']}日）も対象外"
              "＝通常どおり行動してよい日")
    return {
        "info": i,
        "date_long": f"{d.year}年{d.month}月{d.day}日（{B.WEEKDAYS[d.weekday()]}）",
        "date_title": f"{d.year}/{d.month}/{d.day}",
        "iso": d.isoformat(),
        "md": f"{d.month}/{d.day}",
        "rokusei_today": f"{mark(mok)}（木星人＋） / {mark(kin)}（金星人・霊合）",
        "rokusei_today_short": f"{mark(mok)} / {mark(kin)}",
        "mok_detail": f"{mark(mok)}＝{B.UNSEI_MEANING[mok]}",
        "kin_detail": f"{mark(kin)}＝{B.UNSEI_MEANING[kin]}",
        "rokusei_month": f"{mark(mm)}（木星人＋） / {mark(mk)}（金星人）",
        "rokusei_year": f"{mark(ym)} / {mark(yk)}",
        "rokusei_tomorrow": (
            f"翌日（{nd.month}/{nd.day}）は木星人＋：{mark(i['next_mokusei'])} / "
            f"金星人：{mark(i['next_kinsei'])}"),
        "shichu_day": f"{i['pillar']}日＝{i['stem_god']}＋{i['branch_gods'][0][1]}",
        "shichu_detail": (
            f"{i['stem']}＝{i['stem_god']}（{B.TEN_GOD_MEANING[i['stem_god']]}）"
            f"＋{i['branch']}中の{bg}"),
        "shichu_month": f"{i['month_pillar']}月（{i['month_god']}）",
        "shichu_month_note": (
            f"{i['cur_setsu']}（{i['cur_setsu_day'].month}/{i['cur_setsu_day'].day}）"
            f"から{i['month_pillar']}月。{i['next_setsu']}"
            f"（{i['next_setsu_day'].month}/{i['next_setsu_day'].day}）"
            f"で{i['next_month_pillar']}月へ"),
        "tenchusatsu": tenchu,
        "shichu_tomorrow": (
            f"翌日（{nd.month}/{nd.day}）＝{i['next_pillar']}日："
            f"{i['next_pillar'][0]}＝{B.ten_god(i['next_pillar'][0])}／"
            f"{i['next_pillar'][1]}中 "
            + "・".join(f"{s}＝{g}" for s, g in B.branch_gods(i['next_pillar'][1]))),
    }



# --------------------------------------------------------------------------
# 「生きた値」ブロック
#   自動修復が止まっても、ページ側の uranai-live.js が同じ計算で作り直せるよう、
#   data-uranai-live="キー" を付けて埋め込む部分。
#   .github/assets/uranai-live.js の buildBlocks() と一字一句同じものを返すこと。
#   （テストで全日付を突き合わせている）
# --------------------------------------------------------------------------
def build_blocks(t: dict) -> dict:
    return {
        "lead": (
            f'{t["date_long"]}｜ 六星占術の日運は<strong>{t["rokusei_today"]}</strong>'
            f'＝木星人＋：{t["mok_detail"]}／金星人（霊合）：{t["kin_detail"]}。'
            f'今月の月運は<strong>{t["rokusei_month"]}</strong>、年運は{t["rokusei_year"]}。'
            f'四柱推命は<strong>{t["shichu_day"]}</strong>＝{t["shichu_detail"]}。'
            f'今月＝{t["shichu_month"]}（{t["shichu_month_note"]}）。{t["tenchusatsu"]}。'
            f'{t["rokusei_tomorrow"]}／{t["shichu_tomorrow"]}。'),
        "alertRokusei": (
            f'<strong>本日の六星占術 日運：{t["rokusei_today"]}</strong>'
            f'（木星人＋：{t["mok_detail"]}／金星人（霊合）：{t["kin_detail"]}）'
            f'／月運は{t["rokusei_month"]}・年運は{t["rokusei_year"]}。'),
        "alertShichu": (
            f'四柱推命（辛亥日主）：今月＝{t["shichu_month"]}。本日は'
            f'<strong>{t["shichu_day"]}</strong>。{t["shichu_detail"]}。{t["tenchusatsu"]}。'),
        "alertBazi": (
            f'中国式占い（八字）：<strong>今月＝{t["shichu_month"]}</strong>。本日'
            f'<strong>{t["shichu_day"]}</strong>。{t["shichu_detail"]}。{t["tenchusatsu"]}。'
            f'吉方位：西・北。ラッキー数字：4・9（金）・1・6（水）。'),
        "footerDate": t["date_long"],
    }


def live(key: str, blocks: dict) -> str:
    return f'<span data-uranai-live="{key}">{blocks[key]}</span>'


# --------------------------------------------------------------------------
# 置き換え（要素まるごと差し替えなので、何度実行しても同じ結果になる）
# --------------------------------------------------------------------------
def rewrite_sections(html: str, t: dict) -> tuple[str, list[str], list[str]]:
    done = []
    warnings = []

    def sub(pattern, repl, name, flags=re.S, required=True):
        nonlocal html
        new, n = re.subn(pattern, lambda m: repl, html, flags=flags)
        if n:
            html = new
            done.append(f"{name}×{n}")
        elif required:
            # 中断しない。直せたところまでは直し、残りはページ側の
            # uranai-live.js が閲覧時に計算し直す。ただし必ず警告を出す。
            warnings.append(
                f"「{name}」の差し替え位置が見つかりませんでした"
                "（外部スクリプトの出力形式が変わった可能性）")

    blocks = build_blocks(t)

    # 冒頭リード文（丸ごと作り直す。元は数日前の文面が固定で入っている）
    sub(r'<p class="date">.*?</p>',
        f'<p class="date">{live("lead", blocks)}</p>', "冒頭リード文")

    # 注意欄の先頭行（行ごと差し替える。行頭の 🛡 はこの1行だけ）
    sub(r'^  🛡 [^\n]*', f'  🛡 {live("alertRokusei", blocks)}<br>',
        "注意欄の先頭行", flags=re.M)

    # 9月予言の行から「本日M/D」を外す（予言自体は月単位なので残す）
    sub(r'【全体（(\d{1,2})月予言・本日\d{1,2}/\d{1,2}）継続★】',
        '【全体（\\g<1>月予言）継続★】', "9月予言の見出し", required=False)
    html = re.sub(r'【全体（(\d{1,2})月予言・本日\d{1,2}/\d{1,2}）継続★】',
                  r'【全体（\1月予言）継続★】', html)

    # 人間関係欄の「六星占術＋四柱推命」項目
    sub(r'<div class="comm-source">六星占術＋四柱推命｜.*?</div>\n.*?\n(?=  </div>)',
        f'<div class="comm-source">六星占術＋四柱推命｜日運「{t["rokusei_today"]}」'
        f'＋{t["shichu_day"]}</div>\n'
        f'    <strong>木星人＋：{t["mok_detail"]}／金星人（霊合）：{t["kin_detail"]}。</strong>'
        f'四柱は{t["shichu_detail"]}。{t["tenchusatsu"]}。\n',
        "人間関係欄の六星＋四柱項目")

    # 四柱推命／中国式カードの「M/D（本日）＝XX日：…」（2か所）
    sub(r'<strong style="color:#b3402e;">'
        r'(?:\d{1,2}/\d{1,2}（本日）|本日（\d{1,2}/\d{1,2}）)＝[^<]*</strong>[^\n]*<br>',
        f'<strong style="color:#b3402e;">本日（{t["md"]}）＝{t["shichu_day"]}</strong>'
        f'：{t["shichu_detail"]}。{t["tenchusatsu"]}<br>',
        "四柱/中国式カードの本日行")

    # 今月の月柱を節入りから計算した値に直す（「辛丑月」など誤った値の上書きも兼ねる）
    PILLAR = r'[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]'
    sub(rf'今月＝{PILLAR}月（(?:[^（）]|（[^（）]*）)*）', f'今月＝{t["shichu_month"]}', "今月の月柱",
        required=False)
    html = re.sub(rf'今月＝{PILLAR}月(?!（)', f'今月＝{t["shichu_month"]}', html)

    # 六星の日運行（外部スクリプトが書く。誰も更新しない日は自分で進める）
    sub(r'<strong style="color:#[0-9a-fA-F]{6};">本日（\d{1,2}/\d{1,2}）日運：[^<]*</strong>'
        r'（[^<]*）',
        f'<strong style="color:#c94464;">本日（{t["md"]}）日運：'
        f'{t["rokusei_today_short"]}</strong>'
        f'（木星人＋：{t["mok_detail"]}／金星人（霊合）：{t["kin_detail"]}）',
        "六星の日運行")

    # 「→ 翌日(M/D)は木星人＋：…」の行
    sub(r'→ 翌日[（(]\d{1,2}/\d{1,2}[）)]は木星人＋：[^<]*',
        f'→ {t["rokusei_tomorrow"]}', "六星の翌日行")

    # 注意欄の四柱推命行（行ごと差し替える）
    sub(r'^  ✨ [^\n]*', f'  ✨ {live("alertShichu", blocks)}<br>',
        "注意欄の四柱推命行", flags=re.M)

    # 注意欄の中国式行（行ごと差し替える）
    sub(r'^  ☯ [^\n]*', f'  ☯ {live("alertBazi", blocks)}',
        "注意欄の中国式行", flags=re.M)

    # 「翌日(M/D)＝XX日：…」の行
    sub(r'→ 翌日[（(]\d{1,2}/\d{1,2}[）)]＝[^<]*<br>',
        f'→ {t["shichu_tomorrow"]}。六星は{t["rokusei_tomorrow"]}<br>',
        "翌日の行", required=False)

    # 「N月予言（本日M/D）」から日付を外す（予言は月単位なので月だけ残す）
    html = re.sub(r'(\d{1,2})月予言（本日\d{1,2}/\d{1,2}）', r'\1月予言', html)
    # 「本日M/Dは指定日外」
    html = re.sub(r'本日\d{1,2}/\d{1,2}は指定日外', '本日は指定日外', html)

    # フッターのデータ取得日
    sub(r'データ取得日: .*?<br>',
        f'データ取得日: {live("footerDate", blocks)}<br>', "フッターの日付")

    return html, done, warnings


DAILY_START = "    <!-- uranai:daily-chips ここから（repair_uranai.py が毎回作り直す） -->"
DAILY_END = "    <!-- uranai:daily-chips ここまで -->"


def refresh_daily_chips(html: str, t: dict) -> str:
    """その日限りのチップ（六星の日運・四柱推命・中国式）を作り直して先頭に置く。"""
    i = t["info"]
    bg = "・".join(f"{st}＝{g}" for st, g in i["branch_gods"])

    # 前回この関数が入れたブロックを外す
    html = re.sub(re.escape(DAILY_START) + r".*?" + re.escape(DAILY_END) + r"\n",
                  "", html, flags=re.S)

    # 外部スクリプト由来の「本日ぶん」チップ（古い日付・古い日干支）を取り除く
    def drop(m):
        chunk = m.group(0)
        lm = re.search(r'<div class="chip-label">(.*?)</div>', chunk, re.S)
        label = lm.group(1) if lm else ""
        if re.search(r'本日\s*[（(]?\d{1,2}/\d{1,2}', label) or \
           re.search(r'本日\s+[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]日', label) or \
           re.search(r'★?当日', label):
            return ""
        return chunk
    html = re.sub(r'\n?    <div class="color-chip">\n.*?\n    </div>', drop, html, flags=re.S)

    chips = [
        ("#1e7a48", "#145a34", "六星占術 木星人＋ 日運",
         f'{t["mok_detail"]}。翌日は{mark(i["next_mokusei"])}'
         f'＝{B.UNSEI_MEANING[i["next_mokusei"]]}'),
        ("#2b8ab0", "#1a6285", "六星占術 霊合（金星人） 日運",
         f'{t["kin_detail"]}。翌日は{mark(i["next_kinsei"])}'
         f'＝{B.UNSEI_MEANING[i["next_kinsei"]]}'),
        ("#3b3226", "#1c1810", f'四柱推命 辛亥（{i["pillar"]}日）十神',
         f'{i["stem"]}＝{i["stem_god"]}（{B.TEN_GOD_MEANING[i["stem_god"]]}）'
         f'＋{i["branch"]}中の{bg}。今月＝{t["shichu_month"]}。{t["tenchusatsu"]}'),
        ("#a8762b", "#7e5a1e", f'中国式占い 辛亥（{i["pillar"]}日）ラッキー数字/方位🔢',
         '数字 4・9（金）・1・6（水）／方位 西（金）・北（水）／'
         '開運アイテム 水晶・シルバーアクセ・白い花'),
    ]
    block = [DAILY_START]
    for color, border, label, value in chips:
        block.append(
            '    <div class="color-chip">\n'
            f'      <div class="color-dot" style="background:{color};'
            f'border:1px solid {border};"></div>\n'
            f'      <div><div class="chip-label">{label}</div>'
            f'<div class="chip-value">{value}</div></div>\n'
            '    </div>')
    block.append(DAILY_END)
    return html.replace('  <div class="color-grid">',
                        '  <div class="color-grid">\n' + "\n".join(block), 1)


def drop_expired_chips(html: str, d: datetime.date) -> tuple[str, int]:
    """期限切れのチップを HTML から取り除く（表示側の非表示とは別に元を断つ）。"""
    def last_day(mo):
        return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1]

    def end_of(label):
        m = re.search(r'(\d{1,2})/(\d{1,2})\s*[-〜～]\s*(\d{1,2})/(\d{1,2})', label)
        if m:
            return (int(m.group(3)), int(m.group(4)))
        m = re.search(r'(\d{1,2})/(\d{1,2})\s*[-〜～]\s*(\d{1,2})(?!\s*/)', label)
        if m:
            return (int(m.group(1)), int(m.group(3)))
        m = re.search(r'(\d{1,2})月(?!\d)', label)
        if m:
            return (int(m.group(1)), last_day(int(m.group(1))))
        m = re.search(r'(?<![\d/])(\d{1,2})/(\d{1,2})(?![\d/-])', label)
        if m:
            return (int(m.group(1)), int(m.group(2)))
        return None

    removed = 0

    def repl(m):
        nonlocal removed
        chunk = m.group(0)
        lm = re.search(r'<div class="chip-label">(.*?)</div>', chunk, re.S)
        label = lm.group(1) if lm else ""
        e = end_of(label)
        if e and e < (d.month, d.day):
            removed += 1
            return ""
        return chunk

    html = re.sub(r'\n?    <div class="color-chip">\n.*?\n    </div>', repl, html, flags=re.S)
    return html, removed


def inject_enhancements(html: str, t: dict) -> str:
    """毎回消される鮮度バナー・絞り込みUIを入れ直す（既にあれば何もしない）。"""
    css = (ASSETS / "uranai-enhance.css").read_text(encoding="utf-8")
    controls = (ASSETS / "uranai-controls.html").read_text(encoding="utf-8")
    filter_js = (ASSETS / "uranai-filter.js").read_text(encoding="utf-8")
    live_js = (ASSETS / "uranai-live.js").read_text(encoding="utf-8")

    # meta（データ取得日）
    html = re.sub(r'\n<!-- データ取得日[^\n]*\n<meta name="data-date"[^>]*>', "", html)
    html = re.sub(
        r'(<meta name="viewport"[^>]*>)',
        '\\1\n<!-- データ取得日（repair_uranai.py が書き出す）。鮮度バナーがこの値を見る -->\n'
        f'<meta name="data-date" content="{t["iso"]}">', html, count=1)

    # title
    html = re.sub(r'<title>.*?</title>',
                  f'<title>占いダッシュボード {t["date_title"]}</title>', html, flags=re.S)

    # CSS
    if "stale-banner" not in html.split("</style>")[0]:
        html = html.replace("</style>", "\n" + css + "</style>", 1)

    # 赤帯の置き場所
    if 'id="stale-banner"' not in html:
        html = html.replace(
            "<body>",
            '<body>\n\n<!-- データ鮮度バナー：meta[name=data-date] と Asia/Tokyo の'
            '今日がズレたら強制表示 -->\n'
            '<div id="stale-banner" class="stale-banner" role="alert" '
            'aria-live="assertive"></div>', 1)

    # 絞り込みパネル（既存の並び替えバーがあれば置き換える）
    if 'data-filter="type"' not in html:
        old = re.search(r'  <div class="sort-controls">.*?</div>\n', html, re.S)
        if old:
            html = html[:old.start()] + controls + html[old.end():]
        else:
            html = re.sub(r'(  <div class="color-grid">)', controls + r'\1', html, count=1)

    # JS（末尾に足す）
    if "ページ自身が「見た日」を計算する" not in html:
        # 旧・並び替え／期限切れスクリプトは役目が重なるので取り除く
        html = re.sub(r'\(function\(\) \{\n  const TYPE_ORDER.*?\n\}\)\(\);', "",
                      html, flags=re.S)
        html = re.sub(r'// 期限切れチップを非表示にする\n\(function\(\) \{.*?\n\}\)\(\);', "",
                      html, flags=re.S)
        html = html.replace("\n</body>",
                            f"\n<script>\n{filter_js}\n{live_js}</script>\n\n</body>", 1)
    return html


def validate(html: str, t: dict, d: datetime.date) -> tuple[list[str], list[str]]:
    """(致命的, 警告) を返す。

    致命的 = 直しようがないので書き出しを中止する（構造が壊れている）。
    警告   = 古い文字列が残っているが、ページ側の uranai-live.js が
             閲覧時に計算し直すので致命的ではない。
    """
    fatal, soft = [], []
    body = re.sub(r'<(script|style)\b.*?</\1>', " ", html, flags=re.S)
    body = re.sub(r'<!--.*?-->', " ", body, flags=re.S)
    md = f"{d.month}/{d.day}"

    strays = set()
    for m in re.finditer(r'本日[^。<]{0,24}?(\d{1,2})/(\d{1,2})', body):
        if f"{int(m.group(1))}/{int(m.group(2))}" != md:
            strays.add(m.group(0))
    if strays:
        soft.append("対象日以外の日付が「本日」と併記されています: " + " / ".join(sorted(strays)))

    allowed = {t["info"]["pillar"], t["info"]["next_pillar"], "辛亥"}
    bad = {p for p in re.findall(r'([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])日', body)
           if p not in allowed}
    if bad:
        soft.append("対象日/翌日/命式以外の日干支が残っています: "
                    + " / ".join(sorted(bad)))

    plain = re.sub(r'<[^>]+>', '', body)
    m = re.search(r'データ取得日: ([^\n|]*)', plain)
    if not m or m.group(1).strip() != t["date_long"]:
        soft.append(f'フッターの日付が本日と違います: {m.group(1) if m else "なし"}')

    if f'content="{t["iso"]}"' not in html:
        fatal.append("meta data-date が本日になっていません")
    if 'data-filter="type"' not in html:
        fatal.append("絞り込みUIが入っていません")
    if 'id="stale-banner"' not in html:
        fatal.append("鮮度バナーが入っていません")
    if "uranai-live" not in html and "ページ自身が「見た日」を計算する" not in html:
        fatal.append("自己計算スクリプト（uranai-live.js）が入っていません")
    if html.count('data-uranai-live=') < 5:
        fatal.append("生きた値のタグが足りません（5個必要）")
    return fatal, soft


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="書き出さずに要修復かだけ見る")
    ap.add_argument("--date", help="YYYY-MM-DD（省略時は Asia/Tokyo の今日）")
    args = ap.parse_args()

    d = datetime.date.fromisoformat(args.date) if args.date else today_jst()
    original = HTML_PATH.read_text(encoding="utf-8")
    t = build_texts(d)

    def one_pass(src):
        h, dn, wn = rewrite_sections(src, t)
        h, rm = drop_expired_chips(h, d)
        h = refresh_daily_chips(h, t)
        h = inject_enhancements(h, t)
        return h, dn, wn, rm

    # 不動点まで回す。1回目の結果を2回目に通しても変わらないことを確かめてから
    # 書き出す。ここが安定しないまま書き出すと、次の実行でまた変化してしまい
    # 検証が永久に通らなくなる（2026-09-07 に「偏官（七殺）」のカッコ入れ子で
    # 実際に起きた。実行のたびに「）」が1つ増えていた）。
    html, done, warnings, removed = one_pass(original)
    for _ in range(3):
        again, _d, _w, _r = one_pass(html)
        if again == html:
            break
        html = again
    else:
        print("❌ 修復結果が安定しません（何度直しても変化し続ける）。"
              "書き出しを中止します。", file=sys.stderr)
        import difflib
        diff = list(difflib.unified_diff(html.split("\n"), again.split("\n"),
                                         lineterm="", n=0))[:12]
        for line in diff:
            print("   " + line[:160], file=sys.stderr)
        return 1

    fatal, soft = validate(html, t, d)
    if fatal:
        print("❌ 修復後の検証に失敗しました（書き出しを中止します）:", file=sys.stderr)
        for e in fatal:
            print("   - " + e, file=sys.stderr)
        return 1
    warnings += soft

    def show_warnings():
        for w in warnings:
            print("⚠ " + w, file=sys.stderr)
        if warnings:
            print("   → 直せなかった部分は、ページを開いたときに "
                  "uranai-live.js が計算し直します。", file=sys.stderr)

    if html == original:
        print(f"✅ 修復の必要はありません（{d.isoformat()} で整合しています）。")
        show_warnings()
        return 0

    if args.check:
        show_warnings()
        print(f"⚠ 修復が必要です（{d.isoformat()}）。差し替え: "
              + ", ".join(done) + f" / 期限切れチップ {removed} 件")
        return 1

    HTML_PATH.write_text(html, encoding="utf-8")
    show_warnings()
    print(f"🔧 {d.isoformat()} の内容に修復しました。")
    print("   差し替え: " + ", ".join(done))
    print(f"   期限切れチップ削除: {removed} 件")
    print(f"   日干支 {t['info']['pillar']}日（{t['info']['stem_god']}） / "
          f"六星 {t['rokusei_today_short']} / 月柱 {t['shichu_month']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
