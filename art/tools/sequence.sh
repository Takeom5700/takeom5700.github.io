#!/bin/sh
# 連番の書き出し。記録（動画ファイル）が必要なときだけ使う。
#
#   art/tools/sequence.sh 出力ディレクトリ 開始秒 終了秒 [fps] [幅x高さ] [蓄積枚数] [歩数] [種]
#
# 作品はその場で計算するものとして作ってあるので、これは記録の道具。
# 1枚ずつ独立に焼く（同じ時刻からは必ず同じ絵になる＝基軸「五・種」）ので、
# 並べればそのまま映像になる。
#
# 注意: GPU の無い環境では1枚あたり十数秒かかる。
# 8分半（504秒）を24fpsで通すと12,096枚で、現実的ではない。
# GPU のある機械で回すこと。
set -e
DIR=${1:?出力ディレクトリ}
FROM=${2:-0}
TO=${3:-10}
FPS=${4:-24}
SIZE=${5:-1280x720}
FRAMES=${6:-24}
STEPS=${7:-176}
SEED=${8:-0}
HERE=$(cd "$(dirname "$0")" && pwd)

mkdir -p "$DIR"
N=$(awk -v a="$FROM" -v b="$TO" -v f="$FPS" 'BEGIN{printf "%d", (b-a)*f}')
echo "$N 枚を書き出す（$FROM〜$TO 秒 / $FPS fps / $SIZE）"
i=0
while [ "$i" -lt "$N" ]; do
  T=$(awk -v a="$FROM" -v i="$i" -v f="$FPS" 'BEGIN{printf "%.4f", a + i/f}')
  OUT=$(printf "%s/%06d.png" "$DIR" "$i")
  [ -s "$OUT" ] || "$HERE/capture.sh" "$OUT" "$T" "$SIZE" "$FRAMES" "$STEPS" "$SEED" >/dev/null
  i=$((i+1))
  printf "\r  %d / %d" "$i" "$N"
done
echo ""
cat <<MSG
書き出した。まとめるには:

  ffmpeg -framerate $FPS -i $DIR/%06d.png -c:v libx264 -crf 16 \\
         -pix_fmt yuv420p -movflags +faststart out.mp4

音は入らない（その場で合成しているため）。必要なら画面収録を使うこと。
MSG
