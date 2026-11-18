// Raio-X (inspirado no Valuestats, com dados próprios da API-Football): funções puras usadas pela coleta e pelo app.
// Linha de jogo de um time (do ponto de vista dele), do mais recente para o mais antigo:
// [jogo, data, adversário, casa(1/0), liga, gols pró, gols contra, chutes, chutes cedidos, no gol, no gol cedidos,
//  faltas, faltas do adversário, escanteios, escanteios do adversário, amarelos, amarelos do adversário,
//  chutes 1ºT, chutes 1ºT adversário, no gol 1ºT, no gol 1ºT adversário]   (1º tempo: null quando a API não traz)
export const R = { id: 0, d: 1, opp: 2, home: 3, lg: 4 };
export const RS = {
  g: { lb: 'Gols', f: 5, a: 6 },
  sh: { lb: 'Chutes', f: 7, a: 8 },
  sot: { lb: 'Chutes ao gol', f: 9, a: 10 },
  fc: { lb: 'Faltas', f: 11, a: 12 },
  cor: { lb: 'Escanteios', f: 13, a: 14 },
  yc: { lb: 'Amarelos', f: 15, a: 16 },
  sh1: { lb: 'Chutes no 1º tempo', f: 17, a: 18 },
  sot1: { lb: 'No gol no 1º tempo', f: 19, a: 20 },
};
// linhas de referência (as mais comuns nas casas) para a tabela de "estatísticas de aposta"
export const BET_J = { sh: [20.5, 22.5, 24.5, 26.5], sot: [6.5, 7.5, 8.5, 9.5], fc: [20.5, 22.5, 24.5, 26.5], cor: [8.5, 9.5, 10.5], yc: [3.5, 4.5, 5.5], sh1: [8.5, 10.5], g: [1.5, 2.5, 3.5] };
export const BET_T = { sh: [9.5, 11.5, 13.5], sot: [3.5, 4.5, 5.5], fc: [9.5, 11.5, 13.5], cor: [3.5, 4.5, 5.5], yc: [1.5, 2.5] };
// grade de linhas onde as tendências são procuradas (time e jogo)
const grid = (a, b) => { const o = []; for (let x = a; x <= b + 1e-9; x++) o.push(x); return o; };
export const TREND_T = { sh: grid(7.5, 17.5), sot: grid(2.5, 7.5), fc: grid(8.5, 15.5), cor: grid(2.5, 7.5), yc: grid(0.5, 3.5) };
export const TREND_J = { sh: grid(17.5, 30.5), sot: grid(5.5, 12.5), fc: grid(18.5, 30.5), cor: grid(6.5, 12.5), yc: grid(2.5, 6.5), sh1: grid(6.5, 13.5), g: grid(0.5, 4.5) };
export const TREND_CMP = ['sh', 'sot', 'fc', 'cor', 'yc']; // "mais X que o adversário"

const tot = (r, s) => r[RS[s].f] == null || r[RS[s].a] == null ? null : r[RS[s].f] + r[RS[s].a];
export const valOf = (r, s, kind) => kind === 'j' ? tot(r, s) : kind === 'c' ? (r[RS[s].f] == null ? null : r[RS[s].f] - r[RS[s].a]) : kind === 'a' ? r[RS[s].a] : r[RS[s].f];

