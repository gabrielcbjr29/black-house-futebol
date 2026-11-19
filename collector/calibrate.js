#!/usr/bin/env node
// Validação honesta do Modelo BH com o histórico real (walk-forward): semana a semana, o modelo só enxerga os jogos
// anteriores, prevê os da semana com a escalação que de fato entrou (fase pós-escalação) e compara com o que aconteceu.
// Calibração v2 (19/11/2026), por mercado, inclusive os de time e de jogo:
//   1. fator da média global (jogos recentes) e por liga, encolhido para o global quando a liga tem pouca amostra;
//   2. dispersão k que dá o menor erro já com a média corrigida;
//   3. curva de chance (Platt: p' = σ(a + b·logit p)) para corrigir excesso ou falta de confiança.
// Cada peça só entra se melhorar o log loss nos últimos 60 dias, que ficam fora do ajuste (teste fora da amostra).
// Saída: public/data/calib.json.
import { writeFileSync } from 'node:fs';
import { MARKETS, PLAYER_MK, nbOver, sumK } from '../public/engine.js';
import { buildModel, buildProfiles } from './model.js';
import { loadHistory, P, T } from './history.js';

const IDX = { SH: P.sh, SOT: P.sot, FC: P.fc, FS: P.fs, TK: P.tk, SV: P.sv };
const TEAM = { TSH: 'sh', TSOT: 'sot', TFC: 'fc' }, GAME = { JSH: 'sh', JSOT: 'sot', JFC: 'fc' };
const RECENT_DAYS = 75, LEAGUE_DAYS = 240, HOLDOUT_DAYS = 60, SHRINK = 400; // SHRINK: jogos-equivalentes do global na média da liga
const K_GRID = [2, 2.5, 3, 4, 5, 6, 8, 10, 13, 16, 20, 30, 50, 100, 400];
const clampP = p => Math.min(Math.max(p, 1e-4), 1 - 1e-4);
const logit = p => Math.log(clampP(p) / (1 - clampP(p)));
const sig = x => 1 / (1 + Math.exp(-x));

export function bestK(mus, vals, lines) {
  let best = null;
  for (const k of K_GRID) {
    let ll = 0;
    for (let i = 0; i < mus.length; i++) for (const L of lines) {
      const p = clampP(nbOver(mus[i], k, L));
      ll -= vals[i] > L ? Math.log(p) : Math.log(1 - p);
    }
    if (!best || ll < best.ll) best = { k, ll };
  }
  return best?.k ?? null;
}
// linhas avaliadas: as do mercado (jogador) ou cinco em volta da média (time e jogo, como as casas abrem)
const linesOf = (mk, mu) => MARKETS[mk].kind === 'p' ? MARKETS[mk].lines.slice(0, 4) : [-1.5, -0.5, 0.5, 1.5, 2.5].map(d => Math.floor(mu) + d).filter(x => x > 0);

export function walkForward(H, { minTrain = 120, step = 7 * 864e5, from = null, raw = true } = {}) {
  const F = H.fixtures; if (F.length <= minTrain) return null;
  // a validação mede o modelo cru (sem fatores); a calibração sai dela
  const saved = Object.fromEntries(Object.entries(MARKETS).map(([k, v]) => [k, { cf: v.cf, cfl: v.cfl, pl: v.pl }]));
  if (raw) for (const v of Object.values(MARKETS)) { delete v.cf; delete v.cfl; delete v.pl; }
  try { return fit(collect(F, H, minTrain, step, from)); } finally { if (raw) for (const [k, s] of Object.entries(saved)) Object.assign(MARKETS[k], s); }
}

