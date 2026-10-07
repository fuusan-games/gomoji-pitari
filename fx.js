/* ごもじでピタリ：演出（紙ふぶき・得点ポップ・ふるえ） */
'use strict';
function confetti(n) {
  var cols = ['#f08c00', '#e8590c', '#2f9e44', '#1c7ed6', '#ae3ec9', '#ffd43b'];
  for (var i = 0; i < n; i++) {
    var c = document.createElement('i'); c.className = 'confetti'; c.style.left = Math.random() * 100 + 'vw'; c.style.background = cols[i % cols.length];
    c.style.animationDuration = (1.6 + Math.random() * 1.6) + 's'; c.style.animationDelay = (Math.random() * 0.4) + 's'; document.body.appendChild(c);
    setTimeout(function (x) { return function () { x.remove(); }; }(c), 3800);
  }
}
function vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }
// プレイヤー札の上に「+20」をふわっと出す
function scorePop(p, pts, delay) {
  setTimeout(function () {
    var chip = document.querySelector('#chips .chip[data-p="' + p + '"]'); if (!chip) return;
    var r = chip.getBoundingClientRect(), el = document.createElement('div');
    el.className = 'spop'; el.textContent = '+' + pts; el.style.left = (r.left + r.width / 2) + 'px'; el.style.top = (r.top + r.height * 0.3) + 'px';
    document.body.appendChild(el); chip.classList.remove('gain'); void chip.offsetWidth; chip.classList.add('gain'); sfx.pop();
    setTimeout(function () { el.remove(); }, 1500);
  }, delay || 0);
}
function shake(el) { if (!el) return; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
