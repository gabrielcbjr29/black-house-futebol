// Monta as linhas do bot e do app (bot.json): cada jogador/time × mercado × linha, com chance do modelo, melhor odd
// entre as casas, valor esperado (EV), acertos recentes na mesma linha e Nota BH. Só mercado de MAIS.
// Sem linha de casa, entra a "linha de referência" do modelo (odd justa), só para comparar.
import { MARKETS, playerOver, nbOver, sumK, ev, notaBH, grade, refLine, teamLines } from '../public/engine.js';

const r3 = x => Math.round(x * 1000) / 1000;
const STI = { sh: 1, sot: 2, fc: 3 }; // índice na sequência do time: [jogo, chutes, no gol, faltas, chutes adv., no gol adv., faltas adv.]

function indexLines(lines) {
  const idx = new Map();
  for (const [key, offers] of lines) {
    const [g, target, mk, line] = key.split('|');
    const k = `${g}|${target}|${mk}`;
    (idx.get(k) ?? idx.set(k, []).get(k)).push({ line: +line, offers });
  }
  return idx;
}
const hitRate = (vals, line) => vals.length ? [vals.filter(v => v > line).length, vals.length] : null;

export function buildBotData(slate, lines = new Map(), { houses = [] } = {}) {
  const G = Object.fromEntries(slate.games.map(g => [g.id, g]));
  const idx = indexLines(lines), rows = [];
  const push = (base, mk, probAt, cand, extra) => {
    for (const c of cand) {
      const p = probAt(c.line), best = c.offers[0];
      const e = best ? ev(p, best.odd) : null;
      const nt = notaBH({ p, e, hit: extra.hit?.(c.line), ctx: extra.ctx, cert: extra.cert });
      const h = extra.hit ? extra.hitArr(c.line) : null;
      rows.push({ ...base, m: mk, s: 'o', l: c.line, p: r3(p), d: best?.odd ?? null, b: best?.house ?? null,
        of: c.offers.length > 1 ? c.offers.map(o => [o.house, o.odd]) : undefined, e: e == null ? null : r3(e),
        hit: h, nt, gr: grade(nt), ref: c.offers.length ? undefined : 1 });
    }
  };
  // ---------- jogadores ----------
  for (const [pid, P] of Object.entries(slate.model.players)) {
    const g = G[P.g]; if (!g) continue;
    const mine = g.home.id === P.t ? g.home : g.away, opp = g.home.id === P.t ? g.away : g.home;
    const base = { id: pid, n: P.n, t: mine.name, o: opp.name, home: P.home, g: g.id, lg: g.lg, utc: g.utc, fase: g.fase, pos: P.pos, ps: P.ps, st: P.st, k: 'p' };
    const cert = P.st === 'xi' ? 1 : P.st === 'banco' ? 0.3 : P.ps;
    for (const [mk, [s, b]] of Object.entries(P.mu)) {
      const M = MARKETS[mk]; if (s < 0.04) continue;
      const mu = { start: s, bench: b };
      const probAt = l => playerOver(mu, mk, l, P.ps, P.pb);
      // acertos recentes na linha: só nos jogos em que ele foi titular de fato (60+ min); 1º tempo não tem histórico por jogador
      const vals = M.h1 ? [] : (P.sq?.[M.st] ?? []).filter((_, i) => (P.sq.mn?.[i] ?? 0) >= 60);
      const house = idx.get(`${g.id}|${pid}|${mk}`);
      const ref = house ? null : refLine(probAt, M.lines);
      const cand = house ?? (ref ? [{ line: ref.l, offers: [] }] : []);
      push({ ...base, pj: r3(P.ps * s + (1 - P.ps) * b), sq: (P.sq?.[M.st] ?? []).slice(0, 10), mn: (P.sq?.mn ?? []).slice(0, 10) }, mk, probAt, cand, {
        ctx: P.ctx?.[M.st] ?? 1, cert,
        hit: vals.length >= 3 ? l => hitRate(vals, l)[0] / vals.length : null, hitArr: l => hitRate(vals, l),
      });
    }
  }
  // ---------- times e jogo ----------
  for (const [gid, T] of Object.entries(slate.model.teams)) {
    const g = G[gid]; if (!g) continue;
    for (const st of ['sh', 'sot', 'fc']) {
      const tmk = { sh: 'TSH', sot: 'TSOT', fc: 'TFC' }[st], jmk = { sh: 'JSH', sot: 'JSOT', fc: 'JFC' }[st];
      for (const side of ['h', 'a']) {
        const team = side === 'h' ? g.home : g.away, opp = side === 'h' ? g.away : g.home;
        const mu = T.pj[side][st], k = MARKETS[tmk].k, probAt = l => nbOver(mu, k, l);
        const vals = (T.last?.[side] ?? []).map(x => x[STI[st]]);
        const id = `t${team.id}-${gid}`, house = idx.get(`${gid}|${id}|${tmk}`);
        const ref = house ? null : refLine(probAt, teamLines(mu));
        push({ id, n: team.name, t: team.name, o: opp.name, home: side === 'h', g: g.id, lg: g.lg, utc: g.utc, fase: g.fase, k: 't', pj: r3(mu), sq: vals }, tmk, probAt,
          house ?? (ref ? [{ line: ref.l, offers: [] }] : []), { ctx: 1, cert: 1, hit: vals.length >= 3 ? l => hitRate(vals, l)[0] / vals.length : null, hitArr: l => hitRate(vals, l) });
      }
      // total do jogo: soma dos dois times (dispersão da soma, sem passar do teto do mercado)
      const mh = T.pj.h[st], ma = T.pj.a[st], k = Math.min(sumK(mh, MARKETS[tmk].k, ma, MARKETS[tmk].k), MARKETS[jmk].k);
      const mu = mh + ma, probAt = l => nbOver(mu, k, l);
      const id = `j${gid}`, house = idx.get(`${gid}|${id}|${jmk}`);
      const ref = house ? null : refLine(probAt, teamLines(mu));
      push({ id, n: `${g.home.name} x ${g.away.name}`, t: g.home.name, o: g.away.name, home: true, g: g.id, lg: g.lg, utc: g.utc, fase: g.fase, k: 'j', pj: r3(mu) }, jmk, probAt,
        house ?? (ref ? [{ line: ref.l, offers: [] }] : []), { ctx: 1, cert: 1 });
    }
  }
  rows.sort((a, b) => (b.nt - a.nt) || ((b.e ?? -1) - (a.e ?? -1)));
  // modelo compacto para o /modelo do bot (chance em qualquer linha)
  const mdl = {
    p: Object.fromEntries(Object.entries(slate.model.players).map(([pid, P]) => [pid, { n: P.n, t: P.t, g: P.g, pos: P.pos, ps: P.ps, pb: P.pb, st: P.st, mu: P.mu }])),
    t: Object.fromEntries(Object.entries(slate.model.teams).map(([gid, T]) => [gid, { h: T.h, a: T.a, hn: T.hn, an: T.an, pj: T.pj }])),
  };
  return {
    date: slate.date, gen: slate.gen,
    games: slate.games.map(g => ({ id: g.id, lg: g.lg, utc: g.utc, st: g.status, h: g.home.name, a: g.away.name, hid: g.home.id, aid: g.away.id, fase: g.fase, ref: g.ref || null })),
    injuries: slate.injuries, houses, rows, mdl, ks: Object.fromEntries(Object.entries(MARKETS).map(([k, v]) => [k, v.k])),
  };
}
