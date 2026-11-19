#!/usr/bin/env node
// Última etapa da coleta: linhas das casas + modelo → bot.json e strategies.json.
// Também roda sozinho (node collector/bot.js) para refazer a lista com fotos novas das casas sem gastar a API-Football.
import { readFileSync, writeFileSync } from 'node:fs';
import { fetchHouses, mergeLines } from './lines.js';
import { buildBotData } from './botdata.js';
import { pickStrategies } from './strategies.js';
import { logPrices } from './precos.js';

const OUT = new URL('../public/data/', import.meta.url);
export async function finishBot(slate) {
  let houses = [], lines = new Map(), miss = [];
  try {
    houses = await fetchHouses();
    ({ lines, miss } = mergeLines(houses, slate));
    console.log(`casas: ${houses.map(h => `${h.house} (${h.payload.lines.length})`).join(', ') || 'nenhuma foto recente'} · ${lines.size} linhas encaixadas · ${miss.length} sem par`);
  } catch (e) { console.log('casas: falhou (' + e.message + ')'); }
  const bot = buildBotData(slate, lines, { houses: houses.map(h => ({ house: h.house, at: h.taken_at, n: h.payload.lines.length })) });
  bot.miss = miss.slice(0, 50).map(m => ({ house: m.house, why: m.why, x: m.x }));
  const { hunt, ...rest } = bot;
  writeFileSync(new URL('bot.json', OUT), JSON.stringify(rest));
  writeFileSync(new URL('hunt.json', OUT), JSON.stringify(hunt));
  try { const n = logPrices(bot, new URL('../data/precos/', import.meta.url)); if (n) console.log(`preços: ${n} leituras novas`); } catch (e) { console.log('preços: ' + e.message); }
  const st = pickStrategies(bot);
  writeFileSync(new URL('strategies.json', OUT), JSON.stringify(st));
  console.log(`bot.json: ${bot.rows.length} linhas (${bot.rows.filter(r => r.d).length} com odd de casa) · estratégias: ${st.picks.length} entradas`);
  return { bot, st };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const slate = JSON.parse(readFileSync(new URL('slate.json', OUT), 'utf8'));
  finishBot(slate).catch(e => { console.error(e); process.exit(1); });
}