/* junta, para cada mercado, as previsões cruas do walk-forward: média prevista, valor real, liga e data */
export function collect(F, H, minTrain = 120, step = 7 * 864e5, from = null) {
  const R = {}; // mk → { mu:[], v:[], lg:[], d:[] }
  const add = (mk, mu, v, lg, d) => { const r = R[mk] ??= { mu: [], v: [], lg: [], d: [] }; r.mu.push(mu); r.v.push(v); r.lg.push(lg); r.d.push(d); };
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
    for (const f of test) {
      const d = Date.parse(f.d);
      for (const p of f.p) {
        const m = M.players[p[P.id]]; if (!m || !p[P.start] || p[P.min] < 1) continue; // titulares (é o público das estratégias)
        for (const mk of PLAYER_MK) if (m.mu[mk] && !MARKETS[mk].h1) add(mk, m.mu[mk][0], p[IDX[mk]], f.lg, d);
      }
      const Tm = M.teams[f.id], th = f.t?.[f.h], ta = f.t?.[f.a]; if (!Tm || !th || !ta) continue;
      for (const [mk, st] of Object.entries(TEAM)) { add(mk, Tm.pj.h[st], th[T[st]], f.lg, d); add(mk, Tm.pj.a[st], ta[T[st]], f.lg, d); }
      for (const [mk, st] of Object.entries(GAME)) add(mk, Tm.pj.h[st] + Tm.pj.a[st], th[T[st]] + ta[T[st]], f.lg, d);
    }
  }
  return R;
}

/* log loss médio de um conjunto de linhas com média mu·fator, dispersão k e curva (a, b) */
function score(r, idx, fac, k, pl, mk) {
  let ll = 0, n = 0, br = 0;
  for (const i of idx) {
    const mu = r.mu[i] * fac(i);
    for (const L of linesOf(mk, r.mu[i])) {
      let p = nbOver(mu, k, L); if (pl) p = sig(pl.a + pl.b * logit(p));
      const hit = r.v[i] > L; ll -= Math.log(clampP(hit ? p : 1 - p)); br += (p - hit) ** 2; n++;
    }
  }
  return { ll: ll / n, brier: br / n, n };
}
/* ajuste da curva de Platt (Newton em 2 parâmetros) */
function platt(r, idx, fac, k, mk) {
  const X = [], Y = [];
  for (const i of idx) { const mu = r.mu[i] * fac(i); for (const L of linesOf(mk, r.mu[i])) { X.push(logit(nbOver(mu, k, L))); Y.push(r.v[i] > L ? 1 : 0); } }
  let a = 0, b = 1;
  for (let it = 0; it < 30; it++) {
    let ga = 0, gb = 0, haa = 0, hab = 0, hbb = 0;
    for (let j = 0; j < X.length; j++) { const p = sig(a + b * X[j]), w = p * (1 - p), e = p - Y[j]; ga += e; gb += e * X[j]; haa += w; hab += w * X[j]; hbb += w * X[j] * X[j]; }
    const det = haa * hbb - hab * hab; if (Math.abs(det) < 1e-9) break;
    const da = (hbb * ga - hab * gb) / det, db = (haa * gb - hab * ga) / det; a -= da; b -= db;
    if (Math.abs(da) + Math.abs(db) < 1e-7) break;
  }
  return { a: +a.toFixed(4), b: +b.toFixed(4) };
}
/* faixas de chance (previsto × acertado), com destaque para a faixa das estratégias (55–85%) */
function bins(r, idx, fac, k, pl, mk) {
  const B = {}; let zp = 0, zh = 0, zn = 0;
  for (const i of idx) {
    const mu = r.mu[i] * fac(i);
    for (const L of linesOf(mk, r.mu[i])) {
      let p = nbOver(mu, k, L); if (pl) p = sig(pl.a + pl.b * logit(p));
      const hit = r.v[i] > L ? 1 : 0, b = (Math.min(Math.floor(p * 10), 9) / 10).toFixed(1), x = B[b] ??= [0, 0, 0]; x[0] += p; x[1] += hit; x[2]++;
      if (p >= 0.55 && p <= 0.85) { zp += p; zh += hit; zn++; }
    }
  }
  return { faixas: Object.fromEntries(Object.entries(B).sort().map(([b, [sp, h, n]]) => [b, { n, previsto: +(sp / n).toFixed(3), acertado: +(h / n).toFixed(3) }])),
    zona: zn ? { n: zn, previsto: +(zp / zn).toFixed(3), acertado: +(zh / zn).toFixed(3) } : null };
}

