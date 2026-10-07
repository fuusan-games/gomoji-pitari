/* ごもじでピタリ：描画（ホスト・参加者で共通。受け取ったビューだけを使う）— ロビー・ゲーム画面・結果 */
'use strict';
var ui = { gameKey: '', lastEv: 0, sayId: 0, stageHtml: '', ctrlHtml: '', chipsHtml: '', tilesKey: '', writeKey: '', ansKey: '', deadline: 0, total: 60000, nextAt: 0, lastSec: -1, endKey: '', fresh: {} };
function render(v) {
  lastView = v; window.__gp.view = v;
  BGM.want(v.phase === 'game' && v.g ? 'calm' : null);
  noticeUi(v);
  if (v.phase === 'lobby') { show('lobby'); renderLobby(v); ui.gameKey = ''; hidePanels(); return; }
  if (v.phase === 'end') { show('end'); renderEnd(v); hidePanels(); return; }
  show('game'); renderGame(v);
}
var seenNotice = null;
function noticeUi(v) {
  if (seenNotice === null) seenNotice = v.notice ? v.notice.id : 0;
  else if (v.notice && v.notice.id !== seenNotice) { seenNotice = v.notice.id; if (v.notice.toast || !host) toast(v.notice.msg + (!v.notice.toast && v.phase === 'lobby' ? '。ロビーで次のゲームを待っています' : '')); }
  if (v.phase === 'lobby') overlay('menuModal', false);
  var bar = $('lobbyReqBar'), key = host && v.lobbyReq && v.phase !== 'lobby' ? v.lobbyReq.sid + ':' + v.lobbyReq.at : '';
  if (bar.dataset.key !== key) {
    bar.dataset.key = key;
    bar.innerHTML = key ? '<span>🙋 ' + esc(v.lobbyReq.name) + '「ロビーに戻りたい」</span><button data-lr="abort">中断してロビーへ</button><button data-lr="no" class="ghost">とじる</button>' : '';
    bar.classList.toggle('show', !!key);
  }
}
function lvSelect(c, lv) { return '<select data-c="' + c + '" aria-label="ふーさんの強さ">' + LV_KEYS.map(function (k) { return '<option value="' + k + '"' + (k === lv ? ' selected' : '') + '>' + LV[k] + '</option>'; }).join('') + '</select>'; }
function renderLobby(v) {
  var isHost = !!host, n = v.seats.length;
  document.body.classList.toggle('solo', !!v.solo);
  $('codeBig').textContent = v.code;
  var url = inviteUrl(v.code);
  $('inviteUrl').textContent = url;
  if (!v.solo && $('qr').dataset.url !== url) {
    try { var qr = qrcode(0, 'M'); qr.addData(url); qr.make(); $('qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch (e) { $('qr').textContent = ''; }
    $('qr').dataset.url = url;
  }
  $('seatCount').textContent = n + ' / ' + MAX_HUMANS + '人';
  $('seatList').innerHTML = v.seats.map(function (s, i) {
    var tags = (s.kind === 'host' ? '<span class="tagx host">ホスト</span>' : '') + (i === v.you ? '<span class="tagx you">あなた</span>' : '') + (s.kind === 'remote' && !s.connected ? '<span class="tagx off">切断</span>' : '');
    return '<div class="seat' + (s.connected ? '' : ' offline') + '"><span class="av">' + (i + 1) + '</span><span class="nm">' + esc(s.name) + '</span>' + tags + (isHost && s.kind === 'remote' ? '<button class="xbtn" data-sid="' + s.sid + '" aria-label="外す">×</button>' : '') + '</div>';
  }).join('');
  var np = Math.min(MAX_PLAYERS, Math.max(v.opts.np, n, MIN_PLAYERS));
  $('npSeg').innerHTML = [3, 4, 5, 6].map(function (k) { return '<button data-v="' + k + '" class="' + (k === np ? 'on' : '') + '"' + (isHost && k >= n ? '' : ' disabled') + '>' + k + '人</button>'; }).join('');
  $('npSeg').classList.toggle('ro', !isHost);
  var owners = planOwners(v.seats, v.opts), cpuN = owners.filter(function (o) { return o.kind === 'cpu'; }).length;
  $('npHint').textContent = cpuN ? 'ふーさん🐻も書く人・親になります（強さで書く速さと当てる力が変わります）' : '全員人間で遊びます';
  $('cpuList').innerHTML = owners.map(function (o, c) {
    return '<div class="crow"><span class="av" style="background:' + (o.kind === 'cpu' ? '#c4581d' : '#2f6b4a') + '">' + (c + 1) + '</span><span class="nm">' + esc(o.name) + (o.kind === 'human' && o.sid === v.sid ? '（あなた）' : '') + '</span>' +
      (o.kind === 'cpu' ? (isHost ? lvSelect(c, o.lv) : '<span class="lv">' + LV[o.lv] + '</span>') : '') + '</div>';
  }).join('');
  $('lvAllSeg').innerHTML = LV_KEYS.map(function (k) { return '<button data-v="' + k + '"' + (isHost ? '' : ' disabled') + '>' + LV[k] + '</button>'; }).join('');
  $('lvAllBox').style.display = cpuN && isHost ? '' : 'none';
  $('secSeg').innerHTML = [[60, '60秒', 'ふつう'], [90, '90秒', 'ゆっくり']].map(function (o) { return '<button data-v="' + o[0] + '" class="' + ((v.opts.sec || 60) === o[0] ? 'on' : '') + '"' + (isHost ? '' : ' disabled') + '>' + o[1] + '<small>' + o[2] + '</small></button>'; }).join('');
  $('secSeg').classList.toggle('ro', !isHost);
  $('seatHint').textContent = '最大6人。空いた席は ふーさん🐻 が入ります。招待URLかQRで、各自のスマホから参加してね';
  $('startBtn').disabled = n < 1;
}

// ---------------- ゲーム画面 ----------------
function dispName(o) { return o ? o.name : ''; }
function nm(g, p) { return esc(dispName(g.owners[p])); }
function dieHtml(n, rolling) {
  var on = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }[n] || [];
  var h = '<div class="die' + (n === 1 ? ' one' : '') + (rolling ? ' rolling' : '') + '" aria-label="サイコロ ' + (n || '') + '">';
  for (var i = 0; i < 9; i++) h += '<i class="' + (on.indexOf(i) >= 0 ? 'on' : '') + '"></i>';
  return h + '</div>';
}
function cardHtml6(g, showHit) {
  return '<div class="pcard ' + g.type + '"><div class="ph6">' + TYPE_NAME[g.type] + 'のカード（🎲の目のお題）</div><ol>' + g.card.map(function (w, i) {
    var cls = showHit && g.die ? (g.die === i + 1 ? 'hit' : 'dim') : '';
    return '<li class="' + cls + '"><span class="pip">' + (i + 1) + '</span>' + esc(w) + '</li>';
  }).join('') + '</ol></div>';
}
function promptHtml(g) {
  var p = g.prompt; if (!p) return '';
  var rd = p.type === 'kanji' ? '<span class="pr">' + esc(p.r.join('／')) + '</span>' : '';
  return '<div class="prompt"><span class="pt ' + p.type + '">お題</span><span class="pw">' + esc(p.w) + rd + '</span></div>';
}
function banHtml(g) {
  var p = g.prompt; if (!p) return '';
  var kj = Array.from(p.w).filter(function (c) { return L.isKanji(c) && c !== '々'; });
  var parts = [];
  if (kj.length) parts.push('漢字 <b>' + esc(kj.join('・')) + '</b>');
  var gr = []; p.r.forEach(function (r) { L.grams(r, 3).forEach(function (x) { if (gr.indexOf(x) < 0) gr.push(x); }); });
  if (gr.length) parts.push('カタカナ <b>' + esc(gr.slice(0, 8).join('・')) + (gr.length > 8 ? '…' : '') + '</b>');
  return parts.length ? '<div class="ban hide-kb">🚫 使えない：' + parts.join('／') + '</div>' : '<div class="ban hide-kb">（読みが2文字以下なので、カタカナの禁止はありません）</div>';
}
function myClue(g) { var c = null; g.clues.forEach(function (x) { if (x.p === g.me) c = x; }); return c; }
function clueOf(g, p) { var c = null; g.clues.forEach(function (x) { if (x.p === p) c = x; }); return c; }
function tilesStatus(g) {
  return '<div class="sub">' + g.tiles.map(function (s, i) { return '<span class="tnum">' + (i + 1) + '</span> ' + (s >= 0 ? nm(g, s) : '<span style="opacity:.5">あき</span>'); }).join('　') + '</div>';
}
function boardHtml(g, all) {
  var oya = g.me === g.oya, canFoul = g.me >= 0 && !oya && g.sphase === 'answer' && !g.solved;
  if (!g.order.length) return '<div class="sub">だれも 5文字を出せませんでした…</div>';
  return '<div class="board">' + g.order.map(function (p, i) {
    var c = clueOf(g, p), open = all || i < g.ri, cur = !all && i === g.ri - 1, gs = g.guesses.filter(function (x) { return x.i === i; })[0];
    var cls = 'crd' + (open ? '' : ' back') + (cur ? ' cur' : '') + (cur && ui.fresh.reveal ? ' flip' : '') + (g.solved && g.solved.i === i ? ' win' : '');
    var gtxt = gs ? (gs.pass ? '<span class="gs">パス</span>' : '<span class="gs' + (gs.ok ? ' ok' : '') + '">' + (gs.ok ? '⭕' : '✕') + '「' + esc(gs.text) + '」' + (gs.manual ? '（正解あつかい）' : '') + '</span>') : '';
    var warn = open && c && c.warn && g.me !== g.oya ? '<span class="wn">⚠ ' + esc(c.warn.replace(/（.*）/, '')) + '</span>' : '';
    return '<div class="' + cls + '"><span class="tn">' + (c ? c.tile : i + 1) + '</span>' + (open && c && !c.hidden ? clueHtml(c.k, c.t, 'big') : clueHtml('', '', 'big')) +
      '<span class="wr">' + nm(g, p) + gtxt + warn + (canFoul && open ? '<button class="fl" data-foul="' + i + '" aria-label="反則を指摘">🚩反則</button>' : '') + '</span></div>';
  }).join('') + '</div>';
}
function stageHtml(v) {
  var g = v.g, sp = g.sphase, me = g.me, oya = me === g.oya, h = '';
  if (g.wait > 0) return '<div class="sc"><div class="eyes">🐻</div><div class="bigt">まもなく開始…</div></div>';
  var lf = g.lastFoul && sp === 'choose' ? '<div class="sub">🚩 前のお題「' + esc(g.lastFoul.w) + '」は反則で流れました。決め直し！</div>' : '';
  switch (sp) {
    case 'choose':
      if (oya) h = '<div class="eyes">👑</div><div class="bigt">あなたが親です！</div><div class="sub">カードの種類を選んでね。<br>お題は 答え合わせまで あなたの画面には出ません。</div>';
      else h = '<div class="cback none">？</div><div class="bigt">親：' + nm(g, g.oya) + '</div><div class="sub">親がカードの種類（カタカナ／漢字）を選んでいます…<br>サイコロは ' + nm(g, g.roller) + ' がふります</div>';
      return '<div class="sc">' + lf + h + '</div>';
    case 'roll':
      if (oya) return '<div class="sc"><div class="eyes">🙈</div><div class="bigt">目をつぶって待っててね</div><div class="sub">いま ' + nm(g, g.roller) + ' がサイコロで お題を決めます。<br>あなたの画面には お題は出ません。</div><div class="cback ' + g.type + '">？<small>' + TYPE_NAME[g.type] + '</small></div></div>';
      return '<div class="sc">' + (g.card ? cardHtml6(g, false) : '') + dieHtml(0) + '<div class="sub">' + (me === g.roller ? '🎲 あなたがサイコロをふる番！' : nm(g, g.roller) + ' がサイコロをふります') + '</div></div>';
    case 'ready':
      if (oya) return '<div class="sc"><div class="eyes">🙈</div><div class="bigt">お題が決まりました！</div><div class="sub">みんなが5文字を書きます。60秒くらい待っててね</div>' + dieHtml(g.die, ui.fresh.roll) + '</div>';
      return '<div class="sc">' + dieHtml(g.die, ui.fresh.roll) + (g.card ? cardHtml6(g, true) : '') + '<div class="sub">このお題を 5文字で言いかえよう！</div></div>';
    case 'write':
      if (oya) return '<div class="sc"><div class="eyes">🙈</div><div class="bigt">みんなが 5文字を考え中…</div><div class="sub">番号の小さい順に見せるので、お題を当ててね</div>' + tilesStatus(g) + '</div>';
      var mc = myClue(g);
      if (mc) return '<div class="sc">' + promptHtml(g) + '<div class="bigt">✅ 提出しました</div>' + clueHtml(mc.k, mc.t, 'big') + '<div class="sub">あなたは <span class="tnum">' + mc.tile + '</span> 番</div>' + tilesStatus(g) + '</div>';
      return '<div class="sc">' + promptHtml(g) + banHtml(g) + '<div class="tip hide-kb">💡 漢字は<b>二字熟語</b>、カタカナは<b>カタカナ言葉</b>だとボーナス＋10ずつ。<br>カタカナは外来語でなくてもOK（ハシル・クルマ など）</div>' + (g.card ? '<div class="hide-kb">' + cardHtml6(g, true) + '</div>' : '') + '</div>';
    case 'answer':
      h = oya ? '<div class="sub">👑 あなたが親。5文字から お題を当ててね</div>' : promptHtml(g);
      if (g.ans && g.ans.st === 'judged') h += '<div class="guessBig ' + (g.ans.ok ? 'ok' : 'ng') + '">' + (g.ans.ok ? '⭕ 正解！' : (g.guesses[g.guesses.length - 1] || {}).pass ? 'パス' : '✕ はずれ') + '</div>';
      return '<div class="sc" style="justify-content:flex-start">' + h + boardHtml(g, false) + '</div>';
    case 'result':
      var p = g.prompt, s = g.solved;
      h = '<div class="reveal"><div class="sub">お題は…</div><div class="rw">' + esc(p ? p.w : '') + '</div>' + (p && p.type === 'kanji' ? '<div class="sub">' + esc(p.r.join('／')) + '</div>' : '') + '</div>';
      if (s) {
        var c = clueOf(g, s.p);
        h += '<div class="bigt">' + (s.i + 1) + 'つ目の5文字で 正解！' + (s.manual ? '<small>（正解あつかい）</small>' : '') + '</div>';
        h += '<div class="pts"><span>👑' + nm(g, g.oya) + ' <b>+' + s.oyaPts + '</b></span><span>✏️' + nm(g, s.p) + ' <b>+' + L.writerPoints(s.bj, s.bk) + '</b></span></div>';
        h += '<div class="bon">' + (host ? '<button data-bonus="j" class="' + (s.bj ? 'on' : '') + '">' + (s.bj ? '✅' : '⬜') + ' 二字熟語 +10</button><button data-bonus="k" class="' + (s.bk ? 'on' : '') + '">' + (s.bk ? '✅' : '⬜') + ' カタカナ言葉 +10</button>'
          : '<span class="' + (s.bj ? 'on' : '') + '">' + (s.bj ? '✅' : '—') + ' 二字熟語</span><span class="' + (s.bk ? 'on' : '') + '">' + (s.bk ? '✅' : '—') + ' カタカナ言葉</span>') + '</div>';
        if (host) h += '<div class="sub" style="font-size:11px">ボーナスは目安で自動判定。ちがっていたらタップで切りかえ</div>';
      } else h += '<div class="bigt">ざんねん！ だれも得点なし</div>';
      return '<div class="sc" style="justify-content:flex-start">' + h + boardHtml(g, true) + '</div>';
    case 'foul':
      var f = g.foul, fc = f ? clueOf(g, f.p) : null;
      return '<div class="sc"><div class="eyes">🚩</div><div class="bigt">反則（お手つき）！</div>' + (fc && !fc.hidden ? clueHtml(fc.k, fc.t, 'big') : '') + '<div class="sub">' + (f ? nm(g, f.p) + 'の5文字（' + nm(g, f.by) + 'が指摘）' : '') + '<br>このお題は終わり。同じ親で お題を決め直します</div>' + (g.prompt ? '<div class="sub">お題は「' + esc(g.prompt.w) + '」でした</div>' : '') + '</div>';
    case 'over':
      return '<div class="sc"><div class="eyes">🎉</div><div class="bigt">ゲーム終了！</div><div class="sub">結果発表…</div></div>';
  }
  return '';
}
function chipBadge(g, p) {
  var sp = g.sphase, c = clueOf(g, p), b = '';
  if (p === g.oya) b = '👑親';
  else if (sp === 'roll' && p === g.roller) b = '🎲';
  else if (sp === 'write') b = c ? '<span class="tnum">' + c.tile + '</span>' : '✏️';
  else if ((sp === 'answer' || sp === 'result' || sp === 'foul') && c) b = '<span class="tnum">' + c.tile + '</span>' + (g.solved && g.solved.p === p ? '⭕' : '');
  return b;
}
function renderChips(g) {
  $('chips').style.gridTemplateColumns = 'repeat(' + g.n + ',minmax(0,1fr))';
  var html = g.owners.map(function (o, p) {
    return '<div class="chip' + (p === g.oya ? ' oya' : '') + (p === g.me ? ' me' : '') + (o.connected ? '' : ' off') + '" data-p="' + p + '"><div class="cn">' + (p === g.me ? '●' : '') + esc(dispName(o)) + '</div><div class="cs">' + g.scores[p] + '</div><div class="cb">' + chipBadge(g, p) + '</div></div>';
  }).join('');
  if (html !== ui.chipsHtml) { ui.chipsHtml = html; $('chips').innerHTML = html; }
}
function ctrlHtml(v) {
  var g = v.g, sp = g.sphase, me = g.me;
  if (g.wait > 0 || me < 0) return '';
  if (sp === 'choose' && me === g.oya) return '<button class="kata" data-a="type" data-v="kata">カタカナ<small>のカード</small></button><button class="kanji" data-a="type" data-v="kanji">漢字<small>のカード</small></button>';
  if (sp === 'roll' && me === g.roller) return '<button class="main" data-a="roll">🎲 サイコロをふる</button>';
  if (sp === 'answer' && me !== g.oya && g.ans && g.ans.st === 'judged' && !g.ans.ok && g.judgedIn > 0) {
    var last = g.guesses[g.guesses.length - 1];
    if (last && !last.pass) return '<button class="okb" data-a="override">⭕ 正解にする<small>「' + esc(last.text) + '」でも意味が合っていたら</small></button>';
  }
  if (sp === 'result' && host) return '<button class="main" data-a="next">▶ 次へ<small id="nextSub"></small></button>';
  return '';
}
function statusText(v) {
  var g = v.g, sp = g.sphase, me = g.me, oya = me === g.oya;
  if (g.wait > 0) return ['', ''];
  switch (sp) {
    case 'choose': return oya ? ['あなたが親！ カードの種類を選んでね', 'mine'] : ['親の ' + nm(g, g.oya) + ' がカードを選んでいます', ''];
    case 'roll': return me === g.roller ? ['🎲 サイコロをふってね！', 'mine'] : oya ? ['🙈 お題は見えません。待っててね', ''] : [nm(g, g.roller) + ' がサイコロをふります', ''];
    case 'ready': return oya ? ['お題が決まりました。まもなくスタート', ''] : ['お題をチェック！ まもなく書き始め', 'mine'];
    case 'write': return oya ? ['🙈 みんなが書いています', ''] : myClue(g) ? ['提出しました！ ほかの人を待っています', ''] : ['漢字2＋カタカナ3で言いかえて、番号をタップ！', 'mine'];
    case 'answer':
      if (!g.ans) return ['番号の小さい順に めくります…', ''];
      if (g.ans.st === 'think') return oya ? [g.ri + 'つ目の5文字！ お題はなに？（1回だけ答えられます）', 'mine'] : ['親の ' + nm(g, g.oya) + ' が考えています…', ''];
      return g.ans.ok ? ['⭕ 正解！', 'mine'] : [g.ri < g.order.length ? 'はずれ… 次の5文字へ' : 'はずれ… これで最後でした', ''];
    case 'result': return [g.turn + 1 < g.rounds ? 'まもなく次のラウンド <span id="nextNum"></span>' : 'まもなく結果発表 <span id="nextNum"></span>', ''];
    case 'foul': return ['🚩 反則！ お題を決め直します', ''];
    case 'over': return ['🎉 ゲーム終了！', ''];
  }
  return ['', ''];
}
function hidePanels() { $('writePanel').hidden = true; $('answerPanel').hidden = true; }
function renderGame(v) {
  var g = v.g, me = g.me, gk = v.code + ':' + v.gameNo;
  if (ui.gameKey !== gk) {
    ui.gameKey = gk; ui.lastEv = g.ev.length ? g.ev[g.ev.length - 1].id : 0; ui.sayId = g.say ? g.say.id : 0;
    ui.stageHtml = ''; ui.ctrlHtml = ''; ui.chipsHtml = ''; ui.tilesKey = ''; ui.writeKey = ''; ui.ansKey = '';
    $('stage').querySelectorAll('.bubble').forEach(function (x) { x.remove(); });
  }
  var evs = g.ev.filter(function (e) { return e.id > ui.lastEv; });
  if (evs.length) ui.lastEv = evs[evs.length - 1].id;
  ui.fresh = {}; evs.forEach(function (e) { ui.fresh[e.kind] = e; });
  $('phLabel').textContent = 'ラウンド' + Math.min(g.turn + 1, g.rounds) + '/' + g.rounds + '｜親：' + dispName(g.owners[g.oya]);
  renderChips(g);
  // タイマー
  if (g.sphase === 'write' && g.endsIn != null) { ui.deadline = Date.now() + g.endsIn; ui.total = g.total; $('timer').classList.add('on'); }
  else { ui.deadline = 0; $('timer').classList.remove('on', 'hot', 'crit'); BGM.duck(1); }
  ui.nextAt = g.sphase === 'result' && g.nextIn != null ? Date.now() + g.nextIn : 0;
  // ステージ
  var sh = stageHtml(v);
  if (sh !== ui.stageHtml) { ui.stageHtml = sh; $('stageInner').innerHTML = sh; if (ui.fresh.reveal) { var cur = $('stageInner').querySelector('.crd.cur'); if (cur) cur.scrollIntoView({ block: 'nearest' }); } }
  renderWritePanel(v); renderAnswerPanel(v);
  var ch = ctrlHtml(v); if (ch !== ui.ctrlHtml) { ui.ctrlHtml = ch; $('ctrl').innerHTML = ch; }
  var st = statusText(v); $('status').innerHTML = st[0]; $('status').className = 'status ' + st[1];
  evs.forEach(function (e) { onEvent(v, e); });
  if (g.say && g.say.id !== ui.sayId) {
    ui.sayId = g.say.id; var o = g.owners[g.say.p];
    var b = document.createElement('div'); b.className = 'bubble'; b.textContent = (o ? dispName(o) : '') + '「' + g.say.text + '」';
    $('stage').querySelectorAll('.bubble').forEach(function (x) { x.remove(); }); $('stage').appendChild(b); setTimeout(function () { b.remove(); }, 3400);
  }
  timerLoop();
}
function pop(text, cls) { var p = $('pop'); p.textContent = text; p.className = cls; void p.offsetWidth; p.className = cls + ' go'; }
function onEvent(v, e) {
  var g = v.g;
  switch (e.kind) {
    case 'type': sfx.flip(); break;
    case 'roll': sfx.die(); break;
    case 'write': sfx.turn(); if (g.me !== g.oya) vibrate(30); break;
    case 'tile': sfx.tile(); break;
    case 'timeup': if (e.cnt < g.writers.length) { sfx.timeup(); pop('⏰ タイムアップ', 'info'); } else sfx.turn(); break;
    case 'reveal': sfx.flip(); break;
    case 'guess': if (e.ok) { sfx.correct(); pop('⭕ 正解！', 'good'); } else if (e.pass) pop('パス', 'info'); else { sfx.wrong(); pop('✕ はずれ', 'bad'); shake($('stageInner').querySelector('.crd.cur')); } break;
    case 'override': sfx.correct(); pop('⭕ 正解あつかい', 'good'); break;
    case 'result':
      if (g.solved) { scorePop(g.oya, g.solved.oyaPts, 500); scorePop(g.solved.p, L.writerPoints(g.solved.bj, g.solved.bk), 900); if (g.me === g.oya || g.me === g.solved.p) setTimeout(function () { confetti(36); }, 400); }
      else if (!e.ok) pop('だれも当たらず…', 'info');
      break;
    case 'foul': sfx.foul(); pop('🚩 反則！', 'bad'); vibrate([40, 40, 40]); break;
    case 'turn': sfx.turn(); break;
    case 'over': sfx.fanfare(); break;
  }
}
// 200ms ごと：残り時間・カチカチ音・次へのカウントダウン
function timerLoop() {
  var now = Date.now();
  if (ui.deadline) {
    var left = Math.max(0, ui.deadline - now), sec = Math.ceil(left / 1000), frac = Math.max(0, Math.min(1, left / (ui.total || 60000)));
    $('timerFill').style.width = (frac * 100).toFixed(1) + '%'; $('timerNum').textContent = '⏱ のこり ' + sec + '秒';
    $('timer').classList.toggle('hot', sec <= 10 && sec > 5); $('timer').classList.toggle('crit', sec <= 5);
    BGM.duck(sec <= 10 ? 0.35 : 1);
    if (sec !== ui.lastSec) { if (sec <= 10 && sec > 0 && ui.lastSec !== -1) sfx.tick(sec <= 5); ui.lastSec = sec; }
  } else ui.lastSec = -1;
  if (ui.nextAt) { var n = Math.max(0, Math.ceil((ui.nextAt - now) / 1000)), el = $('nextNum'), ns = $('nextSub'); if (el) el.textContent = '（' + n + '秒）'; if (ns) ns.textContent = 'あと' + n + '秒で自動'; }
}
setInterval(timerLoop, 200);

// ---- 書く（入力欄は静的。描画は表示切りかえ・タイルだけ） ----
var wp = { composing: false, lastCheck: null };
function promptObj(g) { var p = g && g.prompt; return p ? { w: p.w, r: p.r, alts: [], type: p.type } : null; }
function renderWritePanel(v) {
  var g = v.g, show = g.sphase === 'write' && g.me >= 0 && g.me !== g.oya && !myClue(g) && g.wait <= 0;
  var key = v.code + ':' + v.gameNo + ':' + g.turn + ':' + (g.prompt ? g.prompt.w : '') + ':' + g.die + ':' + g.hist.length;
  if (g.sphase === 'write' && key !== ui.writeKey) { ui.writeKey = key; $('inK').value = ''; $('inT').value = ''; $('inK').disabled = $('inT').disabled = false; ui.tilesKey = ''; checkWrite(); if (show && !('ontouchstart' in window)) setTimeout(function () { try { $('inK').focus(); } catch (e) {} }, 50); }
  if (!show && !$('writePanel').hidden) { var a = document.activeElement; if (a === $('inK') || a === $('inT')) a.blur(); }
  $('writePanel').hidden = !show;
  if (show) renderTiles(g);
}
function renderTiles(g) {
  var r = wp.lastCheck, ok = !!(r && r.ok);
  var key = g.tiles.join(',') + ':' + ok + ':' + (pending ? 1 : 0);
  if (key === ui.tilesKey) return; ui.tilesKey = key;
  $('tileRow').innerHTML = g.tiles.map(function (s, i) {
    return s >= 0 ? '<button class="taken" disabled>' + (i + 1) + '<small>' + nm(g, s) + '</small></button>' : '<button data-tile="' + (i + 1) + '" class="' + (ok ? 'go' : '') + '"' + (pending ? ' disabled' : '') + '>' + (i + 1) + '</button>';
  }).join('');
}
function checkWrite() {
  var v = lastView, g = v && v.g; if (!g || !g.prompt) { wp.lastCheck = null; $('wPrev').innerHTML = ''; $('wMsg').innerHTML = ''; return null; }
  var k = $('inK').value, t = $('inT').value, r = L.checkClue(promptObj(g), k, t);
  wp.lastCheck = r;
  var ka = Array.from(r.k), ta = Array.from(r.t), h = '<span class="five">';
  var kBad = r.errors.some(function (e) { return e.code === 'kBan' || e.code === 'kType'; }), tBad = r.errors.some(function (e) { return e.code === 'tBan' || e.code === 'tType'; });
  for (var i = 0; i < 2; i++) h += '<i class="kj' + (ka[i] && kBad ? ' bad' : '') + '">' + esc(ka[i] || '') + '</i>';
  for (var j = 0; j < 3; j++) h += '<i class="kt' + (ta[j] && tBad ? ' bad' : '') + (ta[j] && !tBad && r.warns.length ? ' warn' : '') + '">' + esc(ta[j] || '') + '</i>';
  $('wPrev').innerHTML = h + '</span>';
  var msg = '';
  if (!k && !t) msg = '<span class="g" style="color:inherit;opacity:.7">漢字2つ＋カタカナ3つを入れてね</span>';
  else if (r.ok) msg = '<span class="g">⭕ OK！ 番号をタップして提出</span>' + r.warns.map(function (w) { return '<span class="w">⚠ ' + esc(w.msg) + '</span>'; }).join('');
  else {
    var shown = r.errors.filter(function (e) { return !((e.code === 'kLen' && !k) || (e.code === 'tLen' && !t)); });
    if (!shown.length) shown = r.errors;
    msg = shown.slice(0, 2).map(function (e) { return '<span class="e">✕ ' + esc(e.msg) + '</span>'; }).join('');
  }
  $('wMsg').innerHTML = msg;
  if (lastView && lastView.g) { ui.tilesKey = ''; renderTiles(lastView.g); }
  return r;
}
function kataFix() {
  var el = $('inT'), s = el.value, n = L.toKata(L.nfkc(s)).replace(/\s/g, '');
  if (n !== s) { el.value = n; try { el.setSelectionRange(n.length, n.length); } catch (e) {} }
}
['inK', 'inT'].forEach(function (id) {
  var el = $(id);
  el.addEventListener('compositionstart', function () { wp.composing = true; });
  el.addEventListener('compositionend', function () { wp.composing = false; setTimeout(function () { if (id === 'inT') kataFix(); checkWrite(); }, 0); });
  el.addEventListener('input', function (e) { if (e.isComposing || wp.composing) { checkWrite(); return; } if (id === 'inT') kataFix(); checkWrite(); });
  el.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    if (id === 'inK') $('inT').focus(); else { var r = checkWrite(); if (r && r.ok) { var free = $('tileRow').querySelector('button[data-tile]'); el.blur(); if (free && !('ontouchstart' in window)) free.focus(); } }
  });
});
$('tileRow').addEventListener('click', function (e) {
  var b = e.target.closest('button[data-tile]'); if (!b) return;
  if (wp.composing) { toast('変換を確定してから タップしてね'); return; }
  kataFix(); var r = checkWrite();
  if (!r || !r.ok) { toast(r && r.errors.length ? r.errors[0].msg : '5文字を入れてね'); shake($('writePanel')); return; }
  $('inK').blur(); $('inT').blur();
  act('submit', { k: r.k, t: r.t, tile: +b.dataset.tile });
});

