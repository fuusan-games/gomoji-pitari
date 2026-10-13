/* ごもじでピタリ：共通の定数・小道具・汎用UI（ほかのスクリプトより先に読み込む）
 * 構成：WebRTC（PeerJS）による P2P。ホストのブラウザが唯一の正（authoritative）で、お題・進行・ふーさん🐻の思考はホストが行います。
 * 親の端末には、答え合わせが終わるまで お題のデータそのものが届きません（viewFor で除外）。
 */
'use strict';
var $ = function (id) { return document.getElementById(id); };
var L = window.GP;
var Q = new URLSearchParams(location.search);
var CFG = window.GP_CONFIG || window.SR_CONFIG || {};
var ICE = (CFG.iceServers && CFG.iceServers.length) ? CFG.iceServers : [{ urls: 'stun:stun.l.google.com:19302' }];
if (Q.get('ice')) ICE = Q.get('ice').split(',').map(function (u) { return { urls: u }; });   // テスト・独自環境用
var PEER_OPTS = Object.assign({ debug: 1, config: { iceServers: ICE } }, CFG.peer || {});
var ID_PREFIX = 'gomoji-pitari-v1-', CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
var TURBO = Q.has('turbo');
// 時間（ミリ秒）。turbo はテスト用の早回し（書く時間は ?wsec= で上書き可）
var T = TURBO
  ? { k: 0.12, choose: 300, roll: 300, ready: 700, flip: 300, judged: 500, judgedLong: 1500, afterWrite: 500, result: 2600, foul: 900, over: 900, off: 1500, writeSec: 20 }
  : { k: 1, choose: 2200, roll: 1600, ready: 2600, flip: 1300, judged: 2300, judgedLong: 4200, afterWrite: 1400, result: 15000, foul: 3500, over: 2600, off: 9000, writeSec: 60 };
if (+Q.get('wsec') > 0) T.writeSec = +Q.get('wsec');
var MAX_HUMANS = 6, MIN_PLAYERS = 3, MAX_PLAYERS = 6, HB_MS = 3000, LOST_MS = 10000;
var LV = { slow: '🐢ゆっくり', normal: '🐻ふつう', fast: '⚡はやい' };
var LV_KEYS = ['slow', 'normal', 'fast'];
var BEAR = '🐻', CPU_BASE = 'ふーさん' + BEAR;
var TYPE_NAME = { kata: 'カタカナ', kanji: '漢字' };
var LS_ID = 'gp-client-id', LS_NAME = 'gp-name', LS_HOST = 'gp-host-room', SS_CLIENT = 'gp-joined', LS_SOUND = 'gp-sound-off';
// 画面間で共有する状態
var host = null, client = null, lastView = null, pending = '';
function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {} }
function load(k, json) { try { var v = localStorage.getItem(k); return json ? JSON.parse(v) : v; } catch (e) { return null; } }
function sstore(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function sload(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } }
function rid(n) { var s = ''; for (var i = 0; i < n; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]; return s; }
var myId = load(LS_ID) || (function () { var v = rid(16); store(LS_ID, v); return v; })();
var soundOff = load(LS_SOUND) === '1';
function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function rand(a) { return a[0] + Math.random() * (a[1] - a[0]); }
function cleanName(n) { return String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 8); }
var PARTY = window.FuuParty && window.FuuParty.info;   // ひろばの「みんなの部屋」から来たとき
function genCode() { if (PARTY && PARTY.host) return PARTY.code; var c = ''; for (var i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return c; }
function normCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/I/g, '1').slice(0, 4); }
function inviteUrl(code) { var u = location.origin + location.pathname + '?room=' + code; if (Q.get('ice')) u += '&ice=' + encodeURIComponent(Q.get('ice')); return u; }
function fill(t, o) { return t.replace(/\{(\w+)\}/g, function (_, k) { return o[k] != null ? o[k] : ''; }); }
// 5文字の見た目（漢字2マス＋カタカナ3マス）
function clueHtml(k, t, cls) {
  var ka = Array.from(k || ''), ta = Array.from(t || ''), h = '<span class="five' + (cls ? ' ' + cls : '') + '">';
  for (var i = 0; i < 2; i++) h += '<i class="kj">' + esc(ka[i] || '') + '</i>';
  for (var j = 0; j < 3; j++) h += '<i class="kt">' + esc(ta[j] || '') + '</i>';
  return h + '</span>';
}

