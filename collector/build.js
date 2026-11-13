#!/usr/bin/env node
// Coleta do dia (roda no GitHub Actions): jogos de hoje das ligas do projeto, escalações (quando saem),
// desfalques, Modelo BH e, por fim, as linhas das casas → public/data/slate.json, bot.json, strategies.json e results.json.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { applyCalib } from '../public/engine.js';
import { LEAGUE_IDS, dayBR } from '../config/leagues.js';
import { client } from './apifootball.js';
import { pool } from './http.js';
import { loadHistory } from './history.js';
import { buildModel, buildProfiles } from './model.js';
import { finishBot } from './bot.js';
import { buildResults } from './results.js';

const OUT = new URL('../public/data/', import.meta.url);
const LINEUP_WINDOW = 80 * 6e4; // escalação: procura a partir de 80 min antes do jogo
const DONE = new Set(['FT', 'AET', 'PEN', 'PST', 'CANC', 'ABD', 'AWD', 'WO']);

export function parseGames(resp) {
  return resp.filter(fx => LEAGUE_IDS.has(fx.league.id)).map(fx => ({
    id: fx.fixture.id, lg: fx.league.id, round: fx.league.round, utc: new Date(fx.fixture.timestamp * 1000).toISOString(),
    status: fx.fixture.status.short, ref: (fx.fixture.referee || '').split(',')[0].trim(),
    home: { id: fx.teams.home.id, name: fx.teams.home.name }, away: { id: fx.teams.away.id, name: fx.teams.away.name },
  })).sort((a, b) => a.utc.localeCompare(b.utc));
}
export function parseLineups(resp) {
  const out = {};
  for (const t of resp || []) if (t.team?.id && t.startXI?.length) out[t.team.id] = { xi: t.startXI.map(x => x.player.id), bench: (t.substitutes || []).map(x => x.player.id), f: t.formation || '' };
  return Object.keys(out).length === 2 ? out : null;
}
export function parseInjuries(resp) {
  const out = {};
  for (const x of resp || []) {
    const f = x.fixture?.id, p = x.player?.id; if (!f || !p) continue;
    (out[f] ??= {})[p] = /missing/i.test(x.player.type || '') ? 'out' : 'doubt';
  }
  return out;
}

async function main() {
  const date = dayBR(), now = Date.now();
  const api = client();
  const games = parseGames(await api.fixturesByDate(date));
  console.log(`${date}: ${games.length} jogos nas ligas do projeto`);
  let injuries = {};
  try { injuries = parseInjuries(await api.injuriesByDate(date)); } catch (e) { console.log('desfalques: falhou (' + e.message + ')'); }
  // escalações oficiais: só dos jogos que começam em até 80 min (saem cerca de 60 min antes)
  const soon = games.filter(g => !DONE.has(g.status) && Date.parse(g.utc) - now <= LINEUP_WINDOW && Date.parse(g.utc) - now > -150 * 6e4);
  await pool(soon, 4, async g => { try { g.lineup = parseLineups(await api.lineups(g.id)); } catch (e) { console.log(`escalação ${g.id}: ${e.message}`); } });
  for (const g of games) g.fase = g.lineup ? 'escalacao' : 'abertura';
  // dispersão (k) calibrada com o histórico real (npm run calibrar), quando há amostra suficiente
  const cf = new URL('calib.json', OUT);
  if (existsSync(cf)) { const used = applyCalib(JSON.parse(readFileSync(cf, 'utf8'))); if (used.length) console.log('k calibrado: ' + used.join(' · ')); }
  const H = loadHistory();
  const prof = buildProfiles(H);
  const open = games.filter(g => !DONE.has(g.status));
  const model = buildModel(open, H, prof, injuries);
  const slate = { date, gen: new Date().toISOString(), games, injuries, model, api: { used: api.st.used, remaining: api.st.remaining }, hist: H.fixtures.length };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(new URL('slate.json', OUT), JSON.stringify(slate));
  writeFileSync(new URL('results.json', OUT), JSON.stringify(buildResults(H)));
  console.log(`modelo: ${Object.keys(model.players).length} jogadores em ${open.length} jogos · escalação oficial em ${games.filter(g => g.lineup).length} · ${api.st.used} pedidos (cota restante ${api.st.remaining ?? '?'})`);
  await finishBot(slate);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
