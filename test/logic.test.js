// node test/logic.test.js ― ルールエンジンのテスト（依存なし）
const L = require('../logic.js');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + ' → ' + JSON.stringify(a) + ' (期待 ' + JSON.stringify(b) + ')'); }
function codes(r) { return r.errors.map(e => e.code); }
const P = (w, r, type) => ({ w, r: r || [L.toKata(w)], alts: [], type: type || 'kanji' });

console.log('■ 5文字チェック');
const fire = P('消防士', ['ショウボウシ']);
eq(codes(L.checkClue(fire, '火事', 'ショウ')), ['tBan'], '小さい字も1文字：ショウ(シ・ョ・ウ)はNG');
eq(codes(L.checkClue(fire, '火事', 'ボウシ')), ['tBan'], '読みの連続3文字 ボウシ はNG');
eq(codes(L.checkClue(fire, '鎮火', 'ホース')), [], '「ー」も1文字：ホースは3文字でOK');
eq(codes(L.checkClue(fire, '消火', 'ホース')), ['kBan'], 'お題の漢字「消」はNG');
eq(codes(L.checkClue(fire, '火災', 'ホース')), [], '別の漢字ならOK');
eq(codes(L.checkClue(fire, '火事', 'ショ')), ['tLen'], 'カタカナ2文字はNG');
eq(codes(L.checkClue(fire, '火事', 'ホースー')), ['tLen'], 'カタカナ4文字はNG');
eq(codes(L.checkClue(fire, '火', 'ホース')), ['kLen'], '漢字1文字はNG');
eq(codes(L.checkClue(fire, '火あ', 'ホース')), ['kType'], 'ひらがなは漢字ではない');
eq(codes(L.checkClue(fire, '々火', 'ホース')), ['kType'], '「々」は先頭不可');
eq(codes(L.checkClue(fire, '人々', 'ホース')), [], '「々」は2文字目ならOK');
eq(codes(L.checkClue(fire, '火事', 'ほーす')), [], 'ひらがなはカタカナに自動変換');
eq(L.checkClue(fire, '火事', 'ほーす').t, 'ホース', '変換結果');
eq(codes(L.checkClue(fire, '火事', 'ﾎｰｽ')), [], '半角カタカナも全角に');
eq(codes(L.checkClue(fire, '火事', 'ho-')), ['tType', 'tType', 'tType'], '英字はカタカナではない');
eq(codes(L.checkClue(fire, ' 火事 ', ' ホース ')), [], '空白は無視');
// 濁点：ちがう文字あつかい（完全一致だけ自動NG、にているものは注意）
const r1 = L.checkClue(fire, '火事', 'ショフ');
eq(codes(r1), [], 'ショフ はOK');
const r2 = L.checkClue(fire, '火事', 'ホウシ');
eq(codes(r2), [], '濁点ちがい ホウシ（ボウシ）は自動NGにしない');
eq(r2.warns.map(w => w.code), ['tNear'], '…けれど「にている」注意を出す');
const r3 = L.checkClue(fire, '火事', 'シヨウ');
eq(r3.warns.map(w => w.code), ['tNear'], '小さい字ちがい シヨウ は注意');
eq(L.checkClue(fire, '火事', 'ーアア').warns.map(w => w.code), ['tHead'], '「ー」始まりは注意');
eq(L.checkClue(fire, '火事', 'ッアア').warns.map(w => w.code), ['tHead'], '小さい字始まりは注意');
const kata = P('サンドバッグ', null, 'kata');
eq(codes(L.checkClue(kata, '練習', 'バッグ')), ['tBan'], 'カタカナお題：バッグ（バ・ッ・グ）はNG');
eq(codes(L.checkClue(kata, '練習', 'バック')), [], 'バック（濁点ちがい）は自動NGにしない');
eq(L.checkClue(kata, '練習', 'バック').warns.length, 1, '…注意は出る');
eq(codes(L.checkClue(P('ケーキ', null, 'kata'), '誕生', 'ケーキ')), ['tBan'], '「ー」込みの3連続 ケーキ はNG');
eq(codes(L.checkClue(P('ケーキ', null, 'kata'), '誕生', 'ーキセ')), [], 'ーキ だけならOK（3連続ではない）');
// 複数の読み
const momiji = L.ALL.find(p => p.w === '紅葉');
ok(momiji && momiji.r.length === 2, '紅葉は読みが2つ');
eq(codes(L.checkClue(momiji, '秋季', 'モミジ')), ['tBan'], 'どちらの読みでもNG（モミジ）');
eq(codes(L.checkClue(momiji, '秋季', 'コウヨ')), ['tBan'], 'どちらの読みでもNG（コウヨ）');

