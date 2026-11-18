// Raio-X dos jogos do dia (as melhores ideias do Valuestats, com o nosso histórico da API-Football):
// estatísticas pré-jogo dos dois times com amostra ajustável, "estatísticas de aposta" (% acima das linhas comuns),
// confronto direto, tendências no formato L9/10 (times, jogo e jogadores) e o perfil completo do árbitro.
// Escanteios, cartões e gols entram só como informação: o Modelo BH e as estratégias continuam nos mercados de sempre.
import { P, T } from './history.js';
import { refKey } from './profiles.js';
import { MARKETS } from '../public/engine.js';
import { teamTrends, streak } from '../public/raiox-lib.js';

const r2 = x => x == null ? null : Math.round(x * 100) / 100;
const KEEP = 30; // jogos guardados por time (o app deixa escolher de 3 a 30)

/* linha de um jogo do ponto de vista do time "me" (layout em public/raiox-lib.js) */
export function rowOf(f, me) {
  const op = f.h === me ? f.a : f.h, a = f.t?.[me], b = f.t?.[op]; if (!a || !b) return null;
  const home = f.h === me, gF = home ? f.g?.[0] : f.g?.[1], gA = home ? f.g?.[1] : f.g?.[0];
  let ycF = 0, ycA = 0; for (const p of f.p ?? []) { if (p[P.team] === me) ycF += p[P.yc] || 0; else if (p[P.team] === op) ycA += p[P.yc] || 0; }
  const a1 = f.t1?.[me], b1 = f.t1?.[op];
  return [f.id, f.d.slice(0, 10), op, home ? 1 : 0, f.lg, gF ?? null, gA ?? null, a[T.sh], b[T.sh], a[T.sot], b[T.sot], a[T.fc], b[T.fc],
    a[T.cor] ?? null, b[T.cor] ?? null, ycF, ycA, a1 ? a1[0] : null, b1 ? b1[0] : null, a1 ? a1[1] : null, b1 ? b1[1] : null];
}

/* árbitro: amostra completa (2 temporadas) e últimos 20 jogos. Cartões = amarelos (a API por jogador não separa o vermelho direto). */
export function refereeStats(fixtures, key) {
  const fx = fixtures.filter(f => f.ref && refKey(f.ref) === key && f.t?.[f.h] && f.t?.[f.a]).sort((a, b) => b.d.localeCompare(a.d));
  if (!fx.length) return null;
  const one = list => {
    if (!list.length) return null;
    let fc = 0, yc = 0, o35 = 0, o45 = 0, o55 = 0, b1 = 0, b2 = 0, cor = 0, sh = 0;
    for (const f of list) {
      let yh = 0, ya = 0; for (const p of f.p) { if (p[P.team] === f.h) yh += p[P.yc] || 0; else if (p[P.team] === f.a) ya += p[P.yc] || 0; }
      const y = yh + ya, F = f.t[f.h][T.fc] + f.t[f.a][T.fc];
      fc += F; yc += y; o35 += y > 3.5; o45 += y > 4.5; o55 += y > 5.5; b1 += yh >= 1 && ya >= 1; b2 += yh >= 2 && ya >= 2;
      cor += (f.t[f.h][T.cor] ?? 0) + (f.t[f.a][T.cor] ?? 0); sh += f.t[f.h][T.sh] + f.t[f.a][T.sh];
    }
    const n = list.length;
    return { n, fc: r2(fc / n), yc: r2(yc / n), o35: r2(o35 / n), o45: r2(o45 / n), o55: r2(o55 / n), b1: r2(b1 / n), b2: r2(b2 / n), cor: r2(cor / n), sh: r2(sh / n) };
  };
  // régua: média das mesmas ligas nos mesmos períodos (todas as partidas das ligas em que ele apitou)
  const lgs = new Set(fx.map(f => f.lg)), from = fx[fx.length - 1].d;
  const base = fixtures.filter(f => lgs.has(f.lg) && f.d >= from && f.t?.[f.h] && f.t?.[f.a]);
  const lg = one(base);
  const last5 = fx.slice(0, 5).map(f => {
    let y = 0; for (const p of f.p) y += p[P.yc] || 0;
    return [f.d.slice(0, 10), f.h, f.a, f.g?.[0] ?? null, f.g?.[1] ?? null, y, f.t[f.h][T.fc] + f.t[f.a][T.fc]];
  });
  return { name: fx[0].ref, all: one(fx), l20: one(fx.slice(0, 20)), lg: lg && { fc: lg.fc, yc: lg.yc, o45: lg.o45 }, last5 };
}

