// Itens inspirados no StatsHub: caçador, sequências, árbitros, adversário por posição e números do card.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run, preset, DEFAULT } from '../public/hunter.js';
import { refKey, oppPosition, refereeFactors, playerProfiles, posPriors } from '../collector/profiles.js';
import { posShape, POS_ALPHA } from '../public/engine.js';
import { synthHistory } from '../collector/demo.js';

const D = {
  ks: { SH: 4.5 }, rows: [{ id: '1', m: 'SH', l: 0.5, d: 1.5, b: 'Casa A' }],
  mdl: { p: {
    1: { n: 'A', tn: 'T', on: 'O', home: true, g: 9, lg: 39, utc: new Date(Date.now() + 36e5).toISOString(), pos: 'F', ps: 1, pb: 0, st: 'xi', gap: 0, mu: { SH: [2.2, 0.5] } },
    2: { n: 'B', tn: 'T', on: 'O', home: true, g: 9, lg: 39, utc: new Date(Date.now() + 36e5).toISOString(), pos: 'D', ps: 0.9, pb: 0.3, st: 'provavel', gap: 0, mu: { SH: [0.6, 0.1] } },
    3: { n: 'C', tn: 'T', on: 'O', home: true, g: 9, lg: 39, utc: new Date(Date.now() + 36e5).toISOString(), pos: 'F', ps: 0, pb: 0.5, st: 'banco', gap: 0, mu: { SH: [2, 0.4] } },
  } },
};
// [min, titular, casa, liga, chutes, no gol, f.com., f.sofr., desarmes, defesas]
const h = (sh, home = 1, lg = 39, min = 90, st = 1) => [min, st, home, lg, sh, 0, 0, 0, 0, 0];
const H = { p: { 1: [h(3), h(2), h(0, 0), h(1), h(4), h(2, 0, 2), h(1), h(2), h(3), h(1)], 2: [h(1), h(0), h(1), h(0), h(1), h(1), h(0), h(1), h(1), h(0)], 3: Array(10).fill(h(3)) } };

test('caçador: filtra por acerto, posição, mando e titularidade; banco fica de fora', () => {
  const f = { ...DEFAULT, mk: 'SH', l: 0.5, w: 10, pct: 80 };
  const r = run(D, H, f);
  assert.deepEqual(r.map(x => x.pid), ['1']);          // B bate 6/10; C está no banco
  assert.equal(r[0].hit, 9); assert.equal(r[0].n, 10);
  assert.equal(r[0].sk, 2);                             // 3, 2, 0 → 2 seguidos
  assert.ok(Math.abs(r[0].e - (r[0].p * 1.5 - 1)) < 1e-9); // EV com a odd da casa
  assert.equal(run(D, H, { ...f, pct: 50, pos: ['D'] }).map(x => x.pid).join(), '2');
  assert.equal(run(D, H, { ...f, venue: 'casa', w: 10 })[0].n, 8); // só os jogos em casa contam
  assert.equal(run(D, H, { ...f, liga: true })[0].n, 9);           // jogo da Champions sai
  assert.equal(run(D, H, { ...f, conf: true, pct: 50 }).length, 1);  // provável não entra com "confirmado"
  assert.equal(run(D, H, { ...f, odd: 1.6 }).length, 0);              // odd da casa 1,50 abaixo do mínimo
});
test('caçador: presets são cópias (não mexem no original)', () => {
  const a = preset('zagueiro'); a.pos.push('F');
  assert.deepEqual(preset('zagueiro').pos, ['D']);
});
test('árbitro: o mesmo nome em formatos diferentes vira a mesma chave', () => {
  assert.equal(refKey('M. Oliver'), refKey('Michael Oliver'));
  assert.equal(refKey('Michael Oliver, England'), 'm oliver');
  assert.equal(refKey('Rodrigo José Pereira de Lima'), refKey('Rodrigo Jose Pereira de Lima'));
  assert.equal(refKey('Abel'), 'abel');
});
test('árbitro: faltas e cartões por jogo; adversário por posição fica entre 0,7 e 1,4', () => {
  const Hs = synthHistory(3);
  const RF = refereeFactors(Hs.fixtures, {});
  const any = Object.values(RF)[0];
  assert.ok(any.fpg > 5 && any.cpg >= 0 && any.n > 0 && any.f > 0.5 && any.f < 1.5);
  const OP = oppPosition(Hs.fixtures);
  for (const t of Object.values(OP)) for (const p of Object.values(t)) for (const v of Object.values(p)) assert.ok(v >= 0.7 && v <= 1.4);
  // desligado por padrão (o teste com dados reais não mostrou ganho)
  assert.ok(Object.values(POS_ALPHA).every(a => a === 0));
  assert.deepEqual(Object.values(posShape({ F: { sh: 1.3 } }, 'F')), [1, 1, 1, 1, 1]);
  assert.equal(posShape({ F: { sh: 1.21 } }, 'F', { sh: 0.5 }).sh.toFixed(2), '1.10');
});
test('perfil do jogador: temporada, casa/fora e histórico do caçador', () => {
  const Hs = synthHistory(3);
  const PP = playerProfiles(Hs.fixtures, posPriors(Hs.fixtures));
  const p = Object.values(PP).find(x => x.ss?.ns >= 3);
  assert.ok(p.ss.st.sh != null && p.ss.p90.sh != null);
  assert.ok(p.hx.length <= 20 && p.hx[0].length === 11);
  assert.equal(p.ss.hm.n + p.ss.aw.n, p.ss.ns);
});
import { multiplas, combinados, maiorChance, pdfHTML } from '../scripts/pdf.mjs';
test('PDF do dia: múltiplas uma perna por jogo, combinados no mesmo jogo, maior chance, aviso de odd antiga', () => {
  const fut = new Date(Date.now() + 36e5).toISOString();
  const R = (id, g, m, p, d, extra = {}) => ({ id, n: 'J' + id, t: 'T' + g, o: 'O' + g, home: true, g, k: 'p', st: 'xi', m, l: 0.5, p, d, b: d ? 'Casa' : null, e: d ? p * d - 1 : null, gr: 'A', nt: 70, utc: fut, ...extra });
  const rows = [R('1', 1, 'SH', .72, 1.5), R('2', 1, 'FC', .7, 1.55), R('3', 2, 'TK', .74, 1.45), R('4', 3, 'SH', .66, 1.6), R('5', 3, 'SOT', .6, null)];
  const M = multiplas(rows);
  assert.equal(M.tripla.legs.length, 3);
  assert.equal(new Set(M.tripla.legs.map(r => r.g)).size, 3);           // uma perna por jogo
  assert.ok(Math.abs(M.dupla.odd - 1.5 * 1.45) < 1e-9);
  const C = combinados(rows);
  assert.ok(C.length >= 1 && C.every(c => c.a.g === c.b.g && c.a.id !== c.b.id));
  const mc = maiorChance(rows);
  assert.equal(mc.SOT[0].id, '5');                                        // sem casa: linha de referência
  const html = pdfHTML({ date: '2026-11-14', gen: new Date().toISOString(), games: [{}], rows, rowsU: [], houses: [{ house: 'Farra', at: new Date(Date.now() - 3 * 3600e3).toISOString(), n: 10 }] }, null);
  assert.ok(html.includes('Leitura das odds com 2 h ou mais'));
});
