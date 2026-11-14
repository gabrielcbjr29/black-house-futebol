// Fábrica de estratégias (mesma lógica da NBA): uma estratégia por mercado, com as melhores entradas do Modelo BH
// naquele mercado, gravadas em papel (strategy_picks) e medidas por ROI e CLV.
// Regra de ouro: nunca mudar a regra de uma estratégia que já tem histórico; crie uma versão nova (ex.: m-sot-v2).
import { MARKETS } from '../public/engine.js';

const MKT = ['SH', 'SOT', 'SH1', 'SOT1', 'FC', 'FS', 'TK', 'SV', 'TSH', 'TSOT', 'TFC', 'JSH', 'JSOT', 'JFC'];
const edgeOf = r => r.d ? r.p * r.d - 1 : null;
// titular confirmado, ou provável titular (80%+) enquanto a escalação não sai; nunca "em dúvida" ou banco
const starter = (r, min = 0.8) => r.st === 'xi' || (r.st === 'provavel' && r.ps >= min);
const band = r => r.p >= 0.55 && r.p <= 0.85;
// odd de casa na faixa das listas (1,40–3,50) e valor esperado não negativo: com as escadas das casas (0,5 / 1,5 / 2,5)
// a linha mais segura costuma pagar @1,05–1,20 e nunca tem valor
const ODD_MIN = 1.4, ODD_MAX = 3.5;
const priced = r => r.d >= ODD_MIN && r.d <= ODD_MAX && edgeOf(r) >= 0;

export const STRATEGIES = MKT.map(mk => {
  const M = MARKETS[mk], id = (M.kind === 'p' ? 'm-' : M.kind === 't' ? 't-' : 'j-') + mk.toLowerCase();
  const who = M.kind === 'p' ? (M.h1 ? 'titular confirmado ou muito provável (90%+), porque reserva quase nunca entra no 1º tempo'
    : mk === 'SV' ? 'goleiro titular confirmado ou muito provável (90%+)' : 'titular confirmado ou provável (80%+), fora da lista de dúvidas') : null;
  return {
    id, name: M.lb, markets: [mk], max: 5,
    descr: `As 5 melhores entradas do Modelo BH em ${M.lb.toLowerCase()} (só MAIS), com linha e odd real de casa entre 1,40 e 3,50 e valor esperado positivo: chance do modelo entre 55% e 85%${who ? ', ' + who : ''}; ordem pela Nota BH.`,
    test: r => !!r.d && r.m === mk && band(r) && priced(r) && (M.kind !== 'p' || starter(r, M.h1 || mk === 'SV' ? 0.9 : 0.8)),
  };
});

const strongGrade = r => r.gr === 'A+' || r.gr === 'A';
const fresh = r => !r.utc || Date.parse(r.utc) > Date.now() - 5 * 6e4;

/* Top 10 forte: entrada que aparece num Top 10 do Modelo BH (chutes; faltas e desarmes) com EV de 8%+ e nota A/A+.
   Pega as boas que surgem depois que o teto de 5 do "modelo por mercado" já encheu. Mesmo critério das listas do bot. */
export const TOP_LISTS = { chutes: ['SH', 'SOT', 'SH1', 'SOT1'], faltas: ['FC', 'FS', 'TK'] };
export function modelTop(rows, mks, n = 10) {
  const cov = new Set(rows.filter(r => r.d).map(r => r.g)), out = [], seen = new Set();
  const inR = r => { const o = r.d ?? 1 / r.p; return o >= ODD_MIN - 1e-9 && o <= ODD_MAX + 1e-9; };
  const cand = rows.filter(r => r.k === 'p' && mks.includes(r.m) && fresh(r) && starter(r) && band(r) && inR(r) && (r.d || !cov.has(r.g)))
    .sort((a, b) => (b.nt - a.nt) || ((edgeOf(b) ?? -1) - (edgeOf(a) ?? -1)));
  for (const r of cand) { if (seen.has(r.id)) continue; seen.add(r.id); out.push(r); if (out.length >= n) break; }
  return out;
}
const EXTRA = [
  { id: 'top10-forte', name: 'Top 10 forte', markets: Object.values(TOP_LISTS).flat(), max: 8, group: 'extra',
    descr: 'Entrada que está num Top 10 do Modelo BH (chutes; faltas e desarmes) com odd de casa entre 1,40 e 3,50, EV de 8% ou mais e nota A ou A+, e que o modelo por mercado não pegou (o teto de 5 já tinha enchido). Até 8 por dia.',
    pick: (bot, taken) => Object.values(TOP_LISTS).flatMap(mks => modelTop(bot.rows, mks)).filter(r => r.d && strongGrade(r) && edgeOf(r) >= 0.08 && !taken.has(r.id + '|' + r.m))
      .sort((a, b) => edgeOf(b) - edgeOf(a)) },
  { id: 'oport-forte', name: 'Oportunidade forte', markets: MKT, max: 6, group: 'extra',
    descr: 'Qualquer mercado da casa (jogador, time ou jogo) com EV de 10% ou mais, nota A ou A+ e odd entre 1,40 e 3,50, fora das entradas do modelo por mercado e do Top 10 forte. Jogador: titular confirmado ou provável (80%+). Até 6 por dia.',
    pick: (bot, taken) => bot.rows.filter(r => r.d && fresh(r) && strongGrade(r) && r.d >= ODD_MIN && r.d <= ODD_MAX && edgeOf(r) >= 0.10 && (r.k !== 'p' || starter(r)) && !taken.has(r.id + '|' + r.m))
      .sort((a, b) => edgeOf(b) - edgeOf(a)) },
];