/* tendências de jogadores (titular 60+ min): a linha mais alta de cada mercado que fecha L x/y, com por 90 e a sequência */
const HXI = { SH: 4, SOT: 5, FC: 6, FS: 7, TK: 8, SV: 9 }, STK = { SH: 'sh', SOT: 'sot', FC: 'fc', FS: 'fs', TK: 'tk', SV: 'sv' };
export function playerTrends(model, { min = 6, max = 20 } = {}) {
  const out = [];
  for (const [pid, m] of Object.entries(model.players ?? {})) {
    if (m.st === 'banco' || (m.st !== 'xi' && m.ps < 0.6) || !m.hx?.length) continue;
    const g = m.hx.filter(h => h[1] && h[0] >= 60);
    for (const [mk, c] of Object.entries(HXI)) {
      if (!m.mu?.[mk]) continue;
      const vals = g.map(h => h[c]);
      for (const l of [...MARKETS[mk].lines].reverse()) {
        const st = streak(vals.map(v => v > l), { min, max }); if (!st) continue;
        out.push({ pid, g: m.g, mk, l, x: st.x, y: st.y, run: st.run, p90: m.ss?.p90?.[STK[mk]] ?? null, vals: vals.slice(0, st.y) }); break;
      }
    }
  }
  return out.sort((a, b) => b.y - a.y || b.x - a.x || b.l - a.l);
}

export function buildRaiox(H, games, model, { date, inj = [] } = {}) {
  const ids = new Set(games.flatMap(g => [g.home.id, g.away.id])), byTeam = {};
  for (let i = H.fixtures.length - 1; i >= 0; i--) {
    const f = H.fixtures[i];
    for (const me of [f.h, f.a]) if (ids.has(me) && (byTeam[me] ??= []).length < KEEP) { const r = rowOf(f, me); if (r) byTeam[me].push(r); }
  }
  const tn = {}, rf = {}, tr = [];
  const name = id => H.teams[id] ?? String(id);
  const out = games.map(g => {
    const h = g.home.id, a = g.away.id;
    for (const id of [h, a]) tn[id] = name(id);
    const tm = { [h]: byTeam[h] ?? [], [a]: byTeam[a] ?? [] };
    for (const r of [...tm[h], ...tm[a]]) tn[r[2]] ??= name(r[2]);
    // confronto direto: do ponto de vista do mandante de hoje, os 5 mais recentes (qualquer mando)
    const h2h = H.fixtures.filter(f => (f.h === h && f.a === a) || (f.h === a && f.a === h)).sort((x, y) => y.d.localeCompare(x.d)).slice(0, 5).map(f => rowOf(f, h)).filter(Boolean);
    const rk = g.ref ? refKey(g.ref) : null;
    if (rk && !(rk in rf)) rf[rk] = refereeStats(H.fixtures, rk);
    // tendências dos dois times; "os dois": a tendência de jogo também vale nos jogos do adversário, na mesma linha
    const T2 = { [h]: teamTrends(tm[h], { venue: 'casa' }), [a]: teamTrends(tm[a], { venue: 'fora' }) };
    for (const [me, op] of [[h, a], [a, h]]) for (const t of T2[me]) {
      if (t.k === 'j') t.b = T2[op].some(u => u.k === 'j' && u.s === t.s && u.side === t.side && (t.side === 'o' ? u.l >= t.l : u.l <= t.l)) ? 1 : 0;
      tr.push({ g: g.id, t: me, ...t });
    }
    return { id: g.id, lg: g.lg, utc: g.utc, h, a, ref: g.ref || null, rk, tm, h2h, inj: inj.filter(x => x.g === g.id) };
  });
  return { date, gen: new Date().toISOString(), tn, g: out, rf, tr, pt: playerTrends(model) };
}
