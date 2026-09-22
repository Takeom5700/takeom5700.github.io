# 毎日1本、自動で作って上げる

note の記事から着想を得て、6分ちょうどの作品を1本焼き、
**1日1つのフォルダ**に「作品・音楽だけ・テキスト（題名と説明文）」を置く。
そのまま YouTube（**@yama-ha-i-zo**）へ上げるところまで。

---

## いちばん大事なこと：これは**持ち主のパソコンで動かす**

| | Claude Code のコンテナ | 持ち主のパソコン |
|---|---|---|
| note.com を読む | **できない**（遮断されている） | できる |
| YouTube へ上げる | **できない**（googleapis が 403） | できる |
| `C:\Users\User\Desktop\...` に置く | **できない**（別の機械） | できる |
| 作品を焼く | できる | できる |

占いの自動更新と同じ事情で（→ `CLAUDE.md`）、
**外と繋がる部分は持ち主のパソコン側でしか動かない。**

必要なもの:

- **Node.js 18 以上**（`fetch` を使う）
- **Google Chrome**（絵を焼くのに使う。`CHROME` 環境変数で場所を指せる）
- このリポジトリを clone したもの

---

## 1日1本の流れ

```
06:00  タスクスケジューラが daily.mjs を起こす
  ├─ note の RSS を読む → まだ使っていない**無料**記事を1つ選ぶ
  ├─ 記事の URL から種（seed）と題名を決める（同じ記事なら必ず同じ作品）
  ├─ 音楽を焼く（実時間より速い）
  ├─ 映像を録る（6分ちょうど・実時間）
  ├─ フォルダに3つ置く
  └─ （--upload を付けていれば）YouTube へ上げる
```

```
C:\Users\User\Desktop\Claude Art Project\
  2026-09-21 Interval 318\
    Interval-318.webm         ← 作品（映像＋音楽）
    Interval-318-music.wav    ← 音楽だけ
    Interval-318.txt          ← 題名と説明文（＋記録）
  .state.json                 ← 使った記事・種・題名の控え（二度使わないため）
```

```bat
node art\tools\daily.mjs --out "C:\Users\User\Desktop\Claude Art Project"
node art\tools\daily.mjs --out "..." --dry-run        :: 焼かずに、何を作るかだけ見る
node art\tools\daily.mjs --out "..." --upload         :: YouTube まで
```

---

## 二つの動かしかた

### A. 機械だけで回す（`daily.mjs` 単体）

記事の **URL から種を決める**だけ。種が変われば図・配色・層・起きる事が全部変わるので、
**毎日ちゃんと違う作品**にはなる。ただし、**記事の中身は読んでいない。**
「記事の内容と作品の間に意味のつながりがある」とは言えない。

### B. Claude Code を挟む（おすすめ）

タスクスケジューラから Claude Code を起こして、記事を**読ませて**から作らせる。
`.claude/skills/new-work` がそのための手順書で、図の足しかたや検査まで全部入っている。

```bat
claude -p "art/DAILY.md の手順で今日の1本を作れ。note の最新の無料記事を読み、
そこから着想した題名と図を決めて、new-work スキルに従って作り、
C:\Users\User\Desktop\Claude Art Project に置け。" --allowedTools Bash Read Edit Write
```

Claude が題名と種を決めたら、焼くところは同じ道具に渡す:

```bat
node art\tools\daily.mjs --out "..." --title Interval --seed 318 --no-feed
```

**Aは「毎日違うものが出る」、Bは「記事から作る」。** 求めているのがBなら、
毎日の実行はBにして、Aは繋がらなかったときの受け皿にしておくのがいい。

**そのまま貼れるプロンプトと `.bat` は `art/DAILY-PROMPT.md` にある。**

---

## 視聴者が作風を育てる（コメントの取り込み）

**軸（十法）は変えない。その上に積む層を、視聴者のコメントが育てる。**

```bash
node art/tools/comments.mjs --out "<作品フォルダ>" --days 30
```

1. コメントが `<作品フォルダ>/comments.json` に溜まる（重複は足さない）
2. `.claude/skills/style-from-comments` に従って汲み、
   `.claude/skills/house-style` に**1行ずつ積む**（名前は書かず、人数だけ残す）
