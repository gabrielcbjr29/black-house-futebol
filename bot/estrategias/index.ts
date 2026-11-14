// Black House Futebol · fábrica de estratégias: grava em papel as entradas do dia (public/data/strategies.json),
// manda o alerta, vigia o risco até o jogo, confere com os resultados (results.json) e entrega o relatório.
//   ?record=<WEBHOOK_SECRET>  grava as novas (com alerta) e atualiza o fechamento das já gravadas (pg_cron, a cada 10 min)
//   ?settle=<WEBHOOK_SECRET>  confere as entradas abertas com os resultados (pg_cron)
//   ?csv=<REPORT_TOKEN>       todas as entradas em CSV (planilha)
//   ?stats=1                  placar por estratégia (view strategy_stats)
const APP = 'https://gabrielcbjr29.github.io/black-house-futebol/data/';
// índice de cada mercado no results.json (jogador: [min, chutes, no gol, faltas com., faltas sofr., desarmes, defesas];
// time e jogo: [90, chutes, no gol, faltas]). 1º tempo do jogador: conferência manual (a API não traz por tempo).
const RIDX: Record<string, number> = { SH: 1, SOT: 2, FC: 3, FS: 4, TK: 5, SV: 6, TSH: 1, TSOT: 2, TFC: 3, JSH: 1, JSOT: 2, JFC: 3 };
const MANUAL = new Set(['SH1', 'SOT1']);
const MKN: Record<string, string> = { SH: 'Chutes', SOT: 'Chutes ao gol', SH1: 'Chutes 1º tempo', SOT1: 'Chutes ao gol 1º tempo', FC: 'Faltas cometidas', FS: 'Faltas sofridas', TK: 'Desarmes', SV: 'Defesas', TSH: 'Chutes do time', TSOT: 'Chutes ao gol do time', TFC: 'Faltas do time', JSH: 'Chutes no jogo', JSOT: 'Chutes ao gol no jogo', JFC: 'Faltas no jogo' };
const json = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
async function sb(path: string, init: RequestInit = {}) {
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const r = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { apikey: key!, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error('banco ' + r.status + ' ' + (await r.text()).slice(0, 160));
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
const cfg = async (k: string) => (await sb(`bot_config?key=eq.${k}&select=value`))?.[0]?.value as string | undefined;
const getJ = (f: string) => fetch(APP + f + '?t=' + Math.floor(Date.now() / 120_000), { headers: { 'Cache-Control': 'no-cache' } }).then(r => r.ok ? r.json() : null);
const dayBR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const esc = (t: string) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n1 = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1)).replace('.', ',');
const n2 = (x: number) => x.toFixed(2).replace('.', ',');
const pct = (x: number) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1).replace('.', ',') + '%';
const hourBR = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
const FOOT = '<i>🔞 18+ · Aposte com responsabilidade. Apostas podem causar dependência.</i>';
// últimos 10 como titular, do mais recente para o mais antigo: 🟩 bateu, 🟥 não bateu
function sqLine(vals: any, line: number) {
  const v = (Array.isArray(vals) ? vals : []).slice(0, 10).map(Number); if (!v.length) return '';
  let hit = 0; const dots = v.map(x => { const ok = x > line; if (ok) hit++; return ok ? '🟩' : '🟥'; }).join('');
  return `${dots} <b>${hit}/${v.length}</b>`;
}
const FASE: Record<string, string> = { abertura: 'antes da escalação', escalacao: 'com escalação oficial' };

