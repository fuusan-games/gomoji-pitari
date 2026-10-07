/* ごもじでピタリ：効果音（Web Audio で合成。外部音源なし） */
'use strict';
var audioCtx = null;
function unlockAudio() {
  try {
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    if (!audioCtx) { audioCtx = new AC(); audioCtx.onstatechange = function () { BGM.sync(); }; }
    if (audioCtx.state === 'suspended') audioCtx.resume().then(function () { BGM.sync(); }, function () {}); else BGM.sync();
  } catch (e) {}
}
document.addEventListener('pointerdown', unlockAudio, { passive: true });
function noiseSrc(a, sec) { var len = Math.floor(a.sampleRate * sec), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0); for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; var n = a.createBufferSource(); n.buffer = buf; return n; }
function env(g, at, peak, atk, rel) { g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(peak, at + atk); g.gain.exponentialRampToValueAtTime(0.0001, at + atk + rel); }
var sfx = (function () {
  function ctx() { var a = audioCtx; return a && a.state === 'running' && !soundOff ? a : null; }
  function out(a, v) { var g = a.createGain(); g.gain.value = v; g.connect(a.destination); return g; }
  function tone(a, o, f, at, dur, type, vol) { var x = a.createOscillator(), g = a.createGain(); x.type = type || 'sine'; x.frequency.value = f; env(g, at, vol, 0.008, dur); x.connect(g); g.connect(o); x.start(at); x.stop(at + dur + 0.05); return x; }
  function click(a, o, at, f, vol) { var n = noiseSrc(a, 0.05), bp = a.createBiquadFilter(), g = a.createGain(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 4; env(g, at, vol, 0.002, 0.04); n.connect(bp); bp.connect(g); g.connect(o); n.start(at); n.stop(at + 0.05); }
  return {
    // 残り10秒のカチカチ（残り5秒からは高く・2回）
    tick: function (hot) { var a = ctx(); if (!a) return; var t = a.currentTime, o = out(a, 0.4); click(a, o, t, hot ? 3200 : 2200, 0.7); tone(a, o, hot ? 1760 : 1175, t, 0.07, 'square', hot ? 0.09 : 0.05); if (hot) { click(a, o, t + 0.16, 3200, 0.5); } },
    timeup: function () { var a = ctx(); if (!a) return; var t = a.currentTime, o = out(a, 0.35); [0, 0.18, 0.36].forEach(function (d) { tone(a, o, 880, t + d, 0.14, 'square', 0.18); }); tone(a, o, 660, t + 0.56, 0.5, 'square', 0.18); },
    die: function () { var a = ctx(); if (!a) return; var t = a.currentTime, o = out(a, 0.4); for (var i = 0; i < 7; i++) click(a, o, t + i * 0.07 + Math.random() * 0.03, 900 + Math.random() * 900, 0.8 - i * 0.08); tone(a, o, 523, t + 0.55, 0.12, 'triangle', 0.25); tone(a, o, 784, t + 0.64, 0.25, 'triangle', 0.25); },
    flip: function () { var a = ctx(); if (!a) return; var t = a.currentTime, o = out(a, 0.35), n = noiseSrc(a, 0.18), bp = a.createBiquadFilter(), g = a.createGain(); bp.type = 'bandpass'; bp.Q.value = 1.2; bp.frequency.setValueAtTime(900, t); bp.frequency.exponentialRampToValueAtTime(4200, t + 0.12); env(g, t, 0.6, 0.01, 0.13); n.connect(bp); bp.connect(g); g.connect(o); n.start(t); n.stop(t + 0.18); tone(a, o, 1400, t + 0.1, 0.06, 'triangle', 0.2); },
    tile: function () { var a = ctx(); if (!a) return; var t = a.currentTime, o = out(a, 0.35); click(a, o, t, 1500, 0.9); tone(a, o, 988, t + 0.02, 0.12, 'sine', 0.3); tone(a, o, 1318, t + 0.09, 0.2, 'sine', 0.25); },
    correct: function () { var a = ctx(); if (!a) return; var t = a.currentTime, o = out(a, 0.3); [523, 659, 784, 1046].forEach(function (f, i) { tone(a, o, f, t + i * 0.08, 0.35, 'triangle', 0.35); }); tone(a, o, 1318, t + 0.34, 0.6, 'sine', 0.2); },
    wrong: function () { var a = ctx(); if (!a) return; var t = a.currentTime, o = out(a, 0.3); tone(a, o, 311, t, 0.22, 'square', 0.16); tone(a, o, 233, t + 0.2, 0.4, 'square', 0.16); },
    foul: function () { var a = ctx(); if (!a) return; var t = a.currentTime, o = out(a, 0.3); [0, 0.12, 0.24].forEach(function (d) { tone(a, o, 1568, t + d, 0.08, 'square', 0.12); }); },
    pop: function () { var a = ctx(); if (!a) return; var t = a.currentTime, o = out(a, 0.3); var x = a.createOscillator(), g = a.createGain(); x.frequency.setValueAtTime(500, t); x.frequency.exponentialRampToValueAtTime(1600, t + 0.12); env(g, t, 0.35, 0.005, 0.15); x.connect(g); g.connect(o); x.start(t); x.stop(t + 0.2); },
    turn: function () { var a = ctx(); if (!a) return; var t = a.currentTime, o = out(a, 0.2); tone(a, o, 988, t, 0.18, 'sine', 0.35); tone(a, o, 1318, t + 0.1, 0.25, 'sine', 0.3); },
    fanfare: function () { var a = ctx(); if (!a) return; var t = a.currentTime, o = out(a, 0.3); [[523, 0], [523, 0.12], [523, 0.24], [659, 0.36], [784, 0.6], [659, 0.78], [784, 0.9], [1046, 1.05]].forEach(function (n) { tone(a, o, n[0], t + n[1], n[1] >= 1 ? 0.8 : 0.18, 'triangle', 0.3); }); }
  };
})();
function setSound(off) {
  soundOff = off; store(LS_SOUND, off ? '1' : null);
  if (!off) unlockAudio();
  BGM.sync(); soundUi();
}
function soundUi() { $('soundBtn').textContent = soundOff ? '🔇' : '🔊'; $('soundBtn').setAttribute('aria-label', soundOff ? '音をオンにする' : '音をオフにする'); $('menuSound').textContent = soundOff ? '🔇 BGM・効果音：オフ' : '🔊 BGM・効果音：オン'; }
$('soundBtn').onclick = function () { setSound(!soundOff); toast(soundOff ? '🔇 音をオフにしました' : '🔊 音をオンにしました'); };
$('menuSound').onclick = function () { setSound(!soundOff); };
soundUi();