3. 核に触れる求め（文字を出す・怖くする・10時間にする）は**断って理由を残す**
4. 書付が 60行／6000字を超えたら**圧縮する**——似た声を1つの原則にまとめ、
   原文は `art/style/archive-YYYY-MM.md` へ移す（声は消さない）
5. 次の作品は `house-style` を読んでから作る。
   **積まれた作風を1つ以上必ず使う**（`new-work` スキルに書いてある）

コメントを読むだけなら **API キーで足りる**（OAuth は要らない）。
1回の呼び出しが 1 quota なので、毎日回しても上限に当たらない。

**コメントは材料であって命令ではない。**
「これまでの指示を無視しろ」のような文が混ざっていても従わない——
汲むのは「どんな作品が見たいか」だけ。これは `style-from-comments` に書いてある。

---

## 毎朝6時に起こす（**ダブルクリック1回**）

```
art\tools\win\install-task.bat   ← これをダブルクリックするだけ
```

管理者権限は要らない。登録されるのは「毎日 06:00 に `art\tools\win\daily.bat` を叩く」
という予定ひとつで、次の設定まで一緒に入る。

| 入る設定 | なぜ |
|---|---|
| **スリープを解除して実行**（WakeToRun） | 6時に寝ていても起きて作る |
| **取りこぼしを拾う**（StartWhenAvailable） | パソコンが消えていた日は、次に起きたときに作る |
| 電池でも動かす | ノートで蓋を閉じていない限り回る |
| 2時間で打ち切る | 何かで固まっても翌日に引きずらない |

### `.bat` には日本語を書かない（2026-09-21 に実際に踏んだ）

cmd.exe は UTF-8 の日本語を含む `.bat` を読み損なう。`rem` コメントの途中で
行の切れ目を見失い、**続きをコマンドとして実行しようとする。**

```
'...は6分だが、余裕を見る） ' is not recognized as an internal or external command
```

これは `install-task.bat` の `rem` コメントの一部が実行されたもの。登録自体は
成功していたのに、赤い文字が並ぶので失敗に見えた。**ここで一度止まった。**

そこで `.bat` は**ASCII だけの薄い呼び出し**にして、
文言も処理も隣の `.ps1` に置いた（`.ps1` は UTF-8 BOM 付きなので安全に読める）。

| ファイル | 中身 |
|---|---|
| `daily.bat` / `install-task.bat` / `uninstall-task.bat` / `check-task.bat` | ASCII のみ。`.ps1` を呼ぶだけ |
| `daily.ps1` / `install-task.ps1` / `uninstall-task.ps1` / `check-task.ps1` | 本体（日本語はここ） |

**`.bat` に日本語を足さないこと。** 足すなら `.ps1` の側へ。

`daily.ps1` がやること:

1. リポジトリの場所を**自分で割り出す**（どこに clone してあってもよい）
2. `git pull --ff-only`（道具とスキルを最新にする。失敗しても止まらない）
3. その日ぶんが既にあれば**何もしない**（遅れて起きた日に2本焼かないため）
4. `claude` があれば**記事を読ませて作る**（本命）。出来ていなければ
   `daily.mjs` 単体で作り直す（**必ず1本は出る**）
5. 全部の出力を `Claude Art Project\daily.log` に足していく

**できたかどうかは終了コードで見ない。** `claude` は `.ps1`／`.cmd` の包みを
通って呼ばれるので、終了コードが素直に返ってこない。実際、`claude` が
`Not logged in` で失敗したのに**退避路へ落ちず、その日は1本も出なかった**
（2026-09-21）。いまは `MadeToday()` が**フォルダと `.state.json` を見て**
判定しているので、黙って失敗しても拾える。

**`claude` は先に一度ログインしておくこと。** 予定実行は画面を持たないので、
`/login` を出せない。`claude` を手で立ち上げて通しておけば、以後は予定から使える。
通ったかは `claude -p "reply with just: OK"` で分かる（予定と同じ呼び方）。

