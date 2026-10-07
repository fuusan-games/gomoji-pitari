/* ごもじでピタリ：ホスト側のゲーム進行（authoritative）。お題・時間・ふーさん🐻の思考はここ */
'use strict';
var LINES = {
  type: ['{type}のカードにするクマ！', '今回は{type}でいくクマ〜', 'うーん…{type}！クマ'],
  roll: ['えいっ🎲 ふるクマ！', 'コロコロ〜🎲 クマ'],
  wrote: { slow: ['うーん…やっと書けたクマ', 'できた…と思うクマ'], normal: ['できたクマ！', 'これでいくクマ'], fast: ['ひらめいたクマ！⚡', 'もうできたクマ！⚡'] },
  tile1: ['1番いただきクマ！', '1番もらったクマ〜'],
  noIdea: ['うーん…思いつかなかったクマ…', 'むずかしいクマ〜💦'],
  guess: { slow: ['えーと…「{a}」かなあ？クマ', 'たぶん「{a}」…？クマ'], normal: ['「{a}」クマ！', '「{a}」だと思うクマ'], fast: ['わかったクマ！「{a}」！', '「{a}」で決まりクマ⚡'] },
  pass: ['うーん、これはパスするクマ…'],
  right: ['やったクマ〜！🎉', 'つたわったクマ！'],
  wrong: ['ちがったクマ〜💦', 'あれれ？クマ'],
  helped: ['ぼくの5文字で つたわったクマ！🎉', '書いてよかったクマ〜'],
  miss: ['むずかしかったクマ〜', 'だれも当てられなかったクマ…']
};
function hostId(code) { return ID_PREFIX + code; }
function newRoom(name, solo) {
  return { code: solo ? 'SOLO' : genCode(), solo: !!solo, phase: 'lobby', opts: { np: 4, lv: ['normal', 'normal', 'normal', 'normal', 'normal', 'normal'], sec: 60 }, nextSid: 2, gameNo: 0,
    seats: [{ sid: 1, name: name, kind: 'host', clientId: myId, connected: true }], G: null, notice: null, lobbyReq: null };
}
function startHost(name, resumeRoom, solo) {
  document.body.classList.add('is-host');
  host = { room: resumeRoom || newRoom(name, solo), conns: {}, lastSeen: {}, tries: 0, opened: false };
  document.body.classList.toggle('solo', !!host.room.solo);
  if (resumeRoom) host.room.seats.forEach(function (s) { if (s.kind === 'remote') s.connected = false; });
  if (resumeRoom && resumeRoom.G) { var G = resumeRoom.G; G.ph = null; G.ri = -1; G.judgedN = -1; }
  if (host.room.solo) { host.opened = true; hostRender(); saveHost(); }
  else { connecting(true, resumeRoom ? '部屋を再開しています…' : '部屋を作っています…', 'シグナリングサーバーに接続中', function () { location.href = location.pathname; }); openHostPeer(); }
  setInterval(hostHeartbeat, 2000);
  setInterval(hostTick, TURBO ? 25 : 100);
}
// 席：人間が参加順に前から。残りは ふーさん（合計3〜6人）
function planOwners(seats, opts) {
  var np = Math.min(MAX_PLAYERS, Math.max(opts.np, seats.length, MIN_PLAYERS)), out = [];
  for (var i = 0; i < np; i++) { var h = seats[i]; out.push(h ? { kind: 'human', sid: h.sid, name: h.name } : { kind: 'cpu', lv: opts.lv[i] || 'normal', name: '' }); }
  var cpus = out.filter(function (o) { return o.kind === 'cpu'; });
  cpus.forEach(function (o, i) { o.name = cpus.length > 1 ? CPU_BASE + (i + 1) : CPU_BASE; });
  return out;
}
function writeMs() { var R = host.room; return ((TURBO || +Q.get('wsec') > 0) ? T.writeSec : (R.opts.sec || 60)) * 1000; }
function hostStartGame() {
  var R = host.room;
  if (!R.seats.length) return;
  R.gameNo++; R.lobbyReq = null;
  var owners = planOwners(R.seats, R.opts);
  var S = L.newGame(owners.length, {});
  R.G = { S: S, owners: owners, startAt: Date.now() + 700, started: false, ph: null, phAt: 0, cpu: {}, writeEnd: 0, resultEnd: 0, ri: -1, ansOpenAt: 0, cpuGuessAt: 0, judgedN: -1, judgedEnd: 0,
    say: null, mind: Math.floor(Math.random() * 1e9), lastBc: 0 };
  R.phase = 'game';
  hostBroadcast();
}
function say(p, text) { var G = host.room.G; G.say = { id: (G.say ? G.say.id : 0) + 1, p: p, text: text }; }
function ownerOfSid(sid) { var G = host.room.G, r = -1; G.owners.forEach(function (o, i) { if (o.kind === 'human' && o.sid === sid) r = i; }); return r; }
function isCpu(p) { return host.room.G.owners[p].kind === 'cpu'; }
function lvOf(p) { var o = host.room.G.owners[p]; return o.kind === 'cpu' ? o.lv : 'normal'; }
// 切断中の人間の席は ふーさんが代わりに動かす
function isProxy(p) { var o = host.room.G.owners[p]; if (o.kind !== 'human') return false; var s = seatBySid(o.sid); return !!s && s.kind === 'remote' && !s.connected; }
function auto(p) { return isCpu(p) || isProxy(p); }
function humanOthers(S) { var G = host.room.G; return G.owners.some(function (o, i) { if (o.kind !== 'human' || i === S.oya) return false; var s = seatBySid(o.sid); return s && (s.kind !== 'remote' || s.connected); }); }

