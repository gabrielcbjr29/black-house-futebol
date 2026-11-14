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