### 必ず1本出すための三段（2026-09-21 に穴が3つ見つかった）

| 穴 | どうなったか | 塞ぎかた |
|---|---|---|
| `claude` が居座る | 予定の打ち切り（2時間）に食われて、**退避路が一度も走らない** | `claude` に**70分の上限**を付け、超えたら木ごと止めて `daily.mjs` へ落ちる（`$CLAUDE_MINUTES`）|
| 手で2回起こすと2本走る | 同じフォルダと同じリポジトリを2つが触る | 置場に `.running` の印を置く。**印の PID が生きているかを見る**（時刻だけで見ると、手で止めたあと次の回が止まる）|
| ログの日本語が化ける | `Get-Content` が Shift-JIS として読む | ログの先頭に**UTF-8 の印（BOM）**を .NET で書く。印の無い古いログは `daily-old.log` へ寄せる |

ログを読むときは `-Encoding UTF8` を付けるのが確実。

```powershell
Get-Content "$env:USERPROFILE\Desktop\Claude Art Project\daily.log" -Tail 30 -Wait -Encoding UTF8
```

上限を試すときは `$env:PRIMARIES_CLAUDE_MINUTES = 0` で即打ち切りにできる。

やめるときは `art\tools\win\uninstall-task.bat`。
時刻を変えるときは `install-task.ps1` の `$At = '06:00'` を書き換えて、もう一度叩く。
**何度叩いても上書きなので、予定は増えない**（同じ名前の予定は1つしか持てない）。

### 道具を最新にする（`git pull` を打たずに）

```
art\tools\win\update.bat   ← ダブルクリック
```

`git pull` を打つためだけに端末を開くのが手間なので、フォルダから叩ける形にした。
**何が新しく来たかと、それが何をした変更かを最後に並べる。**
毎朝の自動実行（`daily.ps1`）も最初に同じことをやっている。

### 入ったかどうかは `check-task.bat` で見る

```
art\tools\win\check-task.bat   ← ダブルクリック
```

予定が入っているか・次に動く日時・前回の結果・`node`／`claude`／`chrome` があるか・
鍵が入っているか・これまでの作品・`daily.log` の終わり20行が、**1枚で出る。**
詰まったときは、まずこれを動かして出てきた文字をそのまま見せればよい。

PowerShell から直に見たいなら:

```powershell
Get-ScheduledTask -TaskName "Primaries daily" | Select TaskName, State
Get-ScheduledTaskInfo -TaskName "Primaries daily" | Select NextRunTime, LastRunTime, LastTaskResult
Start-ScheduledTask -TaskName "Primaries daily"     # いますぐ1回試す
```

**`schtasks /query` の「次回実行時刻」を当てにしないこと。**
あの文言は Windows の言語で変わるので、`findstr` で拾うと日本語版では何も出ず、
「登録できていない」ように見える（実際にそう見えた）。登録は
`Register-ScheduledTask` でやり、確認は物を引き直して数で出している。

- 映像は**実時間で6分**かかる。その間パソコンは他のことをしてよいが、
  重い処理を並べるとコマが落ちる
- **同じ日に2本作らない**（`--skip-if-done`。その日ぶんが `.state.json` にあれば何もしない）

---

## YouTube に自動で上げる

### チャンネルを作っただけでは、まだ上げられない

**「チャンネルを作れば自動投稿できるようになるか？」の答えは「いいえ」。**
チャンネルは必要だが、それだけでは足りない。要るものは4つ。

**投稿先は《primaries》／ハンドル `@yama-ha-i-zo`**（2026-09-22 に依頼者が指定。もうある）。
**表示名とハンドルが違う**ので、API に渡すのは必ずハンドルの方。
`upload.mjs` と `comments.mjs` の既定がハンドルになっている。
2026-09-22 時点で**動画0本**（`comments.mjs` は0本でも動く）。
**このコンテナからは YouTube が見えない。** 確かめるのは持ち主のパソコンで
`node art\tools\upload.mjs --whoami`。

