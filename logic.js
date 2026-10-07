/* ごもじでピタリ ― ルールエンジン（ブラウザ / Node 共通・DOMに依存しない）
 * 文字チェック（漢字2＋カタカナ3）・お題データ・得点・ラウンド進行・ふーさん🐻（書く人／当てる人）の思考
 */
(function (root) {
  'use strict';
  var G0 = typeof globalThis !== 'undefined' ? globalThis : root;
  if (!G0.GP_DATA && typeof require === 'function') ['./words-kata1.js', './words-kata2.js', './words-kanji1.js', './words-kanji2.js', './words-extra.js'].forEach(function (f) { require(f); });
  var D = G0.GP_DATA || {};

  // ---------- 文字の種類 ----------
  var SMALL = 'ァィゥェォッャュョヮヵヶ', BIG = 'アイウエオツヤユヨワカケ';
  function toKata(s) { return String(s).replace(/[\u3041-\u3096]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); }); }
  function toHira(s) { return String(s).replace(/[\u30a1-\u30f6]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); }); }
  function nfkc(s) { s = String(s == null ? '' : s); try { s = s.normalize('NFKC'); } catch (e) {} return s; }
  function isKanji(c) { return /^[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3005\u3007]$/.test(c); }
  function isKata(c) { return /^[\u30a1-\u30fa\u30fc]$/.test(c); }
  function chars(s) { return Array.from(String(s)); }
  // 濁点・半濁点をとって、小さい字を大きくする（「にている」判定用）
  function loose(s) {
    var t = String(s); try { t = t.normalize('NFD').replace(/[\u3099\u309a]/g, '').normalize('NFC'); } catch (e) {}
    return chars(t).map(function (c) { var i = SMALL.indexOf(c); return i >= 0 ? BIG[i] : c; }).join('');
  }
  function grams(s, n) { var a = chars(s), out = []; for (var i = 0; i + n <= a.length; i++) out.push(a.slice(i, i + n).join('')); return out; }
  // 答え合わせ用の正規化（ひらがな/カタカナ・全角/半角・長音・記号のちがいを無視）
  function norm(s) { return toHira(nfkc(s).toLowerCase()).replace(/[\s\u3000ー〜～\-_‐−・･.,、。!！?？'"「」『』()（）［］\[\]…~]/g, ''); }

  // ---------- お題データ ----------
  // 1行＝「お題|よみ（カタカナ。複数は/区切り。カタカナのお題は空でOK）|正解として受けつける別名（,区切り）|ふーさん🐻の5文字（,区切り。/j＝漢字が二字熟語ではない）|連想ことば（空白区切り）」
  var ALL = [], BY = { kata: [], kanji: [] }, DECOY = { kata: [], kanji: [] };
  function parse(line, type, decoy) {
    var a = String(line).split('|'), w = a[0].trim();
    var r = (a[1] || '').trim() ? a[1].split('/').map(function (x) { return toKata(x.trim()); }).filter(Boolean) : [toKata(w)];
    var p = { id: ALL.length, type: type, w: w, r: r, alts: (a[2] || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean),
      clues: (a[3] || '').split(',').map(function (x) { x = x.trim(); if (!x) return null; var m = x.split('/'); var s = chars(m[0]); return { k: s.slice(0, 2).join(''), t: s.slice(2).join(''), bj: !/j/.test(m[1] || '') }; }).filter(Boolean),
      kw: (a[4] || '').split(/\s+/).filter(Boolean), decoy: !!decoy };
    ALL.push(p); (decoy ? DECOY : BY)[type].push(p);
    return p;
  }
  (D.kata || []).forEach(function (l) { parse(l, 'kata'); });
  (D.kanji || []).forEach(function (l) { parse(l, 'kanji'); });
  (D.decoyKata || []).forEach(function (l) { parse(l, 'kata', true); });
  (D.decoyKanji || []).forEach(function (l) { parse(l, 'kanji', true); });
  // ボーナス判定の目安（二字熟語／カタカナ言葉）。最後はみんな（ホスト）が決める
  var JUKUGO = {}, LOAN = {};
  (D.jukugo || []).forEach(function (w) { JUKUGO[w] = 1; });
  (D.loan || []).forEach(function (w) { LOAN[w] = 1; });
  ALL.forEach(function (p) {
    p.clues.forEach(function (c) { if (c.bj) JUKUGO[c.k] = 1; });
    p.kw.forEach(function (w) { var k = toKata(w); if (/^[\u4e00-\u9fff]{2}$/.test(w)) JUKUGO[w] = 1; if (/^[\u30a1-\u30fa\u30fc]{3}$/.test(w) && w === k) LOAN[w] = 1; });
    if (p.type === 'kata' && chars(p.w).length === 3) LOAN[p.w] = 1;
  });
  function bonusDefault(k, t) { return { j: !!JUKUGO[k], k: !!LOAN[t] }; }

  // ---------- 5文字チェック ----------
  function cleanParts(k, t) {
    k = nfkc(k).replace(/\s/g, ''); t = toKata(nfkc(t).replace(/\s/g, ''));
    return { k: k, t: t };
  }
  // 戻り値：{ ok, k, t, errors:[{code,msg}], warns:[{code,msg}] }
  function checkClue(p, k0, t0) {
    var c = cleanParts(k0, t0), k = c.k, t = c.t, E = [], W = [], ka = chars(k), ta = chars(t);
    function err(code, msg) { E.push({ code: code, msg: msg }); }
    if (ka.length !== 2) err('kLen', '漢字は ちょうど2文字（いま' + ka.length + '文字）');
    ka.forEach(function (ch, i) {
      if (!isKanji(ch)) err('kType', '「' + ch + '」は漢字ではありません');
      else if (ch === '々' && i === 0) err('kType', '「々」は先頭に置けません');
    });
    if (ta.length !== 3) err('tLen', 'カタカナは ちょうど3文字（いま' + ta.length + '文字）');
    ta.forEach(function (ch) { if (!isKata(ch)) err('tType', '「' + ch + '」はカタカナではありません'); });
    if (p) {
      var ban = {};
      chars(p.w).forEach(function (ch) { if (isKanji(ch) && ch !== '々') ban[ch] = 1; });
      ka.forEach(function (ch, i) { var real = ch === '々' && i > 0 ? ka[i - 1] : ch; if (ban[real]) err('kBan', '「' + ch + '」はお題「' + p.w + '」の漢字なので使えません'); });
      if (ta.length === 3) {
        var hit = null, near = null;
        p.r.forEach(function (r) {
          if (grams(r, 3).indexOf(t) >= 0) hit = hit || r;
          else if (grams(loose(r), 3).indexOf(loose(t)) >= 0) near = near || r;
        });
        if (hit) err('tBan', '「' + t + '」はお題の読み「' + hit + '」の 連続3文字なので使えません');
        else if (near) W.push({ code: 'tNear', msg: '「' + t + '」はお題の読み「' + near + '」に にています（反則かどうかは みんなで判断）' });
      }
    }
    if (ta.length && (ta[0] === 'ー' || SMALL.indexOf(ta[0]) >= 0)) W.push({ code: 'tHead', msg: '「ー」や小さい字から始まっています' });
    return { ok: !E.length, k: k, t: t, errors: E, warns: W };
  }
  function isCorrect(p, ans) {
    var a = norm(ans); if (!a) return false;
    return [p.w].concat(p.r, p.alts).some(function (x) { return norm(x) === a; });
  }

  // ---------- 乱数 ----------
  function rngFrom(seed) { var a = (seed >>> 0) || 1; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function shuffle(a, rng) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
  function hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }

  // ---------- 得点 ----------
  var OYA_PTS = [30, 20, 10];
  function oyaPoints(i) { return OYA_PTS[Math.min(i, 2)]; }
  function writerPoints(bj, bk) { return 10 + (bj ? 10 : 0) + (bk ? 10 : 0); }

  // ---------- ゲーム進行 ----------
  // ラウンド＝人数ぶん（全員が1回ずつ親）。親は席順（時計回り）で交代。サイコロは親の左どなり（次の席）がふる
  function newGame(n, opts, rng) {
    rng = rng || Math.random; opts = opts || {};
    var S = { n: n, rounds: n, turn: 0, start: opts.start != null ? opts.start : Math.floor(rng() * n), scores: [], phase: 'choose', pk: 1, evId: 0, ev: [], hist: [],
      decks: { kata: shuffle(BY.kata.map(function (p) { return p.id; }), rng), kanji: shuffle(BY.kanji.map(function (p) { return p.id; }), rng) }, seed: Math.floor(rng() * 1e9) };
    for (var i = 0; i < n; i++) S.scores.push(0);
    resetTurn(S);
    return S;
  }
  function ev(S, kind, o) { o = o || {}; o.id = ++S.evId; o.kind = kind; S.ev.push(o); if (S.ev.length > 30) S.ev.shift(); return o; }
  function bump(S) { S.pk++; }
  function oyaOf(S) { return (S.start + S.turn) % S.n; }
  function writersOf(S) { var o = oyaOf(S), w = []; for (var i = 1; i < S.n; i++) w.push((o + i) % S.n); return w; }
  function resetTurn(S) {
    S.oya = oyaOf(S); S.roller = (S.oya + 1) % S.n; S.writers = writersOf(S);
    S.phase = 'choose'; S.type = null; S.card = null; S.die = null; S.prompt = null;
    S.clues = {}; S.tiles = []; for (var i = 0; i < Math.min(5, S.writers.length); i++) S.tiles.push(-1);
    S.order = []; S.ri = 0; S.guesses = []; S.ans = null; S.solved = null; S.foul = null; bump(S);
  }
  function chooseType(S, type) {
    if (S.phase !== 'choose' || (type !== 'kata' && type !== 'kanji')) return 'いまは選べません';
    S.type = type; var dk = S.decks[type];
    if (dk.length < 6) S.decks[type] = dk = dk.concat(shuffle(BY[type].map(function (p) { return p.id; }), Math.random));
    S.card = dk.splice(0, 6); S.phase = 'roll'; bump(S); ev(S, 'type', { type: type });
    return null;
  }
  function roll(S, rng) {
    if (S.phase !== 'roll') return 'いまは ふれません';
    S.die = 1 + Math.floor((rng || Math.random)() * 6); S.prompt = S.card[S.die - 1]; S.phase = 'ready'; bump(S); ev(S, 'roll', { die: S.die });
    return null;
  }
  function beginWrite(S) { if (S.phase !== 'ready') return; S.phase = 'write'; bump(S); ev(S, 'write'); }
  function submitClue(S, seat, k, t, tile) {
    if (S.phase !== 'write') return '書く時間は おわりました';
    if (S.writers.indexOf(seat) < 0) return '親は書けません';
    if (S.clues[seat]) return 'もう出しています';
    tile = +tile; if (!(tile >= 1 && tile <= S.tiles.length)) return '番号を選んでね';
    if (S.tiles[tile - 1] >= 0) return 'その番号は もう取られました';
    var c = checkClue(ALL[S.prompt], k, t); if (!c.ok) return c.errors[0].msg;
    S.clues[seat] = { k: c.k, t: c.t, tile: tile, warn: c.warns.length ? c.warns[0].msg : '' };
    S.tiles[tile - 1] = seat; ev(S, 'tile', { p: seat, tile: tile });
    return null;
  }
  function allSubmitted(S) { return S.writers.every(function (w) { return !!S.clues[w]; }) || S.tiles.every(function (x) { return x >= 0; }); }
  // 書く時間おわり → 番号の小さい順にならべる（書けなかった人は発表なし）
  function endWrite(S) {
    if (S.phase !== 'write') return;
    S.order = S.tiles.filter(function (x) { return x >= 0; });
    S.ri = 0; S.phase = 'answer'; S.ans = null; bump(S); ev(S, 'timeup', { cnt: S.order.length });
    if (!S.order.length) finishTurn(S, null);
  }
  function revealNext(S) {
    if (S.phase !== 'answer' || S.solved || S.ri >= S.order.length) return false;
    S.ri++; S.ans = { st: 'think', i: S.ri - 1 }; bump(S); ev(S, 'reveal', { i: S.ri - 1, p: S.order[S.ri - 1] });
    return true;
  }
  // 親のこたえ（今めくった1枚につき1回）。pass=true なら「パス」
  function guess(S, text, pass) {
    if (S.phase !== 'answer' || !S.ans || S.ans.st !== 'think') return 'いまは こたえられません';
    var i = S.ans.i, ok = !pass && isCorrect(ALL[S.prompt], text);
    var g = { i: i, text: pass ? '' : String(text).slice(0, 24), ok: ok, pass: !!pass };
    S.guesses.push(g); S.ans = { st: 'judged', i: i, ok: ok }; bump(S); ev(S, 'guess', { i: i, ok: ok, pass: !!pass, text: g.text });
    if (ok) solve(S, i, false);
    return null;
  }
  // 自動判定でまちがいでも、意味が合っていれば「正解あつかい」にできる
  function override(S) {
    if (S.phase !== 'answer' || !S.ans || S.ans.st !== 'judged' || S.ans.ok) return 'いまは変えられません';
    var g = S.guesses[S.guesses.length - 1]; if (!g || g.pass) return 'パスは正解にできません';
    g.ok = true; g.manual = true; S.ans.ok = true; ev(S, 'override', { i: S.ans.i }); solve(S, S.ans.i, true);
    return null;
  }
  function solve(S, i, manual) {
    var p = S.order[i], c = S.clues[p], b = bonusDefault(c.k, c.t);
    S.solved = { i: i, p: p, oyaPts: oyaPoints(i), bj: b.j, bk: b.k, manual: !!manual };
    S.scores[S.oya] += S.solved.oyaPts; S.scores[p] += writerPoints(b.j, b.k);
    finishTurn(S, S.solved);
  }
  // 次のこたえへ（まちがい・パスのあと）。もう無ければ ラウンド終了（だれも得点なし）
  function afterJudge(S) {
    if (S.phase !== 'answer' || !S.ans || S.ans.st !== 'judged' || S.ans.ok) return;
    if (S.ri >= S.order.length) finishTurn(S, null); else revealNext(S);
  }
  function setBonus(S, which, val) {
    if (S.phase !== 'result' || !S.solved) return 'いまは変えられません';
    var key = which === 'j' ? 'bj' : which === 'k' ? 'bk' : null; if (!key) return null;
    val = !!val; if (S.solved[key] === val) return null;
    S.solved[key] = val; S.scores[S.solved.p] += val ? 10 : -10;
    var h = S.hist[S.hist.length - 1]; if (h) { h.bj = S.solved.bj; h.bk = S.solved.bk; h.wp = writerPoints(S.solved.bj, S.solved.bk); }
    bump(S); return null;
  }
  function finishTurn(S, sol) {
    S.phase = 'result'; S.ans = S.ans || null; bump(S);
    var c = sol ? S.clues[sol.p] : null;
    S.hist.push({ turn: S.turn, oya: S.oya, prompt: S.prompt, type: S.type, solved: !!sol, i: sol ? sol.i : -1, p: sol ? sol.p : -1, clue: c ? c.k + c.t : '',
      op: sol ? sol.oyaPts : 0, wp: sol ? writerPoints(sol.bj, sol.bk) : 0, bj: sol ? sol.bj : false, bk: sol ? sol.bk : false });
    ev(S, 'result', { ok: !!sol });
  }
  // 反則（お手つき）：そのお題は終わり。同じ親で お題を決めるところから やり直し
  function foul(S, i, by) {
    if (S.phase !== 'answer' || S.solved || !(i >= 0 && i < S.ri)) return 'いまは反則にできません';
    S.foul = { i: i, p: S.order[i], by: by }; S.phase = 'foul'; bump(S); ev(S, 'foul', { i: i, p: S.order[i] });
    return null;
  }
  function redo(S) { if (S.phase !== 'foul') return; var f = S.foul, pr = S.prompt; resetTurn(S); S.lastFoul = { prompt: pr, i: f.i, p: f.p }; ev(S, 'redo'); }
  function nextTurn(S) {
    if (S.phase !== 'result') return;
    S.turn++; S.lastFoul = null;
    if (S.turn >= S.rounds) { S.phase = 'over'; bump(S); ev(S, 'over'); return; }
    resetTurn(S); ev(S, 'turn');
  }
  // 順位（同点は同じ順位）
  function ranking(scores) {
    var idx = scores.map(function (s, i) { return i; }).sort(function (a, b) { return scores[b] - scores[a] || a - b; });
    return idx.map(function (p) { var r = 1; scores.forEach(function (s) { if (s > scores[p]) r++; }); return { p: p, rank: r, score: scores[p] }; });
  }

  // ---------- ふーさん🐻：書く人 ----------
  var LV = {
    slow: { write: [24, 52], fail: 0.12, best: 0.25, conf: 0.35, think: [5, 8], keep: 0.55, noise: 1.25 },
    normal: { write: [12, 38], fail: 0.04, best: 0.4, conf: 0.55, think: [3, 5.5], keep: 0.72, noise: 0.75 },
    fast: { write: [6, 20], fail: 0, best: 0.6, conf: 0.75, think: [1.8, 3.2], keep: 0.86, noise: 0.42 }
  };
  // 使う5文字を選ぶ（ほかのふーさんと同じものは避ける）。null＝思いつかなかった
  function cpuClue(S, seat, lv, rng) {
    rng = rng || Math.random; var L = LV[lv] || LV.normal, p = ALL[S.prompt];
    var used = {}; Object.keys(S.clues).forEach(function (k) { used[S.clues[k].k + S.clues[k].t] = 1; });
    if (S.cpuPick) Object.keys(S.cpuPick).forEach(function (k) { if (+k !== seat) used[S.cpuPick[k]] = 1; });
    var cand = p.clues.map(function (c, i) { return { c: c, i: i }; }).filter(function (x) { return !used[x.c.k + x.c.t]; });
    if (!cand.length || rng() < L.fail) return null;
    var pick = rng() < L.best ? cand[0] : cand[Math.floor(rng() * cand.length)];
    return { k: pick.c.k, t: pick.c.t, idx: pick.i };
  }
  function cpuWriteMs(lv, rng) { var w = (LV[lv] || LV.normal).write; return (w[0] + (rng || Math.random)() * (w[1] - w[0])) * 1000; }
  // 番号タイル：自信があれば小さい番号、なければ少しあとの番号
  function cpuTile(S, lv, idx, rng) {
    rng = rng || Math.random; var L = LV[lv] || LV.normal, free = [];
    S.tiles.forEach(function (x, i) { if (x < 0) free.push(i + 1); });
    if (!free.length) return null;
    var conf = L.conf - (idx || 0) * 0.15;
    return rng() < conf || free.length === 1 ? free[0] : free[1];
  }

  // ---------- ふーさん🐻：当てる人（見えている5文字だけを使う） ----------
  // 候補＝お題の種類（カタカナ／漢字）の全お題＋まぎらわしい「おとり」。連想ことばとの重なりで点数をつける
  var LEX = {};
  function kanjiRuns(s) { return String(s).match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3005]+/g) || []; }
  function kataRuns(s) { return toKata(String(s)).match(/[\u30a1-\u30fa\u30fc]{2,}/g) || []; }
  function lexFor(type) {
    if (LEX[type]) return LEX[type];
    var cands = BY[type].concat(DECOY[type]), df = { c: {}, p: {}, k: {} };
    var items = cands.map(function (p) {
      var ch = {}, pr = {}, kw = {};
      var src = p.kw; // 当てる側は「連想ことば」だけを使う（書く側の模範解答は見ない）
      src.forEach(function (w) { kanjiRuns(w).forEach(function (run) { chars(run).forEach(function (c) { if (c !== '々') ch[c] = 1; }); grams(run, 2).forEach(function (g) { pr[g] = 1; }); }); });
      p.kw.forEach(function (w) { kataRuns(w).forEach(function (k) { kw[k] = 1; }); });
      var it = { p: p, ch: ch, pr: pr, kw: Object.keys(kw), ban: {}, grams: {} };
      chars(p.w).forEach(function (c) { if (isKanji(c)) it.ban[c] = 1; });
      p.r.forEach(function (r) { grams(r, 3).forEach(function (g) { it.grams[g] = 1; }); });
      Object.keys(ch).forEach(function (x) { df.c[x] = (df.c[x] || 0) + 1; });
      Object.keys(pr).forEach(function (x) { df.p[x] = (df.p[x] || 0) + 1; });
      it.kw.forEach(function (x) { df.k[x] = (df.k[x] || 0) + 1; });
      return it;
    });
    var N = items.length;
    function idf(tab, x) { return Math.log((N + 1) / ((tab[x] || 0) + 0.5)); }
    LEX[type] = { items: items, idf: idf, df: df, N: N };
    return LEX[type];
  }
  function share2(a, b) { var g = grams(loose(a), 2); var h = grams(loose(b), 2); return g.some(function (x) { return h.indexOf(x) >= 0; }); }
  // mind：{ seed, keep } ＝ そのふーさんが知っている連想の割合（ゲームごとに少しずつちがう）
  function clueScore(lex, it, clue, mind) {
    function know(tok) { return !mind || hash(mind.seed + ':' + it.p.id + ':' + tok) < mind.keep; }
    var s = 0, ka = chars(clue.k), t = clue.t;
    ka.forEach(function (c) { if (it.ch[c] && know('c' + c)) s += lex.idf(lex.df.c, c); });
    if (it.pr[clue.k] && know('p' + clue.k)) s += 1.2 * lex.idf(lex.df.p, clue.k);
    var best = 0;
    it.kw.forEach(function (w) {
      if (!know('k' + w)) return;
      var f = lex.idf(lex.df.k, w), v = 0;
      if (w === t) v = 2.0 * f; else if (w.indexOf(t) >= 0 || (w.length >= 2 && t.indexOf(w) >= 0)) v = 1.4 * f; else if (share2(w, t)) v = 0.3 * f;
      if (v > best) best = v;
    });
    return s + best;
  }
  // ルール上ありえない候補（5文字にその候補の漢字や読みの連続3文字が入っている）はのぞく
  function impossible(it, clue) { return chars(clue.k).some(function (c) { return it.ban[c]; }) || !!it.grams[clue.t]; }
  function rankCandidates(type, clues, exclude, mind) {
    var lex = lexFor(type), out = [];
    lex.items.forEach(function (it) {
      if (exclude && exclude.some(function (x) { return norm(x) === norm(it.p.w); })) return;
      if (clues.some(function (c) { return impossible(it, c); })) return;
      var s = 0; clues.forEach(function (c) { s += clueScore(lex, it, c, mind); });
      out.push({ p: it.p, s: s });
    });
    return out;
  }
  function gumbel(rng) { var u = Math.max(1e-9, rng()); return -Math.log(-Math.log(u)); }
  function cpuGuess(type, clues, exclude, lv, seed, rng) {
    rng = rng || Math.random; var L = LV[lv] || LV.normal;
    var list = rankCandidates(type, clues, exclude, { seed: seed, keep: L.keep });
    if (!list.length) return { text: 'わからない', s: 0, pass: true };
    var best = null;
    list.forEach(function (x) { var v = x.s + L.noise * gumbel(rng); if (!best || v > best.v) best = { v: v, x: x }; });
    var top = list.reduce(function (m, x) { return x.s > m ? x.s : m; }, 0);
    return { text: best.x.p.w, s: best.x.s, top: top, id: best.x.p.id };
  }
  function cpuThinkMs(lv, rng) { var w = (LV[lv] || LV.normal).think; return (w[0] + (rng || Math.random)() * (w[1] - w[0])) * 1000; }

  var api = { ALL: ALL, BY: BY, DECOY: DECOY, JUKUGO: JUKUGO, LOAN: LOAN, LV: LV, OYA_PTS: OYA_PTS,
    toKata: toKata, toHira: toHira, nfkc: nfkc, isKanji: isKanji, isKata: isKata, chars: chars, loose: loose, grams: grams, norm: norm,
    checkClue: checkClue, cleanParts: cleanParts, isCorrect: isCorrect, bonusDefault: bonusDefault, oyaPoints: oyaPoints, writerPoints: writerPoints,
    rngFrom: rngFrom, shuffle: shuffle, newGame: newGame, chooseType: chooseType, roll: roll, beginWrite: beginWrite, submitClue: submitClue, allSubmitted: allSubmitted,
    endWrite: endWrite, revealNext: revealNext, guess: guess, override: override, afterJudge: afterJudge, setBonus: setBonus, foul: foul, redo: redo, nextTurn: nextTurn,
    ranking: ranking, oyaOf: oyaOf, cpuClue: cpuClue, cpuWriteMs: cpuWriteMs, cpuTile: cpuTile, cpuGuess: cpuGuess, cpuThinkMs: cpuThinkMs, rankCandidates: rankCandidates, lexFor: lexFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GP = api;
})(this);
