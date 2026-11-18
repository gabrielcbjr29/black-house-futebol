#!/usr/bin/env node
// Dados de demonstração (simulados): histórico com jogadores de taxas conhecidas, jogos de "hoje" e linhas de uma
// casa fictícia. Serve para os testes e para ver o app e o bot funcionando antes da chave da API-Football.
// Nada aqui é dado real: tudo sai marcado com demo: true.
import { writeFileSync, mkdirSync } from 'node:fs';
import { buildModel, buildProfiles } from './model.js';
import { buildBotData } from './botdata.js';
import { pickStrategies } from './strategies.js';
import { buildResults } from './results.js';
import { dayBR } from '../config/leagues.js';
import { buildRaiox } from './raiox.js';

export function rng(seed = 7) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
export function poisson(r, mu) { const L = Math.exp(-mu); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; }
// binomial negativa por mistura gama-Poisson (dispersão k)
function gamma(r, k) { // Marsaglia-Tsang, escala 1
  if (k < 1) return gamma(r, k + 1) * Math.pow(r(), 1 / k);
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) { let x, v; do { const u1 = r(), u2 = r(); x = Math.sqrt(-2 * Math.log(u1 || 1e-12)) * Math.cos(2 * Math.PI * u2); v = 1 + c * x; } while (v <= 0); v = v * v * v; const u = r(); if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v; }
}
export const nbSample = (r, mu, k) => poisson(r, mu * gamma(r, k) / k);

const POS = ['G', 'D', 'D', 'D', 'D', 'M', 'M', 'M', 'F', 'F', 'F', 'G', 'D', 'M', 'M', 'F', 'F'];
const BASE = { G: { sh: 0, sot: 0, fc: .05, fs: .2, tk: 0, sv: 0 }, D: { sh: .5, sot: .15, fc: 1.1, fs: .7, tk: 1.8 }, M: { sh: 1.2, sot: .38, fc: 1.2, fs: 1.3, tk: 1.5 }, F: { sh: 2.6, sot: 1, fc: 1.1, fs: 1.4, tk: .5 } };

/* histórico simulado: nTeams times, turno e returno; cada jogador tem taxas "verdadeiras" guardadas em truth */
export function synthHistory({ seed = 11, nTeams = 10, lg = 39, season = 2026, start = '2026-08-15', rounds = 18 } = {}) {
  const r = rng(seed), teams = {}, players = {}, truth = {};
  for (let t = 1; t <= nTeams; t++) {
    const tid = lg * 100 + t, atk = 0.75 + 0.5 * r(), def = 0.75 + 0.5 * r(), foul = 0.8 + 0.4 * r();
    teams[tid] = { id: tid, name: `Time ${t}`, atk, def, foul, squad: [] };
    POS.forEach((pos, i) => {
      const pid = tid * 100 + i, mult = 0.6 + 0.8 * r();
      players[pid] = `J${t}.${i} ${pos}`;
      truth[pid] = { pos, t: tid, starter: i < 11, rate: Object.fromEntries(Object.entries(BASE[pos]).map(([k, v]) => [k, v * (k === 'fc' ? foul : 1) * mult])) };
      teams[tid].squad.push(pid);
    });
  }
  const ids = Object.keys(teams).map(Number), fixtures = [];
  let fid = lg * 1e5, day = Date.parse(start + 'T15:00:00Z');
  for (let rd = 0; rd < rounds; rd++) {
    const order = ids.slice(); const rot = rd % (ids.length - 1); // rodízio simples
    const ring = [order[0], ...order.slice(1).slice(rot), ...order.slice(1).slice(0, rot)];
    for (let i = 0; i < ids.length / 2; i++) {
      const [h, a] = rd % 2 ? [ring[i], ring[ids.length - 1 - i]] : [ring[ids.length - 1 - i], ring[i]];
      const rec = { id: ++fid, d: new Date(day + i * 3600e3).toISOString(), lg, s: season, r: `R${rd + 1}`, h, a, ref: `Árbitro ${1 + (fid % 6)}`, g: [0, 0], g1: [null, null], t: {}, t1: null, p: [] };
      for (const [me, op, home] of [[h, a, 1], [a, h, 0]]) {
        const T = teams[me], O = teams[op], tot = [0, 0, 0, 0, 0, 0];
        const shotF = T.atk * O.def * (home ? 1.05 : 0.95), foulF = T.foul * (home ? .98 : 1.02);
        for (const pid of T.squad) {
          const tr = truth[pid];
          const starts = tr.starter ? r() < 0.88 : r() < 0.12;
          const min = starts ? (r() < .7 ? 90 : 60 + Math.floor(r() * 30)) : (r() < .5 && tr.pos !== 'G' ? 10 + Math.floor(r() * 25) : 0);
          const f = min / 90;
          const st = { sh: nbSample(r, tr.rate.sh * shotF * f, 5), fc: nbSample(r, tr.rate.fc * foulF * f, 9), fs: nbSample(r, tr.rate.fs * O.foul * f, 5), tk: nbSample(r, tr.rate.tk * f, 6) };
          st.sot = Math.min(st.sh, poisson(r, st.sh * 0.37));
          rec.p.push([pid, me, min, starts ? 1 : 0, tr.pos, st.sh, st.sot, st.fc, st.fs, st.tk, 0, 0, 0]);
          tot[0] += st.sh; tot[1] += st.sot; tot[2] += st.fc;
        }
        tot[3] = Math.round(50 + 15 * (T.atk - O.atk)); rec.t[me] = tot;
      }
      // defesas do goleiro titular = chutes no gol do adversário menos gols
      for (const [me, op, gi] of [[h, a, 0], [a, h, 1]]) {
        const sot = rec.t[op][1], goals = Math.min(sot, poisson(r, sot * 0.3)); rec.g[1 - gi] = goals;
        const gk = rec.p.find(p => p[1] === me && p[4] === 'G' && p[2] > 0); if (gk) { gk[10] = sot - goals; gk[11] = goals; }
        rec.t[me][4] = sot - goals;
      }
      fixtures.push(rec);
    }
    day += 7 * 864e5;
  }
  return { fixtures, players, teams: Object.fromEntries(Object.entries(teams).map(([k, v]) => [k, v.name])), truth, meta: teams };
}