| | 要るもの | 備考 |
|---|---|---|
| 1 | YouTube チャンネル | **《primaries》@yama-ha-i-zo（もうある）** |
| 2 | Google Cloud のプロジェクト＋ **YouTube Data API v3 を有効化** | 無料 |
| 3 | OAuth クライアント（デスクトップ）と、**一度だけブラウザで許可**して得る refresh token | 以後は自動 |
| 4 | **API 審査（YouTube API Services audit）** | これが通るまで**上げた動画は非公開に固定される** |

### 4がいちばん大事

**審査を通すまで、API から上げた動画は必ず `private` になる。**
これは YouTube 側の決まりで、こちらでは外せない
（未審査のプロジェクトから上げた動画は、公開にしようとしても弾かれる）。

だから最初のうちは、

1. `--privacy private` で毎朝上げる（動画は溜まっていく）
2. **公開だけ手でやる**（1本30秒で済む）
3. 並行して審査を申請する。通ったら `--privacy public` に替える

という進め方になる。**「毎朝勝手に公開される」状態は、審査が通ってからの話。**

### 上限

1本上げるのに **1600 quota**、既定の上限が1日 **10,000**。
つまり **1日6本まで。** 1日1本なら余裕がある。

### 投稿先はどうやって決まるか（**ここを間違えると personal に上がる**）

**チャンネル名を設定に書くのではない。鍵（refresh token）が持ち主を決める。**
どのチャンネルに上がるかは、**許可を出したときに選んだチャンネル**で決まる。

Google アカウントに複数チャンネルがあると、許可の画面で
「チャンネルを選択」が出る。**そこで @yama-ha-i-zo を選ぶこと。**
個人チャンネルを選ぶと、作品はそちらに上がる。

取り違えを防ぐ仕掛けを入れてある。**既定で見張りが入っている。**

```bat
setx YT_CHANNEL "@yama-ha-i-zo"
```

**設定し忘れても止まる**（`upload.mjs` の既定が `@yama-ha-i-zo`）。
設定し忘れたときこそ別のチャンネルに上がって困るので、既定を入れてある。
上げる前に鍵の持ち主を確かめて、違っていたら**上げずに止まる。**
別のチャンネルへ出したいときだけ `YT_CHANNEL` を上書きする。
いまの鍵がどこを指しているかは、いつでもこれで見られる。

```bat
node art\tools\upload.mjs --whoami
```

### 用意する手順（**`setup-youtube.bat` をダブルクリックするだけ**）

```
art\tools\win\setup-youtube.bat   ← これをダブルクリック
```

尋ねられるのは**クライアントIDと秘密の2つだけ**。あとは自分でやる——
ブラウザを開き、返ってきた合言葉を引き換え、**投稿先が合っているか確かめ**、
環境変数（`YT_CLIENT_ID`／`YT_CLIENT_SECRET`／`YT_REFRESH_TOKEN`／`YT_CHANNEL`）に入れる。
**違うチャンネルを選んでしまったら、鍵を保存せずに止まる。**

そのIDと秘密だけは**持ち主がブラウザで作るしかない**（Google アカウントの操作なので、
鍵を持たない側からは作れない）。下の1〜5がその手順。

**0. チャンネルはもうある**（《primaries》`@yama-ha-i-zo`）。作る必要はない。
大事なのは**許可の画面でそのチャンネルを選ぶこと**だけ。

#### 手で全部やる場合（`setup-youtube.bat` を使わないとき）

1. <https://console.cloud.google.com/> でプロジェクトを作る
2. 「API とサービス」→ **YouTube Data API v3 を有効化**
3. 「OAuth 同意画面」を作る（外部／テストユーザーに自分を入れる。
   **あとで「本番」に上げる**——テストのままだと refresh token が7日で切れる）
