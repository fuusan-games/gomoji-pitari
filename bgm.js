/* ごもじでピタリ：BGM（Web Audio で合成・オリジナル）
 * calm：考えるとき用のおだやかなループ（C長調・96BPM）。書く時間の残り10秒は 小さくして カチカチ音を聞こえやすく
 */
'use strict';
function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
var TRACKS = {
  calm: { bpm: 96, vol: 1.1,
    chords: [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50], [48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]],
    mel: [[[0, 76, 2], [2, 79, 2], [4, 81, 4], [8, 79, 4], [12, 76, 4]], [[0, 74, 2], [2, 76, 2], [4, 72, 8], [12, 69, 4]], [[0, 72, 4], [4, 74, 2], [6, 76, 2], [8, 77, 4], [12, 76, 4]], [[0, 74, 6], [6, 71, 2], [8, 67, 8]],
      [[0, 79, 2], [2, 81, 2], [4, 84, 4], [8, 83, 2], [10, 81, 2], [12, 79, 4]], [[0, 76, 4], [4, 72, 4], [8, 74, 2], [10, 76, 2], [12, 72, 4]], [[0, 77, 2], [2, 76, 2], [4, 74, 4], [8, 72, 4], [12, 69, 4]], [[0, 71, 4], [4, 74, 4], [8, 72, 8]]],
    step: function (A, bar, st, t, d) {
      var ch = this.chords[bar];
      if (st === 0 || st === 8) A.kick(t, 0.16, 100);
      if (st % 4 === 2) A.hat(t, 0.016);
      if (st === 0 || st === 8) A.tone(t, mtof(ch[0] - 12), d * 6, 'triangle', 0.16, 0.01);
      if (st % 2 === 0) A.tone(t, mtof(ch[[0, 1, 2, 1][(st / 2) % 4]] + 12), d * 1.6, 'sine', 0.04, 0.005);
      this.mel[bar].forEach(function (n) { if (n[0] === st) { A.tone(t, mtof(n[1] - 12), d * n[2] * 0.95, 'sine', 0.07, 0.006); A.tone(t, mtof(n[1]), d * 1.2, 'triangle', 0.014, 0.004); } });
    } }
};
var BGM = (function () {
  var cur = null, wanted = null, bus = null, timer = null, nextT = 0, stepN = 0, noiseBuf = null, analyser = null, master = null, duck = 1;
  function ctx() { return audioCtx; }
  function out() {
    var a = ctx();
    if (!master) { master = a.createGain(); master.gain.value = 1.0; var comp = a.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4; analyser = a.createAnalyser(); analyser.fftSize = 512; master.connect(comp); comp.connect(analyser); analyser.connect(a.destination); }
    return master;
  }
  function nb() { var a = ctx(); if (!noiseBuf) { var len = a.sampleRate * 0.5; noiseBuf = a.createBuffer(1, len, a.sampleRate); var d = noiseBuf.getChannelData(0); for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; } return noiseBuf; }
  var A = {
    tone: function (t, f, dur, type, vol, atk) {
      var a = ctx(), o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + atk); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(atk + 0.02, dur));
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
    },
    kick: function (t, vol, f0) { var a = ctx(), o = a.createOscillator(), g = a.createGain(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.16); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.25); },
    hat: function (t, vol) { var a = ctx(), n = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); n.buffer = nb(); f.type = 'highpass'; f.frequency.value = 7000; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04); n.connect(f); f.connect(g); g.connect(bus); n.start(t, Math.random() * 0.4); n.stop(t + 0.05); }
  };
  function tick() {
    var a = ctx(), tr = TRACKS[cur]; if (!a || !tr) return;
    var d = 60 / tr.bpm / 4;
    if (nextT < a.currentTime - 0.05) nextT = a.currentTime + 0.05;
    while (nextT < a.currentTime + 0.2) { var st = stepN % 16, bar = Math.floor(stepN / 16) % 8; try { tr.step(A, bar, st, nextT, d); } catch (e) {} nextT += d; stepN++; }
  }
  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    if (bus) { var b = bus, a = ctx(); try { b.gain.cancelScheduledValues(a.currentTime); b.gain.setTargetAtTime(0.0001, a.currentTime, 0.25); } catch (e) {} setTimeout(function () { try { b.disconnect(); } catch (e) {} }, 1500); bus = null; }
    cur = null;
  }
  function start(name) {
    var a = ctx(); stop(); cur = name;
    bus = a.createGain(); bus.gain.setValueAtTime(0.0001, a.currentTime); bus.gain.linearRampToValueAtTime(TRACKS[name].vol * duck, a.currentTime + 2);
    bus.connect(out()); stepN = 0; nextT = a.currentTime + 0.1; tick(); timer = setInterval(tick, 40);
  }
  var api = {
    want: function (name) { wanted = name; api.sync(); },
    duck: function (v) { if (v === duck) return; duck = v; if (bus && cur) { try { bus.gain.setTargetAtTime(TRACKS[cur].vol * v, ctx().currentTime, 0.3); } catch (e) {} } },
    sync: function () {
      var a = ctx(), target = wanted;
      if (soundOff || document.hidden || !a || a.state !== 'running') target = null;
      if (target === cur) return;
      if (target) start(target); else stop();
    },
    state: function () { return { cur: cur, wanted: wanted, off: soundOff, ctx: ctx() ? ctx().state : 'none' }; },
    level: function () { if (!analyser) return 0; var buf = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(buf); var s = 0; for (var i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return Math.sqrt(s / buf.length); }
  };
  return api;
})();
document.addEventListener('visibilitychange', function () { BGM.sync(); });