console.log('■ 正解判定');
const panda = L.ALL.find(p => p.w === 'パンダ');
ok(L.isCorrect(panda, 'パンダ') && L.isCorrect(panda, 'ぱんだ') && L.isCorrect(panda, ' ﾊﾟﾝﾀﾞ '), 'カタカナ/ひらがな/半角');
ok(!L.isCorrect(panda, 'クマ'), 'ちがう答え');
ok(L.isCorrect(momiji, 'もみじ') && L.isCorrect(momiji, 'こうよう') && L.isCorrect(momiji, '紅葉'), '漢字お題は読みでもOK');

console.log('■ ふーさん🐻の5文字（全お題・全部ルールどおりか）');
let n = 0, bad = 0, few = 0;
for (const p of L.BY.kata.concat(L.BY.kanji)) {
  if (p.clues.length < 2) few++;
  for (const c of p.clues) { n++; const r = L.checkClue(p, c.k, c.t); if (!r.ok || r.warns.length) { bad++; console.log('  ✗', p.w, c.k + c.t, r.errors.concat(r.warns).map(e => e.msg).join(' / ')); } }
}
ok(bad === 0, 'ふーさんの5文字はすべて合格');
ok(few === 0, 'どのお題にも2つ以上の5文字');
const nk = L.BY.kata.length, nj = L.BY.kanji.length;
console.log('  お題 カタカナ' + nk + '・漢字' + nj + '・合計' + (nk + nj) + '／ふーさんの5文字 ' + n + '個');
ok(nk + nj >= 300, 'お題300以上');
ok(new Set(L.ALL.map(p => p.w)).size === L.ALL.length, 'お題の重複なし');
// 書く人ふーさんどうしは同じ5文字を使わない
{
  const S = L.newGame(4, { start: 0 }, L.rngFrom(3)); L.chooseType(S, 'kanji'); L.roll(S, L.rngFrom(5));
  S.cpuPick = {}; const got = [];
  for (const w of S.writers) { const c = L.cpuClue(S, w, 'fast', L.rngFrom(w)); if (c) { S.cpuPick[w] = c.k + c.t; got.push(c.k + c.t); } }
  ok(new Set(got).size === got.length, 'ふーさんどうしで5文字がかぶらない');
}

console.log('■ 得点');
eq([0, 1, 2, 3, 4].map(L.oyaPoints), [30, 20, 10, 10, 10], '親：1枚目30・2枚目20・3枚目以降10');
eq([L.writerPoints(false, false), L.writerPoints(true, false), L.writerPoints(false, true), L.writerPoints(true, true)], [10, 20, 20, 30], '書いた人：10＋熟語10＋カタカナ言葉10');
eq(L.bonusDefault('百獣', 'キング'), { j: true, k: true }, 'ボーナス目安');
eq(L.ranking([30, 50, 30, 10]).map(x => x.rank), [1, 2, 2, 4], '同点は同順位');

