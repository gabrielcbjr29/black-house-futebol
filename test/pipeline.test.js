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
test('validação walk-forward: sem viés grande na média (dados simulados)', async () => {
  const { collect } = await import('../collector/calibrate.js');
  const H = synthHistory({ seed: 9, rounds: 20, nTeams: 10 }), R = collect(H.fixtures, H, 50);
  const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
  for (const mk of ['SH', 'FC', 'TK', 'TSH', 'JFC']) { const ratio = avg(R[mk].mu) / avg(R[mk].v); assert.ok(Math.abs(ratio - 1) < 0.08, `${mk} ${ratio}`); }
});
test('calibração v2: escolhe no teste fora da amostra e nunca fica pior que o modelo cru', () => {
  const r = walkForward(synthHistory({ seed: 9, rounds: 40, nTeams: 10 }), { minTrain: 50 });
  assert.ok(r && Object.keys(r).length >= 3);
  for (const [mk, c] of Object.entries(r)) {
    assert.ok(c.logloss_teste.escolhido <= c.logloss_teste.cru + 1e-9, `${mk} piorou`);
    assert.ok(c.fator > 0.7 && c.fator < 1.3, `${mk} fator ${c.fator}`);
    if (c.curva) assert.ok(Math.abs(c.curva.b) > 0.3 && Math.abs(c.curva.b) < 3, `${mk} curva ${c.curva.b}`);
    assert.ok(c.antes.faixas && c.depois.faixas);
  }
});
test('calibração: k escolhido pelo menor erro recupera a dispersão verdadeira', async () => {
  const { bestK } = await import('../collector/calibrate.js');
  const { rng, nbSample } = await import('../collector/demo.js');
  const r = rng(17), mus = [], vals = [];
  for (let i = 0; i < 6000; i++) { const mu = 0.4 + 2 * r(); mus.push(mu); vals.push(nbSample(r, mu, 5)); }
  const k = bestK(mus, vals, [0.5, 1.5, 2.5]);
  assert.ok(k >= 3 && k <= 10, `k=${k}`);
});
test('calibração v2 no motor: fator por liga, curva na chance e volta ao normal sem curva', async () => {
  const E = await import('../public/engine.js');
  const keep = { ...E.MARKETS.FC };
  try {
    E.MARKETS.FC.cf = 0.9; E.MARKETS.FC.cfl = { 71: 1.1 };
    assert.equal(E.facOf('FC', 71), 1.1); assert.equal(E.facOf('FC', 39), 0.9);
    const p0 = E.playerOver({ start: 1, bench: 0 }, 'FC', 0.5, 1, 0);
    E.calIn({ FC: { k: E.MARKETS.FC.k, pl: { a: 0.2, b: 1 } } });
    const p1 = E.playerOver({ start: 1, bench: 0 }, 'FC', 0.5, 1, 0);
    assert.ok(p1 > p0 && p1 < 1);
    assert.ok(Math.abs(E.calP('FC', 0.5) - 1 / (1 + Math.exp(-0.2))) < 1e-9);
    E.calIn({ FC: { k: E.MARKETS.FC.k } });
    assert.equal(E.playerOver({ start: 1, bench: 0 }, 'FC', 0.5, 1, 0), p0);
  } finally { for (const k of Object.keys(E.MARKETS.FC)) delete E.MARKETS.FC[k]; Object.assign(E.MARKETS.FC, keep); }
});
test('registro de preços: guarda a primeira e a última leitura antes do jogo, ignora sem odd e jogo começado', async () => {
  const { updatePrices } = await import('../collector/precos.js');
  const now = Date.parse('2026-11-19T15:00:00Z'), utc = '2026-11-19T20:00:00Z';
  const row = (o, at, extra = {}) => ({ id: '1', m: 'SH', s: 'o', l: 1.5, p: 0.6, d: o, b: '99play', at, utc, g: 9, lg: 71, ...extra });
  const P = {};
  assert.equal(updatePrices(P, { rows: [row(1.9, 'a'), row(null, 'a', { id: '2' }), row(2, 'a', { id: '3', utc: '2026-11-19T14:00:00Z' })] }, now), 1);
  assert.equal(updatePrices(P, { rows: [row(1.9, 'a')] }, now + 6e4), 0);
  assert.equal(updatePrices(P, { rows: [row(1.75, 'b')] }, now + 12e4), 1);
  const e = P['1|SH|o|1.5'];
  assert.equal(e.a.o, 1.9); assert.equal(e.z.o, 1.75); assert.equal(e.z.h, '99play'); assert.equal(Object.keys(P).length, 1);
});