/* amostra: mando ('' todos, 'casa', 'fora') e os N mais recentes */
export function sample(rows, { venue = '', n = 20 } = {}) {
  return (rows ?? []).filter(r => !venue || (venue === 'casa') === !!r[R.home]).slice(0, n);
}
export function avg(rows, s, kind = 't') {
  const v = rows.map(r => valOf(r, s, kind)).filter(x => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
/* [acertos, jogos] acima (o) ou abaixo (u) da linha */
export function hits(rows, s, kind, line, side = 'o') {
  let h = 0, n = 0;
  for (const r of rows) { const v = valOf(r, s, kind); if (v == null) continue; n++; if (side === 'u' ? v < line : v > line) h++; }
  return [h, n];
}

/* Sequência no formato do Valuestats (L9/10 = em 9 dos últimos 10): a maior janela recente com no máximo 1 erro,
   sem terminar num erro. ok[] vem do mais recente para o mais antigo. Devolve {x, y, run} (run = acertos seguidos). */
export function streak(ok, { min = 6, max = 20 } = {}) {
  const v = ok.slice(0, max);
  let run = 0; while (run < v.length && v[run]) run++;
  let miss = 0, y = 0;
  for (let i = 0; i < v.length; i++) { if (!v[i]) { if (miss) break; miss++; } y = i + 1; }
  while (y > 0 && !v[y - 1]) y--;
  const x = v.slice(0, y).filter(Boolean).length;
  return x >= min ? { x, y, run } : null;
}

/* tendências de um time no jogo de hoje (time, jogo e comparação com o adversário), no mando de hoje e no geral.
   Para cada estatística: a linha mais alta (mais de) e a mais baixa (menos de) que ainda fecham a sequência. */
export function teamTrends(rows, { venue = '', min = 6, max = 20 } = {}) {
  const out = [];
  const scopes = venue ? [[venue, sample(rows, { venue, n: max })], ['', sample(rows, { n: max })]] : [['', sample(rows, { n: max })]];
  const seen = new Set();
  for (const [sc, rs] of scopes) {
    const add = (kind, s, side, line, st, vals) => {
      const key = `${kind}|${s}|${side}`; if (seen.has(key)) return; // o mando de hoje vem antes do geral
      seen.add(key); out.push({ k: kind, s, side, l: line, x: st.x, y: st.y, run: st.run, v: sc, vals: vals.slice(0, st.y) });
    };
    for (const [kind, G] of [['t', TREND_T], ['j', TREND_J]]) for (const [s, lines] of Object.entries(G)) {
      const vals = rs.map(r => valOf(r, s, kind)).filter(v => v != null); if (vals.length < min) continue;
      // a ponta da grade não diz nada ("menos de 30,5 chutes no jogo"): só vale para gols e amarelos, que têm mercado na ponta
      const edge = s === 'g' || s === 'yc';
      for (const l of [...lines].reverse()) { const st = streak(vals.map(v => v > l), { min, max }); if (st) { if (edge || l !== lines[0]) add(kind, s, 'o', l, st, vals); break; } }
      for (const l of lines) { const st = streak(vals.map(v => v < l), { min, max }); if (st) { if (edge || l !== lines[lines.length - 1]) add(kind, s, 'u', l, st, vals); break; } }
    }
    for (const s of TREND_CMP) {
      const vals = rs.map(r => valOf(r, s, 'c')).filter(v => v != null); if (vals.length < min) continue;
      for (const [side, test] of [['o', v => v > 0], ['u', v => v < 0]]) { const st = streak(vals.map(test), { min, max }); if (st) add('c', s, side, 0, st, vals); }
    }
  }
  return out;
}

/* texto curto de uma tendência (português) */
export function trendText(t, team = '') {
  const S = { g: 'gols', sh: 'chutes', sot: 'chutes ao gol', fc: 'faltas', cor: 'escanteios', yc: 'amarelos', sh1: 'chutes no 1º tempo', sot1: 'no gol no 1º tempo' };
  const n1 = x => String(x).replace('.', ',');
  const where = t.v === 'casa' ? ' em casa' : t.v === 'fora' ? ' fora' : '';
  const freq = `${t.x}/${t.y}${where}`;
  if (t.k === 'c') return `${team} com ${t.side === 'o' ? 'mais' : 'menos'} ${S[t.s]} que o adversário · ${freq}`;
  const what = `${t.side === 'o' ? 'mais' : 'menos'} de ${n1(t.l)} ${S[t.s]}`;
  return t.k === 'j' ? `Jogo com ${what} (jogos do ${team}) · ${freq}` : `${team} com ${what} · ${freq}`;
}
