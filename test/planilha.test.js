import test from 'node:test';
import assert from 'node:assert/strict';
import { rowsOf, resumo, filtra, csvOf, planilhaHTML, exposicao } from '../public/planilha.js';

const P = { gen: '2026-11-18T18:00:00Z', estrategias: [{ id: 'm-sv', name: 'Defesas do goleiro' }],
  picks: [
    { id: 1, date: '2026-11-14', strategy_id: 'm-sv', name: 'Walter', team: 'A', opp: 'B', mk: 'SV', side: 'o', line: 2.5, odd: 1.9, open_line: 2.5, open_odd: 1.82, odd_src: '99play', p: 0.58, edge: 0.05, status: 'red', result: 1, profit: -1, clv_line: 0, clv_odd: -0.0421, alerted: false },
    { id: 2, date: '2026-11-14', strategy_id: 'm-sv', name: 'Time X', team: 'X', opp: 'Y', mk: 'TSOT', side: 'u', line: 4, odd: 1.8, open_line: 4.5, open_odd: 1.8, odd_src: '99play', p: 0.6, edge: 0.3, status: 'green', result: 3, profit: 0.8, clv_line: 0.5, clv_odd: null, alerted: true },
  ],
  tops: [{ id: 9, date: '2026-11-14', list: 'chutes', rank: 1, name: 'Fulano', mk: 'SH', side: 'o', line: 0.5, odd: 1.5, open_line: 0.5, open_odd: 1.5, p: 0.7, status: 'green', result: 2, profit: 0.5, clv_line: 0, clv_odd: 0 }] };

test('planilha: entradas do papel e do Top 10 no mesmo formato, CLV pelo lado', () => {
  const R = rowsOf(P);
  assert.equal(R.length, 3);
  const u = R.find(x => x.id === 2);
  assert.equal(u.L, 4.5); assert.equal(u.Lf, 4); assert.equal(u.clvL, 0.5); // MENOS: a linha desceu = a favor
  assert.equal(R.find(x => x.src === 'top').sname, 'Top 10 Chutes (#1)');
});
test('planilha: resumo só conta green/red no lucro e no ROI; filtros e CSV', () => {
  const R = filtra(rowsOf(P), { per: 'tudo', src: 'est', est: '', mk: '', st: '', al: false });
  const S = resumo(R);
  assert.equal(S.dec, 2); assert.equal(S.g, 1); assert.ok(Math.abs(S.lucro - -0.2) < 1e-9); assert.ok(Math.abs(S.roi - -0.1) < 1e-9);
  assert.equal(filtra(rowsOf(P), { per: 'tudo', src: 'est', al: true }).length, 1);
  const csv = csvOf(P, { per: 'tudo', src: 'tudo' });
  assert.equal(csv.split('\n').length, 4); assert.match(csv, /Menos;4,5;1,8/);
  assert.match(planilhaHTML(P, { per: 'tudo', src: 'tudo', est: '', mk: '', st: '', al: false }), /Por faixa de EV/);
});
test('planilha: exposição por jogo agrupa entradas do mesmo jogo no mesmo dia', () => {
  const a = [{ date: '2026-11-19', gid: 1 }, { date: '2026-11-19', gid: 1 }, { date: '2026-11-19', gid: 2 }, { date: '2026-11-20', gid: 1 },
    { date: '2026-11-19', gid: 3 }, { date: '2026-11-19', gid: 3 }, { date: '2026-11-19', gid: 3 }, { date: '2026-11-19' }];
  const f = exposicao(a);
  assert.deepEqual(a.map(f), ['2 no mesmo jogo', '2 no mesmo jogo', '1 entrada no jogo', '1 entrada no jogo', '3+ no mesmo jogo', '3+ no mesmo jogo', '3+ no mesmo jogo', null]);
});
