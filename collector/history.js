#!/usr/bin/env node
// Histórico próprio: guarda, jogo a jogo, as estatísticas de cada jogador e de cada time das ligas do projeto
// (data/hist/<liga>-<temporada>.json). É a base do modelo e da conferência das entradas.
// Roda de forma incremental: lista os jogos encerrados de cada liga e busca só os que ainda faltam
// (2 pedidos por jogo: jogadores e estatísticas do time). Teto por execução: HIST_MAX_RUN.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { LEAGUES, HIST_SEASONS } from '../config/leagues.js';
import { client } from './apifootball.js';
import { pool } from './http.js';

export const HIST_DIR = new URL('../data/hist/', import.meta.url);
// linha de jogador: [id, time, minutos, titular(1/0), posição, chutes, no gol, faltas cometidas, faltas sofridas, desarmes, defesas, gols sofridos, amarelos]
export const P = { id: 0, team: 1, min: 2, start: 3, pos: 4, sh: 5, sot: 6, fc: 7, fs: 8, tk: 9, sv: 10, gc: 11, yc: 12 };
// estatística de time: [chutes, no gol, faltas, posse, defesas, escanteios]
export const T = { sh: 0, sot: 1, fc: 2, poss: 3, sv: 4, cor: 5 };
const FINISHED = 'FT-AET-PEN';

const num = v => v == null || v === '' ? 0 : (typeof v === 'string' ? parseFloat(v) || 0 : +v || 0);
function teamVec(list = []) {
  const m = Object.fromEntries((list || []).map(s => [s.type, s.value]));
  return [num(m['Total Shots']), num(m['Shots on Goal']), num(m['Fouls']), num(m['Ball Possession']), num(m['Goalkeeper Saves']), num(m['Corner Kicks'])];
}

/* Converte as respostas da API-Football de um jogo encerrado no registro compacto do histórico. */
export function ingestFixture(fx, playersResp = [], statsResp = []) {
  const t = {}, t1 = {}, p = [], names = {}, tnames = {};
  for (const s of statsResp || []) {
    const id = s.team?.id; if (!id) continue;
    t[id] = teamVec(s.statistics);
    if (Array.isArray(s.statistics_1h) && s.statistics_1h.length) t1[id] = teamVec(s.statistics_1h).slice(0, 3);
  }
  for (const side of playersResp || []) {
    const tid = side.team?.id; if (!tid) continue; tnames[tid] = side.team.name;
    for (const pl of side.players || []) {
      const s = pl.statistics?.[0] || {}, g = s.games || {};
      const min = num(g.minutes); names[pl.player.id] = pl.player.name;
      const start = g.substitute === false ? 1 : 0;
      p.push([pl.player.id, tid, min, start, g.position || '', num(s.shots?.total), num(s.shots?.on), num(s.fouls?.committed), num(s.fouls?.drawn),
        num(s.tackles?.total), num(s.goals?.saves), num(s.goals?.conceded), num(s.cards?.yellow)]);
    }
  }
  return {
    rec: {
      id: fx.fixture.id, d: fx.fixture.date, lg: fx.league.id, s: fx.league.season, r: fx.league.round || '',
      h: fx.teams.home.id, a: fx.teams.away.id, ref: (fx.fixture.referee || '').split(',')[0].trim(),
      g: [fx.goals?.home ?? null, fx.goals?.away ?? null], g1: [fx.score?.halftime?.home ?? null, fx.score?.halftime?.away ?? null],
      t, t1: Object.keys(t1).length ? t1 : null, p,
    },
    names, tnames: { [fx.teams.home.id]: fx.teams.home.name, [fx.teams.away.id]: fx.teams.away.name, ...tnames },
  };
}

// um arquivo por liga e temporada, um jogo por linha (NDJSON) e em ordem de data: cada coleta só acrescenta linhas,
// então o git guarda diferenças pequenas (o repositório não incha). Os nomes ficam num arquivo à parte.
export function fileOf(lg, season, ext = 'ndjson') { return new URL(`${lg.key}-${season}.${ext}`, HIST_DIR); }
export function loadFile(lg, season) {
  const f = fileOf(lg, season), fn = fileOf(lg, season, 'names.json');
  const out = { lg: lg.id, season, fixtures: {}, players: {}, teams: {}, complete: false, skip: {} };
  if (existsSync(f)) for (const l of readFileSync(f, 'utf8').split('\n')) if (l.trim()) { const r = JSON.parse(l); out.fixtures[r.id] = r; }
  if (existsSync(fn)) Object.assign(out, JSON.parse(readFileSync(fn, 'utf8')));
  return out;
}
export function saveFile(lg, season, file) {
  const recs = Object.values(file.fixtures).sort((a, b) => a.d.localeCompare(b.d) || a.id - b.id);
  writeFileSync(fileOf(lg, season), recs.map(r => JSON.stringify(r)).join('\n') + (recs.length ? '\n' : ''));
  writeFileSync(fileOf(lg, season, 'names.json'), JSON.stringify({ players: file.players, teams: file.teams, complete: file.complete, skip: file.skip ?? {} }));
}
// junta todas as ligas e temporadas num só histórico (ordem: do jogo mais antigo para o mais novo)
export function loadHistory() {
  const H = { fixtures: [], players: {}, teams: {} };
  for (const lg of LEAGUES) for (const s of HIST_SEASONS) {
    const f = loadFile(lg, s); Object.assign(H.players, f.players); Object.assign(H.teams, f.teams);
    for (const r of Object.values(f.fixtures)) H.fixtures.push(r);
  }
  H.fixtures.sort((a, b) => a.d.localeCompare(b.d));
  return H;
}

