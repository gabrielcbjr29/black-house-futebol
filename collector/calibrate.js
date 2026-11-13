#!/usr/bin/env node
// Validação honesta do Modelo BH com o histórico real (walk-forward): semana a semana, o modelo só enxerga os jogos
// anteriores, prevê os da semana com a escalação que de fato entrou (fase pós-escalação) e compara com o que aconteceu.
// Saída: public/data/calib.json com, por mercado, viés, Brier, faixas de chance (previsto × acertado) e o k sugerido.
import { writeFileSync } from 'node:fs';
import { MARKETS, PLAYER_MK, playerOver, nbOver } from '../public/engine.js';
import { buildModel, buildProfiles } from './model.js';
import { loadHistory, P } from './history.js';

const IDX = { SH: P.sh, SOT: P.sot, FC: P.fc, FS: P.fs, TK: P.tk, SV: P.sv };
export function walkForward(H, { minTrain = 120, step = 7 * 864e5, from = null } = {}) {
  const F = H.fixtures; if (F.length <= minTrain) return null;
  const acc = {}; // mk → { n, sumP, hits, brier, bins:{}, mus:[], vals:[] }
  let t0 = Date.parse(from ?? F[minTrain].d);
  const end = Date.parse(F[F.length - 1].d) + 1;
  while (t0 < end) {
    const t1 = t0 + step;
    const train = { ...H, fixtures: F.filter(f => Date.parse(f.d) < t0) };
    const test = F.filter(f => Date.parse(f.d) >= t0 && Date.parse(f.d) < t1);
    t0 = t1; if (!test.length) continue;
    const games = test.map(f => ({ id: f.id, lg: f.lg, utc: f.d, status: 'NS', ref: f.ref, home: { id: f.h, name: '' }, away: { id: f.a, name: '' },
      lineup: Object.fromEntries([f.h, f.a].map(t => [t, { xi: f.p.filter(p => p[P.team] === t && p[P.start]).map(p => p[P.id]), bench: f.p.filter(p => p[P.team] === t && !p[P.start]).map(p => p[P.id]) }])) }));
    const M = buildModel(games, train, buildProfiles(train));
    for (const f of test) for (const p of f.p) {
      const m = M.players[p[P.id]]; if (!m || !p[P.start] || p[P.min] < 1) continue; // titulares (é o público das estratégias)
      for (const mk of PLAYER_MK) {
        if (!m.mu[mk] || MARKETS[mk].h1) continue;
        const val = p[IDX[mk]], a = acc[mk] ??= { n: 0, sumP: 0, hits: 0, brier: 0, bins: {}, mus: [], vals: [] };
        a.mus.push(m.mu[mk][0]); a.vals.push(val);
        for (const L of MARKETS[mk].lines.slice(0, 3)) {
          const pr = playerOver({ start: m.mu[mk][0], bench: 0 }, mk, L, 1, 0), hit = val > L ? 1 : 0;
          a.n++; a.sumP += pr; a.hits += hit; a.brier += (pr - hit) ** 2;
          const b = (Math.floor(pr * 10) / 10).toFixed(1), B = a.bins[b] ??= [0, 0, 0]; B[0] += pr; B[1] += hit; B[2]++;
        }
      }
    }
  }
  const out = {};
  for (const [mk, a] of Object.entries(acc)) {
    // k sugerido pelo método dos momentos nos resíduos: var = mu + mu²/k
    let sm = 0, sv = 0, sm2 = 0; a.mus.forEach((mu, i) => { sm += mu; sv += (a.vals[i] - mu) ** 2; sm2 += mu * mu; });
    const kSug = sv > sm ? +(sm2 / (sv - sm)).toFixed(1) : null;
    out[mk] = { n: a.n, previsto: +(a.sumP / a.n).toFixed(3), acertado: +(a.hits / a.n).toFixed(3), brier: +(a.brier / a.n).toFixed(4),
      media_prevista: +(sm / a.mus.length).toFixed(3), media_real: +(a.vals.reduce((x, y) => x + y, 0) / a.vals.length).toFixed(3), k_atual: MARKETS[mk].k, k_sugerido: kSug,
      faixas: Object.fromEntries(Object.entries(a.bins).sort().map(([b, [sp, h, n]]) => [b, { n, previsto: +(sp / n).toFixed(3), acertado: +(h / n).toFixed(3) }])) };
  }
  return out;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const r = walkForward(loadHistory());
  writeFileSync(new URL('../public/data/calib.json', import.meta.url), JSON.stringify({ gen: new Date().toISOString(), mercados: r }));
  for (const [mk, x] of Object.entries(r ?? {})) console.log(`${mk.padEnd(4)} n=${x.n} previsto ${x.previsto} × acertado ${x.acertado} · Brier ${x.brier} · média ${x.media_prevista}/${x.media_real} · k ${x.k_atual}→${x.k_sugerido}`);
  if (!r) console.log('histórico pequeno demais para validar');
}