export function demoSlate({ now = new Date() } = {}) {
  const H = synthHistory({ start: new Date(now.getTime() - (17 * 7 + 2) * 864e5).toISOString().slice(0, 10) }); // última rodada há 2 dias
  const ids = Object.keys(H.teams).map(Number), base = now.getTime();
  const games = [0, 1, 2, 3].map(i => ({
    id: 900000 + i, lg: 39, round: 'R19', utc: new Date(base + (i === 0 ? 40 : 180 + 120 * i) * 6e4).toISOString(), status: 'NS', ref: 'Árbitro 2',
    home: { id: ids[2 * i], name: H.teams[ids[2 * i]] }, away: { id: ids[2 * i + 1], name: H.teams[ids[2 * i + 1]] },
  }));
  // o primeiro jogo já tem a escalação oficial (fase pós-escalação)
  const g0 = games[0], sq = t => H.meta[t].squad;
  g0.lineup = Object.fromEntries([g0.home.id, g0.away.id].map(t => [t, { xi: sq(t).slice(0, 11), bench: sq(t).slice(11), f: '4-3-3' }]));
  for (const g of games) g.fase = g.lineup ? 'escalacao' : 'abertura';
  const prof = buildProfiles(H), model = buildModel(games, H, prof, {});
  const slate = { date: dayBR(now), gen: now.toISOString(), demo: true, games, injuries: {}, inj: [{ g: games[1].id, n: 'J3.16 F', t: games[1].home.name, st: 'out', why: 'Lesão muscular' }, { g: games[2].id, n: 'J6.12 D', t: games[2].away.name, st: 'doubt', why: 'Dores no tornozelo' }], model, hist: H.fixtures.length };
  // casa fictícia com algumas linhas (odds com margem de ~7% sobre a chance "justa" ± ruído)
  const r = rng(3), lines = new Map();
  for (const [pid, P] of Object.entries(model.players)) for (const mk of ['SH', 'SOT', 'FC', 'FS', 'TK']) {
    if (!P.mu[mk] || r() < 0.5) continue;
    const line = mk === 'SOT' ? 0.5 : P.mu[mk][0] > 1.6 ? 1.5 : 0.5;
    lines.set(`${P.g}|${pid}|${mk}|${line}`, [{ house: 'casa-demo', odd: Math.round((1.55 + r() * 1.3) * 100) / 100 }]);
  }
  for (const g of games) lines.set(`${g.id}|j${g.id}|JSH|21.5`, [{ house: 'casa-demo', odd: 1.83 }]);
  const bot = { ...buildBotData(slate, lines, { houses: [{ house: 'casa-demo', at: now.toISOString(), n: lines.size }] }), demo: true };
  return { H, slate, bot, st: pickStrategies(bot), results: buildResults(H, 4, now) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = new URL('../public/data/', import.meta.url); mkdirSync(out, { recursive: true });
  const { H, slate, bot, st, results } = demoSlate();
  const raiox = buildRaiox(H, slate.games, slate.model, { date: slate.date, inj: slate.inj });
  const { hunt, ...botRest } = bot;
  for (const [f, x] of [['slate.json', slate], ['bot.json', botRest], ['hunt.json', hunt], ['raiox.json', raiox], ['strategies.json', { ...st, demo: true }], ['results.json', results]]) writeFileSync(new URL(f, out), JSON.stringify(x));
  console.log(`demo: ${bot.rows.length} linhas, ${st.picks.length} entradas de estratégia`);
}
