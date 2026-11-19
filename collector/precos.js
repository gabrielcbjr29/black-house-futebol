// Registro de preços para a mistura modelo × mercado (método, 19/11).
// Para cada linha com odd de casa guarda a PRIMEIRA leitura e a ÚLTIMA antes do jogo: chance do modelo, odd, casa e hora da leitura.
// Com o resultado do jogo, isso permite medir quanto peso dar à chance implícita da casa (e serve de fechamento para o CLV).
// Um arquivo por dia em data/precos/AAAA-MM-DD.json, sem migração no banco.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

export function updatePrices(P, bot, now = Date.now()) {
  let n = 0;
  for (const r of [...(bot.rows ?? []), ...(bot.rowsU ?? [])]) {
    if (!r.d || r.l == null || !(Date.parse(r.utc) > now)) continue; // só odd de casa, antes do jogo
    const k = `${r.id}|${r.m}|${r.s ?? 'o'}|${r.l}`, at = r.at ?? null;
    const cur = { t: new Date(now).toISOString(), at, p: r.p, o: r.d, h: r.b ?? null, f: r.fase ?? null };
    const e = P[k];
    if (!e) { P[k] = { g: r.g, lg: r.lg, utc: r.utc, a: cur, z: cur }; n++; continue; }
    if (e.z.at !== at || e.z.o !== r.d || e.z.p !== r.p) { e.z = cur; n++; }
  }
  return n;
}

export function logPrices(bot, dirUrl, now = Date.now()) {
  if (!bot?.date || bot.demo) return 0;
  mkdirSync(dirUrl, { recursive: true });
  const f = new URL(`${bot.date}.json`, dirUrl);
  const P = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
  const n = updatePrices(P, bot, now);
  if (n) writeFileSync(f, JSON.stringify(P));
  return n;
}
