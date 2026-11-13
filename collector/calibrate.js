#!/usr/bin/env node
// Validação honesta do Modelo BH com o histórico real (walk-forward): semana a semana, o modelo só enxerga os jogos
// anteriores, prevê os da semana com a escalação que de fato entrou (fase pós-escalação) e compara com o que aconteceu.
// Saída: public/data/calib.json com, por mercado, viés, Brier, faixas de chance (previsto × acertado) e o k sugerido.
import { writeFileSync } from 'node:fs';
import { MARKETS, PLAYER_MK, playerOver, nbOver } from '../public/engine.js';
import { buildModel, buildProfiles } from './model.js';
import { loadHistory, P } from './history.js';

const IDX = { SH: P.sh, SOT: P.sot, FC: P.fc, FS: P.fs, TK: P.tk, SV: P.sv };
const RECENT_DAYS = 75;
const K_GRID = [2, 2.5, 3, 4, 5, 6, 8, 10, 13, 16, 20, 30, 50, 100, 400];
export function bestK(mus, vals, lines) {
  let best = null;
  for (const k of K_GRID) {
    let ll = 0;
    for (let i = 0; i < mus.length; i++) for (const L of lines) {
      const p = Math.min(Math.max(nbOver(mus[i], k, L), 1e-4), 1 - 1e-4);
      ll -= vals[i] > L ? Math.log(p) : Math.log(1 - p);
    }
    if (!best || ll < best.ll) best = { k, ll };
  }
  return best?.k ?? null;
}
export function walkForward(H, { minTrain = 120, step = 7 * 864e5, from = null, raw = true } = {}) {
  const F = H.fixtures; if (F.length <= minTrain) return null;
  // a validação mede o modelo cru (fator de calibração = 1); o fator sai dela
  const saved = Object.fromEntries(Object.entries(MARKETS).map(([k, v]) => [k, v.cf]));
  if (raw) for (const v of Object.values(MARKETS)) delete v.cf;
  try { return walk(F, H, minTrain, step, from); } finally { if (raw) for (const [k, cf] of Object.entries(saved)) if (cf != null) MARKETS[k].cf = cf; }
}
function walk(F, H, minTrain, step, from) {
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
        const val = p[IDX[mk]], a = acc[mk] ??= { n: 0, sumP: 0, hits: 0, brier: 0, bins: {}, mus: [], vals: [], ds: [] };
        a.mus.push(m.mu[mk][0]); a.vals.push(val); a.ds.push(Date.parse(f.d));
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
    let sm = 0; a.mus.forEach(mu => { sm += mu; });
    // fator da média: só com os jogos mais recentes (a média da liga muda de uma temporada para outra)
    const last = Math.max(...a.ds), recent = a.ds.map(d => last - d <= RECENT_DAYS * 864e5);
    let rm = 0, rv = 0, rn = 0; a.mus.forEach((mu, i) => { if (recent[i]) { rm += mu; rv += a.vals[i]; rn++; } });
    const fator = rn >= 1500 && rm > 0 ? rv / rm : a.vals.reduce((x, y) => x + y, 0) / sm;
    // dispersão k: a que dá o menor erro (log loss) nas linhas do mercado, já com a média calibrada
    const kSug = bestK(a.mus.map(mu => mu * fator), a.vals, MARKETS[mk].lines.slice(0, 3));
    out[mk] = { n: a.n, previsto: +(a.sumP / a.n).toFixed(3), acertado: +(a.hits / a.n).toFixed(3), brier: +(a.brier / a.n).toFixed(4),
      media_prevista: +(sm / a.mus.length).toFixed(3), media_real: +(a.vals.reduce((x, y) => x + y, 0) / a.vals.length).toFixed(3), k_atual: MARKETS[mk].k, k_sugerido: kSug,
      fator: +fator.toFixed(3), fator_n: rn,
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
