// Monta as linhas do bot e do app (bot.json): cada jogador/time × mercado × linha, com chance do modelo, melhor odd
// entre as casas, valor esperado (EV), acertos recentes na mesma linha e Nota BH. rows = MAIS (listas do bot e app);
// rowsU = MENOS de time e jogo (só com linha de casa; usado pela Tendência e pelos alertas).
// Sem linha de casa, entra a "linha de referência" do modelo (odd justa), só para comparar.
import { MARKETS, playerOver, nbOver, sumK, ev, notaBH, grade, refLine, teamLines } from '../public/engine.js';

const r3 = x => Math.round(x * 1000) / 1000;
const STI = { sh: 1, sot: 2, fc: 3 }; // índice na sequência do time: [jogo, chutes, no gol, faltas, chutes adv., no gol adv., faltas adv.]

function indexLines(lines) {
  const idx = new Map();
  for (const [key, offers] of lines) {
    const [g, target, mk, line, side] = key.split('|');
    const k = `${g}|${target}|${mk}${side === 'u' ? '|u' : ''}`;
    (idx.get(k) ?? idx.set(k, []).get(k)).push({ line: +line, offers });
  }
  return idx;
}
const hitRate = (vals, line) => vals.length ? [vals.filter(v => v > line).length, vals.length] : null;
// sequência: quantos jogos seguidos (do mais recente para trás) ele passou da linha
const streak = (vals, line) => { let n = 0; for (const v of vals) { if (v > line) n++; else break; } return n; };
const avgOf = a => a.length ? r3(a.reduce((x, y) => x + y, 0) / a.length) : null;
// quanto o adversário cede por jogo (últimos 10 jogos dele): [jogo, chutes, no gol, faltas, chutes adv., no gol adv., faltas adv.]
// chutes/no gol do jogador → o que o adversário sofre; faltas cometidas → faltas que o adversário sofre;
// faltas sofridas → faltas que o adversário comete; defesas do goleiro → chutes no gol que o adversário dá
const OPP_COL = { sh: 4, sot: 5, fc: 6, fs: 3, sv: 2 };
// valores de uma estatística nos jogos em que ele foi titular de fato (60+ min), do mais recente para o mais antigo
const starts = (sq, st) => (sq?.[st] ?? []).filter((_, i) => (sq.mn?.[i] ?? 0) >= 60).slice(0, 10);

// Tendência: acertos na linha nos últimos N (L5/L10/L20), contra o adversário e posição dele no ranking de defesa
const hitsSide = (vals, line, u) => vals.length ? [vals.filter(v => u ? v < line : v > line).length, vals.length] : null;
const tdOf = (v20, vs, line, u, df) => ({ l5: hitsSide(v20.slice(0, 5), line, u), l10: hitsSide(v20.slice(0, 10), line, u), l20: hitsSide(v20.slice(0, 20), line, u), vs: hitsSide(vs, line, u) ?? [0, 0], df });
const HXI = { sh: 4, sot: 5, fc: 6, fs: 7, tk: 8, sv: 9 }, VSI = { sh: 2, sot: 3, fc: 4, fs: 5, tk: 6, sv: 7 };