// ---------- 汎用UI ----------
function show(id) { ['title', 'lobby', 'game', 'end'].forEach(function (s) { $(s).classList.toggle('active', s === id); }); document.body.classList.toggle('in-game', id === 'game'); }
function overlay(id, on) { $(id).classList.toggle('active', on); }
var toastT;
function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 3000); }
function banner(msg) { var b = $('banner'); b.textContent = msg || ''; b.classList.toggle('show', !!msg); }
function confirmBox(title, text, yes, cb) {
  $('cfTitle').textContent = title; $('cfText').textContent = text; $('cfYes').textContent = yes; $('cfNo').style.display = '';
  overlay('confirmModal', true);
  $('cfYes').onclick = function () { overlay('confirmModal', false); cb(); };
  $('cfNo').onclick = function () { overlay('confirmModal', false); };
}
function alertBox(msg) { confirmBox('お知らせ', msg, 'OK', function () {}); $('cfNo').style.display = 'none'; }
function connecting(on, title, text, onCancel) {
  overlay('connecting', on);
  if (on) { $('connTitle').textContent = title || '接続中…'; $('connText').textContent = text || ''; $('connCancel').onclick = onCancel || function () { location.href = location.pathname; }; }
}
$('rulesBtn1').onclick = $('rulesBtn2').onclick = function () { overlay('rulesModal', true); };
$('rulesClose').onclick = function () { overlay('rulesModal', false); };
['rulesModal', 'menuModal'].forEach(function (id) { $(id).addEventListener('click', function (e) { if (e.target === this) overlay(id, false); }); });
$('rulesList').innerHTML = [
  '3〜6人（空いた席は <b>ふーさん🐻</b>）。<b>人数と同じ回数</b>だけ親を交代して遊びます。親は「当てる人」、ほかの全員が「書く人」です。',
  '親が <b>カタカナ</b> か <b>漢字</b> のカードを選びます。親の<b>次の席の人</b>が🎲サイコロをふり、出た目のお題に決まります。<b>親の画面には お題は出ません</b>（スマホを伏せなくてOK）。',
  '書く人は <b>60秒</b>で、お題を ' + clueHtml('漢字', 'カタカ', 'mini') + ' <b>漢字2文字＋カタカナ3文字</b> の5文字で言いかえます。例：お題「消防士」→ ' + clueHtml('鎮火', 'ホース', 'mini') + '（カタカナは外来語でなくてもOK。「ー」や小さい字も1文字）。',
  '<b>使えない字</b>：お題に入っている<b>漢字</b>と、お題の読みの<b>連続するカタカナ3文字</b>。例：「消防士（ショウボウシ）」なら「消」「防」「士」や「ショウ」「ボウシ」はダメ。画面で自動チェックします。',
  '書けたら <b>番号タイル</b>（1〜5）を早いもの順で取ると提出。全員出すか60秒たったら おしまい。間に合わなかった人は発表なし。',
  '番号の小さい順に5文字を1つずつ見せ、親はそのたびに <b>1回</b> 答えます（パスもOK）。正解ならそこで終わり、はずれなら次の5文字へ。全部はずれたら、だれも得点なし。',
  '<b>得点</b>　親：1つ目で正解 <b>30点</b>／2つ目 <b>20点</b>／3つ目以降 <b>10点</b>。当てられた5文字を書いた人：<b>10点</b>＋漢字が<b>二字熟語</b>なら＋10＋カタカナが<b>カタカナ言葉</b>なら＋10（最大30点）。ボーナスは目安を自動で付け、ホストが切りかえられます。',
  '<b>反則（お手つき）</b>：めくられた5文字がルール違反なら、親以外の人が🚩で指摘できます。そのお題は終わりで、同じ親のまま お題を決め直します。',
  '自動判定で×でも、意味が合っていれば親以外の人が <b>⭕正解にする</b> で正解にできます（例：表記ゆれ）。',
  '全員が1回ずつ親をしたら終了。合計点がいちばん高い人の勝ち！（同点は同じ順位）'
].map(function (t) { return '<li>' + t + '</li>'; }).join('');
$('titleFive').innerHTML = clueHtml('白黒', 'ベアー') + '<span class="eq">→</span><span class="ans">？</span>';
