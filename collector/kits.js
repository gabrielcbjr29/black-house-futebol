// Camisas (avatar sem foto): cores do uniforme de cada time e número de cada jogador, guardados em data/teams.json.
// Cores: vêm da escalação (fixtures/lineups traz team.colors do jogador de linha e do goleiro). Número: do elenco
// (players/squads) e da escalação do dia. Preenche aos poucos: só os times dos jogos de hoje, no máximo 2 pedidos por time,
// elenco renovado a cada 7 dias.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('../data/teams.json', import.meta.url);
const hex = c => /^[0-9a-f]{6}$/i.test(String(c ?? '')) ? '#' + String(c).toLowerCase() : null;
export const loadKits = () => { try { return existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : {}; } catch { return {}; } };
export const saveKits = K => writeFileSync(FILE, JSON.stringify(K));
// cores de uma resposta de escalação
export function colorsFromLineups(resp, K) {
  let n = 0;
  for (const t of resp || []) {
    const c = t.team?.colors, id = t.team?.id; if (!id || !c) continue;
    const pl = c.player ?? {}, gk = c.goalkeeper ?? {};
    const kit = { p: hex(pl.primary), n: hex(pl.number), b: hex(pl.border), gp: hex(gk.primary), gn: hex(gk.number) };
    if (!kit.p) continue;
    K[id] = { ...(K[id] ?? {}), name: t.team.name ?? K[id]?.name, kit }; n++;
    for (const x of [...(t.startXI ?? []), ...(t.substitutes ?? [])]) if (x.player?.id && x.player.number) ((K[id].num ??= {})[x.player.id] = x.player.number);
  }
  return n;
}
/* times de hoje: cor (escalação do último jogo dele no histórico) e números (elenco), com teto de pedidos */
export async function updateKits(api, games, H, { max = 40, now = Date.now() } = {}) {
  const K = loadKits(); let used = 0;
  const lastFx = {}; for (let i = H.fixtures.length - 1; i >= 0; i--) { const f = H.fixtures[i]; for (const t of [f.h, f.a]) lastFx[t] ??= f.id; }
  for (const g of games) for (const tm of [g.home, g.away]) {
    if (used >= max) break;
    const k = K[tm.id] ??= { name: tm.name };
    if (!k.kit && lastFx[tm.id] && !(k.tried > now - 7 * 864e5)) {
      used++; k.tried = now;
      try { colorsFromLineups(await api.lineups(lastFx[tm.id]), K); } catch (e) { console.log(`camisa ${tm.name}: ${e.message}`); }
    }
    if (!k.sq || now - k.sq > 7 * 864e5) {
      used++;
      try {
        const r = await api.squad(tm.id);
        for (const p of r?.[0]?.players ?? []) if (p.id && p.number) ((k.num ??= {})[p.id] = p.number);
        k.sq = now;
      } catch (e) { console.log(`elenco ${tm.name}: ${e.message}`); }
    }
  }
  saveKits(K);
  return { K, used };
}
/* recorte para o bot.json: cores por nome de time e número por jogador do dia */
export function kitsForBot(K, slate) {
  const kit = {}, num = {};
  for (const g of slate.games) for (const tm of [g.home, g.away]) if (K[tm.id]?.kit) kit[tm.name] = K[tm.id].kit;
  for (const [pid, P] of Object.entries(slate.model.players)) { const n = K[P.t]?.num?.[pid]; if (n) num[pid] = n; }
  return { kit, num };
}