export function buildBotData(slate, lines = new Map(), { houses = [] } = {}) {
  const G = Object.fromEntries(slate.games.map(g => [g.id, g]));
  const idx = indexLines(lines), rows = [], rowsU = [], T0 = slate.model.teams;
  // side 'u' (MENOS): só existe em time e jogo, e só com linha de casa; vai para rowsU (Tendência e alertas), fora das listas do bot
  const push = (base, mk, probAt, cand, extra, side = 'o') => {
    const v = extra.vals ?? [], u = side === 'u';
    for (const c of cand) {
      const po = probAt(c.line), p = u ? 1 - po : po, best = c.offers[0];
      const e = best ? ev(p, best.odd) : null;
      const h10 = hitsSide(v.slice(0, 10), c.line, u), h5 = hitsSide(v.slice(0, 5), c.line, u);
      const nt = notaBH({ p, e, hit: h10 && h10[1] >= 3 ? h10[0] / h10[1] : null, ctx: u ? 1 / (extra.ctx || 1) : extra.ctx, cert: extra.cert });
      const td = best && extra.td ? extra.td(c.line, u) : undefined;
      // at = hora da leitura da odd (a da melhor casa): com 2 h ou mais, o bot e o PDF avisam para conferir
      (u ? rowsU : rows).push({ ...base, m: mk, s: side, l: c.line, p: r3(p), d: best?.odd ?? null, b: best?.house ?? null, at: best?.at ?? undefined,
        of: c.offers.length > 1 ? c.offers.map(o => [o.house, o.odd]) : undefined, e: e == null ? null : r3(e),
        hit: h10, h5, sk: v.length ? (u ? streak(v.map(x => -x), -c.line) : streak(v, c.line)) : undefined, nt, gr: grade(nt), ref: c.offers.length ? undefined : 1, td });
    }
  };
  // ---------- jogadores ----------
  for (const [pid, P] of Object.entries(slate.model.players)) {
    const g = G[P.g]; if (!g) continue;
    const mine = g.home.id === P.t ? g.home : g.away, opp = g.home.id === P.t ? g.away : g.home;
    const base = { id: pid, n: P.n, t: mine.name, o: opp.name, home: P.home, g: g.id, lg: g.lg, utc: g.utc, fase: g.fase, pos: P.pos, ps: P.ps, st: P.st, k: 'p', ms: P.ms };
    const cert = P.st === 'xi' ? 1 : P.st === 'banco' ? 0.3 : P.ps;
    for (const [mk, [s, b]] of Object.entries(P.mu)) {
      const M = MARKETS[mk]; if (s < 0.04) continue;
      const mu = { start: s, bench: b };
      const probAt = l => playerOver(mu, mk, l, P.ps, P.pb);
      // sequência e acertos: só nos jogos em que ele foi titular de fato (60+ min), do mais recente para o mais antigo.
      // 1º tempo: não há dado por jogador, então sem sequência.
      const vals = M.h1 ? [] : starts(P.sq, M.st);
      const house = idx.get(`${g.id}|${pid}|${mk}`);
      const ref = house ? null : refLine(probAt, M.lines);
      const cand = house ?? (ref ? [{ line: ref.l, offers: [] }] : []);
      // números extras do card: por 90 e média como titular na temporada, casa × fora, quanto o adversário cede
      const st = M.st, ss = P.ss, oc = OPP_COL[st], ol = T0[g.id]?.last?.[P.home ? 'a' : 'h'] ?? [];
      const ex = ss ? { p90: ss.p90?.[st] ?? null, sa: ss.st?.[st] ?? null, ns: ss.ns, hm: ss.hm?.[st] ?? null, nh: ss.hm?.n ?? 0, aw: ss.aw?.[st] ?? null, na: ss.aw?.n ?? 0,
        pa: ss.pv?.ns >= 3 ? ss.pv.st?.[st] ?? null : null, np: ss.pv?.ns ?? 0,
        oa: oc != null ? avgOf(ol.map(x => x[oc])) : null, op: P.op?.[st] ?? null } : undefined;
      // Tendência: últimos 20 jogos como titular (60+ min), jogos contra o adversário e defesa dele contra a posição
      const v20 = M.h1 ? [] : (P.hx ?? []).filter(h => h[1] && h[0] >= 60).map(h => h[HXI[st]]);
      const vsv = (P.vs ?? []).map(x => x[VSI[st]]), dpos = T0[g.id]?.def?.[P.home ? 'a' : 'h']?.pos?.[P.pos]?.[st] ?? null;
      push({ ...base, pj: r3(P.ps * s + (1 - P.ps) * b), ps1: r3(s), sq: vals, cx: P.ctx?.[M.st] ?? 1, ex }, mk, probAt, cand, {
        ctx: P.ctx?.[M.st] ?? 1, cert, vals, td: M.h1 ? null : (l, u) => tdOf(v20, vsv, l, u, dpos),
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
        const v20 = (T.last?.[side] ?? []).map(x => x[STI[st]]), vals = v20.slice(0, 10);
        const id = `t${team.id}-${gid}`, house = idx.get(`${gid}|${id}|${tmk}`), houseU = idx.get(`${gid}|${id}|${tmk}|u`);
        const ref = house ? null : refLine(probAt, teamLines(mu));
        const ol = (T.last?.[side === 'h' ? 'a' : 'h'] ?? []).slice(0, 10), oa = avgOf(ol.map(x => x[STI[st] + 3]));
        const vsv = (T.h2h ?? []).map(x => x[STI[st] + (side === 'h' ? 0 : 3)]), dft = T.def?.[side === 'h' ? 'a' : 'h']?.t?.[st] ?? null;
        const extra = { ctx: 1, cert: 1, vals, td: (l, u) => tdOf(v20, vsv, l, u, dft) };
        const base = { id, n: team.name, t: team.name, o: opp.name, home: side === 'h', g: g.id, lg: g.lg, utc: g.utc, fase: g.fase, k: 't', pj: r3(mu), sq: vals, ex: { oa, sa: avgOf(vals) } };
        push(base, tmk, probAt, house ?? (ref ? [{ line: ref.l, offers: [] }] : []), extra);
        if (houseU) push(base, tmk, probAt, houseU, extra, 'u');
      }
      // total do jogo: soma dos dois times (dispersão da soma, sem passar do teto do mercado)
      const mh = T.pj.h[st], ma = T.pj.a[st], k = Math.min(sumK(mh, MARKETS[tmk].k, ma, MARKETS[tmk].k), MARKETS[jmk].k);
      const mu = mh + ma, probAt = l => nbOver(mu, k, l);
      const id = `j${gid}`, house = idx.get(`${gid}|${id}|${jmk}`), houseU = idx.get(`${gid}|${id}|${jmk}|u`);
      const ref = house ? null : refLine(probAt, teamLines(mu));
      // jogo: total dos últimos jogos de cada time (com os adversários que eles tiveram)
      const tot = side => (T.last?.[side] ?? []).map(x => x[STI[st]] + x[STI[st] + 3]);
      // Tendência no jogo: a sequência vale para os DOIS times (cada um nos seus jogos); defesa = ranking de total por jogo dos dois
      const th = tot('h'), ta = tot('a'), vsv = (T.h2h ?? []).map(x => x[STI[st]] + x[STI[st] + 3]);
      const dj = [T.def?.h?.j?.[st] ?? null, T.def?.a?.j?.[st] ?? null];
      const extra = { ctx: 1, cert: 1, vals: [...th.slice(0, 5), ...ta.slice(0, 5)],
        td: (l, u) => { const a = tdOf(th, vsv, l, u, dj[0]), b = tdOf(ta, [], l, u, dj[1]); return { l5: [a.l5, b.l5], l10: [a.l10, b.l10], l20: [a.l20, b.l20], vs: a.vs, df: dj, both: 1 }; } };
      const base = { id, n: `${g.home.name} x ${g.away.name}`, t: g.home.name, o: g.away.name, home: true, g: g.id, lg: g.lg, utc: g.utc, fase: g.fase, k: 'j', pj: r3(mu), jh: th.slice(0, 10), ja: ta.slice(0, 10) };
      push(base, jmk, probAt, house ?? (ref ? [{ line: ref.l, offers: [] }] : []), extra);
      if (houseU) push(base, jmk, probAt, houseU, extra, 'u');
    }
  }
  rows.sort((a, b) => (b.nt - a.nt) || ((b.e ?? -1) - (a.e ?? -1)));
  // modelo compacto para o /modelo do bot (chance em qualquer linha) e sequência como titular de cada estatística
  const mdl = {
    p: Object.fromEntries(Object.entries(slate.model.players).map(([pid, P]) => {
      const g = G[P.g], mine = g?.home.id === P.t ? g?.home : g?.away, opp = g?.home.id === P.t ? g?.away : g?.home;
      return [pid, { n: P.n, t: P.t, tn: mine?.name, on: opp?.name, home: P.home, g: P.g, lg: g?.lg, utc: g?.utc, pos: P.pos, ps: P.ps, pb: P.pb, st: P.st, ms: P.ms, gap: P.gap ?? 0, mu: P.mu,
        sq: Object.fromEntries(['sh', 'sot', 'fc', 'fs', 'tk', 'sv'].map(k => [k, starts(P.sq, k)])) }];
    })),
    t: Object.fromEntries(Object.entries(slate.model.teams).map(([gid, T]) => [gid, { h: T.h, a: T.a, hn: T.hn, an: T.an, pj: T.pj, ref: T.ref, rf: T.rf, reg: T.reg }])),
  };
  // cards em imagem: as melhores do dia (uma por jogador, odds 1,40–3,50)
  const seen = new Set(); let nc = 0;
  for (const r of rows) {
    if (nc >= 12) break;
    const o = r.d ?? 1 / r.p; if (r.k !== 'p' || o < 1.4 || o > 3.5 || seen.has(r.id)) continue;
    seen.add(r.id); r.cd = 1; nc++;
  }
  return {
    date: slate.date, gen: slate.gen,
    games: slate.games.map(g => ({ id: g.id, lg: g.lg, utc: g.utc, st: g.status, h: g.home.name, a: g.away.name, hid: g.home.id, aid: g.away.id, fase: g.fase, ref: g.ref || null })),
    injuries: slate.injuries, inj: slate.inj ?? [], refs: slate.refs ?? {}, houses, rows, rowsU, mdl,
    // Caçador: últimos 20 jogos de cada jogador do dia [min, titular, casa, liga, chutes, no gol, f.com., f.sofr., desarmes, defesas]
    hunt: { date: slate.date, gen: slate.gen, p: Object.fromEntries(Object.entries(slate.model.players).filter(([, P]) => P.hx?.length).map(([pid, P]) => [pid, P.hx.map(h => h.slice(0, 10))])) },
    ks: Object.fromEntries(Object.entries(MARKETS).map(([k, v]) => [k, v.k])),
  };
}