/* lista agrupada por jogo (é como se navega na casa): jogo → jogador · mercado → linha, odd, casa, chance e EV */
export function fmtEntries(list: any[]) {
  const games = new Map<string, any[]>();
  for (const x of list) { const k = String(x.gid ?? [x.team, x.opp].join(' x ')); (games.get(k) ?? games.set(k, []).get(k)!).push(x); }
  const order = [...games.values()].sort((a, b) => String(a[0].tip_utc ?? '').localeCompare(String(b[0].tip_utc ?? '')));
  const regs: { text: string; callback_data: string }[] = []; let i = 0;
  const blocks = order.map(xs => {
    const g = xs[0], title = g.pid.startsWith('j') ? g.name : [g.team, g.opp].join(' x ');
    return `⚽ <b>${esc(title)}</b>${g.tip_utc ? ' · ' + hourBR(g.tip_utc) : ''}\n<blockquote>` + xs.map(x => {
      i++; regs.push({ text: `📝 ${i}`, callback_data: `bet:${x.pid}|${x.mk}|${x.line}:e.${x.strategy_id}`.slice(0, 64) });
      const who = x.pid.startsWith('j') ? 'Jogo' : x.pid.startsWith('t') ? esc(x.team) : esc(x.name);
      const evs = x.edge == null ? '' : ` · EV <b>${pct(+x.edge)}</b>${+x.edge >= .1 ? ' 🔥' : ''}`;
      const sq = x.sq?.length && !x.pid.startsWith('j') ? '\n' + sqLine(x.sq, +x.line) : '';
      return `<b>${i}. ${who}</b> · ${MKN[x.mk] ?? x.mk}\n⬆️ Mais de <b>${n1(+x.line)}</b> · @${n2(+x.odd)} ${esc(x.odd_src ?? '')} · ${Math.round(+x.p * 100)}%${evs}${sq}`;
    }).join('\n') + '</blockquote>';
  });
  return { blocks, regs, n: i };
}
async function send(text: string, kb: unknown, all = false) {
  const token = await cfg('TELEGRAM_BOT_TOKEN'); if (!token) return 0;
  // all: quem recebe as estratégias ou os tops (alerta de escalação)
  const subs: any[] = await sb(all ? 'bot_subs?select=chat_id&or=(est.eq.true,chutes.eq.true,faltas.eq.true)' : 'bot_subs?select=chat_id&est=eq.true') ?? [];
  let sent = 0;
  for (const s of subs) {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: s.chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb }) }).then(r => r.json()).catch(() => null);
    if (r?.ok) sent++;
  }
  return sent;
}
async function alert(fresh: any[], evMin: number) {
  if (!fresh.length) return 0;
  const { blocks, regs, n } = fmtEntries(fresh);
  const fases = [...new Set(fresh.map(x => FASE[x.fase] ?? ''))].filter(Boolean).join(' / ');
  let text = `🚨 <b>${n > 1 ? 'NOVAS ENTRADAS' : 'NOVA ENTRADA'} · MODELO BH ⚽</b>\n<i>Melhor odd entre as casas agora · EV mínimo ${Math.round(evMin * 100)}% · 1u cada${fases ? ' · ' + fases : ''}</i>\n\n${blocks.join('\n\n')}\n\n🟩 bateu · 🟥 não bateu nos últimos 10 como titular (mais recente primeiro)\n📝 <i>Toque no número para registrar a sua aposta. Quanto antes, melhor: a linha costuma andar até o jogo.</i>\n${FOOT}`;
  if (text.length > 4090) text = text.slice(0, 4000).replace(/<[^>]*$/, '') + '</blockquote>…';
  const kb = { inline_keyboard: [...Array.from({ length: Math.ceil(regs.length / 5) }, (_, k) => regs.slice(k * 5, k * 5 + 5)), [{ text: '🧪 Placar', callback_data: '/estrategias' }, { text: '💼 Banca', callback_data: '/banca' }]] };
  return send(text, kb);
}

