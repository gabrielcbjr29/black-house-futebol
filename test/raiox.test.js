import test from 'node:test';
import assert from 'node:assert/strict';
import { streak, teamTrends, hits, sample, avg, trendText } from '../public/raiox-lib.js';
import { rowOf, refereeStats, buildRaiox } from '../collector/raiox.js';
import { demoSlate } from '../collector/demo.js';
import { refKey } from '../collector/profiles.js';

test('sequência L x/y: no máximo 1 erro, sem terminar em erro, mínimo de acertos', () => {
  const T = true, F = false;
  assert.deepEqual(streak([T, T, T, T, T, T, T, T, T, F, T, F, T], { min: 6 }), { x: 10, y: 11, run: 9 });
  assert.deepEqual(streak([F, T, T, T, T, T, T, F], { min: 6 }), { x: 6, y: 7, run: 0 });
  assert.deepEqual(streak([T, T, T, T, T, T, F], { min: 6 }), { x: 6, y: 6, run: 6 });
  assert.equal(streak([T, T, T, T, T, F, F], { min: 6 }), null);
  assert.deepEqual(streak(Array(25).fill(T), { min: 6, max: 20 }), { x: 20, y: 20, run: 20 });
});
test('amostra, média e % acima da linha (time e jogo)', () => {
  const mk = (home, shF, shA) => [1, '2026-01-01', 9, home, 71, 1, 0, shF, shA, 4, 3, 12, 11, 5, 4, 2, 1, 6, 5, 2, 1];
  const rows = [mk(1, 15, 10), mk(0, 8, 14), mk(1, 12, 9)];
  assert.equal(sample(rows, { venue: 'casa' }).length, 2);
  assert.equal(avg(rows, 'sh'), 35 / 3);
  assert.deepEqual(hits(rows, 'sh', 'j', 21.5), [2, 3]);
  assert.deepEqual(hits(rows, 'sh', 't', 10.5, 'u'), [1, 3]);
});
test('tendência de jogo: linha mais alta que fecha a sequência, com o mando de hoje antes do geral', () => {
  const rows = Array.from({ length: 12 }, (_, i) => [i, '2026-01-01', 9, i % 2 ? 0 : 1, 71, 1, 1, 14, 13, 5, 4, 12, 13, 6, 5, 2, 2, 6, 6, 2, 2]);
  const tr = teamTrends(rows, { venue: 'casa', min: 6 });
  const j = tr.find(t => t.k === 'j' && t.s === 'sh' && t.side === 'o');
  assert.equal(j.l, 26.5); assert.equal(j.v, 'casa'); assert.equal(j.x, 6);
  assert.match(trendText(j, 'Santos'), /mais de 26,5 chutes .*6\/6 em casa/);
  assert.ok(!tr.some(t => t.k === 'j' && t.s === 'sh' && t.side === 'u' && t.l === 30.5)); // ponta da grade não entra
});
test('raio-x com o histórico sintético: linhas dos times, árbitro e tendências de jogador', () => {
  const { H, slate } = demoSlate({ now: new Date('2026-11-14T12:00:00Z') });
  const f = H.fixtures.at(-1), r = rowOf(f, f.h);
  assert.equal(r[3], 1); assert.equal(r[7], f.t[f.h][0]); assert.equal(r[8], f.t[f.a][0]);
  const rx = buildRaiox(H, slate.games, slate.model, { date: slate.date, inj: slate.inj });
  assert.equal(rx.g.length, slate.games.length);
  assert.ok(rx.g.every(g => g.tm[g.h].length > 0 && g.tm[g.h].length <= 30));
  assert.equal(rx.g[1].inj.length, 1);
  assert.ok(rx.pt.every(x => x.x >= 6 && x.vals.length === x.y));
  assert.ok(rx.tr.every(t => t.x >= 6 && t.vals.length === t.y));
  const R = rx.rf[refKey('Árbitro 2')];
  assert.ok(R && R.all.n > 0 && R.last5.length === 5 && R.all.o45 >= 0 && R.all.o45 <= 1);
});