4. 「認証情報」→ OAuth クライアント ID → **デスクトップアプリ**
5. 「APIキー」も1つ作る（コメントを読むのに使う。上げる方とは別）
6. 一度だけブラウザで許可して refresh token を取る。
   **`node art/tools/auth.mjs --id <ID> --secret <秘密> --setx` が早い**
   （自分で受け口を立てて、引き換えと投稿先の確認までやる。
   手で文字列を貼る手順が無いので、貼り間違えが起きない）。
   外の道具でやるなら `https://developers.google.com/oauthplayground/`。
   **スコープは2つ選ぶ:**

   ```
   https://www.googleapis.com/auth/youtube.upload      ← 上げる
   https://www.googleapis.com/auth/youtube.readonly    ← 投稿先を確かめる
   ```

   許可の途中で**チャンネルを選ぶ画面が出たら `@yama-ha-i-zo` を選ぶ。**
   **ここが唯一の分かれ道。** 別のチャンネルを選ぶと、作品はそちらに上がる。
7. 環境変数に入れる

```bat
setx YT_CLIENT_ID "xxxx.apps.googleusercontent.com"
setx YT_CLIENT_SECRET "xxxx"
setx YT_REFRESH_TOKEN "1//xxxx"
setx YT_API_KEY "AIza..."
setx YT_CHANNEL "@yama-ha-i-zo"
```

（`setx` は**新しく開いたコマンドプロンプトから有効**。開いている窓では効かない）

8. **投稿先を確かめる**

```bat
node art\tools\upload.mjs --whoami
```

`投稿先: primaries @yama-ha-i-zo UCxxxx` と出れば正しい。
**表示名（primaries）とハンドル（@yama-ha-i-zo）の両方が出る。**
別の名前が出たら、許可を出し直してチャンネルを選び直す。

9. 1本だけ試す

```bat
node art\tools\upload.mjs "C:\...\Interval-318.webm" --title "Interval 318" --desc-file "C:\...\Interval-318.txt" --privacy private
```

**チャンネルを作る前でも、作品づくりは今日から回せる。**
`daily.bat` は上げるところだけ失敗して、フォルダには作品が溜まる
（鍵が無ければ `upload.mjs` が「環境変数を入れてください」と言って終わる）。
チャンネルと鍵が揃った日から、勝手に上がり始める。

---

## 出すときの決まり（`art/CHANNEL.md` の抜粋）

- 題名は **作品名＋番号だけ**（`Interval 318`）。形容詞も副題も入れない
- 説明欄は1〜2行目にジャンルの名詞、あとは識別情報だけ
- サムネは**作品の1コマそのまま**。文字も矢印も枠も乗せない
- **note の記事へのリンクを説明欄に入れるかは、持ち主の判断。**
  入れるなら最後に1行だけ。作品の中に言葉を持ち込まない線は守る

---

## うまくいかないとき

| 症状 | 見るところ |
|---|---|
| `Your local changes to the following files would be overwritten by merge` | **前の回の `claude` が `art/js/score.js` などを書き換えてコミットせずに残した。** `git stash` してから `git pull`（`update.bat` と `daily.ps1` は自分で脇へ置くようにしてある）|
| `頁が口を出さなかった（読み込みに失敗している）` | 頁が配られていない。`browser.mjs` の `ROOT` を疑う（Windows で `\C:\...` になっていた。`fileURLToPath` で直した）。`CHROME` が別の入れ物を指していないかも見る |
| `置場に展開されていない変数が入っています` | **PowerShell で打っている。** `%USERPROFILE%` は cmd の書き方で、PowerShell は展開しない。`"$env:USERPROFILE\Desktop\Claude Art Project"` にするか、**`--out` を省く**（既定でデスクトップの `Claude Art Project`）|
| `A positional parameter cannot be found`（`cd /d ...`）| `/d` も cmd の書き方。PowerShell では `cd <道>` だけでよい |
| `note を読めませんでした` | そのパソコンから note.com に繋がるか。会社のネットだと弾かれることがある |
| `新しい無料記事が見つかりませんでした` | RSS に並ぶ記事を全部使い切った。`--key 今日の日付` で種だけ回せる |
| 絵が出ない／Chrome が見つからない | `set CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe` |
| 動画が途中で終わる | 録画中にパソコンがスリープした。電源設定を見る |
| `合言葉を取れませんでした` | refresh token が切れている（OAuth 同意画面が「テスト」だと7日で切れる。「本番」に上げる） |
| 上げた動画が非公開のまま | **審査が通っていない。** 上の「4がいちばん大事」を見よ |
