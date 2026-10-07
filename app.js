/* ごもじでピタリ：流れ・ボタン操作・タイトル・キーボード対応（最後に読み込む） */
'use strict';
// テスト・デバッグ用（render より前に用意しておく）
window.__gp = { view: null, autoplay: false, bgm: function () { return BGM.state(); },
  act: function (a, v) { act(a, v); }, role: function () { return host ? 'host' : client ? 'client' : 'none'; },
  hostRoom: function () { return host ? host.room : null; }, refresh: function () { if (host) hostBroadcast(); } };

// ---- 操作（ホストも参加者も同じ入口） ----
function act(a, val) {
  var v = lastView; if (!v || v.phase !== 'game' || !v.g) return;
  unlockAudio();
  var m = { t: 'act', a: a, v: val, g: v.gameNo, k: v.g.k };
  if (host) { var err = hostAction(1, m); if (err) { toast(err); if (lastView) render(viewFor(1)); } return; }
  var key = a + ':' + m.k + ':' + JSON.stringify(val || '');
  if (pending === key) return;
  if (send(m)) { pending = key; if (lastView) { ui.tilesKey = ''; renderGame(lastView); } setTimeout(function () { if (pending === key) { pending = ''; if (lastView && lastView.phase === 'game') { ui.tilesKey = ''; renderGame(lastView); } } }, 4000); }
}
$('ctrl').addEventListener('click', function (e) {
  var b = e.target.closest('button[data-a]'); if (!b || b.disabled) return;
  act(b.dataset.a, b.dataset.v);
});
$('stageInner').addEventListener('click', function (e) {
  var f = e.target.closest('button[data-foul]');
  if (f) {
    var i = +f.dataset.foul, g = lastView && lastView.g; if (!g) return;
    var c = clueOf(g, g.order[i]);
    confirmBox('反則（お手つき）にしますか？', (c && !c.hidden ? '「' + c.k + c.t + '」' : 'この5文字') + 'はルール違反ですか？ そのお題は終わりになり、同じ親で お題を決め直します（得点なし）。', '🚩 反則にする', function () { act('foul', i); });
    return;
  }
  var b = e.target.closest('button[data-bonus]');
  if (b && host && lastView && lastView.g && lastView.g.solved) { var s = lastView.g.solved, w = b.dataset.bonus; act('bonus', { w: w, on: !(w === 'j' ? s.bj : s.bk) }); }
});

