#!/bin/sh
# 静止画の書き出し。作品を見るためと、サムネイルのために使う。
#
#   art/tools/capture.sh 出力.png 秒 [幅x高さ] [種]
#
# 同じ引数なら必ず同じ絵になる（基軸「種」）。
# 頁は http で配らないと ES モジュールが読めないので、無ければ自分で立てる。
set -e
OUT=${1:?出力ファイル名}
SEC=${2:-60}
SIZE=${3:-1920x1080}
SEED=${4:-0}
PORT=${PORT:-8899}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
CHROME=${CHROME:-/opt/pw-browsers/chromium-1194/chrome-linux/chrome}
W=${SIZE%x*}; H=${SIZE#*x}

if ! curl -s -o /dev/null "http://127.0.0.1:$PORT/art/index.html"; then
  (cd "$ROOT" && python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &)
  sleep 1.2
fi

URL="http://127.0.0.1:$PORT/art/index.html?t=$SEC&seed=$SEED&w=$W&h=$H"
mkdir -p "$(dirname "$OUT")"
"$CHROME" --headless=new --no-sandbox --disable-dev-shm-usage \
  --hide-scrollbars --force-device-scale-factor=1 \
  --window-size="$((W+40)),$((H+140))" --virtual-time-budget=900000 \
  --dump-dom "$URL" 2>/dev/null \
  | sed -n 's/.*<div id="png">data:image\/png;base64,\([^<]*\)<\/div>.*/\1/p' \
  | tr -d '\n' | base64 -d > "$OUT"
if [ ! -s "$OUT" ]; then echo "書き出しに失敗（頁が絵を返さなかった）" >&2; exit 1; fi
echo "$OUT  $(stat -c%s "$OUT") bytes"