export function fit(R) {
  const out = {};
  for (const [mk, r] of Object.entries(R)) {
    const N = r.mu.length; if (N < 300) continue;
    const last = Math.max(...r.d), cut = last - HOLDOUT_DAYS * 864e5;
    const all = [...Array(N).keys()], train = all.filter(i => r.d[i] < cut), test = all.filter(i => r.d[i] >= cut);
    if (train.length < 200 || test.length < 100) continue;
    const sum = (idx, f) => idx.reduce((s, i) => s + f(i), 0);
    // 1. fator global (recente, dentro do treino) e por liga, encolhido
    const tLast = Math.max(...train.map(i => r.d[i])), rec = train.filter(i => tLast - r.d[i] <= RECENT_DAYS * 864e5);
    const base = rec.length >= 1500 ? rec : train;
    const fg = sum(base, i => r.v[i]) / Math.max(sum(base, i => r.mu[i]), 1e-9);
    const fl = {};
    for (const lg of new Set(train.map(i => r.lg[i]))) {
      const li = train.filter(i => r.lg[i] === lg && tLast - r.d[i] <= LEAGUE_DAYS * 864e5); if (!li.length) continue;
      const mm = sum(li, i => r.mu[i]) / li.length;
      fl[lg] = +((sum(li, i => r.v[i]) + SHRINK * mm * fg) / (sum(li, i => r.mu[i]) + SHRINK * mm)).toFixed(3);
    }
    const facG = () => fg, facL = i => fl[r.lg[i]] ?? fg, facRaw = () => 1;
    // 2. k com a média corrigida (no treino)
    const kNow = MARKETS[mk].k, kSug = bestK(train.map(i => r.mu[i] * facL(i)), train.map(i => r.v[i]), linesOf(mk, fg * (sum(train, i => r.mu[i]) / train.length)));
    // 3. escolha fora da amostra: média (crua, global, por liga) × k (atual, sugerido) × curva (sem, com Platt do treino).
    //    Fica a combinação com o menor log loss nos últimos 60 dias; o "cru" é o modelo de hoje, sem nada.
    const facs = { cru: facRaw, global: facG, liga: facL }, cand = [];
    for (const [fn, fac] of Object.entries(facs)) for (const k of [...new Set([kNow, kSug])]) {
      const pl = platt(r, train, fac, k, mk);
      cand.push({ fn, k, pl: null, s: score(r, test, fac, k, null, mk) }, { fn, k, pl, s: score(r, test, fac, k, pl, mk) });
    }
    const base0 = cand.find(c => c.fn === 'cru' && c.k === kNow && !c.pl), best = cand.reduce((a, b) => b.s.ll < a.s.ll - 1e-5 ? b : a, base0);
    const chosen = best === base0 ? 'cru' : `${best.fn}${best.k !== kNow ? ' + k' : ''}${best.pl ? ' + curva' : ''}`;
    const useLiga = best.fn === 'liga', facU = facs[best.fn];
    const S = { cru: base0.s, escolhido: best.s };
    out[mk] = {
      n: N, n_teste: base0.s.n, media_prevista: +(sum(all, i => r.mu[i]) / N).toFixed(3), media_real: +(sum(all, i => r.v[i]) / N).toFixed(3),
      fator: best.fn === 'cru' ? 1 : +fg.toFixed(3), fator_liga: useLiga ? fl : null, fator_liga_visto: fl, k_atual: kNow, k_sugerido: best.k, curva: best.pl,
      logloss_teste: { cru: +base0.s.ll.toFixed(4), escolhido: +best.s.ll.toFixed(4) }, escolhido: chosen,
      ganho_pct: +((1 - best.s.ll / base0.s.ll) * 100).toFixed(2),
      antes: bins(r, test, facRaw, kNow, null, mk), depois: bins(r, test, facU, best.k, best.pl, mk),
      fator_n: base.length,
    };
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = walkForward(loadHistory());
  writeFileSync(new URL('../public/data/calib.json', import.meta.url), JSON.stringify({ v: 2, gen: new Date().toISOString(), mercados: r }));
  for (const [mk, x] of Object.entries(r ?? {})) {
    const z0 = x.antes.zona, z1 = x.depois.zona;
    console.log(`${mk.padEnd(4)} n=${x.n} · média ${x.media_prevista}/${x.media_real} · k ${x.k_atual}→${x.k_sugerido} · ${x.escolhido} · log loss ${x.logloss_teste.cru}→${x.logloss_teste.escolhido} (${x.ganho_pct}%)`
      + (z0 ? ` · zona 55–85%: antes ${z0.previsto}/${z0.acertado} (n ${z0.n})` : '') + (z1 ? ` depois ${z1.previsto}/${z1.acertado} (n ${z1.n})` : ''));
  }
  if (!r) console.log('histórico pequeno demais para validar');
}
