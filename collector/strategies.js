// Fábrica de estratégias (mesma lógica da NBA): uma estratégia por mercado, com as melhores entradas do Modelo BH
// naquele mercado, gravadas em papel (strategy_picks) e medidas por ROI e CLV.
// Regra de ouro: nunca mudar a regra de uma estratégia que já tem histórico; crie uma versão nova (ex.: m-sot-v2).
import { MARKETS } from '../public/engine.js';

const MKT = ['SH', 'SOT', 'SH1', 'SOT1', 'FC', 'FS', 'TK', 'SV', 'TSH', 'TSOT', 'TFC', 'JSH', 'JSOT', 'JFC'];
const edgeOf = r => r.d ? r.p * r.d - 1 : null;
// titular confirmado, ou provável titular (80%+) enquanto a escalação não sai; nunca "em dúvida" ou banco
const starter = (r, min = 0.8) => r.st === 'xi' || (r.st === 'provavel' && r.ps >= min);
const band = r => r.p >= 0.55 && r.p <= 0.85;

export const STRATEGIES = MKT.map(mk => {
  const M = MARKETS[mk], id = (M.kind === 'p' ? 'm-' : M.kind === 't' ? 't-' : 'j-') + mk.toLowerCase();
  const who = M.kind === 'p' ? (M.h1 ? 'titular confirmado ou muito provável (90%+), porque reserva quase nunca entra no 1º tempo'
    : mk === 'SV' ? 'goleiro titular confirmado ou muito provável (90%+)' : 'titular confirmado ou provável (80%+), fora da lista de dúvidas') : null;
  return {
    id, name: M.lb, markets: [mk], max: 5,
    descr: `As 5 melhores entradas do Modelo BH em ${M.lb.toLowerCase()} (só MAIS), com linha e odd real de casa: chance do modelo entre 55% e 85%${who ? ', ' + who : ''}; ordem pela Nota BH.`,
    test: r => !!r.d && r.m === mk && band(r) && (M.kind !== 'p' || starter(r, M.h1 || mk === 'SV' ? 0.9 : 0.8)),
  };
});

/* entradas do dia por estratégia (uma por alvo e mercado; ordem: Nota BH, depois valor esperado) */
export function pickStrategies(bot) {
  const out = [];
  for (const S of STRATEGIES) {
    const rows = bot.rows.filter(r => { try { return S.test(r); } catch { return false; } })
      .sort((a, b) => (b.nt - a.nt) || ((edgeOf(b) ?? -1) - (edgeOf(a) ?? -1)));
    const seen = new Set(); let k = 0;
    for (const r of rows) {
      const key = r.id + '|' + r.m; if (seen.has(key)) continue; seen.add(key);
      out.push({ strategy_id: S.id, pid: r.id, name: r.n, team: r.t, opp: r.o, gid: r.g, mk: r.m, side: 'o', line: r.l, odd: r.d,
        odd_src: r.b, p: r.p, edge: Math.round(edgeOf(r) * 1e4) / 1e4, nota: r.nt, tip_utc: r.utc, fase: r.fase, sq: r.sq?.length ? r.sq : (r.jh ?? null) });
      if (++k >= S.max) break;
    }
  }
  return { date: bot.date, gen: bot.gen, strategies: STRATEGIES.map(({ test, ...s }) => s), picks: out };
}