console.log('■ 進行');
function play(n, start) {
  const S = L.newGame(n, { start }, L.rngFrom(7));
  return S;
}
{
  const S = play(4, 1);
  eq([S.rounds, S.oya, S.roller], [4, 1, 2], 'ラウンド数＝人数・サイコロは親の次の席');
  eq(S.writers, [2, 3, 0], '書く人＝親以外');
  eq(S.tiles.length, 3, '番号タイルは書く人数ぶん');
  ok(L.roll(S) != null, '種類を選ぶ前はふれない');
  eq(L.chooseType(S, 'kata'), null, '親がカタカナを選ぶ'); eq(S.card.length, 6, 'カード＝6つのお題');
  eq(L.roll(S, () => 0.5), null, 'サイコロ'); eq(S.die, 4, '出目4'); eq(S.prompt, S.card[3], '出目のお題');
  L.beginWrite(S);
  const p = L.ALL[S.prompt], c = p.clues;
  ok(L.submitClue(S, 1, c[0].k, c[0].t, 1) != null, '親は書けない');
  ok(L.submitClue(S, 2, '火', 'アア', 1) != null, 'ルール違反は出せない');
  eq(L.submitClue(S, 2, c[0].k, c[0].t, 2), null, '席2が番号2');
  ok(L.submitClue(S, 3, c[1].k, c[1].t, 2) != null, '取られた番号は取れない');
  eq(L.submitClue(S, 3, c[1].k, c[1].t, 1), null, '席3が番号1');
  ok(!L.allSubmitted(S), 'まだ全員ではない');
  L.endWrite(S); // 席0は時間切れ
  eq(S.order, [3, 2], '番号順（書けなかった人は発表なし）');
  ok(L.revealNext(S), '1枚目をめくる');
  eq(L.guess(S, 'ぜったいちがう'), null, '1枚目まちがい'); eq(S.ans.ok, false, '×');
  ok(L.guess(S, 'x') != null, '1枚につき1回');
  L.afterJudge(S); eq(S.ri, 2, '2枚目へ');
  eq(L.guess(S, p.w), null, '2枚目正解');
  eq(S.phase, 'result', '結果へ'); eq(S.solved.oyaPts, 20, '親は2枚目なので20点');
  const exp = L.writerPoints(S.solved.bj, S.solved.bk);
  eq(S.scores[1], 20, '親の得点'); eq(S.scores[2], exp, '書いた人の得点'); eq(S.scores[3], 0, '外れの人は0'); eq(S.scores[0], 0, '書けなかった人は0');
  L.setBonus(S, 'j', !S.solved.bj); eq(S.scores[2], exp + (S.solved.bj ? 10 : -10), 'ボーナスを手で切りかえ');
  L.nextTurn(S); eq([S.turn, S.oya, S.phase], [1, 2, 'choose'], '次の親は時計回り');
}
{
  const S = play(3, 0); L.chooseType(S, 'kanji'); L.roll(S); L.beginWrite(S);
  const p = L.ALL[S.prompt];
  L.submitClue(S, 1, p.clues[0].k, p.clues[0].t, 1); L.submitClue(S, 2, p.clues[1].k, p.clues[1].t, 2);
  ok(L.allSubmitted(S), '全員出した'); L.endWrite(S); L.revealNext(S);
  L.guess(S, '', true); L.afterJudge(S); L.guess(S, 'はずれ'); L.afterJudge(S);
  eq(S.phase, 'result', '全部はずれで終了'); eq(S.scores, [0, 0, 0], 'だれも得点なし'); eq(S.hist[0].solved, false, '記録');
}
{
  const S = play(3, 0); L.chooseType(S, 'kanji'); L.roll(S); L.beginWrite(S);
  const p = L.ALL[S.prompt];
  L.submitClue(S, 1, p.clues[0].k, p.clues[0].t, 1); L.endWrite(S); L.revealNext(S);
  L.guess(S, 'にたこたえ'); eq(L.override(S), null, '「正解にする」'); eq(S.scores[0], 30, '親30'); ok(S.solved.manual, '手動正解の記録');
}
{
  const S = play(3, 0); L.chooseType(S, 'kata'); L.roll(S); L.beginWrite(S);
  const p = L.ALL[S.prompt], pr = S.prompt;
  L.submitClue(S, 1, p.clues[0].k, p.clues[0].t, 1); L.endWrite(S); L.revealNext(S);
  eq(L.foul(S, 0, 2), null, '反則（お手つき）'); eq(S.phase, 'foul', 'foul');
  L.redo(S); eq([S.phase, S.turn, S.oya], ['choose', 0, 0], '同じ親で お題を決め直し'); eq(S.lastFoul.prompt, pr, '前のお題を記録');
  eq(S.scores, [0, 0, 0], '反則のお題は得点なし');
}
{
  const S = play(3, 0); L.chooseType(S, 'kata'); L.roll(S); L.beginWrite(S); L.endWrite(S);
  eq(S.phase, 'result', 'だれも書けなければすぐ結果');
}
{ // 全ラウンド
  const S = play(5, 2); let t = 0;
  while (S.phase !== 'over' && t++ < 50) {
    L.chooseType(S, t % 2 ? 'kata' : 'kanji'); L.roll(S); L.beginWrite(S);
    const p = L.ALL[S.prompt]; S.writers.forEach((w, i) => { const c = p.clues[i % p.clues.length]; L.submitClue(S, w, c.k, c.t, i + 1); });
    L.endWrite(S); L.revealNext(S); L.guess(S, p.w); L.nextTurn(S);
  }
  eq([S.phase, S.turn, S.hist.length], ['over', 5, 5], '5人なら5ラウンドで終了');
  eq(S.hist.map(h => h.oya), [2, 3, 4, 0, 1], '全員が1回ずつ親');
  eq(S.tiles.length <= 5, true, 'タイルは最大5');
}