// ---- ホストのロビー操作 ----
$('seatList').addEventListener('click', function (e) {
  var b = e.target.closest('button[data-sid]'); if (!b || !host) return;
  var R = host.room, seat = seatBySid(+b.dataset.sid);
  if (!seat || seat.kind !== 'remote' || R.phase !== 'lobby') return;
  var doRemove = function () {
    var c = host.conns[seat.clientId]; if (c) { try { c.send({ t: 'kicked' }); } catch (x) {} setTimeout(function () { try { c.close(); } catch (x) {} }, 300); delete host.conns[seat.clientId]; }
    R.seats.splice(R.seats.indexOf(seat), 1); hostBroadcast();
  };
  if (seat.connected) confirmBox(seat.name + 'を外しますか？', '部屋から退出させます。', '外す', doRemove); else doRemove();
});
$('cpuList').addEventListener('change', function (e) {
  var s = e.target.closest('select[data-c]'); if (!s || !host || host.room.phase !== 'lobby') return;
  if (LV_KEYS.indexOf(s.value) >= 0) { host.room.opts.lv[+s.dataset.c] = s.value; hostBroadcast(); }
});
function segClick(id, fn) { $(id).addEventListener('click', function (e) { var b = e.target.closest('button[data-v]'); if (!b || b.disabled || !host || host.room.phase !== 'lobby') return; fn(b.dataset.v); hostBroadcast(); }); }
segClick('lvAllSeg', function (v) { host.room.opts.lv = host.room.opts.lv.map(function () { return v; }); });
segClick('npSeg', function (v) { if (+v >= host.room.seats.length) host.room.opts.np = +v; });
segClick('secSeg', function (v) { host.room.opts.sec = +v === 90 ? 90 : 60; });
$('startBtn').onclick = function () { if (host) { unlockAudio(); hostStartGame(); } };
$('againBtn').onclick = function () { if (host && host.room.phase === 'end') hostStartGame(); };
$('toLobbyBtn').onclick = function () { if (host && host.room.phase === 'end') hostToLobby('ロビーに戻りました'); };
function copyUrl() {
  var u = $('inviteUrl').textContent;
  function legacy() { try { var ta = document.createElement('textarea'); ta.value = u; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'; document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, u.length); var ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e) { return false; } }
  var p = navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(u) : Promise.reject();
  p.then(function () { toast('招待URLをコピーしました'); }, function () { toast(legacy() ? '招待URLをコピーしました' : 'URLを長押ししてコピーしてください'); });
}
$('copyBtn').onclick = copyUrl;
$('shareBtn').onclick = function () {
  var data = { title: 'ごもじでピタリ', text: 'いっしょに「ごもじでピタリ」で遊ぼう！ 部屋コード ' + $('codeBig').textContent, url: $('inviteUrl').textContent };
  if (!navigator.share || (navigator.canShare && !navigator.canShare(data))) return copyUrl();
  try { navigator.share(data).catch(function (e) { if (!e || e.name !== 'AbortError') copyUrl(); }); } catch (e) { copyUrl(); }
};

// ---- 退出・メニュー ----
function leaveRoom() {
  if (host) {
    var solo = host.room.solo;
    confirmBox(solo ? 'ゲームをやめますか？' : '部屋を閉じますか？', solo ? 'タイトルに戻ります。' : '参加者全員の接続が切れ、ゲームは終了します。', solo ? 'やめる' : '部屋を閉じる', function () {
      Object.keys(host.conns).forEach(function (cid) { try { host.conns[cid].send({ t: 'closed' }); } catch (e) {} });
      store(LS_HOST, null);
      setTimeout(function () { try { if (host.peer) host.peer.destroy(); } catch (e) {} location.href = location.pathname + location.search.replace(/([?&])room=[^&]*/, '$1'); }, 300);
    });
  } else confirmBox('部屋を出ますか？', 'ゲーム中に出た場合も、同じニックネームで入り直せば元の席に戻れます。', '部屋を出る', function () { sstore(SS_CLIENT, null); leaveClient(true); });
}
$('leaveBtn1').onclick = $('leaveBtn2').onclick = leaveRoom;
$('menuBtn').onclick = function () { overlay('menuModal', true); };
function confirmAbort() {
  confirmBox('中断してロビーに戻りますか？', 'いまのゲームを終了して、全員をこの部屋のロビーに戻します。部屋コード・参加者・設定はそのままです。', '中断してロビーへ', function () {
    if (host && host.room.phase !== 'lobby') hostToLobby('⏸️ ホストがゲームを中断しました');
  });
}
$('menuAbort').onclick = function () { overlay('menuModal', false); confirmAbort(); };
$('menuReq').onclick = function () { overlay('menuModal', false); if (send({ t: 'lobbyReq' })) toast('ホストに「ロビーに戻りたい」と伝えました'); };
$('menuLeave').onclick = function () { overlay('menuModal', false); leaveRoom(); };
$('menuRules').onclick = function () { overlay('menuModal', false); overlay('rulesModal', true); };
$('menuClose').onclick = function () { overlay('menuModal', false); };
$('lobbyReqBar').addEventListener('click', function (e) {
  var b = e.target.closest('button[data-lr]'); if (!b || !host) return;
  if (b.dataset.lr === 'no') { host.room.lobbyReq = null; hostBroadcast(); } else confirmAbort();
});

// ---------------- タイトル ----------------
function renderTitle() {
  if (!$('nameIn').value) $('nameIn').value = load(LS_NAME) || '';
  var inv = normCode(Q.get('room'));
  $('inviteJoinBox').style.display = inv.length === 4 ? '' : 'none';
  $('invCode').textContent = inv;
  if (inv.length === 4) $('codeIn').value = inv;
  var saved = load(LS_HOST, true), ok = saved && saved.room && Date.now() - saved.saved < 12 * 3600 * 1000;
  $('resumeBtn').style.display = ok ? '' : 'none';
  if (ok) $('resumeBtn').textContent = saved.room.solo ? '前回のふーさんとのゲームを再開する' : '前回の部屋（' + saved.room.code + '）を再開する';
  var joined = sload(SS_CLIENT);
  $('rejoinBtn').style.display = joined ? '' : 'none';
  if (joined) $('rejoinBtn').textContent = '部屋 ' + joined.code + ' に戻る（' + joined.name + '）';
}
function getName(optional) {
  var n = cleanName($('nameIn').value);
  if (!n) { if (optional) return 'あなた'; toast('ニックネームを入力してください'); $('nameIn').focus(); return null; }
  store(LS_NAME, n); return n;
}
$('createBtn').onclick = function () { var n = getName(); if (n) { unlockAudio(); store(LS_HOST, null); startHost(n, null, false); } };
$('soloBtn').onclick = function () { var n = getName(true); unlockAudio(); store(LS_HOST, null); startHost(n, null, true); };
$('resumeBtn').onclick = function () {
  var saved = load(LS_HOST, true); if (!saved) return; unlockAudio();
  startHost(saved.room.seats[0].name, saved.room, saved.room.solo); host.resuming = true;
};
function join(code) {
  var n = getName(); if (!n) return;
  code = normCode(code);
  if (code.length !== 4) { toast('4文字の部屋コードを入力してください'); return; }
  unlockAudio(); startClient(code, n);
}
$('joinBtn').onclick = function () { join($('codeIn').value); };
$('joinInvitedBtn').onclick = function () { join(Q.get('room')); };
$('rejoinBtn').onclick = function () { var j = sload(SS_CLIENT); if (j) { $('nameIn').value = j.name; unlockAudio(); startClient(j.code, j.name); } };
$('codeIn').addEventListener('input', function () { this.value = normCode(this.value); });
if (location.protocol === 'file:') setTimeout(function () { toast('ファイルを直接開いています。招待URLは公開URL（https）でのみ使えます。'); }, 500);

// ---- iPhone のキーボード：見えている範囲（visualViewport）にゲーム画面を合わせる ----
function vvUpdate() {
  var vv = window.visualViewport, root = document.documentElement;
  if (!vv) return;
  var h = Math.round(vv.height), top = Math.round(vv.offsetTop);
  var typing = /^(INPUT|TEXTAREA)$/.test((document.activeElement || {}).tagName || '') && document.body.classList.contains('in-game');
  var kb = typing && (window.innerHeight - h > 120);
  root.style.setProperty('--vvh', kb ? h + 'px' : '100%');
  root.style.setProperty('--vvtop', kb ? top + 'px' : '0px');
  document.body.classList.toggle('kb', kb);
  if (window.scrollY || document.documentElement.scrollTop) window.scrollTo(0, 0);
}
if (window.visualViewport) { visualViewport.addEventListener('resize', vvUpdate); visualViewport.addEventListener('scroll', vvUpdate); }
document.addEventListener('focusin', function () { setTimeout(vvUpdate, 60); setTimeout(vvUpdate, 350); });
document.addEventListener('focusout', function () { setTimeout(vvUpdate, 60); setTimeout(vvUpdate, 350); });
window.addEventListener('scroll', function () { if (window.scrollY) window.scrollTo(0, 0); });

// ---- ページ全体の引っぱり（バウンス・プルで閉じる・プルで再読み込み）を止める ----
var touch0 = null;
document.addEventListener('touchstart', function (e) { if (e.touches.length === 1) touch0 = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
document.addEventListener('touchmove', function (e) {
  if (!e.cancelable) return;
  if (e.touches.length > 1) { e.preventDefault(); return; }
  if (!touch0) return;
  var t = e.touches[0], dx = t.clientX - touch0.x, dy = t.clientY - touch0.y, ax = Math.abs(dx), ay = Math.abs(dy);
  if (!ax && !ay) return;
  for (var el = e.target; el && el.nodeType === 1 && el !== document.body; el = el.parentElement) {
    var cs = getComputedStyle(el);
    var canV = ay >= ax * 0.5 && /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1 && ((dy > 0 && el.scrollTop > 0) || (dy < 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1));
    var canH = ax >= ay * 0.5 && /(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1 && ((dx > 0 && el.scrollLeft > 0) || (dx < 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1));
    if (canV || canH) return;
  }
  e.preventDefault();
}, { passive: false });

// テスト用：自動でプレイ（window.__gp.autoplay = true）。親として答えるときは、見えている5文字だけで ふーさんと同じ考え方を使う
setInterval(function () {
  var v = lastView; if (!window.__gp.autoplay || !v || v.phase !== 'game' || !v.g || pending) return;
  var g = v.g, me = g.me; if (me < 0 || g.wait > 0) return;
  if (g.sphase === 'choose' && me === g.oya) { var b = $('ctrl').querySelector('button[data-a="type"]'); if (b) b.click(); }
  else if (g.sphase === 'roll' && me === g.roller) { var r = $('ctrl').querySelector('button[data-a="roll"]'); if (r) r.click(); }
  else if (g.sphase === 'write' && !$('writePanel').hidden && g.prompt) {
    var p = L.ALL.filter(function (x) { return x.w === g.prompt.w && !x.decoy; })[0]; if (!p) return;
    var used = {}; g.clues.forEach(function (c) { if (!c.hidden) used[c.k + c.t] = 1; });
    var c = p.clues.filter(function (x) { return !used[x.k + x.t]; })[me % 2] || p.clues[0];
    $('inK').value = c.k; $('inT').value = L.toHira(c.t); kataFix(); checkWrite();
    var t = $('tileRow').querySelector('button[data-tile]'); if (t) t.click();
  } else if (g.sphase === 'answer' && me === g.oya && g.ans && g.ans.st === 'think' && !$('ansBtn').disabled) {
    var clues = g.order.slice(0, g.ri).map(function (q) { return clueOf(g, q); }).filter(function (x) { return x && !x.hidden; });
    var ex = g.guesses.filter(function (x) { return !x.pass; }).map(function (x) { return x.text; });
    var res = L.cpuGuess(g.type, clues, ex, 'normal', 1);
    if (res.pass) $('passBtn').click(); else { $('inA').value = res.text; $('ansBtn').click(); }
  }
}, TURBO ? 150 : 600);
renderTitle();
