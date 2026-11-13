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
  assert.deepEqual(lines.get('1|1460|SOT|0.5'), [{ house: 'b', odd: 1.95 }, { house: 'a', odd: 1.8 }]);
  assert.equal(miss.filter(m => m.why === 'jogador').length, 1);
  // mando invertido não encaixa (casa e fora trocados = outro jogo)
  assert.equal(lines.has('1|j1|JSH|21.5'), false);
});