// grava as entradas do dia. A ENTRADA vale na linha e odd do momento do alerta (open_line/open_odd, guardadas pelo
// gatilho); line/odd seguem atualizadas até o jogo e viram o fechamento (CLV).
async function record(silent = false) {
  const st = await getJ('strategies.json');
  if (!st?.picks) return { ok: false, erro: 'strategies.json indisponível' };
  if (st.demo) return { ok: true, skip: 'dados de demonstração' };
  if (st.date !== dayBR()) return { ok: true, skip: `dados de ${st.date}` };
  await sb('strategies?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(st.strategies.map((s: any) => ({ id: s.id, name: s.name, descr: s.descr, markets: s.markets, updated_at: new Date().toISOString() }))) });
  const now = Date.now();
  const have: any[] = await sb(`strategy_picks?date=eq.${st.date}&select=strategy_id,pid,mk,alerted`) ?? [];
  const key = (x: any) => `${x.strategy_id}|${x.pid}|${x.mk}`, had = new Set(have.map(key));
  const count: Record<string, number> = {}; for (const h of have) count[h.strategy_id] = (count[h.strategy_id] || 0) + 1;
  const maxOf = Object.fromEntries(st.strategies.map((s: any) => [s.id, s.max ?? 5]));
  const rows: any[] = [], fresh: any[] = [];
  for (const p of st.picks) {
    if (p.tip_utc && Date.parse(p.tip_utc) <= now + 3 * 6e4) continue; // jogo começando: vale a última gravada
    if (!p.odd) continue;
    const row = { date: st.date, ...p, stat: p.mk, manual: MANUAL.has(p.mk), updated_at: new Date(now).toISOString() };
    if (had.has(key(p))) { rows.push(row); continue; }
    if ((count[p.strategy_id] || 0) >= (maxOf[p.strategy_id] ?? 5)) continue;
    count[p.strategy_id] = (count[p.strategy_id] || 0) + 1; fresh.push(row);
  }
  // papel grava TODAS; alerta só EV ≥ mínimo (bot_config ALERT_EV) e UMA por jogador/time no dia (a de maior EV),
  // porque mercados do mesmo jogador (chutes e chutes ao gol) andam juntos
  const evMin = +((await cfg('ALERT_EV')) ?? .05) || .05;
  const alertedPid = new Set(have.filter(h => h.alerted).map(h => h.pid)), best = new Map<string, any>();
  for (const x of fresh) if ((x.edge ?? -1) >= evMin && !alertedPid.has(x.pid) && (!best.has(x.pid) || x.edge > best.get(x.pid).edge)) best.set(x.pid, x);
  for (const x of fresh) x.alerted = best.get(x.pid) === x;
  const up = (list: any[]) => sb('strategy_picks?on_conflict=date,strategy_id,pid,mk', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(list) });
  if (rows.length) await up(rows);
  if (fresh.length) await up(fresh);
  const toAlert = fresh.filter(x => x.alerted).sort((a, b) => b.edge - a.edge);
  const alertas = silent ? 0 : await alert(toAlert, evMin).catch(e => { console.error('alerta', e); return 0; });
  const bot = await getJ('bot.json').catch(() => null);
  const risk = bot?.date === st.date ? await risco(bot).catch(e => ({ erro: String(e) })) : { skip: 'bot.json de outro dia' };
  const lu = bot?.date === st.date && !silent ? await escalacao(bot).catch(e => ({ erro: String(e) })) : { skip: 'sem bot.json do dia' };
  return { ok: true, date: st.date, atualizadas: rows.length, novas: fresh.length, alertadas: toAlert.length, alertas, risco: risk, escalacao: lu };
}

