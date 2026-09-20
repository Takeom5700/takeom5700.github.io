---
name: publish
description: 焼き上がった作品を Primaries（YouTube）へ出す。映像・音楽・Suno用音源・サムネの書き出しと、題名・説明欄・タグの書式。公開の直前に使う。
---

# Primaries へ出す

チャンネルは **Primaries**（原色）。作品名は1本ごとに変わる。
取り決めの本体は `art/CHANNEL.md`。ここは手順だけ。

## 1. 焼く

```bash
# 映像＋音楽（実時間・6分かかる）
node art/tools/record.mjs out/<題名>-NNN-映像と音楽.webm --seed N \
  --size 854x480 --bitrate 200000 --audio-bitrate 96000

# 本番の画質で出すなら（1440p 以上。原色の面は低ビットレートで輪郭が崩れる）
node art/tools/record.mjs out/<題名>-NNN.webm --seed N --size 2560x1440 --bitrate 24000000

# 音楽だけ（48kHz ステレオ全長）
node art/tools/record.mjs out/<題名>-NNN-音楽.wav --seed N --music

# Suno に持っていく用（60秒＋style prompt。長い欄は 1000 文字に収まる）
node art/tools/suno.mjs N --short --dir out
```

`--rate 32000 --mono` を足すと器だけ小さくなる（**音の作りは変わらない**。
渡せる大きさに収めるときだけ使う）。

## 2. サムネ

**文字・矢印・顔・赤丸・枠を乗せない。** 作品の1コマをそのまま使う。

```bash
art/tools/capture.sh out/<題名>-NNN-thumb.png <秒> 2560x1440 N
```

選ぶのは**いちばん対比の強い1コマ**（原色の面が大きく、図がはっきり出ているところ）。
`node art/tools/measure.mjs N` の「対比」の行が高い時刻を目安にする。

## 3. 出す

| 欄 | 書きかた |
|---|---|
| 題名 | `Passage 004`（**作品名＋番号だけ**）|
| 説明欄 | 1〜2行目にジャンルの名詞、そのあと識別情報だけ（下の雛形）|
| タグ | 各言語で入れてよい（画面に出ないので唯一の例外）|
| サムネ | 作品の1コマそのまま |
| 部の名 | 出すなら `I II III IV V`。**日本語の文字を出さない** |

```
Generative film. One seed, one world, six minutes.
Made entirely from code — no footage, no images, no stock. Music from the same seed.

Passage 004
I II III IV V
6:00  seed 4
```

```
generative art, algorithmic art, abstract animation, experimental animation,
visual music, procedural art, creative coding, motion art
```

## やらないこと（全部、やった方が数字は伸びる。承知で捨てる）

- ❌ サムネに文字・矢印・顔・赤丸・枠
- ❌ 題名に形容詞（`Relaxing` `Beautiful` `Cinematic` `4K` `作業用` `睡眠用`）
- ❌ 副題（日本語も英語も）
- ❌ 冒頭の挨拶・チャンネル紹介・登録依頼
- ❌ 用途を売る（「10時間」「勉強用BGM」）
- ❌ Shorts のために切り刻む（「間」が壊れ、「枠」が壊れる）
- ❌ コメント欄で意味を説明する

**`generative` `film` `code` はジャンルの名詞なので入れてよい。**
`Relaxing` `Beautiful` は主張なので入れない。この区別だけが線。