/* 📈 Tendência: método à parte, sem depender do modelo. Entra só se passar em TODOS os critérios:
   sequência 7+/10 e 4+/5 na linha da casa e no lado da entrada (titular 60+ min; no jogo, os DOIS times nos seus jogos);
   50%+ contra o adversário (ou nenhum jogo contra ele); adversário entre os ~35% que MAIS cedem aquilo (MAIS) ou que
   MENOS cedem (MENOS) na liga dele (7 de 20), por posição no caso do jogador; odd de casa entre 1,60 e 2,30;
   jogador titular confirmado ou provável (80%+) com 70+ minutos esperados. MENOS só existe em time e jogo.
   1 por jogador/time por dia (a de melhor sequência), até 10, pela ordem L10, L5, L20, odd. */
export const TD = { oddMin: 1.6, oddMax: 2.3, share: 0.35, l10: 7, l5: 4, vs: 0.5, minMs: 70, max: 10 };
const ok = (h, need, n) => !!h && h[1] >= n && h[0] >= need;
export function tdCheck(r) {
  const t = r.td; if (!t || !r.d || r.d < TD.oddMin - 1e-9 || r.d > TD.oddMax + 1e-9) return null;
  if (r.k === 'p' && !(starter(r) && (r.ms ?? 0) >= TD.minMs)) return null;
  const seq = t.both ? [0, 1].every(i => ok(t.l10[i], TD.l10, 10) && ok(t.l5[i], TD.l5, 5)) : ok(t.l10, TD.l10, 10) && ok(t.l5, TD.l5, 5);
  if (!seq) return null;
  if (t.vs?.[1] > 0 && t.vs[0] / t.vs[1] < TD.vs) return null;
  const u = r.s === 'u';
  const topN = d => Math.round(d[2] * TD.share);
  const good = (rank, n, N) => u ? rank > n - N : rank <= N;
  let dfOk;
  if (t.both) { const [a, b] = t.df ?? []; dfOk = !!(a && b) && good((a[1] + b[1]) / 2, (a[2] + b[2]) / 2, (topN(a) + topN(b)) / 2); }
  else dfOk = !!t.df && good(t.df[1], t.df[2], topN(t.df));
  if (!dfOk) return null;
  const sum = h => Array.isArray(h?.[0]) ? h.reduce((a, x) => [a[0] + x[0], a[1] + x[1]], [0, 0]) : h;
  const k10 = sum(t.l10), k5 = sum(t.l5), k20 = sum(t.l20);
  return [k10[0] / k10[1], k5[0] / k5[1], k20 ? k20[0] / k20[1] : 0, r.d];
}
export function pickTendencia(bot) {
  const cand = [...bot.rows, ...(bot.rowsU ?? [])].filter(fresh).map(r => [r, tdCheck(r)]).filter(([, k]) => k)
    .sort(([, a], [, b]) => (b[0] - a[0]) || (b[1] - a[1]) || (b[2] - a[2]) || (b[3] - a[3]));
  const seen = new Set(), out = [];
  for (const [r] of cand) { if (seen.has(r.id)) continue; seen.add(r.id); out.push(r); if (out.length >= TD.max) break; }
  return out;
}
const TEND = { id: 'tendencia', name: 'Tendência', markets: MKT, max: TD.max, group: 'tendencia', alert: 'sempre',
  descr: 'Método à parte, sem depender do modelo: 7+ acertos nos últimos 10 e 4+ nos últimos 5 na linha da casa (titular 60+ min), 50%+ contra o adversário (ou nenhum jogo), adversário entre os ~35% que mais cedem (mais) ou menos cedem (menos) aquilo na liga, odd entre 1,60 e 2,30, titular com 70+ min esperados. Mais e menos (menos só em time e jogo). 1 por jogador, até 10 por dia.' };

const toPick = (S, r) => ({ strategy_id: S.id, pid: r.id, name: r.n, team: r.t, opp: r.o, gid: r.g, mk: r.m, side: r.s === 'u' ? 'u' : 'o', line: r.l, odd: r.d,
  odd_src: r.b, p: r.p, edge: Math.round(edgeOf(r) * 1e4) / 1e4, nota: r.nt, tip_utc: r.utc, fase: r.fase, sq: r.sq?.length ? r.sq : (r.jh ?? null) });

/* entradas do dia por estratégia (uma por alvo e mercado; ordem: Nota BH, depois valor esperado) */
export function pickStrategies(bot) {
  const out = [];
  for (const S of STRATEGIES) {
    const rows = bot.rows.filter(r => { try { return S.test(r); } catch { return false; } })
      .sort((a, b) => (b.nt - a.nt) || ((edgeOf(b) ?? -1) - (edgeOf(a) ?? -1)));
    const seen = new Set(); let k = 0;
    for (const r of rows) {
      const key = r.id + '|' + r.m; if (seen.has(key)) continue; seen.add(key);
      out.push(toPick(S, r));
      if (++k >= S.max) break;
    }
  }
  // estratégias extras: uma por jogador (a melhor), sem repetir o que o "modelo por mercado" já pegou (na oportunidade forte)
  const taken = new Set(out.map(p => p.pid + '|' + p.mk));
  for (const S of EXTRA) {
    const seen = new Set(); let k = 0;
    for (const r of S.pick(bot, taken)) {
      if (seen.has(r.id)) continue; seen.add(r.id);
      out.push(toPick(S, r)); taken.add(r.id + '|' + r.m);
      if (++k >= S.max) break;
    }
  }
  // Tendência: lista própria, independente das outras (pode repetir alvo e pegar o lado que o modelo não escolheu)
  for (const r of pickTendencia(bot)) out.push(toPick(TEND, r));
  return { date: bot.date, gen: bot.gen, strategies: [...STRATEGIES.map(({ test, ...s }) => ({ ...s, group: 'modelo' })), ...EXTRA.map(({ pick, ...s }) => s), TEND], picks: out };
}