async function main() {
  mkdirSync(HIST_DIR, { recursive: true });
  const api = client({ max: +(process.env.HIST_MAX_RUN || 1500) });
  const today = new Date().toISOString().slice(0, 10);
  let novos = 0;
  // reserva da cota diária para a coleta do dia (jogos, escalações, desfalques): o histórico para antes dela
  const RESERVE = +(process.env.HIST_RESERVE || 800);
  outer: for (const s of [...HIST_SEASONS].reverse()) for (const lg of LEAGUES) {
    if (api.st.remaining != null && api.st.remaining < RESERVE) { console.log(`parando: cota restante ${api.st.remaining} (reserva ${RESERVE})`); break; }
    const file = loadFile(lg, s);
    if (file.complete) continue; // temporada passada já guardada inteira
    let list;
    try { list = await api.fixturesRange(lg.id, s, `${s - 1}-07-01`, today, FINISHED); }
    catch (e) { console.log(`${lg.key} ${s}: lista falhou (${e.message})`); if (e.quota) break outer; continue; }
    // jogo sem estatística de jogador na API (fases preliminares, por exemplo): desiste depois de 3 tentativas
    const skip = file.skip ??= {}, MAX_TRIES = 3;
    const missing = list.filter(fx => !file.fixtures[fx.fixture.id] && (skip[fx.fixture.id] ?? 0) < MAX_TRIES);
    // os mais recentes primeiro: são os que mais pesam no modelo e os que conferem as entradas de ontem
    missing.sort((a, b) => b.fixture.date.localeCompare(a.fixture.date));
    if (!missing.length) {
      // temporada passada encerrada e inteira no arquivo: não lista mais (economiza a cota)
      if (s < Math.max(...HIST_SEASONS) && list.length && !file.complete) { file.complete = true; saveFile(lg, s, file); }
      const sem = list.filter(fx => !file.fixtures[fx.fixture.id]).length;
      if (sem) { console.log(`${lg.key} ${s}: completo (${list.length - sem} jogos + ${sem} sem estatística de jogador na API)`); continue; }
      console.log(`${lg.key} ${s}: completo (${list.length} jogos)`); continue;
    }
    const left = api.st.remaining == null ? Infinity : api.st.remaining - RESERVE;
    const budget = Math.max(0, Math.floor(Math.min(api.st.max - api.st.used, left) / 2));
    const batch = missing.slice(0, budget);
    const res = await pool(batch, 4, async fx => {
      const [pl, st] = await Promise.all([api.fixturePlayers(fx.fixture.id), api.fixtureStats(fx.fixture.id).catch(() => [])]);
      return ingestFixture(fx, pl, st);
    });
    let ok = 0, falhas = 0;
    for (const r of res) {
      if (!r || r.__error) { falhas++; if (falhas <= 2) console.log(`  falha: ${r?.__error?.message}`); continue; }
      if (!r.rec.p.length) {
        // só conta tentativa quando o jogo já tem mais de 2 dias (a estatística pode demorar a sair)
        if (Date.now() - Date.parse(r.rec.d) > 2 * 864e5) skip[r.rec.id] = (skip[r.rec.id] ?? 0) + 1;
        continue;
      } // jogo sem estatística de jogador: tenta de novo na próxima
      file.fixtures[r.rec.id] = r.rec; Object.assign(file.players, r.names); Object.assign(file.teams, r.tnames); ok++;
    }
    saveFile(lg, s, file);
    novos += ok;
    console.log(`${lg.key} ${s}: +${ok} jogos (${Object.keys(file.fixtures).length}/${list.length})${missing.length > batch.length ? ' · continua na próxima execução' : ''}`);
    if (api.st.used >= api.st.max - 2) break outer;
  }
  // reparo: jogos guardados sem a estatística do time (pedido que falhou no limite por minuto): busca de novo
  let reparados = 0;
  repair: for (const s of [...HIST_SEASONS].reverse()) for (const lg of LEAGUES) {
    const file = loadFile(lg, s), skip = file.skip ??= {};
    const bad = Object.values(file.fixtures).filter(r => Object.keys(r.t ?? {}).length < 2 && (skip['t' + r.id] ?? 0) < 3);
    if (!bad.length) continue;
    const left = api.st.remaining == null ? Infinity : api.st.remaining - RESERVE;
    const batch = bad.slice(0, Math.max(0, Math.min(api.st.max - api.st.used, left)));
    if (!batch.length) break repair;
    await pool(batch, 4, async r => {
      try {
        const st = await api.fixtureStats(r.id);
        const fix = ingestFixture({ fixture: { id: r.id, date: r.d }, league: { id: r.lg, season: r.s }, teams: { home: { id: r.h }, away: { id: r.a } } }, [], st).rec;
        if (Object.keys(fix.t).length === 2) { r.t = fix.t; r.t1 = fix.t1; reparados++; } else skip['t' + r.id] = (skip['t' + r.id] ?? 0) + 1;
      } catch { /* tenta na próxima */ }
    });
    saveFile(lg, s, file);
  }
  if (reparados) console.log(`reparo: ${reparados} jogos com a estatística do time recuperada`);
  console.log(`histórico: ${novos} jogos novos · ${api.st.used} pedidos${api.st.limited ? ` · ${api.st.limited} esperas por limite/minuto` : ''}${api.st.remaining != null ? ` · cota restante hoje ${api.st.remaining}` : ''}`);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
