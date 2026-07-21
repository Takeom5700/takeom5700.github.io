import os
import re
import sys
import datetime
from google import genai
from google.genai import types

jst = datetime.timezone(datetime.timedelta(hours=9))
today = datetime.datetime.now(jst)
date_str = today.strftime('%Y%m%d')
year = today.year
month = today.month
day = today.day
weekdays = ['月', '火', '水', '木', '金', '土', '日']
weekday = weekdays[today.weekday()]

output_path = f'ai-shinbun/newspaper_{date_str}.html'

if os.path.exists(output_path):
    print(f'{output_path} already exists, skipping.')
    sys.exit(0)

api_key = os.environ.get('GEMINI_API_KEY')
if not api_key:
    print('GEMINI_API_KEY is not set.')
    sys.exit(1)

client = genai.Client(api_key=api_key)

template_path = os.path.join(os.path.dirname(__file__), 'newspaper_template.html')
with open(template_path, 'r', encoding='utf-8') as f:
    template = f.read()

template = template.replace('{{YEAR}}', str(year)).replace('{{MONTH}}', str(month)).replace('{{DAY}}', str(day))

prompt = f"""{year}年{month}月{day}日付のAI新聞HTMLを生成してください。

まずGoogle検索で以下を調べて最新AIニュースを収集してください：
- "AI news {year} {month}/{day}"
- "人工知能 最新ニュース {year}年{month}月"
- "Claude GPT Gemini LLM news {year}"

収集したニュースをもとに、以下の仕様で完全なAI新聞HTMLを生成してください。

## 文字数制限（厳守・超過すると表示が切れる）
- 主記事（上段右・最重要）: 400文字以内
- 第2記事: 260文字以内
- 第3記事: 200文字以内
- 第4記事: 140文字以内
- 短信6本: 各83文字以内
- 下段3本: 各400文字以内

## 色アクセント（絶対厳守：適用範囲を誤ると紙面が壊れる）
- <span style="color:...">タグは foreignObject内の<div>/<p>本文（HTML）でのみ使用可能
- <text>要素・<tspan>要素（SVGの見出し・肩見出し・短信見出しなど、writing-mode="tb-rl"の縦書き部分すべて）の中では<span>タグは絶対に使用禁止。SVGの<text>はHTMLではないため<span>を解釈できず、ブラウザがSVG全体のパースに失敗し紙面全体が崩壊する
- 見出し・肩見出しは常にプレーンテキストのみとする（色を付けたい場合はfill属性を<text>タグ自体に指定するか、何もしない）
- 本文（foreignObject内）でのみ：数値・統計・日付は<span style="color:#b0001e;font-weight:700;">数値</span>、固有名詞・組織名は<span style="color:#0d3461;font-weight:700;">名前</span>

## 絶対守るルール
- 実際に収集したニュースで記事を書く（架空ニュース禁止）
- <!DOCTYPE html>から</html>まで完全なHTMLを出力する
- 下記テンプレートの構造・スタイル・SVGレイアウトはそのまま使い、【】内のプレースホルダーだけを実際の内容に置き換える
- テンプレートの<text>タグ内のプレースホルダーは装飾なしのプレーンテキストに置き換える（<span>を追加しない）

## テンプレート
{template}

上記テンプレートの【】をすべて実際の内容に置き換えた完全なHTMLのみを出力してください。説明文は不要です。"""

print(f"Generating newspaper for {date_str} using Gemini with Google Search...")

candidate_models = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash']

response = None
last_error = None
for model_name in candidate_models:
    try:
        print(f"Trying model: {model_name}")
        response = client.models.generate_content(
            model=model_name,
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
                max_output_tokens=16000,
            )
        )
        print(f"Success with model: {model_name}")
        break
    except Exception as e:
        last_error = e
        print(f"Model {model_name} failed: {e}")
        continue

if response is None:
    raise RuntimeError(f"All candidate models failed. Last error: {last_error}")

html_content = response.text

match = re.search(r'<!DOCTYPE html>.*?</html>', html_content, re.DOTALL | re.IGNORECASE)
if match:
    html_content = match.group(0)

def strip_span_from_svg_text(html):
    """<span> is invalid inside SVG <text>/<tspan> and breaks the whole page's
    SVG parsing. The model sometimes adds it anyway despite prompt instructions,
    so strip it as a safety net on any line containing <text that isn't inside
    a foreignObject (HTML) block."""
    fixed_lines = []
    for line in html.split('\n'):
        stripped = line.lstrip()
        if stripped.startswith('<text') and 'foreignObject' not in line:
            line = re.sub(r'</?span[^>]*>', '', line)
        fixed_lines.append(line)
    return '\n'.join(fixed_lines)

html_content = strip_span_from_svg_text(html_content)

os.makedirs('ai-shinbun', exist_ok=True)
with open(output_path, 'w', encoding='utf-8') as f:
    f.write(html_content)
print(f"Saved: {output_path} ({len(html_content)} chars)")

index_path = 'ai-shinbun/index.html'
with open(index_path, 'r', encoding='utf-8') as f:
    index_html = f.read()

if f'newspaper_{date_str}.html' in index_html:
    print(f"Card for {date_str} already in index.html, skipping.")
else:
    new_card = (
        f'      <a class="newspaper-card" href="newspaper_{date_str}.html" style="animation-delay:0.05s">\n'
        f'        <div class="card-date-num">{month}月{day}日</div>\n'
        f'        <div class="card-date-str">{year}年{month}月{day}日（{weekday}）</div>\n'
        f'        <div class="card-label">朝刊 <span class="card-arrow">→</span></div>\n'
        f'      </a>\n\n'
        f'      '
    )
    index_html = index_html.replace(
        '      <a class="newspaper-card" href="newspaper_',
        new_card + '      <a class="newspaper-card" href="newspaper_',
        1
    )
    with open(index_path, 'w', encoding='utf-8') as f:
        f.write(index_html)
    print(f"Updated: {index_path}")
