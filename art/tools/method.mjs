// 音楽の**作法**を検査する。`variety.mjs` が「毎回違うか」を見るのに対して、
// こちらは「3つの作法が**本当に別の作りになっているか**」を見る。
//
//   node art/tools/method.mjs [種の数]
//
// 依頼者「コードや和音機能から音楽を作る手法ももちろん用いても良いが、
//        スケールや音階から音楽を考える手法やそれの応用でもある
//        対位法による音楽作りのアプローチもできるようにはしておいて」
//
// **名前を付け替えただけでは意味が無い。** だから作りの違いそのものを測る。
//   和音 … 三和音が鳴り、低音が歩く
//   音階 … **三度を積まない**・低音が歩かない（持続低音）
//   対位 … **2本の旋律が同時に鳴っている時間**が長い

import { composeWork } from '../js/score.js';
import { composeMusic, makeCounter, MODES, degOf, CONS, PERF } from '../js/music.js';
import { makeRng } from '../js/rng.js';

const N = parseInt(process.argv[2] || '120', 10);
let fail = 0;

// ---- 対位法の法（2本目の線そのものを見る）-----------------------------
{
  let n = 0, dissOnStrong = 0, parallel = 0, stepShare = 0, contrary = 0, moves = 0, wide = 0;
  for (let s = 0; s < 400; s++) {
    const rng = makeRng(s * 7919 + 13);
    const sc = MODES[s % MODES.length].sc;
    // 主題を作る（隣へ動くのを主に、たまに跳ぶ）
    const subj = [];
    let d = 0;
    for (let i = 0; i < 8; i++) {
      subj.push({ deg: d, beats: 1 });
      d += (rng() < 0.55 ? 1 : -1) * (rng() < 0.2 ? 2 : 1);
      d = Math.max(-2, Math.min(7, d));
    }
    subj[subj.length - 1].deg = 0;
    const cnt = makeCounter(rng, subj, sc);
    let prevIv = null;
    for (let i = 0; i < cnt.length; i++) {
      const iv = Math.abs(degOf(sc, subj[i].deg) - degOf(sc, cnt[i].deg));
      n++;
      if (i % 2 === 0 && !CONS.has(iv)) dissOnStrong++;
      if (Math.abs(cnt[i].deg) > 6) wide++;
      if (i > 0) {
        const sm = Math.sign(subj[i].deg - subj[i - 1].deg);
        const cm = Math.sign(cnt[i].deg - cnt[i - 1].deg);
        if (sm && cm) { moves++; if (sm !== cm) contrary++; }
        if (Math.abs(cnt[i].deg - cnt[i - 1].deg) === 1) stepShare++;
        if (prevIv !== null && PERF.has(iv) && iv === prevIv && sm === cm && sm) parallel++;
      }
      prevIv = iv;
    }
  }
  console.log('対位法の法（400本の2本目・3200音）');
  const row = (k, v, ok) => console.log(`  ${k.padEnd(24, '　')} ${v}  ${ok ? '○' : '×'}`);
  row('強い位置の不協和', `${dissOnStrong} 音（0 でなければならない）`, dissOnStrong === 0);
  row('平行5度・平行8度', `${parallel} 箇所（0 でなければならない）`, parallel === 0);
  row('音域の外', `${wide} 音（0 でなければならない）`, wide === 0);
  row('反対の動き', `${(contrary / Math.max(1, moves) * 100) | 0}%（50% 以上）`, contrary / Math.max(1, moves) >= 0.5);
  row('順次進行', `${(stepShare / Math.max(1, n) * 100) | 0}%（40% 以上）`, stepShare / Math.max(1, n) >= 0.4);
  if (dissOnStrong || parallel || wide) fail++;
  if (contrary / Math.max(1, moves) < 0.5 || stepShare / Math.max(1, n) < 0.4) fail++;
}

