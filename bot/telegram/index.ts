// Bot do Telegram do Black House Futebol (Supabase Edge Function, Deno). Separado do bot da NBA.
// Lê a lista pronta que a coleta publica (bot.json no GitHub Pages) e responde aos comandos.
// Configuração na tabela privada bot_config: TELEGRAM_BOT_TOKEN, WEBHOOK_SECRET, ALLOWED_CHATS (opcional).
// Instalação (uma vez, e de novo quando mudar a lista de comandos): <url-da-função>?setup=<WEBHOOK_SECRET>
const APP_URL = 'https://gabrielcbjr29.github.io/black-house-futebol/';
const DATA = APP_URL + 'data/';
type Row = { id: string; n: string; t: string; o: string; home: boolean; g: number; lg: number; utc: string; fase: string; k: 'p' | 't' | 'j'; pos?: string; ps?: number; st?: string;
  m: string; s: 'o'; l: number; p: number; d: number | null; b: string | null; of?: [string, number][]; e: number | null; pj: number; sq?: number[]; mn?: number[]; hit?: [number, number] | null; nt: number; gr: string; ref?: 1 };
type Data = { date: string; gen: string; demo?: boolean; games: { id: number; lg: number; utc: string; st: string; h: string; a: string; fase: string; ref: string | null }[]; rows: Row[];
  mdl: { p: Record<string, { n: string; t: number; g: number; pos: string; ps: number; pb: number; st: string; mu: Record<string, [number, number]> }>; t: Record<string, { h: number; a: number; hn: string; an: string; pj: { h: Record<string, number>; a: Record<string, number> } }> };
  ks: Record<string, number>; houses: { house: string; at: string; n: number }[] };

