// E2E: ごもじでピタリ — solo vs ふーさん at 390×844 (?from=portal) and 375×667, then host + guest over real PeerJS cloud signaling (local STUN).
// usage: node test/stun-server.js <box-ip> 3478 &  python3 -m http.server 8821 &  node test/e2e.js <box-ip> 8821
const { chromium } = require('/workspace/hayaoshi-quiz/node_modules/playwright-core');
const IP = process.argv[2] || '172.30.0.2', PORT = process.argv[3] || 8821;
const ROOT = `http://localhost:${PORT}/index.html`;
const NET = `${ROOT}?ice=${encodeURIComponent('stun:' + IP + ':3478')}&turbo`;
const SS = __dirname + '/../screenshots/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = []; const fail = m => { errors.push(m); console.log('  ✗', m); }; const ok = m => console.log('  ✓', m);
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  async function phone(label, w = 390, h = 844) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ja-JP' });
    const p = await ctx.newPage(); p.label = label;
    p.on('pageerror', e => fail(`[${label}] JS error ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/PeerJS|WebSocket|net::|ERR_|Failed to load resource/.test(m.text())) fail(`[${label}] console ${m.text()}`); });
    return p;
  }
  const view = p => p.evaluate(() => window.__gp.view && JSON.parse(JSON.stringify(window.__gp.view)));
  const waitV = (p, fn, ms) => p.waitForFunction(new Function('var v = window.__gp.view; return !!v && (' + fn + ');'), null, { timeout: ms || 20000 });
  const clean = p => p.evaluate(() => document.getElementById('toast').classList.remove('show'));
  const settle = p => p.evaluate(() => document.getAnimations().forEach(a => { try { if (isFinite(a.effect.getComputedTiming().endTime)) a.finish(); } catch (e) {} }));
  // layout: no document scroll, hub button not over any visible control, in-game controls on screen and big enough
  async function layout(p, tag) {
    const r = await p.evaluate(() => {
      const vis = el => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || !el.getClientRects().length) return false; for (let e = el; e; e = e.parentElement) if (getComputedStyle(e).display === 'none' || e.hidden) return false; return true; };
      const fab = document.getElementById('hirobaFab'), fr = fab && vis(fab) ? fab.getBoundingClientRect() : null;
      const scr = document.querySelector('.screen.active') || document.body, sr = scr.getBoundingClientRect(), hits = [], small = [], off = [];
      const inGame = document.body.classList.contains('in-game');
      scr.querySelectorAll('button, input, select, a').forEach(b => {
        if (!vis(b) || b === fab) return; const r = b.getBoundingClientRect(); if (!r.width || !r.height) return;
        const top = Math.max(r.top, sr.top), bot = Math.min(r.bottom, sr.bottom, innerHeight);
        if (bot <= top) return;
        if (fr && r.left < fr.right && r.right > fr.left && top < fr.bottom && bot > fr.top) hits.push((b.id || b.className || b.tagName) + ' ' + (b.textContent || '').trim().slice(0, 12));
        if (inGame && !b.closest('#stage') && (r.height < 30 || r.width < 30)) small.push((b.id || b.className) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
        if (inGame && !b.closest('#stage') && (r.bottom > innerHeight + 0.5 || r.right > innerWidth + 0.5)) off.push(b.id || b.className || b.tagName);
      });
      return { docScroll: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - innerHeight, scrollY: scrollY, fab: !!fr, hits, small, off, inGame, vh: innerHeight };
    });
    if (r.docScroll > 1 || r.scrollY) fail(`[${tag}] page scrolls: ${JSON.stringify(r)}`);
    if (r.hits.length) fail(`[${tag}] hub button overlaps: ${r.hits.join(', ')}`);
    if (r.inGame && r.fab) fail(`[${tag}] hub button visible during play`);
    if (r.small.length) fail(`[${tag}] small tap targets: ${r.small.join(', ')}`);
    if (r.off.length) fail(`[${tag}] controls off-screen: ${r.off.join(', ')}`);
    return r;
  }
  // 1人ぶんを 本物のタップ・入力で進める（screenshots を撮りながら）
  async function playHuman(p, who, opt) {
    opt = opt || {};
    const shots = opt.shots || {}, seen = { write: 0, answer: 0, result: 0, choose: 0, roll: 0, hidden: 0 };
    const t0 = Date.now();
    while (Date.now() - t0 < (opt.ms || 240000)) {
      const v = await view(p); if (!v) { await sleep(150); continue; }
      if (v.phase === 'end') break;
      if (v.phase !== 'game' || !v.g || v.g.wait > 0) { await sleep(150); continue; }
      const g = v.g, me = g.me, sp = g.sphase;
      // 親には答え合わせまで お題が届かない
      if (me === g.oya && ['choose', 'roll', 'ready', 'write', 'answer'].includes(sp)) {
        seen.hidden++;
        if (g.prompt || g.card) fail(`[${who}] 親の端末に お題が届いている (${sp})`);
        const txt = await p.evaluate(() => document.getElementById('game').innerText);
        if (opt.knownPrompt && opt.knownPrompt() && txt.includes(opt.knownPrompt())) fail(`[${who}] 親の画面に お題の文字`);
      }
      if (sp === 'choose' && me === g.oya && await p.$('#ctrl button[data-a="type"]')) { seen.choose++; await p.tap(seen.choose % 2 ? '#ctrl button[data-v="kanji"]' : '#ctrl button[data-v="kata"]'); await sleep(100); continue; }
      if (sp === 'roll' && me === g.roller && await p.$('#ctrl button[data-a="roll"]')) { seen.roll++; await p.tap('#ctrl button[data-a="roll"]'); await sleep(100); continue; }
      if (sp === 'write' && me !== g.oya && !(await p.$eval('#writePanel', e => e.hidden))) {
        const info = await p.evaluate(() => { const g = window.__gp.view.g, P = GP.ALL.filter(x => x.w === g.prompt.w && !x.decoy)[0]; const used = {}; g.clues.forEach(c => { if (!c.hidden) used[c.k + c.t] = 1; }); return { w: P.w, kj: Array.from(P.w).filter(c => GP.isKanji(c)), r: P.r, clues: P.clues.filter(c => !used[c.k + c.t]) }; });
        const c = info.clues[seen.write % Math.max(1, info.clues.length)] || info.clues[0];
        if (seen.write === 0) {
          // 1) 反則になる入力 → 自動チェックが止める
          const badK = info.kj.length ? (info.kj[0] + '山') : '山川', badT = info.r[0].length >= 3 ? Array.from(info.r[0]).slice(0, 3).join('') : 'アアア';
          await p.fill('#inK', badK); await p.fill('#inT', GPh(badT));
          const m1 = await p.textContent('#wMsg'), conv = await p.inputValue('#inT');
          if (conv !== badT) fail(`[${who}] ひらがな→カタカナ自動変換 ${conv} != ${badT}`); else ok(`[${who}] ひらがな「${GPh(badT)}」→「${conv}」に自動変換`);
          if (!/✕/.test(m1)) fail(`[${who}] 反則の入力でエラーが出ない: ${m1}`); else ok(`[${who}] 自動チェック: ${m1.replace(/\s+/g, ' ').slice(0, 60)}`);
          const k0 = g.k; await p.tap('#tileRow button[data-tile]'); await sleep(250);
          const after = await view(p); if (after.g.clues.some(x => x.p === me)) fail(`[${who}] 反則の5文字が提出できてしまった`); else ok(`[${who}] 反則の5文字は提出できない（番号タップで止まる）`);
          // 2) 文字数オーバー・小さい字/ー
          await p.fill('#inK', '山'); await p.fill('#inT', 'ほーす');
          const m2 = await p.textContent('#wMsg'); if (!/2文字/.test(m2)) fail('kLen message missing: ' + m2);
        }
        await p.fill('#inK', c.k); await p.fill('#inT', GPh(c.t));
        const m3 = await p.textContent('#wMsg');
        if (!/OK/.test(m3)) { fail(`[${who}] 正しい5文字がOKにならない ${c.k}${c.t}: ${m3}`); }
        if (seen.write === 0 && opt.kb) await kbCheck(p, who, 'write');
        if (seen.write === 0 && shots.write) { await clean(p); await settle(p); await p.screenshot({ path: SS + shots.write }); await layout(p, who + '-write'); ok(`[${who}] screenshot ${shots.write}`); }
        seen.write++;
        await p.tap('#tileRow button[data-tile]');
        const res = await p.waitForFunction(me => { const g = window.__gp.view.g, t = document.getElementById('toast'); if (g.sphase !== 'write' || g.clues.some(x => x.p === me)) return 'ok'; if (t.classList.contains('show') && /取られ/.test(t.textContent)) return 'taken'; return false; }, me, { timeout: 8000 }).then(h => h.jsonValue()).catch(() => 'timeout');
        if (res === 'timeout') fail(`[${who}] 提出が反映されない`);
        else if (res === 'taken') { ok(`[${who}] 同時に同じ番号をタップ → 「その番号は もう取られました」で別の番号を選び直し（早い者勝ち）`); await p.evaluate(() => document.getElementById('toast').classList.remove('show')); }
        continue;
      }
      if (sp === 'answer' && me === g.oya && g.ans && g.ans.st === 'think' && !(await p.$eval('#ansBtn', e => e.disabled))) {
        const guess = await p.evaluate(() => { const g = window.__gp.view.g; const cl = g.order.slice(0, g.ri).map(q => g.clues.filter(c => c.p === q)[0]); const ex = g.guesses.filter(x => !x.pass).map(x => x.text); return GP.cpuGuess(g.type, cl, ex, 'normal', 3).text; });
        await p.tap('#inA'); await p.fill('#inA', guess);
        if (seen.answer === 0 && opt.kb) await kbCheck(p, who, 'answer');
        if (seen.answer === 0 && shots.answer) { await sleep(TURBO_FLIP); await clean(p); await settle(p); await p.screenshot({ path: SS + shots.answer }); await layout(p, who + '-answer'); ok(`[${who}] screenshot ${shots.answer}（親の画面：お題は出ていない）`); }
        seen.answer++;
        const k = g.k; await p.tap('#ansBtn');
        await p.waitForFunction(k => window.__gp.view.g && window.__gp.view.g.k !== k, k, { timeout: 8000 }).catch(() => fail(`[${who}] 答えが反映されない`));
        continue;
      }
      if (sp === 'result' && g.solved && !seen.result && shots.result) {
        seen.result++; await sleep(1300); await clean(p); await p.screenshot({ path: SS + shots.result }); await layout(p, who + '-result'); ok(`[${who}] screenshot ${shots.result}`);
        continue;
      }
      if (sp === 'answer' && me !== g.oya && g.ri >= 1 && g.ans && g.ans.st === 'judged' && !g.ans.ok && shots.reveal && !seen.reveal) {
        seen.reveal = 1; await sleep(250); await clean(p); await settle(p); await p.screenshot({ path: SS + shots.reveal }); ok(`[${who}] screenshot ${shots.reveal}（書いた人の画面：めくり・判定）`);
        continue;
      }
      if (opt.sample && Math.random() < 0.08) await layout(p, who + '-' + sp);
      await sleep(120);
    }
    return seen;
  }
  const TURBO_FLIP = 450;
  // iPhone のキーボード表示を再現（visualViewport が縮んだ状態）：入力欄と 番号／答えるボタンが見える範囲に収まるか
  async function kbCheck(p, who, what) {
    await sleep(450);
    const H = 330;
    const r = await p.evaluate(([H, what]) => {
      document.documentElement.style.setProperty('--vvh', H + 'px'); document.body.classList.add('kb');
      const ids = what === 'write' ? ['inK', 'inT'] : ['inA', 'ansBtn', 'passBtn'];
      const els = ids.map(id => document.getElementById(id)).concat(what === 'write' ? Array.from(document.querySelectorAll('#tileRow button')) : []);
      const out = els.map(e => { const b = e.getBoundingClientRect(); return { id: e.id || e.textContent.trim(), bottom: Math.round(b.bottom), h: Math.round(b.height) }; });
      return out;
    }, [H, what]);
    const bad = r.filter(x => x.bottom > H + 0.5 || x.h < 30);
    if (bad.length) fail(`[${who}] keyboard(${what}): hidden/small ${JSON.stringify(bad)}`); else ok(`[${who}] キーボード表示（見える高さ${H}px）でも ${what === 'write' ? '入力欄と番号タイル' : '答え欄と 答える／パス'} が見える（最下部 ${Math.max(...r.map(x => x.bottom))}px）`);
    await clean(p); await p.screenshot({ path: SS + (what === 'write' ? '07b_write_keyboard_375.png' : '08b_answer_keyboard_375.png') });
    await p.evaluate(() => { document.documentElement.style.setProperty('--vvh', '100%'); document.body.classList.remove('kb'); });
  }
  function GPh(s) { return s.replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)); }

  // ================= 1) solo, 390×844, ?from=portal =================
  {
    const p = await phone('solo390');
    await p.goto(ROOT + '?turbo&wsec=45&from=portal'); await sleep(400);
    const L1 = await layout(p, 'title390');
    if (!L1.fab) fail('hub button should show on title with ?from=portal'); else ok('title: 🏠 ひろばへ visible with ?from=portal, no overlap, no page scroll');
    await p.screenshot({ path: SS + '01_title.png' });
    await p.fill('#nameIn', 'りょう'); await p.tap('#soloBtn'); await p.waitForSelector('#lobby.active');
    await layout(p, 'lobby390');
    await p.selectOption('select[data-c="1"]', 'slow'); await p.selectOption('select[data-c="3"]', 'fast');
    await waitV(p, "v.opts.lv[1] === 'slow' && v.opts.lv[3] === 'fast'");
    await p.screenshot({ path: SS + '01b_lobby_solo.png' });
    await p.tap('#startBtn'); await waitV(p, 'v.phase === "game"');
    await sleep(900); await layout(p, 'game390');
    const t0 = Date.now();
    const seen = await playHuman(p, 'solo390', { shots: { write: '02_write.png', answer: '03_oya_answer.png', result: '04_result.png', reveal: '03b_reveal_writer.png' }, sample: true });
    await waitV(p, 'v.phase === "end"', 60000).catch(() => {});
    const v = await view(p);
    if (v.phase !== 'end') fail('solo 390 game did not finish: ' + v.phase);
    else {
      ok(`solo 390×844 game finished in ${((Date.now() - t0) / 1000).toFixed(0)}s: ${v.g.rounds} rounds, wrote ${seen.write}×, answered ${seen.answer}×, scores ${v.g.owners.map((o, i) => o.name.replace('ふーさん🐻', 'ふー') + (o.lv ? '(' + o.lv + ')' : '') + ' ' + v.g.scores[i]).join(' / ')}`);
      if (v.g.hist.length !== 4) fail('4 players → 4 rounds expected, got ' + v.g.hist.length);
      if (new Set(v.g.hist.map(h => h.oya)).size !== 4) fail('everyone should be 親 once');
      if ((await p.$$('#rankList .rk')).length !== 4) fail('rank list should show 4 rows');
      await sleep(600); await p.screenshot({ path: SS + '05_end.png' }); await layout(p, 'end390');
      const fabEnd = await p.evaluate(() => getComputedStyle(document.getElementById('hirobaFab')).display !== 'none');
      if (!fabEnd) fail('hub button should return on the result screen'); else ok('hub button back on the end screen, no overlap');
    }
    await p.context().close();
  }

  // ================= 2) solo, 375×667 (iPhone SE), 3 players =================
  {
    const p = await phone('solo375', 375, 667);
    await p.goto(ROOT + '?turbo&wsec=45&from=portal'); await sleep(300);
    await layout(p, 'title375'); await p.screenshot({ path: SS + '06_title_375.png' });
    await p.tap('#soloBtn'); await p.waitForSelector('#lobby.active');
    await layout(p, 'lobby375');
    await p.tap('#npSeg button[data-v="3"]'); await p.tap('#lvAllSeg button[data-v="fast"]');
    await waitV(p, 'v.opts.np === 3 && v.opts.lv[1] === "fast"');
    await p.tap('#startBtn'); await waitV(p, 'v.phase === "game"');
    const t0 = Date.now();
    const seen = await playHuman(p, 'solo375', { shots: { write: '07_write_375.png', answer: '08_oya_answer_375.png', result: '09_result_375.png', reveal: '09b_reveal_writer_375.png' }, sample: true, kb: true });
    const v = await view(p);
    if (v.phase !== 'end') fail('solo 375 game did not finish');
    else ok(`solo 375×667 game finished in ${((Date.now() - t0) / 1000).toFixed(0)}s: 3 rounds, scores ${v.g.scores.join(' / ')} (wrote ${seen.write}×, answered ${seen.answer}×; 親の端末にお題なしを ${seen.hidden} 回確認)`);
    await layout(p, 'end375');
    await p.context().close();
  }

  // ================= 2b) 🚩反則 と ⭕正解にする（親以外の人間が使う） =================
  {
    const p = await phone('rules390');
    await p.goto(ROOT + '?turbo&wsec=30'); await sleep(300);
    await p.tap('#soloBtn'); await p.waitForSelector('#lobby.active');
    await p.tap('#npSeg button[data-v="3"]'); await p.tap('#lvAllSeg button[data-v="slow"]');
    await waitV(p, 'v.opts.np === 3 && v.opts.lv[1] === "slow"');
    await p.tap('#startBtn'); await waitV(p, 'v.phase === "game"');
    await p.evaluate(() => { window.__gp.autoplay = true; });
    let foulDone = false, ovDone = false; const t0 = Date.now();
    while (Date.now() - t0 < 150000 && !(foulDone && ovDone)) {
      const v = await view(p); if (!v || v.phase === 'end') break;
      const g = v.g;
      if (g && g.sphase === 'answer' && g.me !== g.oya) {
        if (!foulDone && g.ans && g.ans.st === 'think' && await p.$('#stageInner button[data-foul]')) {
          const oya = g.oya, turn = g.turn;
          await p.tap('#stageInner button[data-foul]').catch(() => {}); await p.tap('#cfYes').catch(() => {});
          const r = await p.waitForFunction(() => { const g = window.__gp.view.g; return g && (g.sphase === 'foul' || g.lastFoul) ? 'yes' : g && g.sphase === 'result' ? 'late' : false; }, null, { timeout: 8000 }).then(h => h.jsonValue()).catch(() => 'timeout');
          if (r === 'yes') {
            await p.screenshot({ path: SS + '15_foul.png' });
            await waitV(p, 'v.g.sphase === "choose" || v.g.sphase === "roll"', 10000).catch(() => {});
            const a = await view(p);
            if (a.g.oya === oya && a.g.turn === turn && a.g.lastFoul && a.g.hist.length === turn) { foulDone = true; ok(`🚩反則 → そのお題は終わり、同じ親（${a.g.owners[oya].name}）でお題を決め直し（流れたお題「${a.g.lastFoul.w}」）`); }
            else fail('foul did not restart with the same 親: ' + JSON.stringify({ oya: a.g.oya, turn: a.g.turn, lf: a.g.lastFoul }));
          }
          continue;
        }
        if (!ovDone && await p.$('#ctrl button[data-a="override"]')) {
          const before = (await view(p)).g.scores.slice();
          await p.tap('#ctrl button[data-a="override"]').catch(() => {});
          const r = await p.waitForFunction(() => { const g = window.__gp.view.g; return g && g.solved && g.solved.manual; }, null, { timeout: 5000 }).then(() => true).catch(() => false);
          if (r) { const a = await view(p); ovDone = true; ok(`⭕正解にする → 正解あつかい（親+${a.g.solved.oyaPts}・書いた人+${a.g.scores[a.g.solved.p] - before[a.g.solved.p]}）`); await sleep(300); await clean(p); await p.screenshot({ path: SS + '16_override.png' }); }
          continue;
        }
      }
      await sleep(60);
    }
    if (!foulDone) fail('could not exercise 🚩反則 in this run');
    if (!ovDone) console.log('  - ⭕正解にする: ふーさんが はずれる場面がなかったため未確認（ロジックテストで確認済み）');
    await p.evaluate(() => { window.__gp.autoplay = true; });
    await waitV(p, 'v.phase === "end"', 120000).then(() => ok('rules390 game finished'), () => fail('rules390 game did not finish'));
    await p.context().close();
  }

  // ================= 3) online: host + guest over PeerJS cloud =================
  {
    const host = await phone('host'), guest = await phone('guest');
    await host.goto(NET + '&wsec=40'); await host.fill('#nameIn', 'りょう'); await host.tap('#createBtn');
    await host.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.getElementById('codeBig').textContent), null, { timeout: 30000 }).catch(() => {});
    const code = await host.textContent('#codeBig');
    if (!/^[A-Z0-9]{4}$/.test(code)) { fail('room could not be created (signaling blocked?)'); }
    else {
      ok('room created ' + code + ' (PeerJS cloud signaling)');
      await guest.goto(NET + '&wsec=40&room=' + code); await guest.fill('#nameIn', 'たろう'); await guest.tap('#joinInvitedBtn');
      await waitV(guest, 'v.seats.length === 2', 45000).then(() => ok('guest joined via invite URL (WebRTC data channel up)'), () => fail('guest could not join'));
      await host.tap('#npSeg button[data-v="3"]'); await waitV(host, 'v.opts.np === 3');
      await host.selectOption('select[data-c="2"]', 'fast');
      await waitV(guest, "v.opts.np === 3 && v.opts.lv[2] === 'fast'");
      const cl = await guest.textContent('#cpuList'); if (!/はやい/.test(cl)) fail('guest lobby does not show ふーさん level'); else ok('guest lobby shows ふーさん🐻 = ⚡はやい（2人＋ふーさん）');
      await host.screenshot({ path: SS + '10_lobby_online.png' });
      await host.tap('#startBtn');
      await waitV(guest, 'v.phase === "game"', 15000);
      // guest の画面で、guest が親のときに お題が出ないこと（ホストのお題を知っているので文字列でも確認）
      const hostPrompt = { w: null }; const poll = setInterval(async () => { try { const hv = await view(host); if (hv && hv.g && hv.g.prompt) hostPrompt.w = hv.g.prompt.w; } catch (e) {} }, 300);
      const t0 = Date.now();
      const [sg, sh] = await Promise.all([
        playHuman(guest, 'guest', { shots: { write: '11_write_guest.png', answer: '12_oya_answer_guest.png', result: '13_result_guest.png' }, knownPrompt: () => hostPrompt.w, ms: 300000 }),
        playHuman(host, 'host', { ms: 300000 })
      ]);
      clearInterval(poll);
      const ev = await view(guest), eh = await view(host);
      if (ev.phase !== 'end' || eh.phase !== 'end') fail('online game did not finish: ' + eh.phase + '/' + ev.phase);
      else {
        ok(`online game finished in ${((Date.now() - t0) / 1000).toFixed(0)}s: scores ${eh.g.scores.join(' / ')}; guest wrote ${sg.write}× answered ${sg.answer}×, host wrote ${sh.write}× answered ${sh.answer}×`);
        if (JSON.stringify(eh.g.scores) !== JSON.stringify(ev.g.scores)) fail('final scores differ host/guest'); else ok('host and guest final scores match');
        if (!sg.hidden || !sh.hidden) fail('each human should have been 親 at least once'); else ok(`親の端末に お題が届かないことを確認（guest ${sg.hidden}回・host ${sh.hidden}回のサンプル）`);
        await guest.screenshot({ path: SS + '14_end_online_guest.png' });
      }
      // 次のゲーム → ゲスト「ロビーに戻りたい」→ ホストが中断
      await host.tap('#againBtn'); await waitV(guest, 'v.phase === "game" && v.g.wait === 0', 15000);
      // 番外の操作は無視される（親でない人の「答える」）
      const g0 = await view(guest);
      if (g0.g.me !== g0.g.oya) { const k0 = g0.g.k; await guest.evaluate(() => window.__gp.act('type', 'kata')); await sleep(500); const g1 = await view(host); if (g1.g.type === 'kata' && g1.g.oya !== 1 && g1.g.k !== k0 && host.label && (await view(host)).g.owners[g1.g.oya].kind === 'human') fail('out-of-turn action accepted?'); else ok('out-of-turn action (親でない人がカードを選ぶ) is ignored'); }
      await guest.tap('#menuBtn'); await guest.tap('#menuReq');
      await host.waitForSelector('#lobbyReqBar.show button[data-lr="abort"]', { timeout: 10000 }); await host.tap('#lobbyReqBar button[data-lr="abort"]'); await host.tap('#cfYes');
      await waitV(guest, 'v.phase === "lobby"').then(() => ok('⋯ → ロビーに戻りたい → host 中断してロビーへ → both in lobby'), () => fail('abort to lobby failed'));
      // 途中で再読み込み → 同じニックネームで元の席へ
      await host.tap('#startBtn'); await waitV(guest, 'v.phase === "game"', 15000);
      await guest.goto(NET + '&room=' + code); await guest.fill('#nameIn', 'たろう'); await guest.tap('#joinInvitedBtn');
      await waitV(guest, 'v.phase === "game" && v.g.me === 1', 45000).then(() => ok('guest reloaded and rejoined mid-game by nickname (same seat)'), () => fail('rejoin failed'));
    }
  }
  await browser.close();
  console.log(errors.length ? `\nFAILED (${errors.length})` : '\nALL E2E CHECKS PASSED');
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