// ---- 3つの作法が別の作りになっているか --------------------------------
const stat = {};
for (let s = 0; s < N; s++) {
  const w = composeWork(s);
  const m = composeMusic(w);
  const st = stat[m.method] || (stat[m.method] = { n: 0, third: 0, pad: 0, bass: 0, bars: 0, duo: 0, span: 0 });
  st.n++;
  // 持続（声部 3／6）の同時に鳴る音から、三度が積まれているかを見る
  const byT = new Map();
  for (const x of m.notes) {
    if (x.voice !== 3 && x.voice !== 6) continue;
    const k = x.t.toFixed(2);
    if (!byT.has(k)) byT.set(k, []);
    byT.get(k).push(x.midi);
  }
  for (const v of byT.values()) {
    st.pad++;
    let has = 0;
    for (let i = 0; i < v.length; i++) {
      for (let j = i + 1; j < v.length; j++) {
        const iv = Math.abs(v[i] - v[j]) % 12;
        if (iv === 3 || iv === 4) has = 1;
      }
    }
    st.third += has;
  }
  // **低音が歩いているか＝音の高さが動くか**で見ること。
  // 打ち出しの数で見ていたら、持続低音を `bassPat` の場所で打ち直すように
  // した時点で同じ数になり、検査が落ちた（数えていたのは歩きではなく刻み）。
  // **低音が歩いているか＝出てくる音の高さが何種類あるか**で見ること。
  // 打ち出しの数で見ていたら、持続低音を打ち直すようにした時点で同じ数に
  // なった（数えていたのは歩きではなく刻み）。隣り同士の変化で見ても、
  // 同時に鳴る5度下が「動いた」に見えて 46% と出た。**種類で数える。**
  st.bass += new Set(m.notes.filter((x) => x.voice === 2 || x.voice === 7)
    .map((x) => x.midi)).size;
  st.bars++;
  // 音の量（作法で音の大きさが変わってしまっていないか）
  for (const x of m.notes) st.span += 0;
  st.loud = (st.loud || 0) + m.notes.reduce((a, x) => a + x.v * x.v * Math.min(x.d, 4), 0) / w.total;
  // 旋律の声部（0／6／8）が2本同時に鳴っている時間
  const mel = m.notes.filter((x) => x.voice === 0 || x.voice === 8 || x.voice === 6)
    .map((x) => [x.t, x.t + x.d, x.voice]).sort((a, b) => a[0] - b[0]);
  let duo = 0, sum = 0;
  for (let i = 0; i < mel.length; i++) {
    sum += mel[i][1] - mel[i][0];
    for (let j = i + 1; j < mel.length && mel[j][0] < mel[i][1]; j++) {
      if (mel[j][2] !== mel[i][2]) duo += Math.min(mel[i][1], mel[j][1]) - mel[j][0];
    }
  }
  st.duo += duo / Math.max(1, w.total);
  st.span += sum / Math.max(1, w.total);
}
console.log('');
console.log(`3つの作法の作り（種 0〜${N - 1}）`);
console.log('  作法   本数  三度を積んだ持続  低音の音の種類  2本同時に鳴る/尺');
const got = {};
for (const k of ['和音', '音階', '対位']) {
  const st = stat[k];
  if (!st) { console.log(`  ${k}   0 本  ——`); continue; }
  got[k] = {
    third: st.third / Math.max(1, st.pad),
    bass: st.bass / Math.max(1, st.bars),
    duo: st.duo / st.n,
  };
  console.log(`  ${k}  ${String(st.n).padStart(4)} 本`
    + `  ${(got[k].third * 100).toFixed(0).padStart(13)}%`
    + `  ${got[k].bass.toFixed(1).padStart(13)}`
    + `  ${(got[k].duo * 100).toFixed(0).padStart(14)}%`);
}
console.log('');
const need = (cond, msg) => { console.log(`  ${cond ? '○' : '×'} ${msg}`); if (!cond) fail++; };
if (got['音階'] && got['和音']) {
  need(got['音階'].third < 0.05, '音階の作法は三度を積まない（5% 未満）');
  need(got['和音'].third > 0.5, '和音の作法は三度を積む（50% 超）');
  need(got['音階'].bass < got['和音'].bass * 0.35, '音階の作法の低音は歩かない（音の種類が、和音の 0.35 倍未満）');
}
if (got['対位'] && got['和音']) {
  need(got['対位'].duo > got['和音'].duo * 1.6, '対位は2本の旋律が同時に鳴っている（和音の 1.6 倍超）');
}
// **作法で音の大きさが変わらないこと。** 対位の伴奏を 0.45 まで下げたら、
// 対位の作品だけ音の量が他の半分になった（実測 0.45 対 0.97／秒）。
// **作法の違いは作りの違いであって、音量の違いではない。**
{
  const ls = ['和音', '音階', '対位'].filter((k) => stat[k]).map((k) => stat[k].loud / stat[k].n);
  const lo = Math.min(...ls), hi = Math.max(...ls);
  console.log(`  音の量／秒: ${ls.map((x) => x.toFixed(2)).join(' / ')}`);
  need(lo >= hi * 0.55, '作法で音の大きさが変わらない（いちばん小さい作法が、いちばん大きい作法の 0.55 倍以上）');
}
console.log('');
if (fail) { console.error(`作法の法に届いていない項目が ${fail} 件ある`); process.exit(1); }
console.log('3つの作法は、それぞれ別の作りになっている。');