let CFG: { v: Record<string, string>; at: number } | null = null;
async function cfg(k: string) {
  if (!CFG || Date.now() - CFG.at > 60_000) {
    const r = await sb('bot_config?select=key,value'); CFG = { v: Object.fromEntries((r ?? []).map((x: any) => [x.key, x.value])), at: Date.now() };
  }
  return Deno.env.get(k) || CFG.v[k] || '';
}
async function sb(path: string, init: RequestInit = {}) {
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const r = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { apikey: key!, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error('banco ' + r.status + ' ' + (await r.text()).slice(0, 120));
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
const TG = async (m: string, body: unknown) => fetch(`https://api.telegram.org/bot${await cfg('TELEGRAM_BOT_TOKEN')}/${m}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
let CACHE: { at: number; d: Data } | null = null;
async function data(): Promise<Data> {
  if (CACHE && Date.now() - CACHE.at < 120_000) return CACHE.d;
  const r = await fetch(DATA + 'bot.json?t=' + Math.floor(Date.now() / 120_000), { headers: { 'Cache-Control': 'no-cache' } });
  if (!r.ok) throw new Error('dados indisponíveis (' + r.status + ')');
  CACHE = { at: Date.now(), d: await r.json() }; return CACHE.d;
}
const getJ = (f: string) => fetch(DATA + f + '?t=' + Math.floor(Date.now() / 120_000)).then(r => r.ok ? r.json() : null);

// ---------- textos ----------
const MK: Record<string, string> = { SH: 'chutes', SOT: 'chutes ao gol', SH1: 'chutes no 1º tempo', SOT1: 'chutes ao gol no 1º tempo', FC: 'faltas cometidas', FS: 'faltas sofridas', TK: 'desarmes', SV: 'defesas', TSH: 'chutes do time', TSOT: 'chutes ao gol do time', TFC: 'faltas do time', JSH: 'chutes no jogo', JSOT: 'chutes ao gol no jogo', JFC: 'faltas no jogo' };
const LG: Record<number, string> = { 39: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier', 140: '🇪🇸 La Liga', 135: '🇮🇹 Serie A', 78: '🇩🇪 Bundesliga', 61: '🇫🇷 Ligue 1', 71: '🇧🇷 Brasileirão', 2: '🏆 Champions' };
const GROUPS: Record<string, { mk: string[]; title: string }> = {
  chutes: { mk: ['SH'], title: 'Chutes' }, nogol: { mk: ['SOT'], title: 'Chutes ao gol' }, chutes1t: { mk: ['SH1'], title: 'Chutes no 1º tempo' }, nogol1t: { mk: ['SOT1'], title: 'Chutes ao gol no 1º tempo' },
  faltas: { mk: ['FC'], title: 'Faltas cometidas' }, sofridas: { mk: ['FS'], title: 'Faltas sofridas' }, desarmes: { mk: ['TK'], title: 'Desarmes' }, defesas: { mk: ['SV'], title: 'Defesas do goleiro' },
  times: { mk: ['TSH', 'TSOT', 'TFC', 'JSH', 'JSOT', 'JFC'], title: 'Times e jogo' },
};
// palavras do /modelo → mercado
const WORD: Record<string, string> = { chutes: 'SH', chute: 'SH', sh: 'SH', nogol: 'SOT', 'no gol': 'SOT', 'ao gol': 'SOT', sot: 'SOT', chutes1t: 'SH1', sh1: 'SH1', nogol1t: 'SOT1', sot1: 'SOT1',
  faltas: 'FC', cometidas: 'FC', fc: 'FC', sofridas: 'FS', fs: 'FS', desarmes: 'TK', tk: 'TK', defesas: 'SV', sv: 'SV' };
const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n1 = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1)).replace('.', ',');
const n2 = (x: number) => x.toFixed(2).replace('.', ',');
const pc = (x: number) => Math.round(x * 100) + '%';
const pct = (x: number) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1).replace('.', ',') + '%';
const norm = (s: string) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const hourBR = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
const dayBR = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
const FOOT = '\n<i>🔞 18+ · Confira escalação e a odd da sua casa. Apostas podem causar dependência; jogue com responsabilidade.</i>';
const ODD_MIN = 1.4, ODD_MAX = 3.5;
const oddOf = (r: Row) => r.d ?? (r.p > 0 ? 1 / r.p : 99);
const inRange = (r: Row) => oddOf(r) >= ODD_MIN - 1e-9 && oddOf(r) <= ODD_MAX + 1e-9;
const STL: Record<string, string> = { xi: '✅ titular', banco: '🪑 banco', provavel: '🕐 provável', duvida: '🟡 dúvida' };
const seq = (r: Row) => r.sq?.length ? (r.k === 'p' && /1$/.test(r.m) ? 'jogo todo: ' : '') + r.sq.slice(0, 10).join('-') : '';

function line(r: Row, i: number) {
  const who = r.k === 'p' ? `${esc(r.n)} <i>(${esc(r.t)})</i>` : r.k === 't' ? `${esc(r.n)} <i>x ${esc(r.o)}</i>` : esc(r.n);
  const odd = r.d ? `@${n2(r.d)} ${esc(r.b ?? '')}${r.of && r.of.length > 1 ? ` (+${r.of.length - 1})` : ''}` : `justa @${n2(1 / r.p)}`;
  const ev = r.e != null ? ` · EV <b>${pct(r.e)}</b>${r.e >= .1 ? ' 🔥' : ''}` : '';
  const h = r.hit ? ` · ${r.hit[0]}/${r.hit[1]} na linha` : '';
  return `<b>${i}. ${who}</b> · ${hourBR(r.utc)}${r.k === 'p' && r.st ? ' · ' + STL[r.st] : ''}\n⬆️ Mais de <b>${n1(r.l)}</b> ${MK[r.m]} · ${odd} · <b>${pc(r.p)}</b>${ev} · Nota ${r.nt}${h}${seq(r) ? `\n<code>${seq(r)}</code>` : ''}`;
}
// lista sem repetir o mesmo jogador (regra do usuário: mesmo jogador não repete na mesma lista no mesmo dia)
function pick(rows: Row[], n = 10) { const seen = new Set<string>(), out: Row[] = []; for (const r of rows) { if (seen.has(r.id)) continue; seen.add(r.id); out.push(r); if (out.length >= n) break; } return out; }
const open = (d: Data) => d.rows.filter(r => Date.parse(r.utc) > Date.now() - 5 * 6e4);
function listMsg(d: Data, title: string, rows: Row[], sub = '') {
  if (!rows.length) return { text: `<b>${title}</b>\n\nNada por enquanto. As linhas abrem ao longo do dia; tente mais tarde.${FOOT}` };
  const body = rows.map((r, i) => line(r, i + 1)).join('\n\n');
  const regs = rows.map((r, i) => ({ text: `📝 ${i + 1}`, callback_data: `bet:${r.id}|${r.m}|${r.l}:lista`.slice(0, 64) }));
  return {
    text: `<b>${title}</b>${d.demo ? ' <i>(demonstração)</i>' : ''}\n<i>${sub || 'Só MAIS · odds 1,40–3,50 · ordem pela Nota BH'}</i>\n\n<blockquote expandable>${body}</blockquote>\n\n<i>📝 registra a sua aposta · sequência = últimos 10 jogos, do mais recente.</i>${FOOT}`,
    kb: { inline_keyboard: [...Array.from({ length: Math.ceil(regs.length / 5) }, (_, k) => regs.slice(k * 5, k * 5 + 5)), [{ text: '📋 Copiar para inscritos', callback_data: `cp:${title.slice(0, 40)}` }]] },
  };
}
function plain(rows: Row[], title: string) {
  return `${title}\n\n` + rows.map((r, i) => `${i + 1}. ${r.k === 'p' ? `${r.n} (${r.t})` : r.n} · Mais de ${n1(r.l)} ${MK[r.m]}${r.d ? ` @${n2(r.d)}` : ''}${r.sq?.length ? `\n   Últimos 10: ${r.sq.slice(0, 10).join('-')}` : ''}`).join('\n') + '\n\n🔞 18+ · Aposte com responsabilidade.';
}

// ---------- modelo em qualquer linha ----------
function nbOver(mu: number, k: number, line: number) {
  mu = Math.max(mu, 1e-4); const thr = Math.floor(line + 1e-9); let p: number, c = 0;
  if (!k || k > 400) { p = Math.exp(-mu); for (let x = 0; x <= thr; x++) { c += p; p *= mu / (x + 1); } }
  else { const q = mu / (k + mu); p = Math.pow(k / (k + mu), k); for (let x = 0; x <= thr; x++) { c += p; p *= (x + k) / (x + 1) * q; } }
  return Math.max(0, Math.min(1, 1 - c));
}
function findPlayer(d: Data, q: string) {
  const nq = norm(q), toks = nq.split(' ');
  let best: [string, number] | null = null;
  for (const [pid, m] of Object.entries(d.mdl.p)) {
    const nn = norm(m.n), last = nn.split(' ').at(-1)!;
    const s = nn === nq ? 3 : nn.includes(nq) ? 2 : toks.includes(last) ? 1 : 0;
    if (s && (!best || s > best[1])) best = [pid, s];
  }
  return best?.[0] ?? null;
}
async function modelo(d: Data, chat: number, args: string) {
  // /modelo saka chutes 1,5 [1,90]
  const parts = args.trim().split(/\s+/); const nums: number[] = [];
  while (parts.length && /^\d+([.,]\d+)?$/.test(parts.at(-1)!)) nums.unshift(+parts.pop()!.replace(',', '.'));
  let mk = ''; for (let i = parts.length - 1; i >= 0; i--) { const w = norm(parts[i]); if (WORD[w]) { mk = WORD[w]; parts.splice(i, 1); break; } }
  const [L, odd] = nums;
  if (!mk || L == null || !parts.length) return 'Uso: <code>/modelo jogador mercado linha [odd]</code>\nEx.: <code>/modelo saka chutes 1,5 1,90</code>\nMercados: chutes, nogol, chutes1t, nogol1t, faltas, sofridas, desarmes, defesas.';
  const pid = findPlayer(d, parts.join(' '));
  const m = pid ? d.mdl.p[pid] : null;
  if (!m) return `Não achei <b>${esc(parts.join(' '))}</b> entre os jogadores de hoje.`;
  if (!m.mu[mk]) return `Sem projeção de ${MK[mk]} para ${esc(m.n)} hoje.`;
  const [s, b] = m.mu[mk], k = d.ks[mk], pS = m.ps, pB = (1 - m.ps) * m.pb, tot = pS + pB;
  const p = tot > 0 ? (pS * nbOver(s, k, L) + pB * (b > 0 ? nbOver(b, k, L) : 0)) / tot : 0;
  await sb('model_tests', { method: 'POST', body: JSON.stringify({ chat_id: chat, date: d.date, pid, name: m.n, gid: m.g, mk, line: L, p: Math.round(p * 1000) / 1000, mu: s, odd: odd ?? null }) }).catch(() => null);
  const ev = odd ? p * odd - 1 : null;
  return `🧮 <b>Modelo BH · ${esc(m.n)}</b>\n<blockquote>Mais de <b>${n1(L)}</b> ${MK[mk]}\nChance: <b>${pc(p)}</b> · odd justa <b>${n2(1 / Math.max(p, 1e-3))}</b>${ev != null ? `\nNa odd ${n2(odd!)}: EV <b>${pct(ev)}</b> ${ev >= .05 ? '✅' : ev >= 0 ? '➖' : '❌'}` : ''}\nMédia se titular: ${n1(Math.round(s * 100) / 100)} · ${STL[m.st] ?? ''}${m.st === 'provavel' ? ` (${pc(m.ps)} de ser titular)` : ''}</blockquote>\n<i>Chance condicionada a ele entrar em campo (sem entrar, a casa costuma anular).</i>${FOOT}`;
}

// ---------- banca e placar ----------
async function banca(chat: number) {
  const b: any[] = await sb(`bets?chat_id=eq.${chat}&select=*&order=created_at.desc&limit=500`) ?? [];
  const done = b.filter(x => x.status === 'green' || x.status === 'red');
  if (!b.length) return `💼 <b>Banca</b>\n\nNenhuma aposta registrada ainda. Use o 📝 nas listas e alertas.`;
  const sum = (a: any[]) => a.reduce((s, x) => s + (+x.profit || 0), 0), stake = (a: any[]) => a.reduce((s, x) => s + (+x.stake || 1), 0);
  const by = (f: (x: any) => string) => { const m = new Map<string, any[]>(); for (const x of done) (m.get(f(x)) ?? m.set(f(x), []).get(f(x))!).push(x); return [...m.entries()].map(([k, a]) => `${esc(k)}: ${a.filter(x => x.status === 'green').length}/${a.length} · ${sum(a) >= 0 ? '+' : ''}${n2(sum(a))}u · ROI ${pct(sum(a) / stake(a))}`).join('\n'); };
  const last = b.slice(0, 8).map(x => `#${x.id} ${esc(x.name)} · +${n1(+x.line)} ${MK[x.mk] ?? x.mk}${x.odd ? ' @' + n2(+x.odd) : ''} · ${({ aguardando_odd: '⏳ falta a odd', aberta: '🕐', green: '✅', red: '❌', void: '↩️' } as any)[x.status]}`).join('\n');
  return `💼 <b>Banca</b>\n<blockquote>Conferidas: ${done.length} · ${done.filter(x => x.status === 'green').length} green\nLucro: <b>${sum(done) >= 0 ? '+' : ''}${n2(sum(done))}u</b> · ROI <b>${done.length ? pct(sum(done) / stake(done)) : '–'}</b></blockquote>${done.length ? `\n<b>Por mercado</b>\n<blockquote>${by(x => MK[x.mk] ?? x.mk)}</blockquote>\n<b>Por origem</b>\n<blockquote>${by(x => x.src)}</blockquote>` : ''}\n<b>Últimas</b>\n<blockquote>${last}</blockquote>\n<i>/apagar número para remover.</i>`;
}
async function placar() {
  const s: any[] = await sb('strategy_stats?select=*&order=lucro.desc.nullslast') ?? [];
  if (!s.length) return '🧪 <b>Estratégias</b>\n\nAinda sem entradas no papel.';
  return `🧪 <b>Placar das estratégias (papel, 1u)</b>\n<blockquote>${s.map(x => `<b>${esc(x.name)}</b>: ${x.g ?? 0}/${x.n ?? 0}${x.abertas ? ` · ${x.abertas} abertas` : ''} · ${x.lucro == null ? '–' : (x.lucro >= 0 ? '+' : '') + n2(+x.lucro) + 'u'} · ROI ${x.roi == null ? '–' : pct(+x.roi)}${x.clv_odd_media != null ? ` · CLV ${pct(+x.clv_odd_media)}` : ''}`).join('\n')}</blockquote>\n<i>Critério para sair do papel: 50+ entradas, ROI e CLV positivos.</i>`;
}
async function gabarito(day?: string) {
  const d = day ?? dayBR(new Date(Date.now() - 864e5));
  const p: any[] = await sb(`strategy_picks?date=eq.${d}&select=*&order=strategy_id.asc`) ?? [];
  if (!p.length) return `📋 <b>Gabarito ${d.split('-').reverse().join('/')}</b>\n\nSem entradas nesse dia.`;
  const ic: Record<string, string> = { green: '✅', red: '❌', void: '↩️', aberta: '🕐' };
  const g = p.filter(x => x.status === 'green').length, n = p.filter(x => ['green', 'red'].includes(x.status)).length, lucro = p.reduce((s, x) => s + (+x.profit || 0), 0);
  return `📋 <b>Gabarito ${d.split('-').reverse().join('/')}</b> · ${g}/${n} · ${lucro >= 0 ? '+' : ''}${n2(lucro)}u\n<blockquote expandable>${p.map(x => `${ic[x.status] ?? ''}${x.alerted ? '🚨' : ''} ${esc(x.name)} · +${n1(+(x.open_line ?? x.line))} ${MK[x.mk]} @${n2(+(x.open_odd ?? x.odd))}${x.result != null ? ` → ${n1(+x.result)}` : x.manual && x.status === 'aberta' ? ` → conferir: /resultado ${x.id} valor` : ''}`).join('\n')}</blockquote>\n<i>🚨 = foi alertada. 1º tempo do jogador: conferência manual.</i>`;
}
// conferência das apostas do usuário com o results.json (mesmas regras do papel)
const RIDX: Record<string, number> = { SH: 1, SOT: 2, FC: 3, FS: 4, TK: 5, SV: 6, TSH: 1, TSOT: 2, TFC: 3, JSH: 1, JSOT: 2, JFC: 3 };
async function settleBets() {
  const res = await getJ('results.json'); if (!res?.stats) return 0;
  const open: any[] = await sb('bets?status=eq.aberta&select=*') ?? []; let n = 0;
  for (const b of open) {
    if (!(b.mk in RIDX) || !res.dates?.includes(b.date)) continue;
    const a = res.stats[b.date]?.[b.pid]; if (!a) continue;
    const result = a[0] > 0 ? a[RIDX[b.mk]] : null, status = result == null ? 'void' : result > +b.line ? 'green' : 'red';
    const profit = status === 'green' ? Math.round((+b.odd - 1) * +b.stake * 100) / 100 : status === 'red' ? -b.stake : 0;
    await sb(`bets?id=eq.${b.id}`, { method: 'PATCH', body: JSON.stringify({ status, result, profit, settled_at: new Date().toISOString() }) }); n++;
  }
  return n;
}

const HELP = `⚽ <b>Black House Futebol</b> · Modelo BH de props (só MAIS)
<blockquote><b>Listas</b>
/top · melhores pela Nota BH
/valor · maior valor esperado (com odd de casa)
/chutes /nogol /chutes1t /nogol1t
/faltas /sofridas /desarmes /defesas /times
/jogos · jogos de hoje · /jogo nome-do-time
/jogador nome

<b>Modelo</b>
/modelo jogador mercado linha [odd]

<b>Resultados</b>
/estrategias · placar · /gabarito [aaaa-mm-dd]
/banca · /apagar n · /resultado n valor
/receber · liga/desliga os alertas</blockquote>`;

async function command(chat: number, text: string) {
  const [cmd0, ...rest] = text.trim().split(/\s+/); const cmd = cmd0.toLowerCase().replace(/^\//, '').replace(/@.*/, ''); const args = rest.join(' ');
  const d = await data();
  const reply = (t: string, kb?: unknown) => TG('sendMessage', { chat_id: chat, text: t, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb });
  if (cmd === 'start' || cmd === 'ajuda' || cmd === 'help') {
    await sb('bot_subs?on_conflict=chat_id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ chat_id: chat }) }).catch(() => null);
    return reply(HELP + `\n<a href="${APP_URL}">Abrir o app</a>`);
  }
  if (cmd === 'top') { const m = listMsg(d, '🔝 Top 10 · Modelo BH', pick(open(d).filter(r => inRange(r) && r.p >= .55))); return reply(m.text, m.kb); }
  if (cmd === 'valor') { const m = listMsg(d, '💎 Valor · maior EV', pick(open(d).filter(r => r.d && r.e! >= .03 && inRange(r)).sort((a, b) => b.e! - a.e!)), 'Só MAIS · só com odd de casa · ordem pelo valor esperado'); return reply(m.text, m.kb); }
  if (GROUPS[cmd]) { const G = GROUPS[cmd]; const m = listMsg(d, `📊 ${G.title}`, pick(open(d).filter(r => G.mk.includes(r.m) && inRange(r) && r.p >= .55), 10)); return reply(m.text, m.kb); }
  if (cmd === 'jogos' || cmd === 'hoje') {
    if (!d.games.length) return reply('Sem jogos das ligas do projeto hoje.');
    return reply(`📅 <b>Jogos de hoje</b>\n<blockquote>${d.games.map(g => `${hourBR(g.utc)} · ${LG[g.lg] ?? ''} · ${esc(g.h)} x ${esc(g.a)}${g.fase === 'escalacao' ? ' · ✅ escalação' : ''}`).join('\n')}</blockquote>\n<i>Casas lidas: ${d.houses?.map(h => `${esc(h.house)} (${hourBR(h.at)})`).join(', ') || 'nenhuma ainda'}</i>`);
  }
  if (cmd === 'jogo') {
    const q = norm(args); const g = d.games.find(g => norm(g.h).includes(q) || norm(g.a).includes(q));
    if (!q || !g) return reply('Uso: <code>/jogo arsenal</code>');
    const m = listMsg(d, `⚽ ${esc(g.h)} x ${esc(g.a)} · ${hourBR(g.utc)}`, pick(d.rows.filter(r => r.g === g.id && r.p >= .5), 15), g.fase === 'escalacao' ? 'Com escalação oficial' : 'Antes da escalação (titularidade provável)');
    return reply(m.text, m.kb);
  }
  if (cmd === 'jogador') {
    const pid = args ? findPlayer(d, args) : null; if (!pid) return reply('Uso: <code>/jogador saka</code>');
    const rows = d.rows.filter(r => r.id === pid);
    return reply(`👤 <b>${esc(d.mdl.p[pid].n)}</b>\n<blockquote expandable>${rows.map((r, i) => line(r, i + 1)).join('\n\n') || 'Sem linha hoje.'}</blockquote>${FOOT}`);
  }
  if (cmd === 'modelo') return reply(await modelo(d, chat, args));
  if (cmd === 'estrategias') return reply(await placar());
  if (cmd === 'gabarito') return reply(await gabarito(/^\d{4}-\d\d-\d\d$/.test(args) ? args : undefined));
  if (cmd === 'banca') return reply(await banca(chat));
  if (cmd === 'apagar') { const id = parseInt(args); if (!id) return reply('Uso: <code>/apagar 12</code>'); await sb(`bets?id=eq.${id}&chat_id=eq.${chat}`, { method: 'DELETE' }); return reply(`Aposta #${id} apagada.`); }
  if (cmd === 'resultado') {
    const [id, v] = args.split(/\s+/).map(x => +x.replace(',', '.')); if (!id || isNaN(v)) return reply('Uso: <code>/resultado 123 2</code> (número da entrada no /gabarito e o valor que saiu)');
    const x = (await sb(`strategy_picks?id=eq.${id}&select=*`))?.[0]; if (!x) return reply('Entrada não encontrada.');
    const L = +(x.open_line ?? x.line), O = +(x.open_odd ?? x.odd), status = v > L ? 'green' : 'red';
    await sb(`strategy_picks?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ status, result: v, profit: status === 'green' ? Math.round((O - 1) * 100) / 100 : -1, settled_at: new Date().toISOString() }) });
    return reply(`Entrada #${id} conferida: ${status === 'green' ? '✅ green' : '❌ red'} (${n1(v)} na linha ${n1(L)}).`);
  }
  if (cmd === 'receber') {
    const cur = (await sb(`bot_subs?chat_id=eq.${chat}&select=est`))?.[0];
    const est = !(cur?.est ?? false);
    await sb('bot_subs?on_conflict=chat_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ chat_id: chat, est, updated_at: new Date().toISOString() }) });
    return reply(est ? '🔔 Alertas do Modelo BH <b>ligados</b>.' : '🔕 Alertas <b>desligados</b>.');
  }
  // texto solto: odd de uma aposta aguardando ("1,85" · "1,85 1,5" · "1,85 0,5u")
  const pend = (await sb(`bets?chat_id=eq.${chat}&status=eq.aguardando_odd&select=*&order=created_at.desc&limit=1`))?.[0];
  const mm = text.trim().match(/^(\d+[.,]\d+)(?:\s+(\d+[.,]?\d*)(?!u))?(?:\s+(\d+[.,]?\d*)u)?$/i);
  if (pend && mm) {
    const odd = +mm[1].replace(',', '.'), L = mm[2] ? +mm[2].replace(',', '.') : +pend.line, stake = mm[3] ? +mm[3].replace(',', '.') : 1;
    await sb(`bets?id=eq.${pend.id}`, { method: 'PATCH', body: JSON.stringify({ odd, line: L, stake, status: 'aberta' }) });
    return reply(`✅ Aposta #${pend.id} registrada: ${esc(pend.name)} · mais de ${n1(L)} ${MK[pend.mk]} @${n2(odd)} · ${n1(stake)}u`);
  }
  return reply('Não entendi. /ajuda mostra os comandos.');
}

async function callback(q: any) {
  const chat = q.message?.chat?.id, dt = String(q.data || '');
  await TG('answerCallbackQuery', { callback_query_id: q.id });
  if (dt.startsWith('/')) return command(chat, dt);
  const d = await data();
  if (dt.startsWith('bet:')) {
    const [body, src] = dt.slice(4).split(':'); const [pid, mk, l] = body.split('|');
    const r = d.rows.find(r => r.id === pid && r.m === mk && r.l === +l) ?? d.rows.find(r => r.id === pid && r.m === mk);
    const name = r?.n ?? d.mdl.p[pid]?.n ?? pid;
    const ins = await sb('bets', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ chat_id: chat, date: d.date, pid, name, team: r?.t, opp: r?.o, gid: r?.g, mk, line: +l, p_model: r?.p, nota: r?.nt, src: src || 'lista', house: r?.b }) });
    return TG('sendMessage', { chat_id: chat, parse_mode: 'HTML', text: `📝 <b>${esc(name)}</b> · mais de ${n1(+l)} ${MK[mk]}\nMande a odd que você pegou (ex.: <code>1,85</code>). Se a linha for outra: <code>1,85 1,5</code>. Stake diferente de 1u: <code>1,85 0,5u</code>.\n<i>Registro #${ins?.[0]?.id}</i>` });
  }
  if (dt.startsWith('cp:')) {
    // texto pronto para os inscritos: a lista do top (sem formatação)
    const rows = pick(open(d).filter(r => inRange(r) && r.p >= .55));
    return TG('sendMessage', { chat_id: chat, text: plain(rows, `⚽ BLACK HOUSE · ${dt.slice(3)}`) });
  }
}

// relatório da manhã: confere as apostas e manda o gabarito de ontem a quem recebe os alertas
async function morning() {
  const n = await settleBets().catch(() => 0);
  const subs: any[] = await sb('bot_subs?select=chat_id&est=eq.true') ?? [];
  const g = await gabarito();
  for (const s of subs) await TG('sendMessage', { chat_id: s.chat_id, text: `☀️ <b>Bom dia!</b>\n\n${g}\n\n${await placar()}`, parse_mode: 'HTML' });
  return { conferidas: n, enviados: subs.length };
}

Deno.serve(async (req: Request) => {
  const u = new URL(req.url);
  try {
    const secret = await cfg('WEBHOOK_SECRET');
    if (u.searchParams.get('setup')) {
      if (u.searchParams.get('setup') !== secret) return new Response('senha errada', { status: 403 });
      // dentro do Supabase o pedido chega como http: o endereço público (https) vem de SUPABASE_URL
      const hook = await TG('setWebhook', { url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/telegram-bot`, secret_token: secret, allowed_updates: ['message', 'callback_query'] });
      const cmds = await TG('setMyCommands', { commands: [['top', 'Top 10 pela Nota BH'], ['valor', 'Maior valor esperado'], ['chutes', 'Chutes'], ['nogol', 'Chutes ao gol'], ['chutes1t', 'Chutes no 1º tempo'], ['nogol1t', 'Chutes ao gol no 1º tempo'], ['faltas', 'Faltas cometidas'], ['sofridas', 'Faltas sofridas'], ['desarmes', 'Desarmes'], ['defesas', 'Defesas do goleiro'], ['times', 'Times e jogo'], ['jogos', 'Jogos de hoje'], ['modelo', 'Chance em qualquer linha'], ['estrategias', 'Placar das estratégias'], ['gabarito', 'Gabarito de ontem'], ['banca', 'Sua banca'], ['receber', 'Ligar/desligar alertas'], ['ajuda', 'Comandos']].map(([command, description]) => ({ command, description })) });
      return new Response(JSON.stringify({ hook, cmds }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (u.searchParams.get('morning')) {
      if (u.searchParams.get('morning') !== secret) return new Response('senha errada', { status: 403 });
      return new Response(JSON.stringify(await morning()), { headers: { 'Content-Type': 'application/json' } });
    }
    if (req.method !== 'POST') return new Response('ok');
    if (req.headers.get('x-telegram-bot-api-secret-token') !== secret) return new Response('forbidden', { status: 403 });
    const up = await req.json();
    const chat = up.message?.chat?.id ?? up.callback_query?.message?.chat?.id;
    const allowed = (await cfg('ALLOWED_CHATS')).split(',').map(s => s.trim()).filter(Boolean);
    if (allowed.length && !allowed.includes(String(chat))) return new Response('ok');
    if (up.callback_query) await callback(up.callback_query);
    else if (up.message?.text) await command(chat, up.message.text);
    return new Response('ok');
  } catch (e) { console.error(e); return new Response('ok'); }
});