function hostAction(sid, m) {
  var R = host.room, G = R.G; if (!G || R.phase !== 'game') return null;
  var S = G.S, p = ownerOfSid(sid), now = Date.now(), err = null;
  if (p < 0 || now < G.startAt) return null;
  if (['type', 'roll', 'guess', 'pass', 'override'].indexOf(m.a) >= 0 && m.k !== S.pk) return null;   // 古い画面からの操作は無視
  switch (m.a) {
    case 'type':
      if (S.phase !== 'choose' || p !== S.oya) return null;
      err = L.chooseType(S, m.v); break;
    case 'roll':
      if (S.phase !== 'roll' || p !== S.roller) return null;
      err = L.roll(S); break;
    case 'submit':
      if (!m.v || typeof m.v !== 'object') return null;
      if (S.phase !== 'write') return '書く時間は おわりました';
      err = L.submitClue(S, p, String(m.v.k || '').slice(0, 8), String(m.v.t || '').slice(0, 8), +m.v.tile); break;
    case 'guess': case 'pass':
      if (S.phase !== 'answer' || p !== S.oya || !S.ans || S.ans.st !== 'think') return null;
      if (m.a === 'guess' && !L.norm(m.v)) return 'こたえを入力してね';
      err = L.guess(S, String(m.v || '').slice(0, 24), m.a === 'pass');
      if (!err) afterGuess(); break;
    case 'override':
      if (p === S.oya) return '親は使えません';
      err = L.override(S); if (!err) { toastAll('⭕ ' + G.owners[p].name + 'が「正解あつかい」にしました'); afterSolve(); } break;
    case 'foul':
      if (p === S.oya) return '親は使えません';
      err = L.foul(S, +m.v, p); break;
    case 'next':
      if (sid !== 1 || S.phase !== 'result') return null;
      G.resultEnd = now; break;
    case 'bonus':
      if (sid !== 1 || !m.v) return null;
      err = L.setBonus(S, m.v.w, !!m.v.on); break;
    default: return null;
  }
  if (err) return err;
  hostTick(true);
  hostBroadcast(); return null;
}
function afterGuess() {
  var G = host.room.G, S = G.S, g = S.guesses[S.guesses.length - 1];
  if (g && g.ok) afterSolve();
  else if (auto(S.oya) && isCpu(S.oya) && Math.random() < 0.6) say(S.oya, pick(LINES.wrong));
}
function afterSolve() {
  var G = host.room.G, S = G.S; if (!S.solved) return;
  if (isCpu(S.oya)) say(S.oya, pick(LINES.right));
  else if (isCpu(S.solved.p)) say(S.solved.p, pick(LINES.helped));
}
// ふーさんの「書く」予定を立てる（書く時間のはじめに）
function planCpuWriters() {
  var G = host.room.G, S = G.S, now = Date.now(); G.cpu = {}; S.cpuPick = {};
  S.writers.forEach(function (w) {
    var lv = lvOf(w), c = L.cpuClue(S, w, lv);
    if (c) S.cpuPick[w] = c.k + c.t;
    var at = now + L.cpuWriteMs(lv) * (TURBO ? T.k : writeMs() / 60000);
    G.cpu[w] = { at: Math.min(at, G.writeEnd - 1500 * T.k), clue: c, lv: lv, done: false };
  });
}
function cpuWriteStep(now) {
  var G = host.room.G, S = G.S, changed = false;
  Object.keys(G.cpu).forEach(function (k) {
    var w = +k, c = G.cpu[w];
    if (c.done || now < c.at || S.clues[w]) return;
    if (!auto(w)) { c.done = true; return; }     // 人間の席（接続中）は本人が書く
    c.done = true;
    // ほかの人がもう同じ5文字を出していたら、別の5文字に書きかえる
    if (c.clue && Object.keys(S.clues).some(function (q) { return S.clues[q].k + S.clues[q].t === c.clue.k + c.clue.t; })) { delete S.cpuPick[w]; c.clue = L.cpuClue(S, w, 'fast'); }
    if (!c.clue) { if (isCpu(w) && Math.random() < 0.7) say(w, pick(LINES.noIdea)); changed = true; return; }
    var tile = L.cpuTile(S, c.lv, c.clue.idx); if (tile == null) return;
    var err = L.submitClue(S, w, c.clue.k, c.clue.t, tile);
    if (err) { var free = S.tiles.indexOf(-1); if (free >= 0) err = L.submitClue(S, w, c.clue.k, c.clue.t, free + 1); }
    if (!err) {
      changed = true;
      if (isCpu(w)) { if (tile === 1 && Math.random() < 0.6) say(w, pick(LINES.tile1)); else if (Math.random() < 0.45) say(w, pick(LINES.wrote[c.lv] || LINES.wrote.normal)); }
      else toastAll(BEAR + ' 切断中の ' + G.owners[w].name + ' のかわりに ふーさんが書きました');
    }
  });
  return changed;
}
function cpuGuessNow() {
  var G = host.room.G, S = G.S, lv = lvOf(S.oya);
  var clues = S.order.slice(0, S.ri).map(function (p) { return S.clues[p]; });
  var ex = S.guesses.filter(function (g) { return !g.pass; }).map(function (g) { return g.text; });
  var res = L.cpuGuess(S.type, clues, ex, lv, G.mind + S.oya * 7919);
  if (isProxy(S.oya)) toastAll(BEAR + ' 切断中の ' + G.owners[S.oya].name + ' のかわりに ふーさんが答えました');
  if (res.pass) { if (isCpu(S.oya)) say(S.oya, pick(LINES.pass)); L.guess(S, '', true); }
  else { if (isCpu(S.oya)) say(S.oya, fill(pick(LINES.guess[lv] || LINES.guess.normal), { a: res.text })); L.guess(S, res.text, false); }
  afterGuess();
}
function hostTick(fromAction) {
  if (!host || !host.opened) return;
  var R = host.room, G = R.G, now = Date.now();
  if (R.phase !== 'game' || !G) return;
  if (now < G.startAt) return;
  if (!G.started) { G.started = true; hostBroadcast(); return; }
  var S = G.S, changed = false, guard = 0, before;
  do {
    before = S.phase + ':' + S.pk + ':' + S.evId;
    if (S.phase !== G.ph) { G.ph = S.phase; G.phAt = now; enterPhase(S, now); changed = true; }
    var age = now - G.phAt;
    switch (S.phase) {
      case 'choose':
        if (auto(S.oya) && age >= (isCpu(S.oya) ? T.choose : T.off)) {
          var ty = Math.random() < 0.5 ? 'kata' : 'kanji'; L.chooseType(S, ty);
          if (isCpu(S.oya) && Math.random() < 0.7) say(S.oya, fill(pick(LINES.type), { type: TYPE_NAME[ty] }));
        }
        break;
      case 'roll':
        if (auto(S.roller) && age >= (isCpu(S.roller) ? T.roll : T.off)) { L.roll(S); if (isCpu(S.roller) && Math.random() < 0.5) say(S.roller, pick(LINES.roll)); }
        break;
      case 'ready':
        if (age >= T.ready) L.beginWrite(S);
        break;
      case 'write':
        if (cpuWriteStep(now)) changed = true;
        if (L.allSubmitted(S) || now >= G.writeEnd) L.endWrite(S);
        break;
      case 'answer':
        if (!S.ans) { if (age >= T.afterWrite) L.revealNext(S); break; }
        if (S.ri !== G.ri) { G.ri = S.ri; G.ansOpenAt = now + T.flip; G.cpuGuessAt = G.ansOpenAt + (isCpu(S.oya) ? L.cpuThinkMs(lvOf(S.oya)) * T.k : T.off); changed = true; }
        if (S.ans.st === 'think') { if (auto(S.oya) && now >= G.cpuGuessAt) cpuGuessNow(); break; }
        if (S.guesses.length !== G.judgedN) {
          G.judgedN = S.guesses.length; var g = S.guesses[S.guesses.length - 1];
          G.judgedEnd = now + (!S.ans.ok && g && !g.pass && humanOthers(S) ? T.judgedLong : T.judged); changed = true;
        }
        if (!S.ans.ok && now >= G.judgedEnd) L.afterJudge(S);
        break;
      case 'result':
        if (now >= G.resultEnd) L.nextTurn(S);
        break;
      case 'foul':
        if (age >= T.foul) L.redo(S);
        break;
      case 'over':
        if (age >= T.over) { R.phase = 'end'; hostBroadcast(); return; }
        break;
    }
    if (S.phase + ':' + S.pk + ':' + S.evId !== before) changed = true; else break;
  } while (guard++ < 8);
  if (fromAction === true) return;
  if (changed || now - G.lastBc > 4000) { G.lastBc = now; hostBroadcast(); }
}
function enterPhase(S, now) {
  var G = host.room.G;
  if (S.phase === 'write') { G.writeEnd = now + writeMs(); planCpuWriters(); }
  if (S.phase === 'answer') { G.ri = -1; G.judgedN = -1; }
  if (S.phase === 'result') {
    G.resultEnd = now + T.result * (S.solved ? 1 : 0.6);
    if (!S.solved) { var c = S.writers.filter(isCpu)[0]; if (c != null && Math.random() < 0.6) say(c, pick(LINES.miss)); }
  }
}
function viewFor(sid) {
  var R = host.room, G = R.G, now = Date.now(), you = -1;
  R.seats.forEach(function (s, i) { if (s.sid === sid) you = i; });
  var v = { t: 'state', phase: R.phase, code: R.code, solo: R.solo, you: you, sid: sid, gameNo: R.gameNo, opts: { np: R.opts.np, lv: R.opts.lv.slice(), sec: R.opts.sec || 60 },
    seats: R.seats.map(function (s) { return { sid: s.sid, name: s.name, kind: s.kind, connected: s.kind !== 'remote' || s.connected }; }), notice: R.notice };
  if (sid === 1 && R.lobbyReq && R.phase !== 'lobby') v.lobbyReq = R.lobbyReq;
  if (R.phase === 'lobby' || !G) return v;
  var S = G.S, me = ownerOfSid(sid), ph = S.phase;
  // 親には、答え合わせ（結果）まで お題を送らない
  var reveal = ph === 'result' || ph === 'over' || ph === 'foul' || R.phase === 'end';
  var seePrompt = me !== S.oya || reveal;
  var clues = S.writers.map(function (w) {
    var c = S.clues[w]; if (!c) return null;
    var ri = S.order.indexOf(w), open = (ri >= 0 && ri < S.ri) || w === me || ph === 'result' || ph === 'over';
    return open ? { p: w, k: c.k, t: c.t, tile: c.tile, warn: c.warn } : { p: w, tile: c.tile, hidden: true };
  }).filter(Boolean);
  v.g = { n: S.n, rounds: S.rounds, turn: S.turn, oya: S.oya, roller: S.roller, writers: S.writers.slice(), sphase: ph, type: S.type, die: S.die, scores: S.scores.slice(), k: S.pk,
    owners: G.owners.map(function (o) { var s = o.kind === 'human' ? seatBySid(o.sid) : null; return { kind: o.kind, sid: o.sid, name: o.name, lv: o.lv, connected: !s || s.kind !== 'remote' || s.connected }; }),
    me: me, tiles: S.tiles.slice(), clues: clues, order: S.order.slice(), ri: S.ri, ans: S.ans, guesses: S.guesses.slice(), solved: S.solved, foul: S.foul,
    lastFoul: S.lastFoul ? { w: L.ALL[S.lastFoul.prompt].w, p: S.lastFoul.p } : null,
    card: seePrompt && S.card && ph !== 'choose' ? S.card.map(function (id) { return L.ALL[id].w; }) : null,
    prompt: seePrompt && S.prompt != null ? { w: L.ALL[S.prompt].w, r: L.ALL[S.prompt].r.slice(), type: S.type } : null,
    hist: S.hist.map(function (h) { var x = Object.assign({}, h); x.w = L.ALL[h.prompt].w; return x; }),
    endsIn: ph === 'write' ? Math.max(0, G.writeEnd - now) : null, total: writeMs(),
    nextIn: ph === 'result' ? Math.max(0, G.resultEnd - now) : null,
    ansIn: ph === 'answer' && S.ans && S.ans.st === 'think' ? Math.max(0, G.ansOpenAt - now) : 0,
    judgedIn: ph === 'answer' && S.ans && S.ans.st === 'judged' && !S.ans.ok ? Math.max(0, G.judgedEnd - now) : 0,
    ev: S.ev.slice(-10), say: G.say, wait: Math.max(0, G.startAt - now) };
  return v;
}
function seatByClient(cid) { return host.room.seats.filter(function (s) { return s.clientId === cid; })[0]; }
function seatBySid(sid) { return host.room.seats.filter(function (s) { return s.sid === sid; })[0]; }
function toastAll(msg) { var R = host.room; R.notice = { id: (R.notice ? R.notice.id : 0) + 1, msg: msg, toast: true }; }
function hostToLobby(msg) {
  var R = host.room;
  R.phase = 'lobby'; R.G = null; R.lobbyReq = null;
  R.seats = R.seats.filter(function (s) { if (s.kind === 'remote') { s.left = false; return !!s.connected; } return true; });
  R.notice = { id: (R.notice ? R.notice.id : 0) + 1, msg: msg };
  hostBroadcast();
}
function hostLobbyReq(seat) {
  var R = host.room;
  if (seat.kind !== 'remote' || R.phase === 'lobby') return;
  if (R.lobbyReq && R.lobbyReq.sid === seat.sid && Date.now() - R.lobbyReq.at < 5000) return;
  R.lobbyReq = { sid: seat.sid, name: seat.name, at: Date.now() };
  hostBroadcast();
}
function hostBroadcast() {
  var R = host.room;
  R.seats.forEach(function (s) { if (s.kind !== 'remote') return; var c = host.conns[s.clientId]; if (c && c.open) { try { c.send(viewFor(s.sid)); } catch (e) {} } });
  hostRender(); saveHost();
}
function hostRender() { render(viewFor(1)); }
var saveT = 0;
function saveHost() { var now = Date.now(); if (now - saveT < 700 && host.room.phase === 'game') return; saveT = now; try { localStorage.setItem(LS_HOST, JSON.stringify({ room: host.room, saved: now })); } catch (e) {} }
