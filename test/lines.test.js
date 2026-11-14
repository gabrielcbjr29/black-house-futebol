import test from 'node:test';
import assert from 'node:assert/strict';
import { teamScore, playerScore, mergeLines } from '../collector/lines.js';

test('nomes de time', () => {
  assert.ok(teamScore('Man City', 'Manchester City') >= 0.9);
  assert.ok(teamScore('Atlético Mineiro', 'Atletico-MG') >= 0.9);
  assert.ok(teamScore('Bayern de Munique', 'Bayern München') >= 0.5);
  assert.ok(teamScore('Arsenal', 'Chelsea') < 0.5);
});
test('nomes de jogador: "Bukayo Saka" × "B. Saka"', () => {
  assert.ok(playerScore('Bukayo Saka', 'B. Saka') >= 0.6);
  assert.ok(playerScore('Bernardo Silva', 'B. Saka') < 0.6);
  assert.ok(playerScore('Vinícius Júnior', 'Vinicius Junior') >= 0.9);
  assert.ok(playerScore('Gabriel Martinelli', 'Gabriel Martinelli') >= 0.99);
});
test('encaixe das linhas no modelo, com a melhor odd entre as casas', () => {
  const slate = { games: [{ id: 1, utc: '2026-11-14T15:00:00Z', home: { id: 42, name: 'Arsenal' }, away: { id: 49, name: 'Chelsea' } }],
    model: { players: { 1460: { n: 'B. Saka', g: 1 }, 1100: { n: 'Gabriel Jesus', g: 1 } } } };
  const ln = (house, odd, extra) => ({ house, taken_at: new Date().toISOString(), payload: { lines: [{ home: 'Arsenal FC', away: 'Chelsea', utc: '2026-11-14T15:00:00Z', type: 'player', player: 'Bukayo Saka', mk: 'SOT', line: 0.5, odd, ...extra }] } });
  const { lines, miss } = mergeLines([ln('a', 1.8), ln('b', 1.95), ln('b', 2.2, { player: 'Fulano Inexistente' }), { house: 'c', payload: { lines: [{ home: 'Chelsea', away: 'Arsenal', type: 'match', mk: 'JSH', line: 21.5, odd: 1.9 }] } }], slate);
  assert.deepEqual(lines.get('1|1460|SOT|0.5').map(({ house, odd }) => ({ house, odd })), [{ house: 'b', odd: 1.95 }, { house: 'a', odd: 1.8 }]);
  assert.equal(miss.filter(m => m.why === 'jogador').length, 1);
  // mando invertido não encaixa (casa e fora trocados = outro jogo)
  assert.equal(lines.has('1|j1|JSH|21.5'), false);
});

