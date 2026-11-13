import test from 'node:test';
import assert from 'node:assert/strict';
import { ingestFixture, P, T } from '../collector/history.js';
import { parseGames, parseLineups, parseInjuries } from '../collector/build.js';

const fx = { fixture: { id: 1, date: '2026-11-08T16:30:00+00:00', timestamp: 1794155400, referee: 'M. Oliver, England', status: { short: 'FT' } },
  league: { id: 39, season: 2026, round: 'Regular Season - 11' }, teams: { home: { id: 42, name: 'Arsenal' }, away: { id: 49, name: 'Chelsea' } },
  goals: { home: 2, away: 1 }, score: { halftime: { home: 1, away: 0 } } };
const players = [{ team: { id: 42, name: 'Arsenal' }, players: [
  { player: { id: 1460, name: 'B. Saka' }, statistics: [{ games: { minutes: 88, position: 'F', substitute: false }, shots: { total: 4, on: 2 }, goals: { total: 1, conceded: 0, saves: null }, tackles: { total: 1 }, fouls: { drawn: 3, committed: null }, cards: { yellow: 0 } }] },
  { player: { id: 999, name: 'X. Reserva' }, statistics: [{ games: { minutes: null, position: 'M', substitute: true }, shots: { total: null, on: null }, goals: {}, tackles: {}, fouls: {}, cards: {} }] },
] }];
const stats = [{ team: { id: 42 }, statistics: [{ type: 'Total Shots', value: 15 }, { type: 'Shots on Goal', value: 6 }, { type: 'Fouls', value: 9 }, { type: 'Ball Possession', value: '58%' }, { type: 'Goalkeeper Saves', value: 2 }, { type: 'Corner Kicks', value: 7 }],
  statistics_1h: [{ type: 'Total Shots', value: 7 }, { type: 'Shots on Goal', value: 3 }, { type: 'Fouls', value: 4 }] }, { team: { id: 49 }, statistics: [{ type: 'Total Shots', value: 9 }] }];

test('histórico: registro compacto do jogo', () => {
  const { rec, names } = ingestFixture(fx, players, stats);
  assert.equal(rec.ref, 'M. Oliver');
  assert.deepEqual(rec.t[42], [15, 6, 9, 58, 2, 7]);
  assert.deepEqual(rec.t1[42], [7, 3, 4]);
  const saka = rec.p.find(p => p[P.id] === 1460);
  assert.equal(saka[P.min], 88); assert.equal(saka[P.start], 1); assert.equal(saka[P.sh], 4); assert.equal(saka[P.sot], 2); assert.equal(saka[P.fs], 3); assert.equal(saka[P.fc], 0);
  const res = rec.p.find(p => p[P.id] === 999); assert.equal(res[P.min], 0); assert.equal(res[P.start], 0);
  assert.equal(names[1460], 'B. Saka');
  assert.equal(rec.t[49][T.sh], 9);
});
test('jogos do dia: só as ligas do projeto, em ordem de horário', () => {
  const other = { ...fx, league: { id: 999 }, fixture: { ...fx.fixture, id: 2 } };
  const g = parseGames([other, fx]);
  assert.equal(g.length, 1); assert.equal(g[0].home.name, 'Arsenal'); assert.equal(g[0].ref, 'M. Oliver');
});
test('escalação: precisa dos dois times', () => {
  const lu = [{ team: { id: 42 }, formation: '4-3-3', startXI: [{ player: { id: 1460 } }], substitutes: [{ player: { id: 999 } }] }];
  assert.equal(parseLineups(lu), null);
  const both = parseLineups([...lu, { team: { id: 49 }, startXI: [{ player: { id: 5 } }], substitutes: [] }]);
  assert.deepEqual(both[42].xi, [1460]); assert.deepEqual(both[42].bench, [999]);
});
test('desfalques: fora × dúvida', () => {
  const inj = parseInjuries([{ fixture: { id: 1 }, player: { id: 7, type: 'Missing Fixture' } }, { fixture: { id: 1 }, player: { id: 8, type: 'Questionable' } }]);
  assert.equal(inj[1][7], 'out'); assert.equal(inj[1][8], 'doubt');
});