// ---------- 📋 Alerta de escalação: quando a escalação oficial de um jogo sai, uma mensagem por jogo com as entradas
// alertadas e os tops do modelo daquele jogo, dizendo quem é titular, quem está no banco e quem ficou fora ----------
async function escalacao(bot: any) {
  const now = Date.now();
  const games = (bot.games ?? []).filter((g: any) => g.fase === 'escalacao' && Date.parse(g.utc) > now - 10 * 6e4);
  if (!games.length) return { jogos: 0 };
  const flags = new Set(((await sb(`bot_config?key=like.LU:${bot.date}:*&select=key`)) ?? []).map((r: any) => r.key));
  const todo = games.filter((g: any) => !flags.has(`LU:${bot.date}:${g.id}`));
  if (!todo.length) return { jogos: 0 };
  const ids = todo.map((g: any) => g.id).join(',');
  const [est, tops]: any[][] = await Promise.all([
    sb(`strategy_picks?date=eq.${bot.date}&alerted=eq.true&gid=in.(${ids})&select=pid,name,team,mk,line,odd,odd_src,gid`).then(x => x ?? []),
    sb(`top_picks?date=eq.${bot.date}&gid=in.(${ids})&select=pid,name,team,mk,line,list,rank,gid&order=list.asc,rank.asc`).then(x => x ?? []),
  ]);
  const ST = (pid: string) => {
    if (pid.startsWith('t') || pid.startsWith('j')) return '⚽';
    const m = bot.mdl?.p?.[pid];
    return !m ? '❌' : m.st === 'xi' ? '✅' : m.st === 'banco' ? '🪑' : '❔';
  };
  const TX: Record<string, string> = { '✅': 'titular', '🪑': '<b>no banco</b> ⚠️', '❌': '<b>fora dos relacionados</b> ⚠️', '❔': 'sem confirmação', '⚽': '' };
  const line = (x: any) => { const s = ST(x.pid); return `${s} <b>${esc(x.pid.startsWith('j') ? 'Jogo' : x.pid.startsWith('t') ? x.team : x.name)}</b> · ${MKN[x.mk] ?? x.mk} mais de ${n1(+x.line)}${TX[s] ? ' · ' + TX[s] : ''}`; };
  let enviados = 0;
  for (const g of todo) {
    const e = est.filter(x => +x.gid === g.id), t = tops.filter(x => +x.gid === g.id && !e.some(y => y.pid === x.pid && y.mk === x.mk));
    if (e.length || t.length) {
      const bad = [...e, ...t].filter(x => ['🪑', '❌'].includes(ST(x.pid))).length;
      const text = `📋 <b>ESCALAÇÃO SAIU · ${esc(g.h)} x ${esc(g.a)}</b> · ${hourBR(g.utc)}
${bad ? `<i>⚠️ ${bad} entrada${bad > 1 ? 's' : ''} com jogador fora do time titular: reveja antes de apostar.</i>` : '<i>Todos os jogadores das entradas começam jogando.</i>'}
${e.length ? `\n🧪 <b>Entradas alertadas</b>\n<blockquote>${e.map(line).join('\n')}</blockquote>` : ''}${t.length ? `\n🎯 <b>Tops do Modelo BH</b>\n<blockquote>${t.map(line).join('\n')}</blockquote>` : ''}
<i>✅ titular · 🪑 banco · ❌ fora da lista · as chances já foram refeitas com a escalação</i>
${FOOT}`;
      enviados += await send(text, { inline_keyboard: [[{ text: '🏟️ Linhas do jogo', callback_data: `/jogo ${g.id}` }, { text: '🧪 Placar', callback_data: '/estrategias' }]] }, true);
    }
    await sb('bot_config?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key: `LU:${bot.date}:${g.id}`, value: String(e.length + t.length) }) });
  }
  // marcas de dias anteriores não servem mais
  await sb(`bot_config?key=like.LU:*&key=not.like.LU:${bot.date}:*`, { method: 'DELETE' }).catch(() => null);
  return { jogos: todo.length, enviados };
}

// ---------- Monitor de risco (duas fases): vigia as entradas alertadas até o jogo começar ----------
// Sinais: escalação oficial deixou o jogador no banco ou fora dos relacionados · jogador em dúvida ·
// a chance do modelo na linha da entrada caiu para menos de 50% ou 10+ pontos.
function nbOver(mu: number, k: number, line: number) {
  mu = Math.max(mu, 1e-4); const thr = Math.floor(line + 1e-9); let p: number, c = 0;
  if (!k || k > 400) { p = Math.exp(-mu); for (let x = 0; x <= thr; x++) { c += p; p *= mu / (x + 1); } }
  else { const q = mu / (k + mu); p = Math.pow(k / (k + mu), k); for (let x = 0; x <= thr; x++) { c += p; p *= (x + k) / (x + 1) * q; } }
  return Math.max(0, Math.min(1, 1 - c));
}
function pNow(bot: any, x: any, L: number) {
  const k = bot.ks?.[x.mk];
  if (x.pid.startsWith('t') || x.pid.startsWith('j')) {
    const r = (bot.rows ?? []).find((r: any) => r.id === x.pid && r.m === x.mk); if (!r) return null;
    return nbOver(r.pj, k, L); // aproximação: no total do jogo o k da soma fica perto do do mercado
  }
  const m = bot.mdl?.p?.[x.pid]; if (!m?.mu?.[x.mk]) return null;
  const [s, b] = m.mu[x.mk], pS = m.ps, pB = (1 - m.ps) * m.pb, tot = pS + pB;
  return tot > 0 ? (pS * nbOver(s, k, L) + pB * (b > 0 ? nbOver(b, k, L) : 0)) / tot : 0;
}
async function risco(bot: any) {
  const now = Date.now();
  const open: any[] = (await sb(`strategy_picks?date=eq.${bot.date}&status=eq.aberta&alerted=eq.true&select=id,strategy_id,pid,name,team,opp,gid,mk,line,odd,open_line,open_odd,odd_src,p,risk,tip_utc`) ?? [])
    .filter((x: any) => !x.tip_utc || Date.parse(x.tip_utc) > now);
  if (!open.length) return { vigiadas: 0, alertas: 0 };
  const games = Object.fromEntries((bot.games ?? []).map((g: any) => [g.id, g]));
  const items: { x: any; why: string[] }[] = [];
  for (const x of open) {
    const L = +(x.open_line ?? x.line), conds: Record<string, string> = {};
    const isP = !x.pid.startsWith('t') && !x.pid.startsWith('j'), m = bot.mdl?.p?.[x.pid], g = games[x.gid];
    if (isP) {
      if (g?.fase === 'escalacao' && !m) conds['fora'] = `${esc(x.name)} <b>não está entre os relacionados</b> na escalação oficial (se não entrar em campo, a aposta costuma ser anulada; confira a regra da casa)`;
      else if (m?.st === 'banco') conds['banco'] = `${esc(x.name)} começa no <b>BANCO</b> na escalação oficial${/1/.test(x.mk) ? ' (no 1º tempo, quase sem chance)' : ''}`;
      else if (m?.st === 'duvida') conds['duvida'] = `${esc(x.name)} está <b>em dúvida</b> para o jogo`;
      if (m?.st === 'xi') conds['xi'] = ''; // titular confirmado: registra sem alertar
    }
    const pn = pNow(bot, x, L);
    if (pn != null) {
      if (pn < .5) conds['p:virou'] = `O modelo agora dá <b>${Math.round(pn * 100)}%</b> na linha ${n1(L)} (era ${Math.round(+x.p * 100)}%)`;
      else if (+x.p - pn >= .1) conds['p:caiu'] = `O modelo caiu para <b>${Math.round(pn * 100)}%</b> na linha ${n1(L)} (era ${Math.round(+x.p * 100)}%)`;
    }
    const keys = Object.keys(conds), seen = x.risk == null ? null : new Set(String(x.risk).split('|').filter(Boolean));
    const fresh = seen ? keys.filter(k => conds[k] && !seen.has(k) && !(k === 'p:caiu' && seen.has('p:virou'))) : [];
    const patch: Record<string, unknown> = { p_now: pn == null ? null : Math.round(pn * 1000) / 1000 };
    if (seen == null || keys.some(k => !seen.has(k))) patch.risk = [...new Set([...(seen ?? []), ...keys])].join('|');
    if (fresh.length) { patch.risk_at = new Date(now).toISOString(); items.push({ x, why: fresh.map(k => conds[k]) }); }
    await sb(`strategy_picks?id=eq.${x.id}`, { method: 'PATCH', body: JSON.stringify(patch) }).catch(() => null);
  }
  let alertas = 0;
  if (items.length) {
    let text = `⚠️ <b>ALERTA DE RISCO · ENTRADA${items.length > 1 ? 'S' : ''} JÁ ENVIADA${items.length > 1 ? 'S' : ''}</b>\n<i>O cenário mudou depois do alerta.</i>\n\n` + items.map(({ x, why }) =>
      `⚽ <b>${esc(x.team)} x ${esc(x.opp)}</b>${x.tip_utc ? ' · ' + hourBR(x.tip_utc) : ''}\n<blockquote><b>${esc(x.name)}</b> · ${MKN[x.mk] ?? x.mk}\n⬆️ Mais de <b>${n1(+(x.open_line ?? x.line))}</b> · @${n2(+(x.open_odd ?? x.odd))}\n${why.map(w => '• ' + w).join('\n')}</blockquote>`).join('\n\n')
      + `\n\n<i>Se ainda não entrou, reavalie. Se já entrou, veja se vale proteger. O placar segue contando a entrada como foi enviada.</i>`;
    if (text.length > 4090) text = text.slice(0, 4000).replace(/<[^>]*$/, '') + '…';
    alertas = await send(text, { inline_keyboard: [[{ text: '🧪 Placar', callback_data: '/estrategias' }, { text: '💼 Banca', callback_data: '/banca' }]] });
  }
  return { vigiadas: open.length, novos_riscos: items.length, alertas };
}

// conferência: jogador que não entrou = anulada; 1º tempo do jogador = manual (fica aberta até o /resultado)
async function settle() {
  const res = await getJ('results.json'); if (!res?.stats) return { ok: false, erro: 'results.json indisponível' };
  const open: any[] = await sb('strategy_picks?status=eq.aberta&manual=eq.false&select=id,date,pid,gid,mk,side,line,odd,open_line,open_odd') ?? [];
  let n = 0;
  for (const r of open) {
    if (!res.dates?.includes(r.date)) continue;
    const key = r.pid.startsWith('t') && !r.pid.includes('-') ? `${r.pid}-${r.gid}` : r.pid;
    const a = res.stats[r.date]?.[key];
    if (!a) continue; // jogo ainda sem estatística (adiado ou não coletado): tenta de novo depois
    const L = +(r.open_line ?? r.line), O = +(r.open_odd ?? r.odd);
    let status = 'void', result: number | null = null;
    if (a[0] > 0) { const v = +a[RIDX[r.mk]]; result = v; status = (r.side === 'u' ? v < L : v > L) ? 'green' : 'red'; }
    const profit = status === 'green' ? Math.round((O - 1) * 100) / 100 : status === 'red' ? -1 : 0;
    await sb(`strategy_picks?id=eq.${r.id}`, { method: 'PATCH', body: JSON.stringify({ status, result, profit, settled_at: new Date().toISOString() }) }).catch(() => null);
    n++;
  }
  return { ok: true, conferidas: n };
}
Deno.serve(async (req: Request) => {
  const u = new URL(req.url);
  try {
    const secret = await cfg('WEBHOOK_SECRET');
    if (u.searchParams.get('record') && u.searchParams.get('record') === secret) return json(await record(u.searchParams.get('silent') === '1'));
    if (u.searchParams.get('settle') && u.searchParams.get('settle') === secret) return json(await settle());
    if (u.searchParams.get('stats')) return json(await sb('strategy_stats?select=*&order=lucro.desc.nullslast'));
    const rep = await cfg('REPORT_TOKEN');
    if (rep && u.searchParams.get('csv') === rep) {
      const rows: any[] = await sb('strategy_picks?select=*,strategies(name)&order=date.asc,strategy_id.asc,id.asc&limit=20000') ?? [];
      const head = ['data', 'estrategia', 'alvo', 'time', 'adversario', 'mercado', 'linha', 'odd', 'casa', 'fase', 'chance_modelo', 'valor_esperado', 'nota', 'alertada', 'resultado', 'status', 'lucro_u', 'linha_fechamento', 'odd_fechamento', 'clv_odd'];
      const q = (x: unknown) => { const t = x == null ? '' : String(x); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
      const ST: Record<string, string> = { aberta: 'Aberta', green: 'Green', red: 'Red', void: 'Anulada' };
      const body = rows.map(r => [r.date, r.strategies?.name ?? r.strategy_id, r.name, r.team, r.opp, MKN[r.mk] ?? r.mk, r.open_line ?? r.line, r.open_odd ?? r.odd, r.odd_src, r.fase, r.p, r.edge, r.nota, r.alerted ? 'sim' : 'não', r.result, ST[r.status] ?? r.status, r.status === 'aberta' ? '' : r.profit, r.line, r.odd, r.clv_odd]);
      return new Response([head, ...body].map(l => l.map(q).join(',')).join('\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
    }
    return json({ ok: true });
  } catch (e) { return json({ ok: false, erro: String((e as Error).message) }, 500); }
});