// ---- 答える（親） ----
function renderAnswerPanel(v) {
  var g = v.g, show = g.sphase === 'answer' && g.me === g.oya && g.order.length > 0 && !!g.ans && g.wait <= 0;
  var think = show && g.ans.st === 'think';
  var key = v.code + ':' + v.gameNo + ':' + g.turn + ':' + g.hist.length + ':' + g.ri;
  if (show && key !== ui.ansKey) { ui.ansKey = key; $('inA').value = ''; }
  if (!show && !$('answerPanel').hidden && document.activeElement === $('inA')) $('inA').blur();
  $('answerPanel').hidden = !show;
  $('ansBtn').disabled = $('passBtn').disabled = !think || !!pending;
  $('inA').placeholder = think ? (g.ri + 'つ目：お題は なに？') : 'つぎの5文字を待ってね…';
}
function sendAnswer() {
  var v = lastView; if (!v || !v.g || $('ansBtn').disabled) return;
  var t = $('inA').value; if (!L.norm(t)) { toast('こたえを入力してね'); return; }
  act('guess', t);
}
$('ansBtn').onclick = sendAnswer;
$('passBtn').onclick = function () { if (!$('passBtn').disabled) act('pass'); };
$('inA').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); sendAnswer(); } });

// ---------------- 結果 ----------------
function renderEnd(v) {
  var g = v.g; if (!g) return;
  var rk = L.ranking(g.scores), medal = ['🥇', '🥈', '🥉'];
  $('rankList').innerHTML = rk.map(function (x) {
    return '<div class="rk' + (x.rank === 1 ? ' first' : '') + '"><span class="md">' + (medal[x.rank - 1] || x.rank) + '</span><span class="nm">' + esc(dispName(g.owners[x.p])) + (x.p === g.me ? '（あなた）' : '') + '</span><span class="sc">' + x.score + '</span></div>';
  }).join('');
  $('histList').innerHTML = g.hist.map(function (h) {
    return '<div class="hrow">R' + (h.turn + 1) + '　👑' + nm(g, h.oya) + '　お題「<b>' + esc(h.w) + '</b>」<br>' +
      (h.solved ? '<span class="ok">⭕ ' + (h.i + 1) + 'つ目で正解</span>　' + nm(g, h.p) + '「' + esc(h.clue) + '」　親+' + h.op + '／書いた人+' + h.wp : '<span class="ng">✕ だれも当たらず</span>') + '</div>';
  }).join('') || '<div class="hrow">—</div>';
  var ek = v.code + ':' + v.gameNo;
  if (ui.endKey !== ek) { ui.endKey = ek; confetti(60); }
}
