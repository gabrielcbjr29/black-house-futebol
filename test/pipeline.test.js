import test from 'node:test';
import assert from 'node:assert/strict';
import { demoSlate, synthHistory } from '../collector/demo.js';
import { walkForward } from '../collector/calibrate.js';
import { STRATEGIES } from '../collector/strategies.js';

const now = new Date('2026-11-14T12:00:00Z');
const { slate, bot, st, results } = demoSlate({ now });
test('modelo do dia: escalação oficial manda (titular, banco), sem ela fica "provável"', () => {
  const g0 = slate.games[0];
  const ps = Object.values(slate.model.players).filter(p => p.g === g0.id);
  assert.ok(ps.length >= 30);
  assert.ok(ps.every(p => p.st === 'xi' || p.st === 'banco'));
  assert.equal(ps.filter(p => p.st === 'xi').length, 22);
  assert.ok(Object.values(slate.model.players).filter(p => p.g !== g0.id).every(p => p.st === 'provavel'));
});
test('goleiro só no mercado de defesas; linha só de MAIS', () => {
  for (const p of Object.values(slate.model.players)) assert.equal(!!p.mu.SV, p.pos === 'G');
  assert.ok(bot.rows.every(r => r.s === 'o'));
});
test('bot.json: odd de casa quando há, referência quando não há', () => {
  const withOdd = bot.rows.filter(r => r.d), ref = bot.rows.filter(r => r.ref);
  assert.ok(withOdd.length > 20 && ref.length > 20);
  for (const r of withOdd) assert.ok(Math.abs(r.e - (r.p * r.d - 1)) < 2e-3);
  assert.ok(bot.rows.some(r => r.k === 'j') && bot.rows.some(r => r.k === 't'));
});
test('estratégias: só com odd real, chance 55–85%, titular ou provável, até 5 por mercado', () => {
  const S = Object.fromEntries(STRATEGIES.map(s => [s.id, s]));
  const byS = {};
  for (const p of st.picks.filter(p => S[p.strategy_id])) {
    assert.ok(p.odd > 1); assert.ok(p.p >= 0.55 && p.p <= 0.85);
    byS[p.strategy_id] = (byS[p.strategy_id] || 0) + 1;
    const row = bot.rows.find(r => r.id === p.pid && r.m === p.mk && r.l === p.line);
    assert.ok(S[p.strategy_id].test(row));
    if (row.k === 'p') assert.ok(row.st === 'xi' || row.ps >= 0.8);
  }
  assert.ok(Object.values(byS).every(n => n <= 5));
});
test('results.json: jogadores, times e jogo por dia', () => {
  assert.ok(results.dates.length >= 1);
  const d = results.stats[results.dates.at(-1)];
  assert.ok(Object.keys(d).some(k => k.startsWith('j')) && Object.keys(d).some(k => k.startsWith('t')));
});
test('validação walk-forward: sem viés grande na média (dados simulados)', () => {
  const r = walkForward(synthHistory({ seed: 9, rounds: 20, nTeams: 10 }), { minTrain: 50 });
  for (const mk of ['SH', 'FC', 'TK']) assert.ok(Math.abs(r[mk].media_prevista / r[mk].media_real - 1) < 0.08, `${mk} ${r[mk].media_prevista}/${r[mk].media_real}`);
});
test('calibração: k escolhido pelo menor erro recupera a dispersão verdadeira', async () => {
  const { bestK } = await import('../collector/calibrate.js');
  const { rng, nbSample } = await import('../collector/demo.js');
  const r = rng(17), mus = [], vals = [];
  for (let i = 0; i < 6000; i++) { const mu = 0.4 + 2 * r(); mus.push(mu); vals.push(nbSample(r, mu, 5)); }
  const k = bestK(mus, vals, [0.5, 1.5, 2.5]);
  assert.ok(k >= 3 && k <= 10, `k=${k}`);
});