console.log('■ ふーさん🐻が当てる（見えている5文字だけ）');
{
  const rng = L.rngFrom(11); const res = {};
  for (const lv of ['slow', 'normal', 'fast']) {
    let first = 0, any = 0, tot = 0;
    for (const p of L.BY.kata.concat(L.BY.kanji)) {
      tot++; const seen = [], ex = []; let got = -1;
      const cl = L.shuffle(p.clues.slice(), rng).slice(0, 3);
      for (let i = 0; i < cl.length; i++) { seen.push(cl[i]); const g = L.cpuGuess(p.type, seen, ex, lv, 99 + tot, rng); if (L.isCorrect(p, g.text)) { got = i; break; } ex.push(g.text); }
      if (got === 0) first++; if (got >= 0) any++;
    }
    res[lv] = [first / tot, any / tot];
    console.log('  ' + lv + '：1枚目で正解 ' + Math.round(first / tot * 100) + '%・3枚までに ' + Math.round(any / tot * 100) + '%');
  }
  ok(res.slow[0] < res.normal[0] && res.normal[0] < res.fast[0], '強さの順（ゆっくり＜ふつう＜はやい）');
  ok(res.fast[0] < 0.95, 'はやい でも まちがえることがある');
  ok(res.slow[0] > 0.2, 'ゆっくり でも それなりに当たる');
  // 候補はルールでしぼる：5文字に入っている漢字を含むお題は候補にしない
  const list = L.rankCandidates('kanji', [{ k: '火事', t: 'ホース' }], [], null);
  ok(!list.some(x => x.p.w.indexOf('火') >= 0 || x.p.w.indexOf('事') >= 0), 'ありえない候補（5文字の漢字を含むお題）はのぞく');
  ok(L.lexFor('kata').items.some(it => it.p.decoy), 'おとり候補も入っている');
  // 当てる側は模範解答を知らない（連想ことばだけ）
  const it = L.lexFor('kata').items.find(x => x.p.w === 'パンダ');
  ok(!it.kw.includes('ベアー'), '書く側の5文字は辞書に入れていない');
}

console.log('\n' + (fail ? '✗ ' + fail + ' 件失敗 / ' : '✓ ') + pass + ' 件OK');
process.exit(fail ? 1 : 0);