test('nomes brasileiros: ordem trocada, nome completo e apelido, sem falso par', () => {
  const ok = [['Henrique Gustavo Scarpa', 'Gustavo Scarpa'], ['Scarpa Gustavo', 'Gustavo Scarpa'], ['Eduardo Dudu', 'Dudu'], ['Antonio Francisco Moura Neto', 'Neto Moura'],
    ['Leonardo Duarte', 'Léo Duarte'], ['Hugo \tVitor', 'Vitor Hugo'], ['Frederico Rodrigues De Paula Santos', 'Fred'],
    ['Cuello', 'Tomás Cuello'], ['Eduardo Vinicius Domachowski', 'Eduardo Doma'], ['Resende Kaua Pascini', 'Kauã Pascini']];
  for (const [h, a] of ok) assert.ok(playerScore(h, a) >= 0.6, h + ' = ' + a);
  const no = [['Luis Eduardo Soares da Silva', 'Tulio Eduardo'], ['Victor Luis', 'André Luis'], ['Paulo Ricardo Alves Ibelli', 'João Paulo'], ['Dylan Felipe Borrero Caicedo', 'Yago Felipe'],
    ['Riquelme', 'Ramon Rique'], ['Carvalho Mateus', 'Miguel Carvalho'], ['Francescoli Hugo', 'Vitor Hugo'], ['Victor Henrique Carvalho Caetano', 'Paulo Henrique']];
  for (const [h, a] of no) assert.ok(playerScore(h, a) < 0.6, h + ' ≠ ' + a);
});
test('encaixe por time e nome ambíguo fica de fora', () => {
  const slate = { games: [{ id: 7, utc: '2026-11-14T23:30:00Z', home: { id: 1, name: 'Chapecoense-sc' }, away: { id: 2, name: 'Vasco DA Gama' } }],
    model: { players: { 10: { n: 'David Antunes', t: 1, g: 7 }, 20: { n: 'David', t: 2, g: 7 }, 30: { n: 'Carlos Eduardo', t: 1, g: 7 } } } };
  const L = (player, team) => ({ home: 'Chapecoense', away: 'CR Vasco da Gama', type: 'player', player, team, mk: 'SH', line: 0.5, odd: 2 });
  const { lines, miss } = mergeLines([{ house: 'x', payload: { lines: [L('David Correa da Fonseca', 'CR Vasco da Gama'), L('David Antunes', 'Chapecoense'),
    L('Carlos Eduardo de Oliveira Alves', 'Chapecoense'), L('Carlos Eduardo Ferreira de Souza', 'Chapecoense')] } }], slate);
  assert.ok(lines.has('7|20|SH|0.5') && lines.has('7|10|SH|0.5'));
  assert.ok(!lines.has('7|30|SH|0.5'));
  assert.equal(miss.filter(m => m.why === 'jogador ambíguo').length, 2);
});
import { pickStrategies } from '../collector/strategies.js';
test('estratégias: só odd de casa entre 1,40 e 3,50 e EV não negativo', () => {
  const base = { id: '1', n: 'A', t: 'T', o: 'O', g: 9, k: 'p', st: 'xi', ps: 1, m: 'SH', nt: 80, utc: '2026-11-14T21:30:00Z', fase: 'escalacao' };
  const bot = { date: 'd', gen: 'g', rows: [{ ...base, l: 0.5, p: 0.8, d: 1.07, b: 'x' }, { ...base, l: 1.5, p: 0.62, d: 1.7, b: 'x', nt: 60 }, { ...base, id: '2', l: 1.5, p: 0.6, d: 1.5, b: 'x' }] };
  const p = pickStrategies(bot).picks.filter(x => x.strategy_id === 'm-sh');
  assert.deepEqual(p.map(x => [x.pid, x.line]), [['1', 1.5]]); // @1,07 sem valor e o 2 com EV −10% ficam de fora
});
test('Top 10 forte e Oportunidade forte: EV 8%/10%, nota A/A+, uma por jogador, sem repetir o modelo por mercado', () => {
  const fut = new Date(Date.now() + 36e5).toISOString();
  const r = (id, m, p, d, nt, gr, extra = {}) => ({ id, n: 'J' + id, t: 'T', o: 'O', g: 1, k: 'p', st: 'xi', ps: 1, m, l: 0.5, p, d, b: 'Casa', nt, gr, utc: fut, fase: 'escalacao', ...extra });
  const rows = [
    ...[1, 2, 3, 4, 5].map(i => r(String(i), 'FC', 0.7, 1.5, 90, 'A+')),       // enchem o teto do m-fc (EV 5%)
    r('6', 'FC', 0.7, 1.6, 80, 'A+'),                                          // EV 12%, nota A+: sobra para o Top 10 forte
    r('7', 'TK', 0.6, 1.7, 55, 'B'),                                           // nota B: fora
    r('8', 'SH', 0.6, 1.9, 70, 'A'),                                           // EV 14%: modelo por mercado pega antes
    { ...r('t9', 'TSH', 0.6, 1.9, 70, 'A'), k: 't' },
  ];
  const s = pickStrategies({ date: 'd', gen: 'g', rows });
  const of = id => s.picks.filter(p => p.strategy_id === id).map(p => p.pid);
  assert.deepEqual(of('m-fc'), ['1', '2', '3', '4', '5']);
  assert.deepEqual(of('top10-forte'), ['6']);
  assert.deepEqual(of('oport-forte'), []); // tudo o que tinha EV 10%+ já foi pego por outra estratégia
  assert.ok(s.strategies.some(x => x.id === 'oport-forte' && x.max === 6));
});
import { tdCheck, pickTendencia } from '../collector/strategies.js';
import { buildBotData } from '../collector/botdata.js';
test('Tendência: todos os critérios, mais e menos, jogo com os dois times', () => {
  const fut = new Date(Date.now() + 36e5).toISOString();
  const P = (extra = {}) => ({ id: '1', n: 'A', k: 'p', st: 'xi', ps: 1, ms: 85, m: 'SH', s: 'o', l: 0.5, d: 1.8, utc: fut, p: 0.6,
    td: { l5: [4, 5], l10: [7, 10], l20: [13, 20], vs: [1, 2], df: [1.5, 6, 20] }, ...extra });
  assert.ok(tdCheck(P()));
  assert.equal(tdCheck(P({ d: 1.55 })), null);                                              // odd fora de 1,60–2,30
  assert.equal(tdCheck(P({ td: { ...P().td, l10: [6, 10] } })), null);                     // 6/10
  assert.equal(tdCheck(P({ td: { ...P().td, l5: [3, 5] } })), null);                       // 3/5
  assert.equal(tdCheck(P({ td: { ...P().td, vs: [0, 2] } })), null);                       // 0/2 contra ele
  assert.ok(tdCheck(P({ td: { ...P().td, vs: [0, 0] } })));                                 // nenhum jogo contra: passa
  assert.equal(tdCheck(P({ td: { ...P().td, df: [1.1, 8, 20] } })), null);                 // 8º de 20: fora dos 7 que mais cedem
  assert.equal(tdCheck(P({ ms: 65 })), null);                                               // minutos baixos
  // MENOS de time: adversário entre os que MENOS cedem (14º de 20 ou pior)
  const U = (rank) => ({ id: 't1-9', n: 'Time', k: 't', m: 'TSH', s: 'u', l: 12.5, d: 1.9, utc: fut, p: 0.5, td: { l5: [4, 5], l10: [8, 10], l20: [15, 20], vs: [0, 0], df: [9.1, rank, 20] } });
  assert.ok(tdCheck(U(15))); assert.equal(tdCheck(U(13)), null);
  // jogo: os dois times precisam passar na sequência
  const J = (l10b) => ({ id: 'j9', n: 'A x B', k: 'j', m: 'JSH', s: 'o', l: 24.5, d: 1.85, utc: fut, p: 0.5,
    td: { both: 1, l5: [[4, 5], [5, 5]], l10: [[8, 10], l10b], l20: [[15, 20], [14, 20]], vs: [1, 1], df: [[27, 3, 20], [26, 5, 20]] } });
  assert.ok(tdCheck(J([7, 10]))); assert.equal(tdCheck(J([6, 10])), null);
  // 1 por jogador, ordem pela sequência
  const pk = pickTendencia({ rows: [P(), P({ m: 'SOT', td: { ...P().td, l10: [9, 10] } }), P({ id: '2', td: { ...P().td, l10: [8, 10] } })], rowsU: [U(16)] });
  assert.deepEqual(pk.map(r => r.id + r.m), ['1SOT', 't1-9TSH', '2SH']); // empate em L10 e L5: L20 decide
});
test('linhas de MENOS de time viram rowsU (fora das listas do bot)', () => {
  const lines = new Map([['5|t1-5|TSH|12.5|u', [{ house: 'Casa', odd: 1.9 }]], ['5|t1-5|TSH|12.5', [{ house: 'Casa', odd: 1.9 }]]]);
  const slate = { date: 'd', gen: 'g', games: [{ id: 5, lg: 71, utc: new Date(Date.now() + 36e5).toISOString(), home: { id: 1, name: 'A' }, away: { id: 2, name: 'B' }, fase: 'abertura' }],
    model: { players: {}, teams: { 5: { pj: { h: { sh: 12, sot: 4, fc: 12 }, a: { sh: 10, sot: 3, fc: 13 } }, last: { h: [[1, 10, 3, 11, 9, 3, 12]], a: [] }, h2h: [], def: { h: null, a: null } } } } };
  const b = buildBotData(slate, lines);
  const o = b.rows.find(r => r.id === 't1-5' && r.m === 'TSH' && r.l === 12.5), u = b.rowsU.find(r => r.id === 't1-5' && r.m === 'TSH');
  assert.ok(o && u && u.s === 'u');
  assert.ok(Math.abs(o.p + u.p - 1) < 0.002);
  assert.equal(b.rows.filter(r => r.s === 'u').length, 0);
});
test('cada linha guarda a hora da leitura da casa (aviso de odd antiga)', () => {
  const slate = { games: [{ id: 7, utc: '2026-11-14T23:30:00Z', home: { id: 1, name: 'Chapecoense' }, away: { id: 2, name: 'Vasco' } }], model: { players: { 20: { n: 'David', t: 2, g: 7 } } } };
  const { lines } = mergeLines([{ house: 'farra', taken_at: '2026-11-14T03:43:47Z', payload: { lines: [{ home: 'Chapecoense', away: 'Vasco', type: 'player', player: 'David Correa da Fonseca', team: 'Vasco', mk: 'SH', line: 0.5, odd: 2 }] } }], slate);
  assert.equal(lines.get('7|20|SH|0.5')[0].at, '2026-11-14T03:43:47Z');
  assert.equal(lines.get('7|20|SH|0.5')[0].house, 'Farra');
});
