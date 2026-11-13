import test from 'node:test';
import assert from 'node:assert/strict';
import { nbOver, playerOver, sumK, projectTeams, notaBH, ev, refLine, MARKETS, LEAGUE_PRIOR } from '../public/engine.js';

const near = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);
test('Poisson: P(X > 0,5) com média 1 = 1 − e^−1', () => near(nbOver(1, 1e6, 0.5), 1 - Math.exp(-1)));
test('binomial negativa tem cauda mais gorda que Poisson na mesma média', () => {
  assert.ok(nbOver(2, 2, 4.5) > nbOver(2, 1e6, 4.5));
  assert.ok(nbOver(2, 2, 0.5) < nbOver(2, 1e6, 0.5));
});
test('chance cai quando a linha sobe', () => { let last = 1; for (const l of [0.5, 1.5, 2.5, 3.5]) { const p = nbOver(1.8, 5, l); assert.ok(p < last); last = p; } });
test('jogador: condicionado a entrar em campo (quem não entra anula)', () => {
  const mu = { start: 2, bench: 0.4 };
  near(playerOver(mu, 'SH', 0.5, 1, 0), nbOver(2, MARKETS.SH.k, 0.5));
  // 50% titular, 0% de entrar do banco: continua sendo a chance de titular (o resto anula)
  near(playerOver(mu, 'SH', 0.5, 0.5, 0), nbOver(2, MARKETS.SH.k, 0.5));
  // com chance de entrar do banco, a chance cai
  assert.ok(playerOver(mu, 'SH', 0.5, 0.5, 0.8) < nbOver(2, MARKETS.SH.k, 0.5));
});
test('1º tempo: reserva não soma chance', () => near(playerOver({ start: 0.8, bench: 0 }, 'SH1', 0.5, 0.5, 1), 0.5 * nbOver(0.8, MARKETS.SH1.k, 0.5) / 1));
test('soma de dois times: k da soma maior que o de cada parte', () => assert.ok(sumK(12, 10, 10, 10) > 10));
test('times: mando e força entram na projeção', () => {
  const avg = { shF: 1, shA: 1, sotF: 1, sotA: 1, fcF: 1, fcA: 1, poss: 50 };
  const pj = projectTeams(avg, avg, LEAGUE_PRIOR);
  assert.ok(pj.h.sh > pj.a.sh);
  near(pj.h.sh * pj.a.sh, (LEAGUE_PRIOR.sh / 2) ** 2, 1e-6);
  const strong = { ...avg, shF: 1.3 };
  assert.ok(projectTeams(strong, avg).h.sh > pj.h.sh);
});
test('valor esperado e nota', () => {
  near(ev(0.6, 1.9), 0.14);
  assert.equal(ev(0.6, null), null);
  assert.ok(notaBH({ p: 0.75, e: 0.1, hit: 0.8 }) > notaBH({ p: 0.56, e: 0.0, hit: 0.4 }));
});
test('linha de referência: a mais perto de 62% entre 50% e 85%', () => {
  const r = refLine(l => nbOver(1.6, 5, l), [0.5, 1.5, 2.5]);
  assert.equal(r.l, 0.5);
  assert.equal(refLine(() => 0.2, [0.5]), null);
});
