// Bot do Telegram do Black House Futebol (Supabase Edge Function, Deno). Mesmo visual e mesma navegação do bot da NBA.
// Lê a lista pronta que a coleta publica (bot.json no GitHub Pages) e responde aos comandos.
//
// Configuração: tabela privada public.bot_config (ou segredos da função):
//   TELEGRAM_BOT_TOKEN  token do @BotFather (obrigatório)
//   WEBHOOK_SECRET      protege o webhook e as chamadas do pg_cron (obrigatório)
//   ALLOWED_CHATS       IDs liberados, separados por vírgula (opcional; vazio = qualquer pessoa)
//
// Instalação (uma vez, e de novo quando mudar a lista de comandos): <url-da-função>?setup=<WEBHOOK_SECRET>

const APP_URL = 'https://gabrielcbjr29.github.io/black-house-futebol/';
type Cfg = { token: string; secret: string; allowed: string[]; dataUrl: string; report: string; at: number };
let CFG: Cfg | null = null;
async function cfg(): Promise<Cfg> {
  if (CFG && Date.now() - CFG.at < 60_000) return CFG;
  const v: Record<string, string> = {};
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (url && key) {
    try {
      const r = await fetch(`${url}/rest/v1/bot_config?select=key,value`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      if (r.ok) for (const x of await r.json()) v[x.key] = x.value;
    } catch (e) { console.error('bot_config', e); }
  }
  const get = (k: string) => Deno.env.get(k) || v[k] || '';
  CFG = { token: get('TELEGRAM_BOT_TOKEN'), secret: get('WEBHOOK_SECRET'), allowed: get('ALLOWED_CHATS').split(',').map(s => s.trim()).filter(Boolean),
    dataUrl: get('DATA_URL') || APP_URL + 'data/bot.json', report: get('REPORT_TOKEN'), at: Date.now() };
  return CFG;
}
async function sb(path: string, init: RequestInit = {}) {
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('banco indisponível');
  const r = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error('banco ' + r.status + ' ' + (await r.text()).slice(0, 120));
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
const TG = async (m: string, body: unknown) => { const c = await cfg(); return fetch(`https://api.telegram.org/bot${c.token}/${m}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()); };

type Row = { id: string; n: string; t: string; o: string; home: boolean; g: number; lg: number; utc: string; fase: string; k: 'p' | 't' | 'j'; pos?: string; ps?: number; st?: string; ms?: number;
  m: string; s: 'o' | 'u'; l: number; p: number; d: number | null; b: string | null; of?: [string, number][]; e: number | null; pj: number; ps1?: number; sq?: number[]; jh?: number[]; ja?: number[];
  hit: [number, number] | null; h5: [number, number] | null; sk?: number; cx?: number; nt: number; gr: string; ref?: 1; cd?: 1; td?: any; at?: string;
  ex?: { p90?: number | null; sa?: number | null; ns?: number; hm?: number | null; nh?: number; aw?: number | null; na?: number; oa?: number | null; op?: number | null; pa?: number | null; np?: number } };
type MPlayer = { n: string; t: number; tn: string; on: string; home: boolean; g: number; lg?: number; gap?: number; utc: string; pos: string; ps: number; pb: number; st: string; ms: number; mu: Record<string, [number, number]>; sq: Record<string, number[]> };
type Game = { id: number; lg: number; utc: string; st: string; h: string; a: string; hid: number; aid: number; fase: string; ref: string | null };
type Data = { date: string; gen: string; demo?: boolean; games: Game[]; rows: Row[]; inj: { g: number; n: string; t: string; st: string; why: string }[];
  mdl: { p: Record<string, MPlayer>; t: Record<string, { h: number; a: number; hn: string; an: string; pj: { h: Record<string, number>; a: Record<string, number> }; ref: string | null; rf: number }> };
  ks: Record<string, number>; houses: { house: string; at: string; n: number }[];
  refs?: Record<string, { n: number; f: number; fpg: number; lfpg: number; cpg: number; lg: number } | null>; rowsU?: Row[] };
type Hunt = { date: string; gen: string; p: Record<string, number[][]> };

let CACHE: { at: number; data: Data } | null = null;
async function data(): Promise<Data> {
  if (CACHE && Date.now() - CACHE.at < 120_000) return CACHE.data;
  const r = await fetch((await cfg()).dataUrl + '?t=' + Math.floor(Date.now() / 120_000), { headers: { 'Cache-Control': 'no-cache' } });
  if (!r.ok) throw new Error('dados indisponíveis (' + r.status + ')');
  CACHE = { at: Date.now(), data: await r.json() };
  return CACHE.data;
}

// Caçador: últimos 20 jogos de cada jogador do dia (arquivo à parte, só carrega quando alguém usa)
let HCACHE: { at: number; data: Hunt } | null = null;
async function hunt(): Promise<Hunt> {
  if (HCACHE && Date.now() - HCACHE.at < 300_000) return HCACHE.data;
  const r = await fetch((await cfg()).dataUrl.replace(/bot\.json$/, 'hunt.json') + '?t=' + Math.floor(Date.now() / 300_000), { headers: { 'Cache-Control': 'no-cache' } });
  if (!r.ok) throw new Error('dados do caçador indisponíveis (' + r.status + ')');
  HCACHE = { at: Date.now(), data: await r.json() };
  return HCACHE.data;
}

// Raio-X (estatísticas pré-jogo, tendências L x/y e árbitros): raiox.json, só carrega quando alguém usa
type RXRow = (number | string | null)[];
type RXT = { g: number; t: number; k: string; s: string; side: string; l: number; x: number; y: number; v: string; b?: number; vals: number[] };
type RX = { date: string; gen: string; tn: Record<string, string>; g: { id: number; lg: number; utc: string; h: number; a: number; ref: string | null; rk: string | null; tm: Record<string, RXRow[]>; h2h: RXRow[]; inj: { n: string; t: string; st: string; why: string }[] }[];
  rf: Record<string, any>; tr: RXT[]; pt: { pid: string; g: number; mk: string; l: number; x: number; y: number; p90: number | null; vals: number[] }[] };
let XCACHE: { at: number; data: RX } | null = null;
async function raiox(): Promise<RX | null> {
  if (XCACHE && Date.now() - XCACHE.at < 300_000) return XCACHE.data;
  const r = await fetch((await cfg()).dataUrl.replace(/bot\.json$/, 'raiox.json') + '?t=' + Math.floor(Date.now() / 300_000), { headers: { 'Cache-Control': 'no-cache' } }).catch(() => null);
  if (!r?.ok) return null;
  XCACHE = { at: Date.now(), data: await r.json() };
  return XCACHE.data;
}

// ---------- textos ----------
const MK: Record<string, string> = { SH: 'chutes', SOT: 'chutes ao gol', SH1: 'chutes no 1º tempo', SOT1: 'chutes ao gol no 1º tempo', FC: 'faltas cometidas', FS: 'faltas sofridas', TK: 'desarmes', SV: 'defesas',
  TSH: 'chutes do time', TSOT: 'chutes ao gol do time', TFC: 'faltas do time', JSH: 'chutes no jogo', JSOT: 'chutes ao gol no jogo', JFC: 'faltas no jogo' };
const MKS: Record<string, string> = { SH: 'chutes', SOT: 'no gol', SH1: 'chutes 1ºT', SOT1: 'no gol 1ºT', FC: 'faltas com.', FS: 'faltas sofr.', TK: 'desarmes', SV: 'defesas',
  TSH: 'chutes time', TSOT: 'no gol time', TFC: 'faltas time', JSH: 'chutes jogo', JSOT: 'no gol jogo', JFC: 'faltas jogo' };
const MKN: Record<string, string> = { SH: 'Chutes', SOT: 'Chutes ao gol', SH1: 'Chutes no 1º tempo', SOT1: 'Chutes ao gol no 1º tempo', FC: 'Faltas cometidas', FS: 'Faltas sofridas', TK: 'Desarmes', SV: 'Defesas do goleiro',
  TSH: 'Chutes do time', TSOT: 'Chutes ao gol do time', TFC: 'Faltas do time', JSH: 'Chutes no jogo', JSOT: 'Chutes ao gol no jogo', JFC: 'Faltas no jogo' };
const MSTAT: Record<string, string> = { SH: 'sh', SOT: 'sot', SH1: 'sh', SOT1: 'sot', FC: 'fc', FS: 'fs', TK: 'tk', SV: 'sv' };
const LINES: Record<string, number[]> = { SH: [0.5, 1.5, 2.5, 3.5], SOT: [0.5, 1.5, 2.5], SH1: [0.5, 1.5], SOT1: [0.5, 1.5], FC: [0.5, 1.5, 2.5], FS: [0.5, 1.5, 2.5], TK: [0.5, 1.5, 2.5, 3.5], SV: [1.5, 2.5, 3.5, 4.5] };
const LG: Record<number, [string, string]> = { 39: ['🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Premier League'], 140: ['🇪🇸', 'La Liga'], 135: ['🇮🇹', 'Serie A'], 78: ['🇩🇪', 'Bundesliga'], 61: ['🇫🇷', 'Ligue 1'], 71: ['🇧🇷', 'Brasileirão'], 2: ['🏆', 'Champions'] };
// comando → mercados
const GROUPS: Record<string, { mk: string[]; title: string; ic: string }> = {
  chutes: { mk: ['SH'], title: 'Chutes', ic: '🎯' }, nogol: { mk: ['SOT'], title: 'Chutes ao gol', ic: '🥅' },
  primeiro: { mk: ['SH1', 'SOT1'], title: 'Chutes no 1º tempo', ic: '⏱️' }, chutes1t: { mk: ['SH1'], title: 'Chutes no 1º tempo', ic: '⏱️' }, nogol1t: { mk: ['SOT1'], title: 'Chutes ao gol no 1º tempo', ic: '⏱️' },
  faltas: { mk: ['FC'], title: 'Faltas cometidas', ic: '🧱' }, sofridas: { mk: ['FS'], title: 'Faltas sofridas', ic: '🤕' }, desarmes: { mk: ['TK'], title: 'Desarmes', ic: '🦶' },
  defesas: { mk: ['SV'], title: 'Defesas do goleiro', ic: '🧤' }, times: { mk: ['TSH', 'TSOT', 'TFC'], title: 'Mercados de time', ic: '🏟️' }, totais: { mk: ['JSH', 'JSOT', 'JFC'], title: 'Totais do jogo', ic: '➕' },
};

const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n1 = (x: number) => (Number.isInteger(x) ? String(x) : (Math.round(x * 10) / 10).toFixed(1)).replace('.', ',');
const n2 = (x: number) => x.toFixed(2).replace('.', ',');
const pc = (x: number | null) => x == null ? '–' : Math.round(x * 100) + '%';
const norm = (s: string) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').trim();
const dayBR = (ms = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(ms));
const dateBR = (d: string) => { const [, m, dd] = d.split('-'); const wd = new Date(d + 'T12:00:00Z').toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' }).replace('.', ''); return `${wd} ${dd}/${m}`; };
const hourBR = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
const FOOT = '\n<i>🔞 18+ · Confira a escalação e a odd da sua casa. O Ministério da Fazenda adverte: apostas podem causar dependência.</i>';
const GRADE: Record<string, string> = { 'A+': '🔥 A+', A: '✅ A', B: '➖ B', C: '⚪ C' };
const bar = (p: number, n = 10) => { const k = Math.max(0, Math.min(n, Math.round(p * n))); return '▰'.repeat(k) + '▱'.repeat(n - k); };
const PAGE = 5;
// faixa de odd das listas (odd da casa ou, sem casa, a odd justa)
const ODD_MIN = 1.4, ODD_MAX = 3.5;
const oddOf = (r: Row) => r.d ?? (r.p > 0 ? 1 / r.p : 99);
const inRangeBase = (r: Row) => { const o = oddOf(r); return o >= ODD_MIN - 1e-9 && o <= ODD_MAX + 1e-9; };
const inRange = inRangeBase;
const RANGE_TXT = ' · odds 1,40–3,50';
// odd mínima do usuário (pedido de 18/11, igual ao bot da NBA): vale para as listas, os Top 10, a múltipla, o envio diário
// e os alertas. Fica na bot_config (ODDMIN_<chat>), sem mexer no banco; sem escolha = 1,40 (a faixa padrão das listas).
// O papel, o placar e a planilha seguem contando tudo: o corte é só do que chega para você.
const OM_OPTS = [1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0, 2.2, 2.5];
const OM_CACHE = new Map<number, { at: number; v: number }>();
async function userMin(chatId: number): Promise<number> {
  const c = OM_CACHE.get(chatId); if (c && Date.now() - c.at < 60_000) return c.v;
  const v = +((await sb(`bot_config?key=eq.ODDMIN_${chatId}&select=value`).catch(() => null))?.[0]?.value ?? 0) || 0;
  OM_CACHE.set(chatId, { at: Date.now(), v }); return v;
}
async function allMins(): Promise<Record<string, number>> {
  const rows: any[] = await sb('bot_config?key=like.ODDMIN_*&select=key,value').catch(() => []) ?? [];
  return Object.fromEntries(rows.map(r => [String(r.key).slice(7), +r.value || 0]));
}
const okOdd = (o: number | null | undefined, om: number) => !om || (o != null && +o >= om - 1e-9);
const rangeTxt = (om: number) => om > ODD_MIN ? ` · odds ${n2(om)}–3,50` : RANGE_TXT;
const keyOf = (r: Row) => `${r.id}|${r.m}|${r.l}${r.s === 'u' ? '|u' : ''}`;
const sideTx = (s?: string) => s === 'u' ? '⬇️ Menos' : '⬆️ Mais';
const cardUrl = (d: Data, r: Row) => `${APP_URL}data/cards/${encodeURIComponent(`${r.id}-${r.m}-${String(r.l).replace('.', '_')}${r.s === 'u' ? '-u' : ''}`)}.jpg?v=${encodeURIComponent(d.gen)}`;
const hitTxt = (h?: [number, number] | null) => h?.[1] ? `<b>${h[0]}/${h[1]}</b>` : '–';
const u2 = (x: number) => (x >= 0 ? '+' : '') + x.toFixed(2).replace('.', ',') + 'u';
const pctS = (x: number) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1).replace('.', ',') + '%';
const evS = (x: any) => x == null ? '–' : (x >= 0 ? '+' : '') + (+x * 100).toFixed(1).replace('.', ',') + '%';
const conf = (p: number) => p >= .62 ? 'alta' : p >= .56 ? 'média' : 'baixa (perto de 50/50)';
// jogo sempre como mandante x visitante
const vsTxt = (r: { home: boolean; t: string; o: string }) => r.home ? `${r.t} x ${r.o}` : `${r.o} x ${r.t}`;
// "<b>1. Nome</b> <i>(Time)</i>" para jogador; time e jogo só com o nome
const whoB = (r: Row, i?: number) => `<b>${i != null ? i + '. ' : ''}${r.k === 'j' ? 'Jogo' : esc(r.n)}</b>${r.k === 'p' ? ` <i>(${esc(r.t)})</i>` : ''}`;
const STL = (r: { st?: string; ps?: number }) => r.st === 'xi' ? '✅ titular confirmado' : r.st === 'banco' ? '🪑 no banco' : r.st === 'duvida' ? '🟡 em dúvida' : r.st === 'provavel' ? `🕐 provável titular (${pc(r.ps ?? 0)})` : '';
// sequência dos últimos 10 (mais recente primeiro): 🟩 bateu (mais que a linha), 🟥 não bateu
const seq = (r: Row) => r.sq?.length ? r.sq.join('-') : '';
function sqDots(vals: number[] | null | undefined, line: number, n = 10, u = false) {
  const v = (vals ?? []).slice(0, n).map(Number); if (!v.length) return { dots: '', hit: 0, n: 0 };
  let hit = 0; const dots = v.map(x => { const ok = u ? x < line : x > line; if (ok) hit++; return ok ? '🟩' : '🟥'; }).join('');
  return { dots, hit, n: v.length };
}
const sqLine = (vals: number[] | null | undefined, line: number, u = false) => { const q = sqDots(vals, line, 10, u); return q.n ? `${q.dots} <b>${q.hit}/${q.n}</b>` : ''; };
// contexto do jogo para a estatística do jogador (quanto o jogo de hoje foge da média dele)
function ctxTxt(r: Row) {
  if (r.k !== 'p' || r.cx == null || Math.abs(r.cx - 1) < 0.03) return '';
  const st = MSTAT[r.m], d = Math.round((r.cx - 1) * 100), sg = (d > 0 ? '+' : '') + d + '%';
  const tag = r.cx >= 1.05 ? ' · <b>favorável</b>' : r.cx <= 0.95 ? ' · <i>difícil</i>' : '';
  const t = st === 'sh' || st === 'sot' ? `${esc(r.o)} cede <b>${sg}</b> ${st === 'sh' ? 'chutes' : 'chutes no gol'} que a média`
    : st === 'fs' ? `${esc(r.o)} comete <b>${sg}</b> faltas que a média`
    : st === 'fc' ? `jogo com <b>${sg}</b> faltas do time dele (adversário e árbitro)`
    : st === 'tk' ? `${esc(r.o)} deve ter <b>${sg}</b> de posse que o normal` : '';
  return t ? `\n🛡️ ${t[0].toUpperCase() + t.slice(1)}${tag}` : '';
}
// números da temporada e do adversário (card completo)
const POSN: Record<string, string> = { G: 'goleiros', D: 'defensores', M: 'meio-campistas', F: 'atacantes' };
const OA: Record<string, string> = { sh: 'chutes', sot: 'chutes no gol', fc: 'faltas sofridas', fs: 'faltas cometidas', sv: 'chutes no gol (finaliza)' };
function numsTxt(r: Row) {
  const x = r.ex; if (!x || /1$/.test(r.m)) return '';
  const st = MSTAT[r.m] ?? { TSH: 'sh', TSOT: 'sot', TFC: 'fc' }[r.m], out: string[] = [];
  if (r.k === 'p') {
    const a: string[] = [];
    if (x.sa != null && (x.ns ?? 0) >= 2) a.push(`<b>${n1(x.sa)}</b> por jogo como titular (${x.ns})`);
    if (x.p90 != null) a.push(`<b>${n1(x.p90)}</b> por 90`);
    if (a.length) out.push('📈 Temporada: ' + a.join(' · '));
    if (x.hm != null && x.aw != null && (x.nh ?? 0) >= 2 && (x.na ?? 0) >= 2) out.push(`🏠 Casa <b>${n1(x.hm)}</b> (${x.nh}) · ✈️ Fora <b>${n1(x.aw)}</b> (${x.na})${r.home ? ' · hoje em casa' : ' · hoje fora'}`);
    if (x.oa != null && OA[st]) {
      const verb = st === 'fc' ? 'sofre' : st === 'fs' ? 'comete' : st === 'sv' ? 'dá' : 'cede';
      const obj = st === 'fc' ? 'faltas' : st === 'fs' ? 'faltas' : st === 'sv' ? 'chutes no gol' : OA[st];
      out.push(`🛡️ ${esc(r.o)} ${verb} <b>${n1(x.oa)}</b> ${obj} por jogo (últ. 10)${x.op != null && Math.abs(x.op - 1) >= 0.06 && r.pos && POSN[r.pos] ? ` · a ${POSN[r.pos]}: <b>${pctS(x.op - 1)}</b> que o normal` : ''}`);
    }
  } else if (r.k === 't') {
    if (x.sa != null) out.push(`📈 ${esc(r.t)}: <b>${n1(x.sa)}</b> por jogo (últ. 10)`);
    if (x.oa != null) out.push(`🛡️ ${esc(r.o)} cede <b>${n1(x.oa)}</b> ${st === 'fc' ? 'faltas (sofre)' : st === 'sot' ? 'chutes no gol' : 'chutes'} por jogo (últ. 10)`);
  }
  return out.length ? '\n' + out.join('\n') : '';
}
const refName = (s: string) => String(s).split(',')[0].trim();
const rigor = (f: number) => f >= 1.07 ? '🔴 <b>rigoroso</b>' : f <= 0.93 ? '🟢 <b>deixa jogar</b>' : '⚪ normal';
function hitsTxt(r: Row) {
  if (r.k === 'j') return r.jh?.length ? `📊 Total nos últimos 5 · ${esc(r.t)}: <b>${r.jh.slice(0, 5).join('-')}</b> · ${esc(r.o)}: <b>${(r.ja ?? []).slice(0, 5).join('-')}</b>` : '';
  if (/1$/.test(r.m)) return '📊 <i>1º tempo: sem histórico por jogador; a chance usa a fatia do 1º tempo da liga</i>';
  return `📊 L5 ${hitTxt(r.h5)} · L10 ${hitTxt(r.hit)}${r.k === 'p' ? ' <i>como titular</i>' : ''}${seq(r) ? `\n${sqLine(r.sq, r.l, r.s === 'u')} · <i>${seq(r)}</i>` : ''}`;
}
// odd lida há 2 h ou mais (leitor parado): avisa para conferir
const STALE = 2 * 3600e3;
const whenBR = (iso: string) => { const d = new Date(iso), same = dayBR(d.getTime()) === dayBR(); return (same ? '' : new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).format(d) + ' ') + hourBR(iso); };
const staleTx = (r: Row) => r.d && r.at && Date.now() - Date.parse(r.at) >= STALE ? `\n⏱️ <b>Odd lida às ${whenBR(r.at)}</b>, confira antes` : '';
const oddTxt = (r: Row) => r.d ? `💵 <code>@${n2(r.d)}</code> ${esc(r.b ?? '')}${r.of && r.of.length > 1 ? ` <i>(+${r.of.length - 1} casa${r.of.length > 2 ? 's' : ''})</i>` : ''}` : `💵 odd justa <code>@${n2(1 / r.p)}</code> <i>(sem casa)</i>`;
const evTxt = (r: Row) => r.e == null ? '' : ` · EV <b>${r.e >= 0 ? '+' : ''}${(r.e * 100).toFixed(1).replace('.', ',')}%</b>`;
// cartão das listas
function listCard(r: Row, i: number) {
  return `<blockquote>${whoB(r, i)}  <i>${esc(vsTxt(r))} · ${hourBR(r.utc)}</i>
${r.s === 'u' ? '⬇️ <b>Menos' : '⬆️ <b>Mais'} de ${n1(r.l)}</b> ${MK[r.m] ?? r.m}
${GRADE[r.gr] ?? r.gr} · Nota <b>${r.nt}</b>  ${bar(r.p)} <b>${pc(r.p)}</b>
${oddTxt(r)}${evTxt(r)}
${hitsTxt(r)}
🧠 Modelo BH: <b>${n1(r.pj)}</b>${r.k === 'p' && r.st ? ' · ' + STL(r) : ''}${ctxTxt(r)}</blockquote>`;
}
// análise completa (🔎)
function card(d: Data, r: Row, i?: number, opt: { td?: boolean } = {}) {
  const T = d.mdl.t[String(r.g)];
  const R = T?.ref ? d.refs?.[T.ref] : null;
  const ref = (r.m === 'FC' || r.m === 'FS' || r.m === 'TFC' || r.m === 'JFC') && T?.ref ? `\n🟨 Árbitro: ${esc(refName(T.ref))}${R ? ` · <b>${n1(R.fpg)}</b> faltas/jogo (liga ${n1(R.lfpg)}) · ${n1(R.cpg)} cartões · ${rigor(R.f)}` : T.rf && Math.abs(T.rf - 1) >= 0.03 ? ` · <b>${pctS(T.rf - 1)}</b> faltas por jogo que a média` : ''}` : '';
  const casas = r.of && r.of.length > 1 ? `\n🏠 Casas: ${r.of.map(([h, o]) => `${esc(h)} @${n2(o)}`).join(' · ')}` : '';
  const refl = r.ref ? '\n📏 <i>Linha de referência do modelo: nenhuma casa abriu essa linha ainda</i>' : '';
  const mins = r.k === 'p' && r.ms ? `\n⏱️ ~${r.ms} min quando titular${r.ps1 != null ? ` · Modelo BH como titular <b>${n1(r.ps1)}</b>` : ''}` : '';
  const nums = numsTxt(r);
  // por que sim / por que não
  const wy: string[] = [], wn: string[] = [];
  if (r.hit && r.hit[1] >= 5 && r.hit[0] / r.hit[1] >= .7) wy.push(`✅ Bateu em ${r.hit[0]} dos últimos ${r.hit[1]}${r.k === 'p' ? ' como titular' : ' jogos'}`);
  if (r.cx != null && r.cx >= 1.08) wy.push('✅ Adversário favorece essa estatística');
  if (r.st === 'xi') wy.push('✅ Titular confirmado na escalação oficial');
  if (!opt.td && r.e != null && r.e >= .05) wy.push(`✅ Valor na odd da casa (EV ${evS(r.e)})`);
  if (r.st === 'provavel') wn.push('⚠️ Escalação ainda não saiu: confira antes de entrar');
  if (r.st === 'duvida') wn.push('🟡 <i>Jogador em dúvida</i>');
  if (r.st === 'banco') wn.push('⚠️ Começa no banco');
  if (r.hit && r.hit[1] >= 5 && r.hit[0] / r.hit[1] < .4) wn.push(`⚠️ Bateu só ${r.hit[0]} dos últimos ${r.hit[1]}`);
  if (r.cx != null && r.cx <= 0.92) wn.push('⚠️ Adversário dificulta essa estatística');
  if (!opt.td && r.e != null && r.e > .15) wn.push('⚠️ <i>Muito acima do mercado: confira notícias</i>');
  const why = [...wy.slice(0, 3), ...wn.slice(0, 3)];
  return `<blockquote>${whoB(r, i)}  <i>${LG[r.lg]?.[0] ?? ''} ${esc(vsTxt(r))} · ${hourBR(r.utc)}</i>
${r.s === 'u' ? '⬇️ <b>Menos' : '⬆️ <b>Mais'} de ${n1(r.l)}</b> ${MK[r.m] ?? r.m}
${GRADE[r.gr] ?? r.gr} · Nota <b>${r.nt}</b>  ${bar(r.p)} <b>${pc(r.p)}</b>
${oddTxt(r)}${opt.td ? ' · 📈 <i>sinal da sequência, não do modelo</i>' : evTxt(r)}${staleTx(r)}${casas}${refl}
${hitsTxt(r)}
🧠 Modelo BH <b>${n1(r.pj)}</b>${r.k === 'p' && r.st ? ' · ' + STL(r) : ''}${mins}${nums}${ctxTxt(r)}${ref}</blockquote>${why.length ? `\n<blockquote expandable><b>Por que sim / por que não</b>\n${why.join('\n')}</blockquote>` : ''}`;
}
function header(d: Data, title: string, extra = '') {
  return `<b>${title}</b>\n<i>${dateBR(d.date)} · ${d.games.length} jogos · atualizado ${hourBR(d.gen)}${d.demo ? ' · demonstração' : ''}${extra}</i>\n`;
}
type Out = { text: string; kb?: unknown; force?: boolean };
const BTN = (text: string, data: string) => ({ text, callback_data: data.slice(0, 64) });
const HOME = [BTN('🏠 Menu', '/menu'), BTN('🔄 Atualizar', 'r:1:/menu')];
const home = (cmd: string, pg = 1) => [BTN('🏠 Menu', '/menu'), BTN('🔄 Atualizar', `r:${pg}:${cmd}`)];
function chunk<T>(a: T[], n: number) { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }
const open = (d: Data) => d.rows.filter(r => Date.parse(r.utc) > Date.now() - 5 * 6e4);

// ---------- Top 10 do Modelo BH ----------
const MT: Record<string, { mk: string[]; title: string; cmd: string; ic: string }> = {
  chutes: { mk: ['SH', 'SOT', 'SH1', 'SOT1'], title: 'CHUTES', cmd: '/topchutes', ic: '🎯' },
  faltas: { mk: ['FC', 'FS', 'TK'], title: 'FALTAS E DESARMES', cmd: '/topfaltas', ic: '🧱' },
};
// ranking pela Nota BH, um por jogador; só titular confirmado ou provável (80%+); jogo com linha de casa só entra com linha de casa
function modelTop(d: Data, mk: string[], n = 10, om = 0) {
  const cov = new Set(d.rows.filter(r => r.d).map(r => r.g));
  const rows = open(d).filter(r => r.k === 'p' && mk.includes(r.m) && (r.st === 'xi' || (r.st === 'provavel' && (r.ps ?? 0) >= .8)) && r.p >= .55 && r.p <= .85 && inRange(r) && okOdd(oddOf(r), om) && (r.d || !cov.has(r.g)))
    .sort((a, b) => (b.nt - a.nt) || ((b.e ?? -1) - (a.e ?? -1)));
  const seen = new Set<string>(), out: Row[] = [];
  for (const r of rows) { if (seen.has(r.id)) continue; seen.add(r.id); out.push(r); if (out.length >= n) break; }
  return out;
}
function tops(d: Data, n = 10, om = 0): Record<string, Row[]> { return Object.fromEntries(Object.entries(MT).map(([k, T]) => [k, modelTop(d, T.mk, n, om)])); }
const MT_NOTE = (d: Data) => d.rows.some(r => r.d)
  ? '\n<i>🏠 Linha e odd da melhor casa lida. 📏 Jogo sem casa ainda usa a linha de referência do modelo. Só titulares confirmados ou prováveis (80%+).</i>'
  : '\n<i>📏 Linha de referência do modelo (chance perto de 62%). Confira a linha da sua casa: se for outra, use /modelo para ver a chance nela. Só titulares confirmados ou prováveis (80%+).</i>';
const lineSrc = (r: Row) => r.d ? `🏠 ${esc(r.b ?? 'casa')} @${n2(r.d)}${r.of && r.of.length > 1 ? ` <i>(+${r.of.length - 1})</i>` : ''}${r.e != null ? ` · EV <b>${evS(r.e)}</b>` : ''}` : `📏 Linha de referência · odd justa @${n2(1 / r.p)}`;
function compact(r: Row, i: number) {
  return `<b>${i}. ${esc(r.n)}</b> <i>(${esc(r.t)}) ${esc(vsTxt(r))} · ${hourBR(r.utc)}</i>
⬆️ Mais de <b>${n1(r.l)}</b> ${MK[r.m] ?? r.m} · <b>${pc(r.p)}</b> · Nota <b>${r.nt}</b>
${lineSrc(r)}
📊 L5 ${hitTxt(r.h5)} · L10 ${hitTxt(r.hit)} · 🧠 ${n1(r.pj)}${r.ms ? ` · ⏱️ ~${r.ms} min` : ''}${r.st === 'xi' ? ' · ✅ titular' : ''}${seq(r) ? `\n${sqLine(r.sq, r.l)}\n<i>🔢 ${seq(r)}</i>` : ''}`;
}
function topText(d: Data, key: string, om = 0) {
  const T = MT[key], top = tops(d, 10, om)[key];
  if (!top.length) return null;
  return `<b>${T.ic} TOP 10 MODELO BH · ${T.title}</b>\n<i>${dateBR(d.date)} · ${d.games.length} jogos · atualizado ${hourBR(d.gen)}</i>\n\n` + top.map((r, i) => compact(r, i + 1)).join('\n\n') + '\n' + MT_NOTE(d) + '\n<i>📝 Toque no número para registrar a entrada (1u) com a sua odd. 🔢 = sequência dos últimos 10 como titular (mais recente primeiro).</i>' + (om > ODD_MIN ? `\n<i>🎯 Só odd ${n2(om)} ou mais (sua odd mínima).</i>` : '') + FOOT;
}
function shareText(r: Row, i?: number) {
  const head = `${i != null ? `${i}. ` : '⚽ '}${r.k === 'p' ? `${r.n} (${r.t})` : r.n} · ${vsTxt(r)} · ${hourBR(r.utc)}`;
  const q = sqDots(r.sq, r.l);
  return [head, `⬆️ Mais de ${n1(r.l)} ${MK[r.m] ?? r.m}`, ...(q.n ? [`📊 Últimos ${q.n}: ${q.dots} ${q.hit}/${q.n}`] : []), ...(seq(r) ? [`🔢 Sequência: ${seq(r)}`] : [])].join('\n');
}
function shareList(d: Data, key: string) {
  const T = MT[key], top = tops(d)[key];
  if (!top.length) return 'Nenhuma entrada no top agora.';
  const body = top.map((r, i) => shareText(r, i + 1)).join('\n\n');
  return `📋 <b>Texto para os inscritos</b> <i>(toque no bloco para copiar)</i>\n<pre>${esc(`${T.ic} TOP 10 MODELO BH · ${T.title}\n${dateBR(d.date)}\n\n${body}\n\n🟩 bateu · 🟥 não bateu · 🔢 sequência dos últimos 10 jogos como titular, do mais recente para o mais antigo.\n🔞 18+ · Aposte com responsabilidade.`)}</pre>`;
}

// ---------- Modelo BH: chance de qualquer linha ----------
function nbOver(mu: number, k: number, line: number) {
  mu = Math.max(mu, 1e-4); const thr = Math.floor(line + 1e-9); let p: number, c = 0;
  if (!k || k > 400) { p = Math.exp(-mu); for (let x = 0; x <= thr; x++) { c += p; p *= mu / (x + 1); } }
  else { const q = mu / (k + mu); p = Math.pow(k / (k + mu), k); for (let x = 0; x <= thr; x++) { c += p; p *= (x + k) / (x + 1) * q; } }
  return Math.max(0, Math.min(1, 1 - c));
}
// chance de MAIS condicionada a entrar em campo (titular ou entra do banco)
function pPlayer(d: Data, m: MPlayer, mk: string, L: number) {
  const mu = m.mu[mk]; if (!mu) return null;
  const k = d.ks?.[mk] ?? 6, pS = m.ps, pB = (1 - m.ps) * m.pb, tot = pS + pB;
  return tot > 0 ? (pS * nbOver(mu[0], k, L) + pB * (mu[1] > 0 ? nbOver(mu[1], k, L) : 0)) / tot : 0;
}
function pAt(d: Data, pid: string, mk: string, L: number) {
  const m = d.mdl?.p?.[pid]; if (m) return pPlayer(d, m, mk, L);
  const r = d.rows.find(x => x.id === pid && x.m === mk); return r ? nbOver(r.pj, d.ks?.[mk] ?? 10, L) : null;
}
const STATW: Record<string, string> = { chutes: 'SH', chute: 'SH', finalizacoes: 'SH', sh: 'SH', nogol: 'SOT', 'no gol': 'SOT', 'ao gol': 'SOT', 'chutes ao gol': 'SOT', sot: 'SOT',
  chutes1t: 'SH1', 'chutes 1t': 'SH1', sh1: 'SH1', nogol1t: 'SOT1', 'no gol 1t': 'SOT1', sot1: 'SOT1', faltas: 'FC', cometidas: 'FC', 'faltas cometidas': 'FC', fc: 'FC',
  sofridas: 'FS', 'faltas sofridas': 'FS', fs: 'FS', desarmes: 'TK', desarme: 'TK', tk: 'TK', defesas: 'SV', defesa: 'SV', sv: 'SV' };
async function modeloCmd(d: Data, rest: string[], chatId: number): Promise<Out> {
  const back = { inline_keyboard: [[BTN('📒 Meus testes', '/testes'), BTN('🧠 Como usar', '/modelo')], [BTN('🏠 Menu', '/menu')]] };
  if (!d.mdl?.p || !Object.keys(d.mdl.p).length) return { text: 'O Modelo BH ainda não rodou para os jogos de hoje. Tente depois da próxima atualização.', kb: { inline_keyboard: [HOME] } };
  if (!rest.length) return { text: `<b>🧠 MODELO BH</b>
Chance de qualquer linha pelo modelo: taxa por 90 minutos do jogador × minutos esperados × contexto do jogo (o que o adversário cede, mando e árbitro), calibrado com o histórico real.

<b>Como usar</b>
<code>/modelo saka chutes 1,5</code>
<code>/modelo vinicius nogol 0,5</code>
<code>/modelo casemiro faltas 1,5</code>
<code>/modelo raphinha sofridas 1,5</code>
<code>/modelo alisson defesas 2,5</code>
Sem a linha, mostra a projeção e as linhas mais comuns.

<b>Mercados</b>: chutes, nogol, chutes1t, nogol1t, faltas (cometidas), sofridas, desarmes, defesas.

📒 Toda linha que você manda vira um <b>teste</b>: no dia seguinte eu confiro o resultado sozinho. Veja em /testes.`, kb: back };
  const toks = rest.map(t => t.toLowerCase());
  let line: number | null = null;
  if (/^\d+([.,]\d+)?$/.test(toks[toks.length - 1] ?? '')) { line = parseFloat(toks.pop()!.replace(',', '.')); if (!Number.isInteger(line - .5)) line = Math.floor(line) + .5; }
  let mk: string | undefined;
  for (const n of [3, 2, 1]) { if (toks.length > n - 1) { const w = norm(toks.slice(-n).join(' ')); if (STATW[w]) { mk = STATW[w]; toks.splice(-n); break; } } }
  if (!mk) { const i = toks.findIndex(t => STATW[norm(t)] || MKS[t.toUpperCase()]); if (i >= 0) { mk = STATW[norm(toks[i])] ?? toks[i].toUpperCase(); toks.splice(i, 1); } }
  if (!mk || !LINES[mk]) return { text: 'Não entendi o mercado. Exemplo: <code>/modelo saka chutes 1,5</code>', kb: back };
  const q = toks.join(' ');
  let pid: string | undefined;
  if (q.startsWith('#')) pid = q.slice(1);
  else {
    const nq = norm(q); if (nq.length < 3) return { text: 'Digite pelo menos 3 letras do nome do jogador.', kb: back };
    const hits = Object.entries(d.mdl.p).filter(([, m]) => norm(m.n).includes(nq) && m.mu[mk!]);
    if (!hits.length) return { text: `Não achei <b>${esc(q)}</b> nos jogos de hoje com ${MK[mk]} (ou ele está fora).`, kb: back };
    if (hits.length > 1) return { text: `Achei ${hits.length} jogadores. Qual deles?`, kb: { inline_keyboard: [...chunk(hits.slice(0, 8).map(([id, m]) => BTN(`${m.n} (${m.tn})`, `/modelo #${id} ${mk}${line != null ? ' ' + line : ''}`)), 2), [BTN('🏠 Menu', '/menu')]] } };
    pid = hits[0][0];
  }
  const m = d.mdl.p[pid!]; if (!m || !m.mu[mk]) return { text: 'Jogador não encontrado nos jogos de hoje.', kb: back };
  const vs = vsTxt({ home: m.home, t: m.tn, o: m.on });
  const v10 = /1$/.test(mk) ? [] : (m.sq?.[MSTAT[mk]] ?? []);
  const projS = m.mu[mk][0];
  const head = `<b>🧠 MODELO BH · ${esc(m.n)}</b>\n<i>${esc(vs)} · ${hourBR(m.utc)} · ${STL(m)}</i>\n`;
  if (line == null) {
    const rows = LINES[mk].map(l => { const po = pPlayer(d, m, mk!, l)!; return `${n1(l).padStart(5)}  ${String(Math.round(po * 100)).padStart(3)}%   @${n2(1 / Math.max(po, .01))}`; }).join('\n');
    return { text: head + `\n<b>${MK[mk]}</b>\nProjeção como titular <b>${n1(Math.round(projS * 100) / 100)}</b> · ⏱️ ~${m.ms} min\n<pre>LINHA  MAIS   ODD JUSTA\n${rows}</pre>${v10.length ? `\nÚltimos ${v10.length} como titular: ${v10.join(' · ')}` : ''}\n\nToque numa linha para registrar o teste:`,
      kb: { inline_keyboard: [LINES[mk].map(l => BTN(n1(l), `/modelo #${pid} ${mk} ${l}`)), ...back.inline_keyboard] } };
  }
  const po = pPlayer(d, m, mk, line)!;
  const q10 = sqDots(v10, line);
  let reg = '';
  try {
    const r = await sb('model_tests?on_conflict=chat_id,date,pid,mk,line', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ chat_id: chatId, date: d.date, pid, name: m.n, gid: m.g, mk, line, p: Math.round(po * 1000) / 1000, mu: Math.round(projS * 100) / 100 }) });
    reg = `📒 Teste <b>#${r?.[0]?.id ?? ''}</b> registrado: confiro amanhã com o resultado (/testes).`;
  } catch { reg = '<i>(não consegui registrar o teste agora)</i>'; }
  back.inline_keyboard.unshift([BTN(`📝 Registrar mais de ${n1(line)} (1u)`, `bm:${pid}:${mk}:${line}`)]);
  return { text: head + `
<b>${MK[mk]} · linha ${n1(line)}</b>
<blockquote>Projeção como titular <b>${n1(Math.round(projS * 100) / 100)}</b>  ·  ⏱️ ~${m.ms} min
⬆️ Mais de ${n1(line)}: <b>${Math.round(po * 100)}%</b>  ${bar(po)}
💵 Odd justa <b>${n2(1 / Math.max(po, .01))}</b>: acima dela, a entrada tem valor
${q10.n ? `📊 Últimos ${q10.n} como titular: ${q10.dots} <b>${q10.hit}/${q10.n}</b> acima\n<i>${v10.join(' · ')}</i>` : '📊 <i>1º tempo: sem histórico por jogador; a chance usa a fatia do 1º tempo da liga</i>'}</blockquote>
👉 Confiança ${conf(po)}${m.st === 'provavel' ? ' · <i>escalação ainda não saiu</i>' : ''}
${reg}
<i>A chance já conta o risco de ele não começar jogando (sem entrar em campo, a casa costuma anular).</i>`, kb: back };
}

// ---------- testes: confere sozinho com os resultados publicados ----------
// results.json: jogador [min, chutes, no gol, faltas com., faltas sofr., desarmes, defesas]; time e jogo [90, chutes, no gol, faltas]
const RIDX: Record<string, number> = { SH: 1, SOT: 2, FC: 3, FS: 4, TK: 5, SV: 6, TSH: 1, TSOT: 2, TFC: 3, JSH: 1, JSOT: 2, JFC: 3 };
async function getResults() { return fetch(APP_URL + 'data/results.json?t=' + Math.floor(Date.now() / 300_000)).then(r => r.ok ? r.json() : null).catch(() => null); }
async function settleTests(rows: any[]) {
  const open = rows.filter(r => !r.settled_at && RIDX[r.mk]);
  if (!open.length) return;
  const res = await getResults(); if (!res?.stats) return;
  for (const r of open) {
    if (!res.dates?.includes(r.date)) continue;
    const a = res.stats[r.date]?.[r.pid];
    if (!a) continue;
    const patch = !(a[0] > 0) ? { settled_at: new Date().toISOString(), hit: null, result: null } : { settled_at: new Date().toISOString(), result: a[RIDX[r.mk]], hit: a[RIDX[r.mk]] > +r.line };
    Object.assign(r, patch);
    await sb(`model_tests?id=eq.${r.id}`, { method: 'PATCH', body: JSON.stringify(patch) }).catch(() => null);
  }
}
function resumoTestes(rows: any[], titulo: string) {
  const done = rows.filter(r => r.settled_at && r.hit != null);
  const pct1 = (a: any[]) => a.length ? Math.round(a.filter(r => r.hit).length / a.length * 1000) / 10 : 0;
  const band = (lo: number, hi: number) => done.filter(r => +r.p >= lo && +r.p < hi);
  const by: Record<string, any[]> = {}; for (const r of done) (by[r.mk] ||= []).push(r);
  const lines = Object.entries(by).sort((a, b) => b[1].length - a[1].length).slice(0, 8).map(([k, a]) => `${(MKN[k] ?? k).padEnd(24).slice(0, 24)} ${String(a.length).padStart(3)}  ${String(pct1(a)).padStart(5)}%`).join('\n');
  const prev = done.length ? Math.round(done.reduce((s, r) => s + +r.p, 0) / done.length * 1000) / 10 : 0;
  return `<b>${titulo}</b>
<blockquote>✅ <b>${done.filter(r => r.hit).length}</b> · ❌ <b>${done.filter(r => !r.hit).length}</b> · ⏳ ${rows.filter(r => !r.settled_at).length} aguardando
Acerto: <b>${pct1(done)}%</b>${done.length ? ` · o modelo previa ${String(prev).replace('.', ',')}%` : ''}
Confiança alta (62%+): ${band(.62, 1.01).length} testes, ${pct1(band(.62, 1.01))}%
Confiança média (56–62%): ${band(.56, .62).length} testes, ${pct1(band(.56, .62))}%
Confiança baixa: ${band(0, .56).length} testes, ${pct1(band(0, .56))}%</blockquote>${lines ? `\n<pre>MERCADO                    N  ACERTO\n${lines}</pre>` : ''}
<i>Se o acerto fica perto do que o modelo previa, ele está calibrado. Amostra pequena engana: o número começa a valer com 100+ testes.</i>`;
}
async function testesCmd(chatId: number, rest: string[]): Promise<Out> {
  const all = norm(rest[0] ?? '') === 'todos';
  let rows: any[] = [];
  try { rows = await sb(`model_tests?select=*${all ? '' : `&chat_id=eq.${chatId}`}&order=created_at.desc&limit=${all ? 1000 : 300}`) ?? []; } catch { return { text: 'Não consegui ler os testes agora.', kb: { inline_keyboard: [HOME] } }; }
  await settleTests(rows);
  if (!rows.length) return { text: 'Nenhum teste ainda. Mande uma linha da sua casa, por exemplo:\n<code>/modelo saka chutes 1,5</code>', kb: { inline_keyboard: [[BTN('🧠 Como usar', '/modelo')], HOME] } };
  const last = rows.slice(0, 12).map(r => {
    const ic = !r.settled_at ? '⏳' : r.hit == null ? '➖' : r.hit ? '✅' : '❌';
    return `${ic} ${esc(r.name)} · mais ${n1(+r.line)} ${MKS[r.mk] ?? r.mk} <i>(${Math.round(+r.p * 100)}%${r.result != null ? ', fez ' + n1(+r.result) : ''})</i>`;
  }).join('\n');
  return { text: resumoTestes(rows, all ? '📒 TESTES DO MODELO BH · TODOS OS USUÁRIOS' : '📒 SEUS TESTES DO MODELO BH') + `\n\n<b>Últimos</b>\n${last}`,
    kb: { inline_keyboard: [[BTN(all ? '👤 Só os meus' : '👥 De todos', all ? '/testes' : '/testes todos'), BTN('🔄 Atualizar', all ? '/testes todos' : '/testes')], [BTN('🧠 Modelo BH', '/modelo'), BTN('🏠 Menu', '/menu')]] } };
}

// ---------- envio diário ----------
type Sub = { chutes: boolean; faltas: boolean; est: boolean };
const subKb = (s: Sub | null, om = 0) => ({ inline_keyboard: [
  [BTN(`${s?.chutes ? '✅' : '⬜'} Top 10 Chutes`, '/receber chutes'), BTN(`${s?.faltas ? '✅' : '⬜'} Top 10 Faltas`, '/receber faltas')],
  [BTN(`${s?.est ? '✅' : '⬜'} Modelo por mercado`, '/receber est')],
  [BTN(`🎯 Odd mínima: ${om > ODD_MIN ? n2(om) : 'padrão (1,40)'}`, '/odd')],
  [BTN('🔕 Parar de receber', '/receber parar'), BTN('🏠 Menu', '/menu')]] });
// 🎯 odd mínima: escolha por botões; vale para tudo que o bot mostra e manda para este chat
async function oddCmd(chatId: number, rest: string[]): Promise<Out> {
  let om = await userMin(chatId);
  const v = (rest[0] ?? '').replace(',', '.');
  if (v) {
    const x = norm(v) === 'padrao' ? 0 : +v;
    if (isFinite(x) && x >= 0 && x <= 10) {
      if (x > ODD_MIN) await sb('bot_config?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key: `ODDMIN_${chatId}`, value: String(x), updated_at: new Date().toISOString() }) });
      else await sb(`bot_config?key=eq.ODDMIN_${chatId}`, { method: 'DELETE' }).catch(() => null);
      om = x > ODD_MIN ? x : 0; OM_CACHE.set(chatId, { at: Date.now(), v: om });
    }
  }
  const lb = (o: number) => `${(om > ODD_MIN ? Math.abs(om - o) < 1e-9 : o === ODD_MIN) ? '✅ ' : ''}${n2(o)}${o === ODD_MIN ? ' (padrão)' : '+'}`;
  return { text: `🎯 <b>ODD MÍNIMA</b>

Agora: <b>${om > ODD_MIN ? n2(om) + ' ou mais' : 'padrão (1,40 ou mais)'}</b>
<blockquote>Vale para tudo que o bot te mostra e manda: listas (Top do dia, Valor, Seguras, Chutes, Faltas…), Top 10 Chutes e Faltas, múltipla, envio diário, alertas das estratégias e alertas de risco.</blockquote>
<i>Usa a odd da casa (99play ou outra lida); sem odd de casa, a odd justa do modelo. A planilha, o placar e o gabarito seguem contando todas as entradas, para medir o método inteiro.</i>`,
    kb: { inline_keyboard: [...chunk(OM_OPTS.map(o => BTN(lb(o), `/odd ${o === ODD_MIN ? 'padrao' : o}`)), 3), [BTN('📬 Envio diário', '/receber'), BTN('🏠 Menu', '/menu')]] } };
}
async function receberCmd(chatId: number, rest: string[]): Promise<Out> {
  const a = norm(rest[0] ?? '');
  if (a === 'odd') return oddCmd(chatId, rest.slice(1));
  let s: Sub | null = null;
  try { s = (await sb(`bot_subs?chat_id=eq.${chatId}&select=chutes,faltas,est`))?.[0] ?? null; } catch { return { text: 'Não consegui acessar as inscrições agora.', kb: { inline_keyboard: [HOME] } }; }
  let next = s;
  if (!a) next = s ?? { chutes: true, faltas: true, est: true };
  else if (a === 'parar') next = { chutes: false, faltas: false, est: false };
  else if (a === 'chutes' || a === 'faltas' || a === 'est') next = { ...(s ?? { chutes: false, faltas: false, est: false }), [a]: !(s?.[a as keyof Sub]) };
  if (JSON.stringify(next) !== JSON.stringify(s)) await sb('bot_subs?on_conflict=chat_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ chat_id: chatId, ...next, updated_at: new Date().toISOString() }) });
  const om = await userMin(chatId);
  const on = [next?.chutes && '🎯 Top 10 Chutes', next?.faltas && '🧱 Top 10 Faltas e desarmes', next?.est && '🧪 Modelo por mercado (entradas do dia)'].filter(Boolean);
  return { text: `<b>📬 ENVIO DIÁRIO DO MODELO BH</b>\n\n${on.length ? `Você recebe todo dia, cerca de 2h30 antes do primeiro jogo:\n${on.map(x => '• ' + x).join('\n')}${next?.est ? '\n\n🚨 No modelo por mercado, cada entrada nova também chega na hora, em alerta, assim que o modelo aponta (das 6h às 23h50).' : ''}` : 'Você não está recebendo nada no momento.'}\n\nToque para ligar ou desligar cada lista:${om > ODD_MIN ? `\n<i>🎯 Só entradas com odd ${n2(om)} ou mais.</i>` : ''}`, kb: subKb(next, om) };
}
async function pushDaily(force = false, lead = 0) {
  CACHE = null;
  const d = await data();
  const flag = `PUSH_${d.date}`;
  if (!force) {
    if (d.demo) return { ok: true, skip: 'dados de demonstração' };
    if (d.date !== dayBR()) return { ok: true, skip: `dados de ${d.date}` };
    if (lead) {
      const first = Math.min(...d.games.filter(g => Date.parse(g.utc) > Date.now()).map(g => Date.parse(g.utc)));
      if (!Number.isFinite(first)) return { ok: true, skip: 'sem jogos pela frente' };
      if (Date.now() < first - lead * 6e4) return { ok: true, skip: `cedo: primeiro jogo às ${hourBR(new Date(first).toISOString())}` };
    }
    const done = await sb(`bot_config?key=eq.${flag}&select=key`).catch(() => []); if (done?.length) return { ok: true, skip: 'já enviado hoje' };
  }
  const gravados = await recordTops(d).catch(e => { console.error('top_picks', e); return 0; });
  const subs: ({ chat_id: number } & Sub)[] = await sb('bot_subs?select=chat_id,chutes,faltas,est&or=(chutes.eq.true,faltas.eq.true,est.eq.true)') ?? [];
  const mins = await allMins(), ents = await estEntries(d.date);
  const byOm = new Map<number, { txt: Record<string, string | null>; T: Record<string, Row[]>; et: ReturnType<typeof estText> }>();
  const forOm = (om: number) => {
    if (!byOm.has(om)) { const pk = ents ? { ...ents, picks: ents.picks.filter((x: any) => okOdd(+x.odd, om)) } : null;
      byOm.set(om, { txt: { chutes: topText(d, 'chutes', om), faltas: topText(d, 'faltas', om) }, T: tops(d, 10, om), et: pk?.picks.length ? estText(d, pk) : null }); }
    return byOm.get(om)!;
  };
  let sent = 0;
  for (const s of subs) {
    const { txt, T, et } = forOm(mins[String(s.chat_id)] ?? 0);
    for (const k of ['chutes', 'faltas'] as const) {
      if (!s[k] || !txt[k]) continue;
      const regs = T[k].map((r, i) => BTN(`📝${i + 1}`, `bet:${keyOf(r)}:${k}`));
      const r = await TG('sendMessage', { chat_id: s.chat_id, text: txt[k]!.slice(0, 4090), parse_mode: 'HTML', disable_web_page_preview: true,
        reply_markup: { inline_keyboard: [...chunk(regs, 5), [BTN('📋 Ver com detalhes', MT[k].cmd), BTN('📤 Texto p/ inscritos', 'cp:' + k)], [BTN('💼 Banca', '/banca')], [BTN('📬 Envio diário', '/receber'), BTN('🏠 Menu', '/menu')]] } });
      if (r.ok) sent++;
      await new Promise(res => setTimeout(res, 60));
    }
    if (s.est && et) {
      const r = await TG('sendMessage', { chat_id: s.chat_id, text: et.text, parse_mode: 'HTML', disable_web_page_preview: true,
        reply_markup: { inline_keyboard: [...chunk(et.regs, 5), [BTN('🧪 Placar das estratégias', '/estrategias'), BTN('💼 Banca', '/banca')], [BTN('📬 Envio diário', '/receber'), BTN('🏠 Menu', '/menu')]] } });
      if (r.ok) sent++;
      await new Promise(res => setTimeout(res, 60));
    }
    // 📄 PDF do dia junto do resumo
    if (await sendPDF(s.chat_id, d)) sent++;
  }
  await sb('bot_config?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key: flag, value: String(sent), updated_at: new Date().toISOString() }) }).catch(() => null);
  return { ok: true, date: d.date, inscritos: subs.length, mensagens: sent, top_gravado: gravados, estrategias: ents?.picks.length ?? 0 };
}

// ---------- entradas das estratégias ----------
const estKey = (x: any) => `${x.pid}|${x.mk}|${+(x.open_line ?? x.line)}${x.side === 'u' ? '|u' : ''}`;
async function estEntries(date: string) {
  const picks = await sb(`strategy_picks?date=eq.${date}&status=eq.aberta&alerted=eq.true&select=strategy_id,pid,name,team,opp,gid,mk,line,odd,open_line,open_odd,odd_src,p,edge,tip_utc,sq&order=edge.desc.nullslast`).catch(() => []);
  if (!picks?.length) return null;
  return { date, picks: picks.map((x: any) => ({ ...x, line: x.open_line ?? x.line, odd: x.open_odd ?? x.odd })) };
}
async function estToday(date: string) {
  const st = await fetch(APP_URL + 'data/strategies.json?t=' + Math.floor(Date.now() / 120_000)).then(r => r.ok ? r.json() : null).catch(() => null);
  return st?.date === date && !st.demo ? st : null;
}
// resumo do dia: entradas ALERTADAS ainda em aberto, agrupadas por jogo (como se navega na casa)
function estText(d: Data, st: any): { text: string; regs: { text: string; callback_data: string }[] } | null {
  const now = Date.now();
  const picks = (st?.picks ?? []).filter((p: any) => !p.tip_utc || Date.parse(p.tip_utc) > now);
  if (!picks.length) return null;
  const G = Object.fromEntries(d.games.map(g => [g.id, g]));
  const games = new Map<string, any[]>();
  for (const x of picks) { const g = G[x.gid]; const k = g ? `${g.h} x ${g.a}` : [x.team, x.opp].sort().join(' x '); (games.get(k) ?? games.set(k, []).get(k)!).push(x); }
  const order = [...games.entries()].sort((a, b) => String(a[1][0].tip_utc ?? '').localeCompare(String(b[1][0].tip_utc ?? '')));
  const regs: { text: string; callback_data: string }[] = []; let i = 0;
  const blocks = order.map(([k, xs]) => `⚽ <b>${esc(k)}</b>${xs[0].tip_utc ? ' · ' + hourBR(xs[0].tip_utc) : ''}\n<blockquote>` + xs.map((x: any) => {
    i++; regs.push(BTN(`📝 ${i}`, `bet:${estKey(x)}:e.${x.strategy_id}`));
    const who = String(x.pid).startsWith('j') ? 'Jogo' : String(x.pid).startsWith('t') ? esc(x.team) : esc(x.name);
    return `<b>${i}. ${who}</b> · ${MKN[x.mk] ?? x.mk}\n⬆️ Mais de <b>${n1(+x.line)}</b> · @${n2(+x.odd)} ${esc(x.odd_src ?? '')} · ${pc(+x.p)}${x.edge != null ? ` · EV <b>${evS(+x.edge)}</b>${+x.edge >= .1 ? ' 🔥' : ''}` : ''}${x.sq?.length && !String(x.pid).startsWith('j') ? '\n' + sqLine(x.sq, +x.line) : ''}`;
  }).join('\n') + '</blockquote>');
  let text = `🧪 <b>RESUMO DO DIA · MODELO BH</b>\n<i>${dateBR(d.date)} · ${i} entrada${i > 1 ? 's' : ''} em aberto · linha e odd do alerta</i>\n\n${blocks.join('\n\n')}\n\n📝 <i>Toque no número e mande a odd que você pegou (ex.: <code>1,85</code> ou <code>1,85 0,5u</code>).</i>` + FOOT;
  if (text.length > 4090) text = text.slice(0, 3990).replace(/<[^>]*$/, '') + '</blockquote>…';
  return { text, regs };
}

// ---------- registro de entradas (1u, odd real) e ROI ----------
const SRC: Record<string, string> = { chutes: 'Top chutes', faltas: 'Top faltas', modelo: '/modelo', lista: 'Outras listas' };
const SRC_CMD: Record<string, string> = { chutes: '/topchutes', faltas: '/topfaltas' };
const srcName = (s: string) => SRC[s] ?? (s?.startsWith('e.') ? '🧪 ' + s.slice(2) : s);
const srcCmd = (s: string) => SRC_CMD[s] ?? (s?.startsWith('e.') ? '/estrategias ' + s.slice(2) : '');
const ODD_KB = (id: number) => ({ inline_keyboard: [
  ['1.50', '1.60', '1.70', '1.80'].map(o => BTN(o.replace('.', ','), `bo:${id}:${o}`)),
  ['1.85', '1.90', '2.00', '2.20'].map(o => BTN(o.replace('.', ','), `bo:${id}:${o}`)),
  [BTN('❌ Cancelar', `bx:${id}`)]] });
async function betStart(chatId: number, d: Data, r: Row, src: string): Promise<Out> {
  await sb(`bets?chat_id=eq.${chatId}&status=eq.aguardando_odd`, { method: 'DELETE' }).catch(() => null);
  const row = (await sb('bets', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ chat_id: chatId, date: d.date, pid: r.id, name: r.n, team: r.t, opp: r.o, gid: r.g, mk: r.m, line: r.l, ref_line: r.l, side: r.s ?? 'o', p_model: r.p, nota: r.nt ?? null, src, house: r.b ?? null, status: 'aguardando_odd' }) }))?.[0];
  return { text: `<b>📝 REGISTRAR ENTRADA · 1u</b>
<blockquote>${whoB(r)} <i>${esc(vsTxt(r))} · ${hourBR(r.utc)}</i>
${sideTx(r.s)} de <b>${n1(r.l)}</b> ${MK[r.m] ?? r.m} · modelo ${pc(r.p)}${r.nt != null ? ` · nota ${r.nt}` : ''}${r.d ? ` · melhor odd ${n2(r.d)} ${esc(r.b ?? '')}` : ''}</blockquote>
<b>Qual odd você pegou?</b> Toque abaixo ou <b>responda com a odd</b>, por exemplo <code>1,83</code>.
Se a linha da sua casa for outra, mande odd e linha: <code>1,83 ${n1(r.l + 1)}</code>
Para outra stake, some as unidades: <code>1,83 2u</code>`, kb: ODD_KB(row.id), force: true };
}
function parseOdd(text: string) {
  const t = text.trim().toLowerCase().replace(/@/g, '').split(/\s+/);
  let odd: number | null = null, line: number | null = null, stake: number | null = null;
  for (const x of t) {
    const u = /^(\d+([.,]\d+)?)u$/.exec(x); if (u) { stake = parseFloat(u[1].replace(',', '.')); continue; }
    const v = parseFloat(x.replace(',', '.')); if (!Number.isFinite(v)) return null;
    if (odd == null) odd = v; else if (line == null) line = v; else return null;
  }
  if (odd == null || odd < 1.01 || odd > 50) return null;
  if (line != null && !Number.isInteger(line - .5)) line = Math.floor(line) + .5;
  if (stake != null && (stake <= 0 || stake > 20)) stake = null;
  return { odd, line, stake };
}
async function betFinish(chatId: number, id: number | null, text: string): Promise<Out | null> {
  const q = id != null ? `bets?id=eq.${id}&chat_id=eq.${chatId}&status=eq.aguardando_odd` : `bets?chat_id=eq.${chatId}&status=eq.aguardando_odd&order=created_at.desc&limit=1`;
  const b = (await sb(q + '&select=*').catch(() => []))?.[0];
  if (!b) return null;
  const v = parseOdd(text);
  if (!v) return { text: 'Não entendi. Mande só a odd, por exemplo <code>1,83</code>, ou odd e linha: <code>1,83 1,5</code>.', kb: ODD_KB(b.id) };
  const patch: Record<string, unknown> = { odd: v.odd, status: 'aberta' };
  if (v.stake) patch.stake = v.stake;
  if (v.line != null && v.line !== +b.line) {
    patch.line = v.line;
    const d = await data().catch(() => null); const p = d ? pAt(d, b.pid, b.mk, v.line) : null; if (p != null) patch.p_model = Math.round(p * 1000) / 1000;
  }
  await sb(`bets?id=eq.${b.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  const line = (patch.line as number) ?? +b.line, p = (patch.p_model as number) ?? +b.p_model, st = (patch.stake as number) ?? +b.stake;
  const ev = p ? p * v.odd - 1 : null;
  return { text: `✅ <b>Entrada #${b.id} registrada</b>
<blockquote><b>${esc(b.name)}</b> · ${b.side === 'u' ? 'menos' : 'mais'} de ${n1(line)} ${MK[b.mk] ?? b.mk}
Odd <b>${n2(v.odd)}</b> · ${n1(st)}u${p ? ` · modelo ${pc(p)}` : ''}${ev != null ? ` · EV pelo modelo ${pctS(ev)}` : ''}${b.ref_line != null && line !== +b.ref_line ? `\n<i>linha da casa ${n1(line)} (sugestão era ${n1(+b.ref_line)})</i>` : ''}</blockquote>
${/1$/.test(b.mk) ? 'Mercado de 1º tempo: confira com <code>/resultado ' + b.id + ' valor</code> depois do jogo.' : 'Confiro sozinho depois do jogo e te conto de manhã.'} Acompanhe em /banca.`, kb: { inline_keyboard: [[BTN('💼 Minha banca', '/banca'), ...(srcCmd(b.src) ? [BTN('◀ Voltar', srcCmd(b.src))] : []), BTN('🏠 Menu', '/menu')]] } };
}
async function settleBets(rows: any[]) {
  const open = rows.filter(r => r.status === 'aberta' && RIDX[r.mk]);
  if (!open.length) return;
  const res = await getResults(); if (!res?.stats) return;
  for (const r of open) {
    if (!res.dates?.includes(r.date)) continue;
    const a = res.stats[r.date]?.[r.pid]; if (!a) continue;
    let patch: Record<string, unknown>;
    if (!(a[0] > 0)) patch = { status: 'void', profit: 0, result: null };
    else { const v = a[RIDX[r.mk]], st = (r.side === 'u' ? v < +r.line : v > +r.line) ? 'green' : 'red'; patch = { status: st, result: v, profit: st === 'green' ? Math.round(+r.stake * (+r.odd - 1) * 100) / 100 : -+r.stake }; }
    patch.settled_at = new Date().toISOString();
    Object.assign(r, patch);
    await sb(`bets?id=eq.${r.id}`, { method: 'PATCH', body: JSON.stringify(patch) }).catch(() => null);
  }
}
function bancaResumo(rows: any[]) {
  const done = rows.filter(r => r.status === 'green' || r.status === 'red');
  const agg = (a: any[]) => { const st = a.reduce((s, r) => s + +r.stake, 0), pr = a.reduce((s, r) => s + +r.profit, 0), g = a.filter(r => r.status === 'green').length; return { n: a.length, st, pr, roi: st ? pr / st : 0, hit: a.length ? g / a.length : 0 }; };
  const T = agg(done);
  const avgOdd = done.length ? done.reduce((s, r) => s + +r.odd, 0) / done.length : 0;
  const tab = (title: string, groups: [string, any[]][]) => {
    const rowsT = groups.filter(([, a]) => a.length).map(([k, a]) => { const x = agg(a); return `${k.padEnd(16).slice(0, 16)} ${String(x.n).padStart(3)} ${(Math.round(x.hit * 100) + '%').padStart(4)} ${u2(x.pr).padStart(7)} ${pctS(x.roi).padStart(7)}`; });
    return rowsT.length ? `\n<b>${title}</b>\n<pre>${'GRUPO'.padEnd(16)}   N  ACE   LUCRO     ROI\n${rowsT.join('\n')}</pre>` : '';
  };
  const by = (f: (r: any) => string) => { const m: Record<string, any[]> = {}; for (const r of done) (m[f(r)] ||= []).push(r); return Object.entries(m).sort((a, b) => b[1].length - a[1].length); };
  return `<blockquote>✅ <b>${done.filter(r => r.status === 'green').length}</b> · ❌ <b>${done.filter(r => r.status === 'red').length}</b> · ➖ ${rows.filter(r => r.status === 'void').length} · ⏳ ${rows.filter(r => r.status === 'aberta').length} em aberto
Apostado <b>${n1(Math.round(T.st * 100) / 100)}u</b> · Lucro <b>${u2(T.pr)}</b> · ROI <b>${pctS(T.roi)}</b>
Acerto ${Math.round(T.hit * 1000) / 10}%${avgOdd ? ` · odd média ${n2(avgOdd)} (empata com ${Math.round(100 / avgOdd)}%)` : ''}</blockquote>`
    + tab('Por lista', by(r => srcName(r.src)))
    + tab('Por mercado', by(r => MKN[r.mk] ?? r.mk))
    + tab('Por casa', by(r => r.house || 'não informada'))
    + tab('Por nota', by(r => r.nota == null ? 'sem nota' : r.nota >= 70 ? 'nota 70+' : r.nota >= 60 ? 'nota 60–69' : 'nota <60'))
    + tab('Por odd', by(r => +r.odd < 1.7 ? 'odd < 1,70' : +r.odd < 1.9 ? 'odd 1,70–1,89' : 'odd 1,90+'));
}
async function bancaCmd(chatId: number, rest: string[]): Promise<Out> {
  const all = norm(rest[0] ?? '') === 'todos';
  let rows: any[] = [];
  try { rows = await sb(`bets?select=*&status=neq.aguardando_odd${all ? '' : `&chat_id=eq.${chatId}`}&order=created_at.desc&limit=2000`) ?? []; } catch { return { text: 'Não consegui ler a banca agora.', kb: { inline_keyboard: [HOME] } }; }
  await settleBets(rows);
  if (!rows.length) return { text: `<b>💼 BANCA DO MODELO BH</b>\nNenhuma entrada registrada ainda.\n\nNos tops (/topchutes, /topfaltas) e nas listas, toque em <b>📝</b> e informe a odd que você pegou. Cada entrada vale 1u e eu confiro sozinho depois do jogo.`, kb: { inline_keyboard: [[BTN('🎯 Top 10 Chutes', '/topchutes'), BTN('🧱 Top 10 Faltas', '/topfaltas')], HOME] } };
  const ic = (r: any) => r.status === 'green' ? '✅' : r.status === 'red' ? '❌' : r.status === 'void' ? '➖' : '⏳';
  const last = rows.slice(0, 10).map(r => `${ic(r)} <code>#${r.id}</code> ${esc(r.name)} · mais ${n1(+r.line)} ${MKS[r.mk] ?? r.mk} @${n2(+r.odd)}${r.result != null ? ` <i>(fez ${n1(+r.result)})</i>` : ''}${r.profit != null && r.status !== 'aberta' ? ` ${u2(+r.profit)}` : ''}`).join('\n');
  const text = `<b>💼 ${all ? 'BANCA DE TODOS' : 'SUA BANCA'} · MODELO BH</b>\n` + bancaResumo(rows) + (await topsResumo()) + `\n\n<b>Últimas</b>\n${last}\n<i>Apagar uma entrada errada: <code>/apagar 12</code>. Amostra pequena engana: o ROI começa a dizer algo com 100+ entradas.</i>`;
  return { text: text.length > 4000 ? text.slice(0, 3990) + '…' : text, kb: { inline_keyboard: [[BTN(all ? '👤 Só a minha' : '👥 De todos', all ? '/banca' : '/banca todos'), BTN('🔄 Atualizar', all ? '/banca todos' : '/banca')], [BTN('🎯 Top Chutes', '/topchutes'), BTN('🧱 Top Faltas', '/topfaltas'), BTN('🏠 Menu', '/menu')]] } };
}
async function apagarCmd(chatId: number, rest: string[]): Promise<Out> {
  const id = parseInt((rest[0] ?? '').replace('#', ''), 10);
  if (!Number.isFinite(id)) return { text: 'Diga o número da entrada: <code>/apagar 12</code> (veja os números em /banca).', kb: { inline_keyboard: [HOME] } };
  const del = await sb(`bets?id=eq.${id}&chat_id=eq.${chatId}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } }).catch(() => null);
  return { text: del?.length ? `🗑️ Entrada #${id} apagada.` : `Não achei a entrada #${id} entre as suas.`, kb: { inline_keyboard: [[BTN('💼 Minha banca', '/banca'), BTN('🏠 Menu', '/menu')]] } };
}
// conferência manual do 1º tempo: /resultado 12 2 (sua aposta) ou /resultado e45 2 (entrada de estratégia)
async function resultadoCmd(chatId: number, rest: string[]): Promise<Out> {
  const id = String(rest[0] ?? ''), v = parseFloat(String(rest[1] ?? '').replace(',', '.'));
  if (!id || !Number.isFinite(v)) return { text: 'Uso: <code>/resultado 12 2</code> (número da sua entrada e quantos ele fez). Para entrada de estratégia: <code>/resultado e45 1</code>.', kb: { inline_keyboard: [HOME] } };
  if (id.startsWith('e')) {
    const x = (await sb(`strategy_picks?id=eq.${parseInt(id.slice(1), 10)}&select=*`).catch(() => []))?.[0]; if (!x) return { text: 'Entrada não encontrada.', kb: { inline_keyboard: [HOME] } };
    const L = +(x.open_line ?? x.line), O = +(x.open_odd ?? x.odd), st = (x.side === 'u' ? v < L : v > L) ? 'green' : 'red';
    await sb(`strategy_picks?id=eq.${x.id}`, { method: 'PATCH', body: JSON.stringify({ status: st, result: v, profit: st === 'green' ? Math.round((O - 1) * 100) / 100 : -1, settled_at: new Date().toISOString() }) });
    return { text: `Entrada da estratégia #${x.id} conferida: ${st === 'green' ? '✅ green' : '❌ red'} (${n1(v)} na linha ${n1(L)}).`, kb: { inline_keyboard: [[BTN('🧪 Estratégias', '/estrategias'), BTN('🏠 Menu', '/menu')]] } };
  }
  const b = (await sb(`bets?id=eq.${parseInt(id, 10)}&chat_id=eq.${chatId}&select=*`).catch(() => []))?.[0]; if (!b) return { text: 'Não achei essa entrada entre as suas.', kb: { inline_keyboard: [HOME] } };
  const st = v > +b.line ? 'green' : 'red';
  await sb(`bets?id=eq.${b.id}`, { method: 'PATCH', body: JSON.stringify({ status: st, result: v, profit: st === 'green' ? Math.round(+b.stake * (+b.odd - 1) * 100) / 100 : -+b.stake, settled_at: new Date().toISOString() }) });
  return { text: `Entrada #${b.id} conferida: ${st === 'green' ? '✅ green' : '❌ red'} (${n1(v)} na linha ${n1(+b.line)}).`, kb: { inline_keyboard: [[BTN('💼 Minha banca', '/banca'), BTN('🏠 Menu', '/menu')]] } };
}

// ---------- fábrica de estratégias ----------
async function estrategiasCmd(rest: string[], chatId?: number): Promise<Out> {
  const id = rest.join('-').toLowerCase().replace(/[^a-z0-9-]/g, '');
  let stats: any[] = [], picks: any[] = [];
  try {
    stats = await sb('strategy_stats?select=*&order=lucro.desc.nullslast') ?? [];
    picks = await sb(`strategy_picks?date=eq.${dayBR()}&select=id,strategy_id,pid,name,mk,line,odd,open_line,open_odd,odd_src,p,edge,status,sq&order=first_at.asc`) ?? [];
  } catch { return { text: 'Não consegui ler as estratégias agora.', kb: { inline_keyboard: [HOME] } }; }
  // antes da primeira gravação, as estratégias saem da própria coleta
  if (!stats.length || !picks.length) {
    const st = await estToday(dayBR());
    if (!stats.length && st) stats = st.strategies.map((s: any) => ({ id: s.id, name: s.name, status: 'papel', n: 0, g: 0, r: 0, v: 0, lucro: 0, roi: null, abertas: 0 }));
    if (!picks.length) picks = (st?.picks ?? []).map((p: any) => ({ ...p, status: 'aberta' }));
  }
  if (!stats.length) return { text: '<b>🧪 MODELO POR MERCADO</b>\n\nAs estratégias entram no banco na primeira rodada com linhas de casa. Por enquanto, nenhuma entrada.', kb: { inline_keyboard: [HOME] } };
  const pickLn = (x: any, i: number) => `${x.status === 'green' ? '✅' : x.status === 'red' ? '❌' : x.status === 'void' ? '➖' : '⏳'} <b>${i}.</b> ${esc(x.name)} ⬆️ ${n1(+(x.open_line ?? x.line))} ${MKS[x.mk] ?? x.mk} @${n2(+(x.open_odd ?? x.odd))}${x.open_line != null && +x.open_line !== +x.line ? ` <i>(agora ${n1(+x.line)})</i>` : ''} · ${pc(+x.p)} · EV ${evS(x.edge == null ? null : +x.edge)}`;
  const kb = { inline_keyboard: [...chunk(stats.map(s => BTN(s.name, `/estrategias ${s.id}`)), 2), [BTN('🧪 Placar', '/estrategias'), BTN('✅ Gabarito de ontem', '/gabarito')], [BTN('🏠 Menu', '/menu')]] };
  const S = id ? stats.find(s => s.id === id) : null;
  if (S) {
    const mine = picks.filter(x => x.strategy_id === S.id);
    const descr = (await sb(`strategies?id=eq.${S.id}&select=descr`).catch(() => []))?.[0]?.descr ?? '';
    const regs = mine.map((x, i) => x.status === 'aberta' && x.pid ? BTN(`📝${i + 1}`, `be:${estKey(x)}:e.${S.id}`) : null).filter(Boolean) as { text: string; callback_data: string }[];
    return { text: `<b>🧪 ${esc(S.name)}</b> <i>(${S.status})</i>\n<i>${esc(descr)}</i>\n<blockquote>Conferidas <b>${S.n}</b> · ✅ ${S.g} · ❌ ${S.r} · ➖ ${S.v}\nLucro <b>${u2(+S.lucro || 0)}</b> · ROI <b>${S.roi == null ? '–' : pctS(+S.roi)}</b> · odd média ${S.odd_media ? n2(+S.odd_media) : '–'}\nCLV médio ${S.clv_linha_media == null ? '–' : (S.clv_linha_media >= 0 ? '+' : '') + n1(+S.clv_linha_media)} · EV médio ${evS(S.edge_medio == null ? null : +S.edge_medio)}</blockquote>\n<b>Hoje</b>\n${mine.length ? mine.map((x, i) => pickLn(x, i + 1)).join('\n') : 'Nenhuma entrada hoje.'}\n<i>O placar é teste em papel (1u por entrada, na linha e odd do alerta).${regs.length ? ' 📝 registra a sua entrada real com a odd que você pegou.' : ''}</i>`,
      kb: { inline_keyboard: [...chunk(regs, 5), ...kb.inline_keyboard] } };
  }
  const lineOf = (s: any) => `${String(s.name).padEnd(18).slice(0, 18)} ${String(s.n ?? 0).padStart(3)} ${(s.n ? Math.round(s.g / Math.max(1, s.g + s.r) * 100) + '%' : '–').padStart(4)} ${u2(+s.lucro || 0).padStart(7)} ${s.clv_linha_media == null ? '   –' : ((s.clv_linha_media >= 0 ? '+' : '') + n1(+s.clv_linha_media)).padStart(4)}`;
  // três placares lado a lado: modelo por mercado, os métodos extras (Top 10 forte, Oportunidade forte, Tendência) e as suas apostas reais
  const isMod = (s: any) => /^[mtj]-/.test(s.id), mod = stats.filter(isMod), ext = stats.filter(s => !isMod(s));
  const sum = (arr: any[]) => { const n = arr.reduce((a, s) => a + (+s.n || 0), 0), g = arr.reduce((a, s) => a + (+s.g || 0), 0), r = arr.reduce((a, s) => a + (+s.r || 0), 0), l = arr.reduce((a, s) => a + (+s.lucro || 0), 0); return { name: 'TOTAL', n, g, r, lucro: l, clv_linha_media: null }; };
  let mine = '';
  if (chatId) {
    const b: any[] = await sb(`bets?chat_id=eq.${chatId}&select=status,profit,stake`).catch(() => []) ?? [];
    const done = b.filter(x => x.status === 'green' || x.status === 'red'), lu = done.reduce((a, x) => a + (+x.profit || 0), 0), st = done.reduce((a, x) => a + (+x.stake || 1), 0);
    mine = `\n<b>💼 Minhas apostas reais</b> (registradas pelo 📝)\n<blockquote>Conferidas <b>${done.length}</b> · ✅ ${done.filter(x => x.status === 'green').length} · ❌ ${done.filter(x => x.status === 'red').length} · abertas ${b.filter(x => x.status === 'aberta' || x.status === 'pendente').length}\nLucro <b>${u2(lu)}</b> · ROI <b>${st ? pctS(lu / st) : '–'}</b></blockquote>`;
  }
  const hoje = stats.map(s => [s, picks.filter(x => x.strategy_id === s.id).length] as const).filter(([, n]) => n).map(([s, n]) => `${esc(s.name)}: <b>${n}</b>`).join(' · ') || 'nenhuma ainda';
  const head = 'ESTRATÉGIA          N  ACE   LUCRO  CLV';
  return { text: `<b>🧪 ESTRATÉGIAS NO PAPEL</b>\n<i>Registro automático, 1u por entrada, na linha e odd do alerta (melhor casa lida) · ACE = acerto sem as anuladas</i>\n\n<b>🧠 Modelo por mercado</b>\n<pre>${head}\n${mod.map(lineOf).join('\n')}\n${lineOf(sum(mod))}</pre>${ext.length ? `\n<b>⭐ Métodos extras</b>\n<pre>${head}\n${ext.map(lineOf).join('\n')}</pre>` : ''}${mine}\n<b>Entradas hoje</b>\n${hoje}\n\n<i>Uma estratégia só merece stake de verdade com 50+ entradas, ROI positivo e CLV positivo; compare por cerca de uma semana (150–200 entradas) antes de mudar cortes. CLV = quanto a linha andou a nosso favor até o jogo.</i>`, kb };
}

// ---------- Top 10 automático e resultado da manhã ----------
async function recordTops(d: Data) {
  const tip: Record<string, number> = {}; for (const g of d.games) tip[g.id] = Date.parse(g.utc) || 0;
  const now = Date.now(), rows: Record<string, unknown>[] = [];
  const T = tops(d);
  for (const k of Object.keys(MT)) T[k].forEach((r, i) => {
    if (tip[r.g] && tip[r.g] <= now + 5 * 6e4) return; // jogo começando: fica a última sugestão gravada
    rows.push({ date: d.date, list: k, rank: i + 1, pid: r.id, name: r.n, team: r.t, opp: r.o, gid: r.g, mk: r.m, line: r.l, side: 'o', p: r.p, nota: r.nt, status: 'aberta',
      ref_line: r.ref ? r.l : null, odd: r.d ?? Math.round(100 / r.p) / 100, odd_src: r.d ? (r.b || 'casa') : 'justa', tip_utc: tip[r.g] ? new Date(tip[r.g]).toISOString() : null, updated_at: new Date(now).toISOString() });
  });
  // mesmo jogador não repete na mesma lista no mesmo dia (em listas diferentes pode)
  const have: any[] = await sb(`top_picks?date=eq.${d.date}&select=pid,list,mk`).catch(() => []) ?? [];
  const fresh = rows.filter(x => !have.some(h => h.pid === x.pid && h.list === x.list && h.mk !== x.mk));
  if (!fresh.length) return 0;
  await sb('top_picks?on_conflict=date,list,pid,mk', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(fresh) });
  return fresh.length;
}
async function settleTops(rows: any[], res: any) {
  for (const r of rows.filter(x => x.status === 'aberta' && RIDX[x.mk])) {
    if (!res?.dates?.includes(r.date)) continue;
    const a = res.stats[r.date]?.[r.pid]; if (!a) continue;
    const L = +(r.open_line ?? r.line), O = +(r.open_odd ?? r.odd);
    const patch: Record<string, unknown> = !(a[0] > 0) ? { status: 'void', result: null, profit: 0 } : { result: a[RIDX[r.mk]], status: a[RIDX[r.mk]] > L ? 'green' : 'red' };
    if (patch.status !== 'void') patch.profit = patch.status === 'green' ? Math.round((O - 1) * 100) / 100 : -1;
    patch.settled_at = new Date().toISOString(); Object.assign(r, patch);
    await sb(`top_picks?id=eq.${r.id}`, { method: 'PATCH', body: JSON.stringify(patch) }).catch(() => null);
  }
}
const hitOf = (a: any[]) => { const g = a.filter(x => x.status === 'green').length, n = a.filter(x => x.status === 'green' || x.status === 'red').length; const pr = a.reduce((s, x) => s + (x.status === 'green' || x.status === 'red' ? +x.profit || 0 : 0), 0); return { g, n, v: a.filter(x => x.status === 'void').length, pct: n ? Math.round(g / n * 100) : 0, pr, roi: n ? pr / n : 0 }; };
async function topsResumo() {
  const all: any[] = await sb('top_picks?select=date,list,status,profit,odd_src&status=in.(green,red,void)&limit=5000').catch(() => []) ?? [];
  if (!all.length) return '';
  const c = hitOf(all.filter(x => x.list === 'chutes')), f = hitOf(all.filter(x => x.list === 'faltas')), T = hitOf(all), real = hitOf(all.filter(x => x.odd_src !== 'justa'));
  const dias = new Set(all.map(x => x.date)).size;
  const ln = (ic: string, lb: string, h: ReturnType<typeof hitOf>) => `${ic} ${lb}: ${h.g}/${h.n} (${h.pct}%) · <b>${u2(h.pr)}</b> · ROI ${pctS(h.roi)}`;
  return `\n<b>📈 Teste do Modelo BH · ${dias} dia${dias > 1 ? 's' : ''} conferido${dias > 1 ? 's' : ''} (1u por entrada)</b>\n${ln('🎯', 'Chutes', c)}\n${ln('🧱', 'Faltas', f)}\n${ln('📊', 'Total', T)}${real.n ? `\n<i>Só com odd real das casas: ${real.g}/${real.n} · ${u2(real.pr)} · ROI ${pctS(real.roi)}</i>` : ''}`;
}
async function morningText(chatId: number, y: string, picks: any[]) {
  const parts: string[] = [];
  const mine: any[] = await sb(`bets?chat_id=eq.${chatId}&date=eq.${y}&status=neq.aguardando_odd&order=id`).catch(() => []) ?? [];
  await settleBets(mine);
  if (mine.length) {
    const done = mine.filter(r => r.status === 'green' || r.status === 'red'), st = done.reduce((a, r) => a + +r.stake, 0), pr = mine.reduce((a, r) => a + (+r.profit || 0), 0);
    const ic = (r: any) => r.status === 'green' ? '✅' : r.status === 'red' ? '❌' : r.status === 'void' ? '➖' : '⏳';
    const lines = mine.slice(0, 12).map(r => `${ic(r)} ${esc(r.name)} · mais ${n1(+r.line)} ${MKS[r.mk] ?? r.mk} @${n2(+r.odd)}${r.result != null ? ` <i>(fez ${n1(+r.result)})</i>` : ''}${r.status !== 'aberta' ? ' ' + u2(+r.profit || 0) : ''}`).join('\n');
    const all: any[] = await sb(`bets?chat_id=eq.${chatId}&status=in.(green,red)&select=stake,profit`).catch(() => []) ?? [];
    const ST = all.reduce((a, r) => a + +r.stake, 0), PR = all.reduce((a, r) => a + +r.profit, 0);
    parts.push(`<b>💼 Suas entradas</b>\n<blockquote>✅ ${done.filter(r => r.status === 'green').length} · ❌ ${done.filter(r => r.status === 'red').length} · ➖ ${mine.filter(r => r.status === 'void').length} · <b>${u2(pr)}</b>${st ? ` · ROI ${pctS(pr / st)}` : ''}\n${lines}</blockquote>${all.length ? `\nBanca total: <b>${u2(PR)}</b> em ${all.length} entradas · ROI ${pctS(ST ? PR / ST : 0)}` : ''}`);
  }
  if (picks.length) {
    const L = (k: string) => { const a = picks.filter(x => x.list === k).sort((x, z) => x.rank - z.rank); if (!a.length) return ''; const h = hitOf(a);
      const det = a.map(x => `${x.status === 'green' ? '✅' : x.status === 'red' ? '❌' : x.status === 'void' ? '➖' : '⏳'} ${esc(x.name)} ⬆️ ${n1(+(x.open_line ?? x.line))} ${MKS[x.mk] ?? x.mk} @${n2(+(x.open_odd ?? x.odd))}${x.odd_src === 'justa' ? '*' : ''}${x.result != null ? ` <i>(${n1(+x.result)})</i>` : ''}`).join('\n');
      return `${MT[k].ic} ${k === 'chutes' ? 'Chutes' : 'Faltas e desarmes'}: <b>${h.g}/${h.n}</b>${h.v ? ` (${h.v} anulada${h.v > 1 ? 's' : ''})` : ''} · <b>${u2(h.pr)}</b> · ROI ${pctS(h.roi)}\n<blockquote expandable>${det}</blockquote>`; };
    parts.push(`<b>📈 Top 10 do Modelo BH</b>\n${Object.keys(MT).map(L).filter(Boolean).join('\n')}` + await topsResumo());
  }
  if (!parts.length) return null;
  return `☀️ <b>RESULTADO DE ONTEM · ${dateBR(y)}</b>\n\n` + parts.join('\n\n') + `\n\n<i>* odd justa do modelo: jogo sem linha de casa. Hoje o resumo sai cerca de 2h30 antes do primeiro jogo.</i>`;
}
async function settleStrats(rows: any[], res: any) {
  for (const r of rows.filter(x => x.status === 'aberta' && !x.manual && RIDX[x.mk])) {
    if (!res?.dates?.includes(r.date)) continue;
    const a = res.stats[r.date]?.[r.pid]; if (!a) continue;
    const L = +(r.open_line ?? r.line), O = +(r.open_odd ?? r.odd);
    let status = 'void', result: number | null = null;
    if (a[0] > 0) { result = a[RIDX[r.mk]]; status = (r.side === 'u' ? result! < L : result! > L) ? 'green' : 'red'; }
    const patch = { status, result, profit: status === 'green' ? Math.round((O - 1) * 100) / 100 : status === 'red' ? -1 : 0, settled_at: new Date().toISOString() };
    Object.assign(r, patch);
    await sb(`strategy_picks?id=eq.${r.id}`, { method: 'PATCH', body: JSON.stringify(patch) }).catch(() => null);
  }
}
async function estGabarito(y: string, res: any) {
  const rows: any[] = await sb(`strategy_picks?date=eq.${y}&select=id,date,strategy_id,pid,name,mk,side,line,odd,open_line,open_odd,odd_src,status,result,profit,clv_line,alerted,manual&order=first_at.asc`).catch(() => []) ?? [];
  if (!rows.length) return null;
  await settleStrats(rows, res);
  const stats: any[] = await sb('strategy_stats?select=*').catch(() => []) ?? [];
  const ic = (x: any) => x.status === 'green' ? '✅' : x.status === 'red' ? '❌' : x.status === 'void' ? '➖' : '⏳';
  const build = (det: boolean) => {
    const blocks: string[] = [];
    for (const S of stats) {
      const a = rows.filter(x => x.strategy_id === S.id); if (!a.length) continue;
      const h = hitOf(a);
      const lines = a.map(x => `${ic(x)} ${x.alerted ? '📬 ' : ''}${esc(x.name)} ${x.side === 'u' ? '⬇️' : '⬆️'} ${n1(+(x.open_line ?? x.line))} ${MKS[x.mk] ?? x.mk} @${n2(+(x.open_odd ?? x.odd))}${x.result != null ? ` <i>(fez ${n1(+x.result)})</i>` : x.manual && x.status === 'aberta' ? ` · conferir: <code>/resultado e${x.id} valor</code>` : ''}${x.clv_line != null && +x.clv_line !== 0 ? ` · fechou ${n1(+x.line)} (CLV ${(x.side === 'u' ? +x.clv_line > 0 : +x.clv_line < 0) ? '+' : '−'}${n1(Math.abs(+x.clv_line))})` : ''}`).join('\n');
      blocks.push(`<b>🧪 ${esc(S.name)}</b>: <b>${h.g}/${h.n}</b>${h.v ? ` (${h.v} anulada${h.v > 1 ? 's' : ''})` : ''} · <b>${u2(h.pr)}</b>${det ? `\n<blockquote>${lines}</blockquote>` : ''}\n<i>Acumulado: ${S.n} entradas · ${u2(+S.lucro || 0)} · ROI ${S.roi == null ? '–' : pctS(+S.roi)}</i>`);
    }
    const T = hitOf(rows), A = hitOf(rows.filter(x => x.alerted));
    return `🧪 <b>GABARITO DO MODELO POR MERCADO · ${dateBR(y)}</b>\n<i>1u por entrada, na linha e odd do alerta</i>\n\n${blocks.join('\n\n')}\n\n📬 <b>Alertadas (EV mínimo): ${A.g}/${A.n} · ${u2(A.pr)} · ROI ${pctS(A.roi)}</b>\n📊 Todas do papel: ${T.g}/${T.n} · ${u2(T.pr)} · ROI ${pctS(T.roi)}\n<i>CLV = quanto a linha andou a nosso favor até o jogo começar (no MAIS, a linha que sobe; no MENOS, a que desce).${det ? '' : ' Entrada por entrada: aba Planilha do app.'}</i>`;
  };
  const text = build(true);
  return text.length <= 4090 ? text : build(false);
}
async function gabaritoCmd(): Promise<Out> {
  const y = dayBR(Date.now() - 864e5), res = await getResults();
  const kb = { inline_keyboard: [[BTN('🧪 Placar das estratégias', '/estrategias'), BTN('💼 Banca', '/banca')], [{ text: '📊 Planilha no app', url: APP_URL + '#planilha' }], [BTN('🏠 Menu', '/menu')]] };
  if (!res?.dates?.includes(y)) return { text: `Os resultados de ${dateBR(y)} ainda não saíram (a coleta das 6h traz). Tente mais tarde.`, kb };
  return { text: (await estGabarito(y, res)) ?? `Nenhuma entrada de estratégia gravada em ${dateBR(y)}.`, kb };
}
const MORNING_KB = () => ({ inline_keyboard: [[BTN('💼 Minha banca', '/banca'), BTN('🧪 Gabarito das estratégias', '/gabarito')], [{ text: '📊 Planilha no app', url: APP_URL + '#planilha' }], [BTN('🧠 Modelo BH', '/modelobh'), BTN('🏠 Menu', '/menu')]] });
async function ontemCmd(chatId: number): Promise<Out> {
  const y = dayBR(Date.now() - 864e5), res = await getResults();
  if (!res?.dates?.includes(y)) return { text: `Os resultados de ${dateBR(y)} ainda não saíram (a coleta das 6h traz). Tente mais tarde.`, kb: MORNING_KB() };
  const picks: any[] = await sb(`top_picks?date=eq.${y}`).catch(() => []) ?? [];
  await settleTops(picks, res);
  return { text: (await morningText(chatId, y, picks)) ?? `Nada registrado em ${dateBR(y)}: nem entradas suas, nem top 10 enviado.`, kb: MORNING_KB() };
}
async function morningPush(force = false) {
  const y = dayBR(Date.now() - 864e5), flag = `MORNING_${y}`;
  if (!force && (await sb(`bot_config?key=eq.${flag}&select=key`).catch(() => []))?.length) return { ok: true, skip: 'já enviado hoje' };
  const res = await getResults();
  if (!res?.dates?.includes(y)) return { ok: true, skip: `resultados de ${y} ainda não saíram` };
  const picks: any[] = await sb(`top_picks?date=eq.${y}`).catch(() => []) ?? [];
  await settleTops(picks, res);
  const subs: any[] = await sb('bot_subs?select=chat_id,chutes,faltas,est&or=(chutes.eq.true,faltas.eq.true,est.eq.true)').catch(() => []) ?? [];
  const gab = await estGabarito(y, res).catch(e => { console.error('gabarito', e); return null; });
  const bettors: any[] = await sb(`bets?select=chat_id&date=eq.${y}&status=neq.aguardando_odd`).catch(() => []) ?? [];
  const chats = [...new Set([...subs, ...bettors].map(x => +x.chat_id))];
  let sent = 0;
  for (const c of chats) {
    const text = await morningText(c, y, subs.some(x => +x.chat_id === c && (x.chutes || x.faltas)) ? picks : []);
    if (text) {
      const r = await TG('sendMessage', { chat_id: c, text: text.slice(0, 4090), parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: MORNING_KB() });
      if (r.ok) sent++;
      await new Promise(ok => setTimeout(ok, 60));
    }
    if (gab && subs.some(x => +x.chat_id === c && x.est)) {
      const r = await TG('sendMessage', { chat_id: c, text: gab, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: { inline_keyboard: [[BTN('🧪 Placar das estratégias', '/estrategias'), BTN('💼 Banca', '/banca')], [{ text: '📊 Planilha no app', url: APP_URL + '#planilha' }], [BTN('🏠 Menu', '/menu')]] } });
      if (r.ok) sent++;
      await new Promise(ok => setTimeout(ok, 60));
    }
  }
  await sb('bot_config?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key: flag, value: String(sent), updated_at: new Date().toISOString() }) }).catch(() => null);
  return { ok: true, date: y, tops: picks.length, estrategias: !!gab, chats: chats.length, mensagens: sent };
}

// ---------- listas ----------
const clampN = (s: string | undefined, def = 10) => { const x = parseInt(s ?? '', 10); return Number.isFinite(x) ? Math.max(1, Math.min(20, x)) : def; };
// page < 0 = abre a entrada número -page da lista (análise completa, na mesma mensagem)
function list(d: Data, rows: Row[], title: string, n: number, cmd: string, page = 1, onePerPlayer = true, empty = '', note = ''): Out {
  const seen = new Set<string>(), all: Row[] = [];
  for (const r of rows) { if (onePerPlayer && seen.has(r.id)) continue; seen.add(r.id); all.push(r); if (all.length >= n) break; }
  if (!all.length) return { text: header(d, title, note) + '\nNenhuma linha boa nesse filtro agora.' + (empty ? '\n' + empty : '') + '\n' + FOOT, kb: { inline_keyboard: [HOME] } };
  const src = cmd.startsWith('/topchutes') ? 'chutes' : cmd.startsWith('/topfaltas') ? 'faltas' : 'lista';
  if (page < 0) {
    const k = Math.min(all.length, -page), r = all[k - 1], pg = Math.ceil(k / PAGE);
    const nav = [k > 1 ? BTN('‹ Anterior', `x:${k - 1}:${cmd}`) : null, BTN('☰ Lista', `p:${pg}:${cmd}`), k < all.length ? BTN('Próxima ›', `x:${k + 1}:${cmd}`) : null].filter(Boolean) as { text: string; callback_data: string }[];
    return { text: header(d, title, note) + '\n' + card(d, r, k) + '\n' + FOOT,
      kb: { inline_keyboard: [[BTN('📝 Registrar (1u)', `be:${keyOf(r)}:${src}`), ...(r.cd ? [BTN('🖼️ Card', `i:${keyOf(r)}`)] : [])], [{ text: '📋 Copiar para inscritos', copy_text: { text: shareText(r).slice(0, 256) } }], nav, [BTN('🏠 Menu', '/menu')]] } };
  }
  const pages = Math.ceil(all.length / PAGE), pg = Math.max(1, Math.min(pages, page));
  const slice = all.slice((pg - 1) * PAGE, pg * PAGE);
  const body = slice.map((r, i) => listCard(r, (pg - 1) * PAGE + i + 1)).join('\n');
  const nav = [];
  if (pg > 1) nav.push(BTN('◀ Anteriores', `p:${pg - 1}:${cmd}`));
  if (pages > 1) nav.push(BTN(`${pg}/${pages}`, `p:${pg}:${cmd}`));
  if (pg < pages) nav.push(BTN('Próximas ▶', `p:${pg + 1}:${cmd}`));
  const pics = slice.map((r, i) => r.cd ? BTN(`🖼️ ${(pg - 1) * PAGE + i + 1}`, `i:${keyOf(r)}`) : null).filter(Boolean) as { text: string; callback_data: string }[];
  const nums = slice.map((_, i) => BTN(`🔎 ${(pg - 1) * PAGE + i + 1}`, `x:${(pg - 1) * PAGE + i + 1}:${cmd}`));
  const share = src !== 'lista' ? [[BTN('📤 Texto p/ inscritos (lista toda)', 'cp:' + src)]] : [];
  return { text: header(d, title, note + (pages > 1 ? ` · página ${pg}/${pages}` : '')) + '\n' + body + '\n<i>🔎 análise completa, registro e 📋 copiar' + (pics.length ? ' · 🖼️ ver o card em imagem' : '') + '</i>\n' + FOOT, kb: { inline_keyboard: [nums, ...(pics.length ? [pics] : []), ...(nav.length ? [nav] : []), ...share, home(cmd, pg)] } };
}
function multipla(d: Data, arg: string | undefined, om = 0): Out {
  const v = arg ? parseFloat(arg.replace(',', '.')) : NaN;
  const target = Number.isFinite(v) && v >= 1.3 && !(Number.isInteger(v) && v <= 8) ? v : null;
  const legs = target ? 8 : Math.max(2, Math.min(6, Number.isFinite(v) ? v : 3));
  const cand = open(d).filter(r => (r.gr === 'A+' || r.gr === 'A') && r.d && r.d >= Math.max(ODD_MIN, om) - 1e-9 && r.d <= ODD_MAX && (r.e ?? 0) >= 0 && r.st !== 'duvida' && r.st !== 'banco' && !/1$/.test(r.m))
    .sort((a, b) => b.nt - a.nt);
  const pick: Row[] = [], games = new Set<number>(); let odd = 1, p = 1;
  for (const r of cand) { if (target ? odd >= target : pick.length >= legs) break; if (pick.length >= 8) break; if (games.has(r.g)) continue; games.add(r.g); pick.push(r); odd *= r.d!; p *= r.p; }
  const kb = { inline_keyboard: [[BTN('2 pernas', '/multipla 2'), BTN('3 pernas', '/multipla 3'), BTN('4 pernas', '/multipla 4')], [BTN('Odd 3,00', '/multipla 3,0'), BTN('Odd 5,00', '/multipla 5,0'), BTN('Odd 10,00', '/multipla 10,0')], home('/multipla ' + (arg ?? '3'))] };
  if (pick.length < 2) return { text: header(d, '🎟️ MÚLTIPLA') + '\nNão há linhas fortes com odd de casa em jogos diferentes agora.\n' + FOOT, kb };
  const legsTxt = pick.map((r, i) => `${i + 1}. <b>${esc(r.n)}</b>  <i>${hourBR(r.utc)}</i>\n    ⬆️ mais de ${n1(r.l)} ${MK[r.m]}  <code>@${n2(r.d!)}</code> ${esc(r.b ?? '')}`).join('\n');
  const evx = (p * odd - 1) * 100;
  return { text: header(d, `🎟️ MÚLTIPLA DE ${pick.length} PERNAS`, target ? ` · alvo ${n2(target)}` : '') + `\n<blockquote>${legsTxt}</blockquote>
<b>Odd combinada  <code>${n2(odd)}</code></b>
${bar(p)} chance ${pc(p)} · EV ${evx >= 0 ? '+' : ''}${evx.toFixed(1).replace('.', ',')}%
<i>Uma perna por jogo, nota A ou A+, só com odd de casa${om > ODD_MIN ? ` de ${n2(om)} ou mais` : ''}. Pernas tratadas como independentes: use stake menor que a de uma simples. As odds podem ser de casas diferentes.</i>
` + FOOT, kb };
}

// ---------- 🎯 Caçador de props ----------
// Filtra os jogadores do dia pelo histórico recente (acertos na linha) e mostra ao lado a chance do Modelo BH e o EV.
// hx: [min, titular, casa, liga, chutes, no gol, f.com., f.sofr., desarmes, defesas] (mais recente primeiro)
const HX: Record<string, number> = { SH: 4, SOT: 5, FC: 6, FS: 7, TK: 8, SV: 9 };
type HF = { mk: string; l: number; w: number; pct: number; pos: string[]; venue: '' | 'casa' | 'fora'; tit: boolean; mmin: number; odd: number; conf: boolean; liga: boolean; gap: number };
const HF0: HF = { mk: 'SH', l: 0.5, w: 10, pct: 70, pos: [], venue: '', tit: true, mmin: 60, odd: 0, conf: false, liga: false, gap: 0 };
const PRESETS: Record<string, { name: string; ic: string; why: string; f: Partial<HF> }> = {
  classico: { name: 'Clássico', ic: '🎯', why: 'chutou em quase todo jogo como titular', f: { mk: 'SH', l: 0.5, w: 10, pct: 80 } },
  zagueiro: { name: 'Zagueiro que chuta', ic: '🧱', why: 'defensor com chute frequente: odd costuma ser alta', f: { mk: 'SH', l: 0.5, w: 20, pct: 50, pos: ['D'], odd: 2.2 } },
  quente: { name: 'Fase quente', ic: '🔥', why: 'acertou o gol em 4 dos últimos 5', f: { mk: 'SOT', l: 0.5, w: 5, pct: 80, pos: ['M', 'F'], odd: 1.8 } },
  centroavante: { name: 'Volume de chute', ic: '💥', why: 'atacante com 2+ chutes em 70% dos jogos', f: { mk: 'SH', l: 1.5, w: 15, pct: 70, pos: ['F'], odd: 1.6 } },
  volante: { name: 'Volante faltoso', ic: '🟨', why: 'meio-campista que faz falta quase todo jogo', f: { mk: 'FC', l: 0.5, w: 15, pct: 80, pos: ['M'], odd: 1.5 } },
  ima: { name: 'Ímã de falta', ic: '🧲', why: 'sofre 2+ faltas em 60% dos jogos', f: { mk: 'FS', l: 1.5, w: 10, pct: 60, pos: ['M', 'F'], odd: 1.9 } },
  desarme: { name: 'Máquina de desarme', ic: '🦶', why: '2+ desarmes em 60% dos jogos', f: { mk: 'TK', l: 1.5, w: 15, pct: 60, pos: ['D', 'M'], odd: 1.8 } },
  goleiro: { name: 'Goleiro ocupado', ic: '🧤', why: '3+ defesas em 60% dos jogos', f: { mk: 'SV', l: 2.5, w: 10, pct: 60, pos: ['G'] } },
};
const POSW: Record<string, string> = { goleiro: 'G', goleiros: 'G', gk: 'G', zagueiro: 'D', zagueiros: 'D', defensor: 'D', defensores: 'D', lateral: 'D', laterais: 'D', defesa: 'D',
  meia: 'M', meias: 'M', volante: 'M', volantes: 'M', meio: 'M', 'meio-campo': 'M', atacante: 'F', atacantes: 'F', ponta: 'F', pontas: 'F', centroavante: 'F', ataque: 'F' };
const POS1: Record<string, string> = { G: 'GOL', D: 'DEF', M: 'MEI', F: 'ATA' };
function parseHunt(args: string[]): { f: HF; preset?: string; err?: string } {
  const a0 = norm(args[0] ?? '').replace(/ /g, '');
  const p0 = a0 && PRESETS[a0] ? a0 : undefined;
  const f: HF = { ...HF0, ...(p0 ? PRESETS[p0].f : {}) }, pos = new Set<string>(p0 ? f.pos : []);
  let mkSet = !!p0;
  for (let i = p0 ? 1 : 0; i < args.length; i++) {
    const raw = args[i].toLowerCase().replace(',', '.'), t = norm(args[i]);
    const two = norm(args[i] + ' ' + (args[i + 1] ?? ''));
    if (STATW[two] && !/1t$/.test(two)) { f.mk = STATW[two]; mkSet = true; i++; continue; }
    if (STATW[t]) { f.mk = STATW[t]; mkSet = true; continue; }
    let m: RegExpExecArray | null;
    if ((m = /^l(5|10|15|20)$/.exec(t))) { f.w = +m[1]; continue; }
    if ((m = /^@(\d+(?:\.\d+)?)$/.exec(raw))) { f.odd = +m[1]; continue; }
    if ((m = /^(\d{1,3})%?$/.exec(raw)) && +m[1] >= 20 && +m[1] <= 100) { f.pct = +m[1]; continue; }
    if ((m = /^(\d+\.5)$/.exec(raw))) { f.l = +m[1]; continue; }
    if ((m = /^min(\d{1,2})$/.exec(t))) { f.mmin = +m[1]; continue; }
    if ((m = /^(?:ult|j)(\d{1,2})$/.exec(t))) { f.gap = +m[1]; continue; }
    if (POSW[t]) { pos.add(POSW[t]); continue; }
    if (t === 'casa' || t === 'fora') { f.venue = t; continue; }
    if (t === 'titular' || t === 'titulares') { f.tit = true; continue; }
    if (t === 'todos' || t === 'qualquer') { f.tit = false; f.mmin = 1; continue; }
    if (t === 'liga' || t === 'mesmaliga') { f.liga = true; continue; }
    if (t === 'conf' || t === 'confirmado' || t === 'escalado') { f.conf = true; continue; }
    return { f, preset: p0, err: `não entendi "<b>${esc(args[i])}</b>"` };
  }
  if (!mkSet) return { f, err: 'falta o mercado (chutes, nogol, faltas, sofridas, desarmes ou defesas)' };
  if (/1$/.test(f.mk)) return { f, err: '1º tempo não tem histórico por jogador na API, então o caçador não cobre' };
  f.pos = [...pos];
  if (f.mk === 'SV') f.pos = ['G'];
  return { f, preset: p0 };
}
const huntCmd = (f: HF) => ['/cacador', MKS[f.mk] === 'no gol' ? 'nogol' : ({ SH: 'chutes', FC: 'faltas', FS: 'sofridas', TK: 'desarmes', SV: 'defesas' } as Record<string, string>)[f.mk] ?? f.mk,
  n1(f.l), 'L' + f.w, String(f.pct), ...f.pos.map(p => ({ G: 'goleiro', D: 'defensor', M: 'meia', F: 'atacante' } as Record<string, string>)[p]), f.venue, f.tit ? '' : 'todos', f.mmin !== 60 && f.tit ? 'min' + f.mmin : '',
  f.odd ? '@' + n1(f.odd) : '', f.conf ? 'conf' : '', f.liga ? 'liga' : '', f.gap ? 'ult' + f.gap : ''].filter(Boolean).join(' ');
const huntDesc = (f: HF) => [`mais de ${n1(f.l)} ${MK[f.mk]}`, `${f.pct}%+ nos últimos ${f.w}${f.tit ? ` como titular (${f.mmin}+ min)` : ''}`,
  f.pos.length ? f.pos.map(p => POSN[p]).join(' e ') : '', f.venue === 'casa' ? 'jogos em casa (e hoje em casa)' : f.venue === 'fora' ? 'jogos fora (e hoje fora)' : '',
  f.liga ? 'só a mesma competição de hoje' : '', f.odd ? `odd ${n2(f.odd)}+` : '', f.conf ? 'titular confirmado' : '', f.gap ? `jogou nos últimos ${f.gap} jogos do time` : ''].filter(Boolean).join(' · ');
type HR = { pid: string; m: MPlayer; hit: number; n: number; vals: number[]; p: number; odd: number; house: string | null; e: number | null; sk: number };
function huntRun(d: Data, H: Hunt, f: HF): HR[] {
  const out: HR[] = [], c = HX[f.mk];
  for (const [pid, m] of Object.entries(d.mdl?.p ?? {})) {
    if (!m.mu?.[f.mk] || Date.parse(m.utc) < Date.now() - 5 * 6e4) continue;
    if (f.pos.length && !f.pos.includes(m.pos)) continue;
    if (f.conf ? m.st !== 'xi' : (m.st === 'banco' || (m.st !== 'xi' && m.ps < 0.6))) continue;
    if (f.venue && (f.venue === 'casa') !== m.home) continue;
    if (f.gap && (m.gap ?? 0) > f.gap) continue;
    const hx = H.p[pid]; if (!hx) continue;
    const g = hx.filter(h => h[0] >= (f.tit ? f.mmin : Math.max(1, f.mmin === 60 ? 1 : f.mmin)) && (!f.tit || h[1]) && (!f.venue || (f.venue === 'casa') === !!h[2]) && (!f.liga || h[3] === m.lg)).slice(0, f.w);
    if (g.length < Math.ceil(f.w * 0.6) || g.length < 3) continue;
    const vals = g.map(h => h[c]), hit = vals.filter(v => v > f.l).length;
    if (hit / g.length * 100 < f.pct - 1e-9) continue;
    const p = pAt(d, pid, f.mk, f.l); if (p == null) continue;
    const row = d.rows.find(r => r.id === pid && r.m === f.mk && r.l === f.l && r.d);
    const odd = row?.d ?? 1 / Math.max(p, 0.01);
    if (f.odd && odd < f.odd - 1e-9) continue;
    let sk = 0; for (const v of vals) { if (v > f.l) sk++; else break; }
    out.push({ pid, m, hit, n: g.length, vals, p, odd, house: row?.b ?? null, e: row?.d ? p * row.d - 1 : null, sk });
  }
  // ranking: com odd de casa, pelo EV; sem odd, pela chance do modelo (o histórico já passou no filtro)
  return out.sort((a, b) => ((b.e ?? -9) - (a.e ?? -9)) || (b.p - a.p) || (b.hit / b.n - a.hit / a.n));
}
async function cacadorCmd(d: Data, rest: string[], page: number): Promise<Out> {
  const menu = { inline_keyboard: [...chunk(Object.entries(PRESETS).map(([k, P]) => BTN(`${P.ic} ${P.name}`, `/cacador ${k}`)), 2), [BTN('🔥 Sequências', '/sequencias'), BTN('🟨 Árbitros', '/arbitros')], HOME] };
  if (!rest.length) return { text: `<b>🎯 CAÇADOR DE PROPS</b>
<i>Filtra os jogadores de hoje pelo que fizeram nos últimos jogos e mostra a chance do Modelo BH e o EV ao lado.</i>

Escolha um filtro pronto ou monte o seu:
<code>/cacador chutes 1,5 L10 70 atacante casa @1,8</code>

<blockquote expandable><b>O que dá para usar</b>
mercado: chutes · nogol · faltas · sofridas · desarmes · defesas
linha: 0,5 · 1,5 · 2,5 …
janela: L5 · L10 · L15 · L20
acerto mínimo: 60 · 70 · 80 (%)
posição: goleiro · defensor · meia · atacante
casa ou fora: só jogos nesse mando (e hoje nesse mando)
titular (padrão, 60+ min) · todos · min70 (minutos mínimos)
liga: só jogos da mesma competição de hoje
conf: só titular confirmado na escalação
ult3: jogou em algum dos 3 últimos jogos do time
@1,8: odd mínima (de casa, ou justa do modelo sem casa)</blockquote>
⚠️ <i>Acerto passado não é chance futura: o ranking vem pelo EV (com odd de casa) e pela chance do modelo.</i>`, kb: menu };
  const { f, preset, err } = parseHunt(rest);
  if (err) return { text: `🎯 Caçador: ${err}.\n\nExemplo: <code>/cacador chutes 1,5 L10 70 atacante</code>`, kb: menu };
  const H = await hunt();
  const res = huntRun(d, H, f), cmd = preset ? '/cacador ' + preset : huntCmd(f);
  const P = preset ? PRESETS[preset] : null;
  const title = `🎯 CAÇADOR · ${P ? P.name.toUpperCase() : MKN[f.mk].toUpperCase()}`;
  const desc = `<i>${huntDesc(f)}</i>${P ? `\n<i>${P.why}</i>` : ''}`;
  if (!res.length) return { text: header(d, title) + `\n${desc}\n\nNinguém passou no filtro hoje. Afrouxe o acerto mínimo, a janela ou a odd.\n` + FOOT, kb: menu };
  const pages = Math.ceil(res.length / 8), pg = Math.max(1, Math.min(pages, page)), sl = res.slice((pg - 1) * 8, pg * 8);
  const body = sl.map((x, i) => {
    const k = (pg - 1) * 8 + i + 1, flag = x.hit / x.n - x.p >= 0.2 ? ' ⚠️' : '';
    return `<b>${k}. ${esc(x.m.n)}</b> <i>(${esc(x.m.tn)} · ${POS1[x.m.pos] ?? x.m.pos})</i> ${x.m.home ? 'x' : '@'} ${esc(x.m.on)} · ${hourBR(x.m.utc)}${x.m.st === 'xi' ? ' ✅' : ''}
${sqDots(x.vals, f.l, f.w).dots} <b>${x.hit}/${x.n}</b>${x.sk >= 3 ? ` · 🔥 ${x.sk} seguidos` : ''}
🧠 Modelo <b>${pc(x.p)}</b>${flag} · ${x.house ? `<code>@${n2(x.odd)}</code> ${esc(x.house)} · EV <b>${evS(x.e)}</b>` : `odd justa <code>@${n2(x.odd)}</code>`}`;
  }).join('\n\n');
  const nav = [pg > 1 ? BTN('◀', `p:${pg - 1}:${cmd}`) : null, pages > 1 ? BTN(`${pg}/${pages}`, `p:${pg}:${cmd}`) : null, pg < pages ? BTN('▶', `p:${pg + 1}:${cmd}`) : null].filter(Boolean) as { text: string; callback_data: string }[];
  const reg = sl.map((x, i) => BTN(`📝 ${(pg - 1) * 8 + i + 1}`, `bm:${x.pid}:${f.mk}:${f.l}`));
  return { text: header(d, title, ` · ${res.length} jogador${res.length > 1 ? 'es' : ''}`) + `\n${desc}\n\n<blockquote>${body}</blockquote>
<i>🟩 bateu · 🟥 não bateu (mais recente primeiro) · ✅ titular confirmado · ⚠️ histórico bem acima do modelo: a sequência pode estar inflada</i>
` + FOOT, kb: { inline_keyboard: [...chunk(reg, 4), ...(nav.length ? [nav] : []), [BTN('🎯 Outros filtros', '/cacador')], home(cmd, pg)] } };
}

// ---------- 🔥 Sequências: só informação; o ranking continua pela chance e pelo EV ----------
const SEQ_MK = ['SH', 'SOT', 'FC', 'FS', 'TK', 'SV'];
function sequenciasCmd(d: Data, rest: string[], page: number): Out {
  const only = rest[0] ? STATW[norm(rest.join(' '))] : null;
  const items: { pid: string; m: MPlayer; mk: string; l: number; sk: number; n: number; p: number; row?: Row }[] = [];
  for (const [pid, m] of Object.entries(d.mdl?.p ?? {})) {
    if (Date.parse(m.utc) < Date.now() - 5 * 6e4 || m.st === 'banco' || (m.st !== 'xi' && m.ps < 0.6)) continue;
    for (const mk of SEQ_MK) {
      if (only && mk !== only) continue;
      const v = m.sq?.[MSTAT[mk]]; if (!v?.length || !m.mu?.[mk]) continue;
      // a linha mais alta em que ele vem batendo há 5+ jogos seguidos como titular
      // (só linhas com odd na faixa 1,40–3,50: "0,5 chute do centroavante" não paga nada)
      for (const l of [...LINES[mk]].reverse()) {
        let sk = 0; for (const x of v) { if (x > l) sk++; else break; }
        if (sk < 5) continue;
        const p = pAt(d, pid, mk, l) ?? 0, row = d.rows.find(r => r.id === pid && r.m === mk && r.l === l && r.d), odd = row?.d ?? 1 / Math.max(p, .01);
        if (odd < ODD_MIN - 1e-9 || odd > ODD_MAX + 1e-9) continue;
        items.push({ pid, m, mk, l, sk, n: v.length, p, row }); break;
      }
    }
  }
  items.sort((a, b) => b.sk - a.sk || b.l - a.l || b.p - a.p);
  const cmd = '/sequencias' + (rest.length ? ' ' + rest.join(' ') : '');
  const kb0 = [[BTN('🏟️ Times e jogo', '/sequencias times')], [BTN('Chutes', '/sequencias chutes'), BTN('No gol', '/sequencias nogol'), BTN('Faltas', '/sequencias faltas')], [BTN('Sofridas', '/sequencias sofridas'), BTN('Desarmes', '/sequencias desarmes'), BTN('Defesas', '/sequencias defesas')]];
  if (!items.length) return { text: header(d, '🔥 SEQUÊNCIAS') + '\nNinguém do dia com 5+ jogos seguidos batendo uma linha como titular.\n' + FOOT, kb: { inline_keyboard: [...kb0, HOME] } };
  const pages = Math.ceil(items.length / 10), pg = Math.max(1, Math.min(pages, page)), sl = items.slice((pg - 1) * 10, pg * 10);
  const body = sl.map((x, i) => `<b>${(pg - 1) * 10 + i + 1}. ${esc(x.m.n)}</b> <i>(${esc(x.m.tn)})</i> · ${hourBR(x.m.utc)}
🔥 <b>${x.sk} seguidos</b> com mais de ${n1(x.l)} ${MK[x.mk]}${x.sk === x.n ? ' <i>(todos os últimos ' + x.n + ')</i>' : ''}
🧠 Modelo <b>${pc(x.p)}</b> · ${x.row ? `<code>@${n2(x.row.d!)}</code> ${esc(x.row.b ?? '')} · EV <b>${evS(x.row.e)}</b>` : `odd justa <code>@${n2(1 / Math.max(x.p, .01))}</code>`}`).join('\n\n');
  const nav = [pg > 1 ? BTN('◀', `p:${pg - 1}:${cmd}`) : null, pages > 1 ? BTN(`${pg}/${pages}`, `p:${pg}:${cmd}`) : null, pg < pages ? BTN('▶', `p:${pg + 1}:${cmd}`) : null].filter(Boolean) as { text: string; callback_data: string }[];
  return { text: header(d, '🔥 SEQUÊNCIAS' + (only ? ' · ' + MKN[only].toUpperCase() : ''), ` · ${items.length} na lista`) + `\n<blockquote>${body}</blockquote>
<i>⚠️ Sequência é informação, não motivo. Casa também vê e costuma pôr no preço; o que decide é a chance do modelo contra a odd (EV). Só jogos como titular (60+ min) e odds 1,40–3,50.</i>
` + FOOT, kb: { inline_keyboard: [...kb0, ...(nav.length ? [nav] : []), home(cmd, pg)] } };
}

// ---------- 🔎 Raio-X do jogo (como a página de jogo do Valuestats, com o nosso histórico) ----------
const RXS: Record<string, [number, number, string]> = { g: [5, 6, 'gols'], sh: [7, 8, 'chutes'], sot: [9, 10, 'chutes ao gol'], fc: [11, 12, 'faltas'], cor: [13, 14, 'escanteios'], yc: [15, 16, 'amarelos'], sh1: [17, 18, 'chutes no 1º tempo'] };
const rxv = (r: RXRow, s: string, k: string) => { const [f, a] = RXS[s]; const x = r[f] as number | null, y = r[a] as number | null; return x == null || y == null ? null : k === 'j' ? x + y : k === 'c' ? x - y : x; };
const rxAvg = (rs: RXRow[], s: string, k = 't', a = false) => { const v = rs.map(r => a ? r[RXS[s][1]] as number | null : rxv(r, s, k)).filter(x => x != null) as number[]; return v.length ? v.reduce((p, q) => p + q, 0) / v.length : null; };
const rxPct = (rs: RXRow[], s: string, k: string, l: number) => { const v = rs.map(r => rxv(r, s, k)).filter(x => x != null) as number[]; return v.length ? `${Math.round(v.filter(x => x > l).length / v.length * 100)}% <i>(${v.filter(x => x > l).length}/${v.length})</i>` : '–'; };
const nl = (x: number) => String(x).replace('.', ',');
function trTxt(t: RXT, team: string) {
  const where = t.v === 'casa' ? ' em casa' : t.v === 'fora' ? ' fora' : '', fq = `<b>${t.x}/${t.y}</b>${where}`;
  if (t.k === 'c') return `${esc(team)} com ${t.side === 'o' ? 'mais' : 'menos'} ${RXS[t.s][2]} que o adversário · ${fq}`;
  const w = `${t.side === 'o' ? 'mais' : 'menos'} de ${nl(t.l)} ${RXS[t.s][2]}`;
  return t.k === 'j' ? `Jogo com ${w} <i>(jogos do ${esc(team)})</i> · ${fq}` : `${esc(team)} com ${w} · ${fq}`;
}
async function raioxCmd(d: Data, rest: string[]): Promise<Out> {
  const X = await raiox();
  if (!X) return { text: '🔎 O Raio-X ainda não foi publicado. Tente depois da próxima atualização.', kb: { inline_keyboard: [HOME] } };
  const live = X.g.filter(g => Date.parse(g.utc) > Date.now() - 150 * 6e4);
  const pick = { inline_keyboard: [...live.map(g => [BTN(`🔎 ${hourBR(g.utc)} ${X.tn[g.h]} x ${X.tn[g.a]}`, `/raiox ${g.id}`)]), HOME] };
  const q = norm(rest[0] ?? '');
  const g = q ? X.g.find(x => String(x.id) === q) ?? X.g.find(x => norm(X.tn[x.h]).includes(q) || norm(X.tn[x.a]).includes(q)) : null;
  if (!g) return { text: `<b>🔎 RAIO-X DO JOGO</b>\nMédias, % nas linhas mais comuns, tendências, árbitro e desfalques de cada jogo de hoje.${q ? `\n\nNão achei <b>${esc(rest[0])}</b>.` : ''}\n\nEscolha o jogo:`, kb: pick };
  const n = [5, 10, 20].includes(+rest[1]) ? +rest[1] : 10, all = rest[2] === 'todos';
  const H = X.tn[g.h], A = X.tn[g.a];
  const sh = (g.tm[g.h] ?? []).filter(r => all || r[3] === 1).slice(0, n), sa = (g.tm[g.a] ?? []).filter(r => all || r[3] === 0).slice(0, n);
  const f1 = (x: number | null) => x == null ? '–' : (Math.round(x * 10) / 10).toString().replace('.', ',');
  const med = ['sh', 'sot', 'fc', 'cor', 'yc', 'g'].map(s => `${RXS[s][2].padEnd(13)} ${(f1(rxAvg(sh, s)) + '/' + f1(rxAvg(sh, s, 't', true))).padStart(9)} ${(f1(rxAvg(sa, s)) + '/' + f1(rxAvg(sa, s, 't', true))).padStart(9)}`).join('\n');
  const lines: [string, number][] = [['sh', 22.5], ['sh', 24.5], ['sot', 7.5], ['fc', 22.5], ['fc', 24.5], ['cor', 9.5], ['yc', 4.5], ['g', 2.5]];
  const bet = lines.map(([s, l]) => `Mais de ${nl(l)} ${RXS[s][2]}: <b>${rxPct(sh, s, 'j', l)}</b> · <b>${rxPct(sa, s, 'j', l)}</b>`).join('\n');
  const tr = X.tr.filter(t => t.g === g.id).sort((a, b) => (b.b ?? 0) - (a.b ?? 0) || b.y - a.y).slice(0, 10).map(t => `${t.b ? '✅ ' : '• '}${trTxt(t, X.tn[t.t])}`).join('\n');
  const R = g.rk ? X.rf[g.rk] : null, S = R?.all, L = R?.lg ?? {};
  const ref = g.ref ? `\n<b>🟨 Árbitro: ${esc(g.ref)}</b>\n${S ? `${f1(S.fc)} faltas/jogo (liga ${f1(L.fc)}) · ${f1(S.yc)} amarelos/jogo (liga ${f1(L.yc)})\n5+ amarelos em ${Math.round(S.o45 * 100)}% · os dois times levam amarelo em ${Math.round(S.b1 * 100)}% · ${S.n} jogos${S.n < 5 ? ' <i>(pouca amostra)</i>' : ''}` : '<i>sem histórico nas nossas ligas</i>'}` : '';
  const inj = g.inj?.length ? `\n<b>🚑 Desfalques</b>\n${g.inj.map(x => `${x.st === 'out' ? '🔴' : '🟡'} ${esc(x.n)} <i>(${esc(x.t)})</i>`).join('\n')}` : '';
  const amostra = all ? `últimos ${n} de cada um` : `últimos ${n} do ${esc(H)} em casa e do ${esc(A)} fora`;
  const text = `<b>🔎 RAIO-X · ${esc(H)} x ${esc(A)}</b>\n<i>${hourBR(g.utc)} · ${amostra}</i>\n
<b>📊 Médias por jogo</b> <i>(pró/contra)</i>\n<pre>${''.padEnd(13)} ${short(H, 9).padStart(9)} ${short(A, 9).padStart(9)}\n${med}</pre>
<b>🎯 % dos jogos acima da linha</b> <i>(total do jogo · ${esc(short(H, 12))} · ${esc(short(A, 12))})</i>\n${bet}\n
${tr ? `<b>🔥 Tendências</b> <i>(✅ = vale também nos jogos do adversário)</i>\n<blockquote expandable>${tr}</blockquote>` : ''}${ref}${inj}
<i>Escanteios, amarelos e gols são só informação: o modelo e as estratégias ficam em chutes, faltas, desarmes e defesas.</i>` + FOOT;
  const b = (lb: string, nn: number, al: boolean) => BTN((nn === n && al === all ? '• ' : '') + lb, `/raiox ${g.id} ${nn}${al ? ' todos' : ''}`);
  return { text, kb: { inline_keyboard: [[b('5', 5, all), b('10', 10, all), b('20', 20, all)], [b('Mando de hoje', n, false), b('Todos os jogos', n, true)],
    [BTN('📋 Linhas do jogo', `/jogo ${g.id}`), BTN('🔎 Outro jogo', '/raiox')], [{ text: '📱 Raio-X completo no app', url: APP_URL + '#jogos' }], HOME] } };
}

// 🔥 Sequências de times e do jogo (formato L x/y do Valuestats)
async function seqTimesCmd(d: Data, page: number): Promise<Out> {
  const X = await raiox();
  if (!X) return { text: '🔥 As sequências de times ainda não foram publicadas.', kb: { inline_keyboard: [HOME] } };
  const live = new Set(X.g.filter(g => Date.parse(g.utc) > Date.now() - 5 * 6e4).map(g => g.id)), G = Object.fromEntries(X.g.map(g => [g.id, g]));
  const items = X.tr.filter(t => live.has(t.g) && t.x >= 8 && t.k !== 'c' && ['sh', 'sot', 'fc', 'sh1'].includes(t.s)).sort((a, b) => (b.b ?? 0) - (a.b ?? 0) || b.y - a.y || b.x - a.x);
  const cmd = '/sequencias times';
  if (!items.length) return { text: header(d, '🔥 SEQUÊNCIAS · TIMES E JOGO') + '\nNenhuma sequência de 8+ hoje em chutes, no gol e faltas.\n' + FOOT, kb: { inline_keyboard: [[BTN('👤 Jogadores', '/sequencias')], HOME] } };
  const pages = Math.ceil(items.length / 12), pg = Math.max(1, Math.min(pages, page)), sl = items.slice((pg - 1) * 12, pg * 12);
  const body = sl.map(t => `${t.b ? '✅ ' : '• '}${trTxt(t, X.tn[t.t])}\n   <i>${hourBR(G[t.g].utc)} ${esc(X.tn[G[t.g].h])} x ${esc(X.tn[G[t.g].a])} · ${t.vals.join('-')}</i>`).join('\n');
  const nav = [pg > 1 ? BTN('◀', `p:${pg - 1}:${cmd}`) : null, pages > 1 ? BTN(`${pg}/${pages}`, `p:${pg}:${cmd}`) : null, pg < pages ? BTN('▶', `p:${pg + 1}:${cmd}`) : null].filter(Boolean) as { text: string; callback_data: string }[];
  return { text: header(d, '🔥 SEQUÊNCIAS · TIMES E JOGO', ` · ${items.length}`) + `\n<blockquote>${body}</blockquote>
<i>8/9 = em 8 dos últimos 9 (no máximo 1 erro), no mando de hoje quando dá. ✅ = a do jogo também vale nos jogos do adversário. Sequência é informação, não motivo: confira a linha e a odd (/totais, /times).</i>
` + FOOT, kb: { inline_keyboard: [...(nav.length ? [nav] : []), [BTN('👤 Jogadores', '/sequencias'), BTN('➕ Totais', '/totais'), BTN('🏟️ Times', '/times')], home(cmd, pg)] } };
}

// ---------- 🟨 Árbitros do dia ----------
// linha extra do Raio-X: distribuição de amarelos e últimos 20
function refMore(X: RX | null, gid: number) {
  const g = X?.g.find(x => x.id === gid), R = g?.rk ? X!.rf[g.rk] : null; if (!R?.all) return '';
  const a = R.all, l = R.l20, L = R.lg ?? {}, p = (x: number) => Math.round(x * 100) + '%';
  return `\n📊 5+ amarelos em <b>${p(a.o45)}</b> (liga ${L.o45 != null ? p(L.o45) : '–'}) · 4+ em ${p(a.o35)} · os dois levam em ${p(a.b1)}${l && l.n < a.n ? ` · últ. 20: ${n1(l.fc)} faltas, ${n1(l.yc)} amarelos` : ''}`;
}
function arbitrosCmd(d: Data, page = 1, X: RX | null = null): Out {
  const gs = d.games.filter(g => g.ref && Date.parse(g.utc) > Date.now() - 5 * 6e4).map(g => ({ g, R: d.refs?.[g.ref!] ?? null }))
    .sort((a, b) => (b.R?.f ?? 1) - (a.R?.f ?? 1));
  const sem = d.games.filter(g => !g.ref && Date.parse(g.utc) > Date.now() - 5 * 6e4).length;
  if (!gs.length) return { text: header(d, '🟨 ÁRBITROS DO DIA') + '\nOs árbitros ainda não foram anunciados para os jogos de hoje.\n' + FOOT, kb: { inline_keyboard: [HOME] } };
  const PG = 10, pages = Math.ceil(gs.length / PG), pg = Math.max(1, Math.min(pages, page));
  const body = gs.slice((pg - 1) * PG, pg * PG).map(({ g, R }) => `⚽ <b>${esc(short(g.h, 16))} x ${esc(short(g.a, 16))}</b> · ${hourBR(g.utc)}${R ? ' · ' + rigor(R.f) : ''}
🟨 ${esc(refName(g.ref!))}${R ? ` · <b>${n1(R.fpg)}</b> faltas (liga ${n1(R.lfpg)}) · <b>${n1(R.cpg)}</b> cartões · ${R.n}j${R.n < 8 ? ' <i>(poucos jogos)</i>' : ''}` : ' · <i>sem histórico</i>'}${refMore(X, g.id)}`).join('\n');
  const nav = [pg > 1 ? BTN('◀', `p:${pg - 1}:/arbitros`) : null, pages > 1 ? BTN(`${pg}/${pages}`, `p:${pg}:/arbitros`) : null, pg < pages ? BTN('▶', `p:${pg + 1}:/arbitros`) : null].filter(Boolean) as { text: string; callback_data: string }[];
  return { text: header(d, '🟨 ÁRBITROS DO DIA', ` · ${gs.length}`) + `\n<blockquote>${body}</blockquote>
<i>Faltas e cartões por jogo no histórico (2025 e 2026). 🔴 rigoroso: 7%+ faltas que a média da liga no modelo · 🟢 deixa jogar: 7%+ abaixo. O efeito já entra nas faltas do Modelo BH, puxado para a média quando há poucos jogos.${sem ? ` ${sem} jogo${sem > 1 ? 's' : ''} sem árbitro anunciado.` : ''}</i>
` + FOOT, kb: { inline_keyboard: [...(nav.length ? [nav] : []), [BTN('🧱 Faltas', '/faltas'), BTN('🤕 Sofridas', '/sofridas'), BTN('➕ Totais', '/totais')], home('/arbitros', pg)] } };
}

// ---------- 📈 Tendência: lista à parte (sequência + confronto + defesa + odd, sem depender do modelo) ----------
const ORD = (n: number) => n + 'º';
const hTx = (h: any) => Array.isArray(h?.[0]) ? h.map((x: any) => x ? `${x[0]}/${x[1]}` : '–').join(' e ') : h ? `${h[0]}/${h[1]}` : '–';
function tdLines(r: Row) {
  const t = r.td; if (!t) return '';
  const u = r.s === 'u', st = MSTAT[r.m] ?? { TSH: 'sh', TSOT: 'sot', TFC: 'fc', JSH: 'sh', JSOT: 'sot', JFC: 'fc' }[r.m];
  const what = r.k === 'p' ? `a ${POSN[r.pos ?? ''] ?? 'jogadores da posição'}` : r.k === 't' ? 'por jogo' : 'de total por jogo';
  let df = '';
  if (t.both) { const [a, b] = t.df ?? []; if (a && b) df = `🛡️ Os dois times no total: ${ORD(a[1])} de ${a[2]} e ${ORD(b[1])} de ${b[2]} na liga (${n1(a[0])} e ${n1(b[0])} por jogo)`; }
  else if (t.df) df = `🛡️ ${esc(r.o)}: ${ORD(t.df[1])} de ${t.df[2]} que mais cede ${what} na liga (${n1(t.df[0])}${r.k === 'p' ? ' por 90' : ' por jogo'})${u ? ' · entre os que MENOS cedem' : ''}`;
  const vs = t.vs?.[1] ? `${t.vs[0]}/${t.vs[1]} contra o ${esc(r.k === 'j' ? 'mesmo adversário' : r.o)}` : 'sem jogo contra ele no histórico';
  return `🔢 L10 <b>${hTx(t.l10)}</b> · L5 <b>${hTx(t.l5)}</b> · L20 ${hTx(t.l20)}${t.both ? ' <i>(casa e fora, cada um nos seus jogos)</i>' : ''}\n⚔️ ${vs}\n${df}`;
}
async function tendenciaCmd(d: Data): Promise<Out> {
  const st = await estToday(d.date), now = Date.now();
  const picks = (st?.picks ?? []).filter((p: any) => p.strategy_id === 'tendencia' && (!p.tip_utc || Date.parse(p.tip_utc) > now - 5 * 6e4));
  const all = [...d.rows, ...(d.rowsU ?? [])];
  const items = picks.map((p: any) => all.find(r => r.id === p.pid && r.m === p.mk && r.l === +p.line && (r.s ?? 'o') === (p.side ?? 'o'))).filter(Boolean) as Row[];
  const intro = `<i>Método à parte, sem depender do modelo: 7+/10 e 4+/5 na linha da casa, 50%+ contra o adversário (ou nenhum jogo), adversário entre os ~35% que mais cedem (mais) ou menos cedem (menos) na liga, odd 1,60–2,30, titular com 70+ min. 1 por jogador, até 10 por dia.</i>`;
  if (!items.length) return { text: header(d, '📈 TENDÊNCIA') + `\n${intro}\n\nNenhuma entrada passou em todos os critérios ${d.rows.some(r => r.d) ? 'hoje' : '(ainda sem linhas de casa lidas)'}.\n` + FOOT, kb: { inline_keyboard: [[BTN('🧪 Placar', '/estrategias tendencia')], HOME] } };
  const body = items.map((r, i) => `<b>${i + 1}.</b> ${whoB(r)} <i>${esc(vsTxt(r))} · ${hourBR(r.utc)}</i>
${sideTx(r.s)} de <b>${n1(r.l)}</b> ${MK[r.m] ?? r.m} · <code>@${n2(r.d!)}</code> ${esc(r.b ?? '')}
${tdLines(r)}
📈 <i>sinal da sequência, não do modelo</i> · 🧠 modelo ${pc(r.p)}${r.e != null ? ` (EV ${evS(r.e)})` : ''}`).join('\n\n');
  const regs = items.map((r, i) => BTN(`📝 ${i + 1}`, `bet:${keyOf(r)}:e.tendencia`));
  return { text: header(d, '📈 TENDÊNCIA', ` · ${items.length}`) + `\n${intro}\n\n<blockquote>${body}</blockquote>\n<i>A coluna do modelo é só para comparar: a Tendência entra mesmo quando o modelo discorda, e o placar dela é separado.</i>\n` + FOOT,
    kb: { inline_keyboard: [...chunk(regs, 5), [BTN('🧪 Placar', '/estrategias tendencia')], HOME] } };
}


// ---------- 🔐 Acesso: bot fechado por lista de IDs (ALLOWED_CHATS em bot_config; o primeiro é o administrador) ----------
async function setAllowed(list: string[]) {
  await sb('bot_config?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key: 'ALLOWED_CHATS', value: [...new Set(list)].join(',') }) });
  CFG = null;
}
async function acessoCmd(cmd: string, rest: string[], chatId: number): Promise<Out> {
  const allowed = (await cfg()).allowed;
  const kb = { inline_keyboard: [[BTN('👥 Acessos', '/acessos')], HOME] };
  if (allowed.length && allowed[0] !== String(chatId)) return { text: 'Só o administrador do bot pode liberar ou bloquear acessos.', kb: { inline_keyboard: [HOME] } };
  const id = String(rest[0] ?? '').replace(/[^0-9-]/g, '');
  if (cmd === 'acessos') {
    const reqs: any[] = await sb('bot_config?key=like.REQ:*&select=key,value').catch(() => []) ?? [];
    const pend = reqs.filter(r => !allowed.includes(r.key.slice(4)));
    return { text: `<b>👥 ACESSOS</b>\n<i>Bot fechado por lista. O primeiro ID é o administrador.</i>\n\n<b>Liberados (${allowed.length})</b>\n${allowed.map((a, i) => `${i ? '•' : '👑'} <code>${a}</code>`).join('\n') || '–'}${pend.length ? `\n\n<b>Pedidos</b>\n${pend.map(r => `• ${esc(r.value)} · <code>${r.key.slice(4)}</code>`).join('\n')}` : ''}\n\n<code>/liberar ID</code> · <code>/bloquear ID</code>`,
      kb: { inline_keyboard: [...pend.slice(0, 6).map(r => [BTN(`✅ Liberar ${r.value}`.slice(0, 40), `/liberar ${r.key.slice(4)}`)]), HOME] } };
  }
  if (!id) return { text: `Uso: <code>/${cmd} 123456789</code> (o ID aparece para a pessoa quando ela tenta usar o bot).`, kb };
  if (cmd === 'liberar') {
    await setAllowed([...(allowed.length ? allowed : [String(chatId)]), id]);
    // quem é liberado já entra recebendo tudo
    await sb('bot_subs?on_conflict=chat_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ chat_id: +id, est: true, top: true, chutes: true, faltas: true }) }).catch(() => null);
    await TG('sendMessage', { chat_id: +id, parse_mode: 'HTML', text: '✅ <b>Acesso liberado!</b>\nVocê já recebe os tops do dia, as entradas das estratégias e os alertas. Para escolher o que receber, use /receber. Toque em /start para abrir o menu.\n\n<i>🔞 18+ · Aposte com responsabilidade.</i>' }).catch(() => null);
    return { text: `✅ ID <code>${id}</code> liberado e já inscrito em tudo.`, kb };
  }
  if (id === allowed[0]) return { text: 'O administrador não pode ser bloqueado.', kb };
  await setAllowed(allowed.filter(a => a !== id));
  await sb(`bot_subs?chat_id=eq.${id}`, { method: 'DELETE' }).catch(() => null);
  return { text: `🚫 ID <code>${id}</code> bloqueado e removido dos envios.`, kb };
}

// ---------- 🚨 Alerta por entrada (chamado pela função das estratégias) ----------
// Uma mensagem por entrada: card em imagem no topo e a análise completa embaixo, com Registrar e Copiar.
// Madrugada (0h–8h de Brasília) chega sem som.
const quiet = () => { const h = +new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(new Date()); return h < 8; };
function alertExtra(d: Data, r: Row, x: any) {
  const out: string[] = [], t = r.td, u = r.s === 'u';
  const td = x.strategy_id === 'tendencia';
  if (td) out.push(`📈 A Tendência não usa o modelo: entrou por sequência, confronto, defesa e odd. Só para comparar, o modelo dá ${pc(r.p)}${r.e != null ? ` (EV ${evS(r.e)})` : ''}.`);
  if (r.d) out.push(`🎯 Modelo <b>${pc(r.p)}</b> × mercado ${pc(1 / r.d)} <i>(chance que a odd ${n2(r.d)} paga)</i>`);
  const parts: string[] = [];
  if (t?.l20) parts.push(`L20 <b>${hTx(t.l20)}</b>`);
  if (t?.vs) parts.push(t.vs[1] ? `contra o ${esc(r.k === 'j' ? 'mesmo adversário' : r.o)} <b>${t.vs[0]}/${t.vs[1]}</b>` : 'sem jogo contra o adversário');
  if (r.ex?.pa != null) parts.push(`temporada passada <b>${n1(r.ex.pa)}</b> por jogo (${r.ex.np})`);
  if (parts.length) out.push('📅 ' + parts.join(' · '));
  if (t?.df && !t.both) out.push(`🛡️ ${esc(r.o)}: <b>${ORD(t.df[1])} de ${t.df[2]}</b> que mais cede ${r.k === 'p' ? `a ${POSN[r.pos ?? ''] ?? 'jogadores da posição'}` : 'por jogo'} na liga (${n1(t.df[0])}${r.k === 'p' ? ' por 90' : ''})`);
  else if (t?.both && t.df?.[0] && t.df?.[1]) out.push(`🛡️ Total por jogo na liga: ${esc(r.t)} ${ORD(t.df[0][1])} de ${t.df[0][2]} · ${esc(r.o)} ${ORD(t.df[1][1])} de ${t.df[1][2]}`);
  const g = d.games.find(G => G.id === r.g), inj = (d.inj ?? []).filter(p => g && (p.t === g.h || p.t === g.a));
  if (inj.length) out.push(`🚑 Desfalques: ${inj.slice(0, 8).map(p => `${p.st === 'out' ? '🔴' : '🟡'} ${esc(p.n)} <i>(${esc(short(p.t, 12))})</i>`).join(', ')}${inj.length > 8 ? ` e mais ${inj.length - 8}` : ''}`);
  if (u && r.sq?.length) out.push(`🔢 ${sqLine(r.sq, r.l, true)} <i>(🟩 ficou abaixo da linha)</i>`);
  return out.length ? `\n<blockquote>${out.join('\n')}</blockquote>` : '';
}
async function alertas(entries: any[]) {
  const d = await data(), subs: any[] = await sb('bot_subs?select=chat_id&est=eq.true') ?? [], mins = await allMins();
  const names: Record<string, string> = Object.fromEntries(((await estToday(d.date))?.strategies ?? []).map((s: any) => [s.id, s.name]));
  const all = [...d.rows, ...(d.rowsU ?? [])], silent = quiet();
  let sent = 0, fotos = 0;
  for (const x of entries) {
    const r = all.find(R => R.id === x.pid && R.m === x.mk && R.l === +x.line && (R.s ?? 'o') === (x.side ?? 'o'));
    if (!r) continue;
    const td = x.strategy_id === 'tendencia';
    const fire = !td && r.e != null && r.e >= .1 ? ' 🔥' : '';
    const title = td ? `📈 <b>TENDÊNCIA · NOVA ENTRADA</b>` : `🚨 <b>NOVA ENTRADA${fire} · ${esc((names[x.strategy_id] ?? x.strategy_id).toUpperCase())}</b>`;
    const text = `${title}\n<i>Linha e odd da melhor casa agora · 1u no papel${td ? '' : ' · EV mínimo 5%'}</i>\n${card(d, r, undefined, { td })}${alertExtra(d, r, x)}\n<i>📝 Registre a sua aposta com a odd que você pegou. Quanto antes, melhor: a linha costuma andar até o jogo.</i>\n${FOOT}`;
    const kb = { inline_keyboard: [[BTN('📝 Registrar minha aposta', `bet:${keyOf(r)}:e.${x.strategy_id}`)], [{ text: '📋 Copiar', copy_text: { text: shareText(r).slice(0, 256) } }, BTN('🧪 Placar', '/estrategias')]] };
    for (const s of subs) {
      if (!okOdd(+(x.open_odd ?? x.odd), mins[String(s.chat_id)] ?? 0)) continue; // odd mínima do chat
      const ph = await TG('sendPhoto', { chat_id: s.chat_id, photo: cardUrl(d, r), disable_notification: silent }).catch(() => null);
      if (ph?.ok) fotos++;
      const m = await TG('sendMessage', { chat_id: s.chat_id, text: text.length > 4090 ? text.slice(0, 4000).replace(/<[^>]*$/, '') + '…' : text, parse_mode: 'HTML', disable_web_page_preview: true, disable_notification: silent, reply_markup: kb });
      if (m?.ok) sent++;
    }
  }
  return { ok: true, mensagens: sent, fotos, silencioso: silent };
}

const HELP = `<b>📖 COMANDOS</b>

<b>Melhores do dia</b>
/top · /top 20 · todos os mercados
/valor · odd de casa com EV de 3% a 15%
/seguras · chance de 65% ou mais

<b>Por mercado</b> <i>(some um número: /chutes 15)</i>
/chutes /nogol /primeiro (1º tempo)
/faltas /sofridas /desarmes /defesas
/times · chutes, no gol e faltas do time
/totais · chutes, no gol e faltas do jogo

<b>Filtros</b>
/jogo arsenal · /jogador saka
/cacador · caçador de props (filtros prontos ou o seu)
/sequencias · quem vem batendo uma linha há 5+ jogos (jogadores, times e jogo)
/tendencia · método Tendência (sequência + confronto + defesa + odd)
/pdf · PDF do dia (entradas, maior chance, combinados, múltiplas)
/arbitros · árbitros do dia: faltas, cartões e rigor
/raiox · raio-x do jogo: médias, % nas linhas, tendências, árbitro

<b>Rodada</b>
/jogos · /desfalques · /resumo
/multipla 3 · /multipla 4,5
/cards · melhores do dia em imagem

<b>Modelo BH</b>
/modelo saka chutes 1,5 · chance pelo modelo + teste
/testes · seus testes conferidos · /testes todos
/topchutes · top 10 em chutes
/topfaltas · top 10 em faltas e desarmes
/receber · receber os tops e as estratégias todo dia
/odd · odd mínima: só mostra e manda entradas a partir dela
/banca · suas entradas, lucro e ROI · /banca todos
/apagar 12 · apaga uma entrada registrada errada
/resultado 12 2 · confere à mão uma entrada de 1º tempo
/ontem · resultado de ontem (chega sozinho de manhã)
/estrategias · modelo por mercado: placar e entradas do dia
/gabarito · resultado de ontem de cada mercado (chega sozinho de manhã, ~8h)
/app · app completo

<b>Como usar as listas</b>
Toque em 🔎 e o número para abrir a análise completa na mesma mensagem e registrar (📝). 🖼️ manda o card em imagem.

<b>Como ler o cartão</b>
<b>Nota</b> 0–100: quanto os dados sustentam a entrada (chance, valor, acertos, contexto do jogo e certeza de que ele joga).
<b>L5 · L10</b>: acertos nos últimos 5 e 10 jogos como titular. 🟩 bateu · 🟥 não bateu.
🛡️ contexto do jogo · ✅ motivos a favor · ⚠️ ponto de atenção.
Só MAIS (as casas não abrem o "menos"). A chance já conta o risco de ele não começar jogando.
As listas mostram só odds entre 1,40 e 3,50.`;
const MENU = { inline_keyboard: [
  [BTN('🔥 Top do dia', '/top'), BTN('💰 Valor', '/valor'), BTN('🛡️ Seguras', '/seguras')],
  [BTN('🎯 Chutes', '/chutes'), BTN('🥅 No gol', '/nogol'), BTN('⏱️ 1º tempo', '/primeiro')],
  [BTN('🧱 Faltas', '/faltas'), BTN('🤕 Sofridas', '/sofridas'), BTN('🦶 Desarmes', '/desarmes')],
  [BTN('🧤 Defesas', '/defesas'), BTN('🏟️ Times', '/times'), BTN('➕ Totais', '/totais')],
  [BTN('🗓️ Jogos', '/jogos'), BTN('🔎 Raio-X', '/raiox'), BTN('🚑 Desfalques', '/desfalques')],
  [BTN('🎯 Top 10 Chutes', '/topchutes'), BTN('🧱 Top 10 Faltas', '/topfaltas'), BTN('📋 Resumo', '/resumo')],
  [BTN('🕵️ Caçador', '/cacador'), BTN('🔥 Sequências', '/sequencias'), BTN('🟨 Árbitros', '/arbitros')],
  [BTN('📈 Tendência', '/tendencia'), BTN('🧪 Placar', '/estrategias')],
  [BTN('🧠 Modelo BH', '/modelo'), BTN('📒 Testes', '/testes'), BTN('📬 Envio diário', '/receber')], [BTN('🎯 Odd mínima', '/odd')],
  [BTN('💼 Banca e ROI', '/banca'), BTN('🧪 Estratégias', '/estrategias'), BTN('🖼️ Cards do dia', '/cards')],
  [{ text: '📱 Abrir o app completo', url: APP_URL }],
] };
const RKB = { keyboard: [[{ text: '🔥 Hoje' }, { text: '🧠 Modelo BH' }], [{ text: '💼 Banca' }, { text: '☰ Mais' }]], resize_keyboard: true, is_persistent: true };
const KBMAP: Record<string, string> = { '🔥 Hoje': '/hoje', '🧠 Modelo BH': '/modelobh', '💼 Banca': '/banca', '☰ Mais': '/menu' };
const HUB = { inline_keyboard: [[BTN('🔥 Hoje', '/hoje'), BTN('🧠 Modelo BH', '/modelobh')], [BTN('💼 Banca e ROI', '/banca'), BTN('☀️ Resultado de ontem', '/ontem')], [BTN('☰ Todos os mercados', '/menu')], [{ text: '📱 Abrir o app completo', url: APP_URL }]] };
const HOJE = { inline_keyboard: [
  [BTN('🔥 Top do dia', '/top'), BTN('💰 Valor', '/valor'), BTN('🛡️ Seguras', '/seguras')],
  [BTN('🎯 Top 10 Chutes', '/topchutes'), BTN('🧱 Top 10 Faltas', '/topfaltas')],
  [BTN('🗓️ Jogos', '/jogos'), BTN('🔎 Raio-X', '/raiox'), BTN('🚑 Desfalques', '/desfalques')],
  [BTN('🕵️ Caçador', '/cacador'), BTN('🔥 Sequências', '/sequencias'), BTN('🟨 Árbitros', '/arbitros')],
  [BTN('📈 Tendência', '/tendencia'), BTN('🧪 Placar', '/estrategias'), BTN('📄 PDF', '/pdf')],
  [BTN('🖼️ Cards do dia', '/cards'), BTN('🎟️ Múltipla', '/multipla 3'), BTN('📋 Resumo', '/resumo')], [BTN('☰ Todos os mercados', '/menu')]] };
const MODELO_HUB = { inline_keyboard: [
  [BTN('🎯 Top 10 Chutes', '/topchutes'), BTN('🧱 Top 10 Faltas', '/topfaltas')],
  [BTN('🧠 Chance de uma linha', '/modelo'), BTN('📒 Meus testes', '/testes')],
  [BTN('☀️ Resultado de ontem', '/ontem'), BTN('📬 Envio diário', '/receber'), BTN('🎯 Odd mínima', '/odd')], [BTN('🧪 Estratégias', '/estrategias'), BTN('💼 Banca e ROI', '/banca')], [BTN('🏠 Menu', '/menu')]] };
const short = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + '.' : s;

async function answer(text: string, chatId: number, page = 1): Promise<Out> {
  const [rawCmd, ...rest] = text.trim().split(/\s+/);
  const cmd = norm(rawCmd.replace(/^\//, '').replace(/@.*$/, ''));
  const arg = rest.join(' ');
  const raw = '/' + [cmd, ...rest].join(' ');
  if (cmd === 'start' || cmd === 'inicio' || cmd === 'menu') {
    const d = await data().catch(() => null);
    const a = d ? open(d).filter(r => r.gr === 'A+' || r.gr === 'A').length : 0;
    const head = `<b>⚽ BLACK HOUSE · PROPS FUTEBOL</b>\n${d ? `<i>${dateBR(d.date)} · ${d.games.length} jogos · ${a} linhas nota A ou A+</i>\n` : ''}`;
    if (cmd === 'inicio') return { text: head + '\nO que você quer ver?', kb: HUB };
    return { text: head + `\nEscolha abaixo ou digite um comando (/ajuda).\n\n<i>Seu ID: <code>${chatId}</code></i>`, kb: MENU };
  }
  if (cmd === 'hoje') { const d = await data().catch(() => null); return { text: `<b>🔥 HOJE</b>\n${d ? `<i>${dateBR(d.date)} · ${d.games.length} jogos · atualizado ${hourBR(d.gen)}</i>\n` : ''}\nEscolha a lista:`, kb: HOJE }; }
  if (cmd === 'modelobh') return { text: `<b>🧠 MODELO BH</b>\nTaxa por 90 minutos de cada jogador × minutos esperados × contexto do jogo (o que o adversário cede, mando e árbitro), calibrado toda madrugada com o histórico real.\n\nSem linha de casa, os tops usam a linha de referência do modelo. Na sua casa a linha pode ser outra: confira em "Chance de uma linha".`, kb: MODELO_HUB };
  if (cmd === 'ontem') return ontemCmd(chatId);
  if (cmd === 'ajuda' || cmd === 'help' || cmd === 'comandos') return { text: HELP, kb: MENU };
  if (cmd === 'testes') return testesCmd(chatId, rest);
  if (cmd === 'receber' || cmd === 'envio') return receberCmd(chatId, rest);
  if (cmd === 'banca' || cmd === 'roi') return bancaCmd(chatId, rest);
  if (cmd === 'apagar') return apagarCmd(chatId, rest);
  if (cmd === 'resultado') return resultadoCmd(chatId, rest);
  if (cmd === 'estrategias' || cmd === 'estrategia') return estrategiasCmd(rest, chatId);
  if (cmd === 'gabarito') return gabaritoCmd();
  if (cmd === 'app') return { text: `📱 <b>App completo</b>\n${APP_URL}`, kb: { inline_keyboard: [[{ text: 'Abrir o app', url: APP_URL }], HOME] } };
  if (cmd === 'odd' || cmd === 'oddminima') return oddCmd(chatId, rest);
  const d = await data();
  // odd mínima do chat: as listas daqui para baixo usam este inRange/RANGE_TXT (mesmo nome, por chat)
  const om = await userMin(chatId), inRange = (r: Row) => inRangeBase(r) && okOdd(oddOf(r), om), RANGE_TXT = rangeTxt(om);
  if (cmd === 'modelo') return modeloCmd(d, rest, chatId);
  if (cmd === 'cacador' || cmd === 'hunter') return cacadorCmd(d, rest, page);
  if (cmd === 'tendencia' || cmd === 'tendencias') return tendenciaCmd(d);
  if (cmd === 'liberar' || cmd === 'bloquear' || cmd === 'acessos') return acessoCmd(cmd, rest, chatId);
  if ((cmd === 'sequencias' || cmd === 'sequencia') && ['times', 'time', 'jogo'].includes(norm(rest[0] ?? ''))) return seqTimesCmd(d, page);
  if (cmd === 'sequencias' || cmd === 'sequencia') return sequenciasCmd(d, rest, page);
  if (cmd === 'arbitros' || cmd === 'arbitro') return arbitrosCmd(d, page, await raiox());
  if (cmd === 'raiox' || cmd === 'raio') return raioxCmd(d, rest);
  if (cmd === 'topchutes' || cmd === 'topfaltas') { const k = cmd === 'topfaltas' ? 'faltas' : 'chutes'; const T = MT[k]; return list(d, tops(d, 10, om)[k], `${T.ic} TOP 10 MODELO BH · ${T.title}`, 10, raw, page, true, 'O Modelo BH ainda não rodou para os jogos de hoje, ou não há titulares prováveis com linha boa.', (d.rows.some(r => r.d) ? ' · melhor casa' : ' · linha de referência') + (om > ODD_MIN ? ` · odd ${n2(om)}+` : '')); }
  if (cmd === 'top') { const n = clampN(rest[0]); return list(d, open(d).filter(inRange), `🔥 TOP ${n} DO DIA`, n, raw, page, true, '', RANGE_TXT); }
  if (cmd === 'valor') return list(d, open(d).filter(r => r.d && r.e != null && r.e >= .03 && inRange(r)).sort((a, b) => (b.e! - a.e!)), '💰 VALOR COM ODD DE CASA', clampN(rest[0]), raw, page, true, '⏳ As odds entram quando as casas abrem as linhas e o leitor manda a foto. Tente mais perto dos jogos ou veja o Top do dia.', RANGE_TXT);
  if (cmd === 'seguras') return list(d, open(d).filter(r => r.p >= .65 && r.p <= .92 && r.st !== 'duvida' && r.st !== 'banco' && inRange(r) && (r.gr === 'A+' || r.gr === 'A')).sort((a, b) => (+!!b.d - +!!a.d) || b.p - a.p), '🛡️ MAIS SEGURAS (CHANCE ≥ 65%)', clampN(rest[0]), raw, page, true, '', RANGE_TXT);
  if (GROUPS[cmd]) { const g = GROUPS[cmd]; return list(d, open(d).filter(r => g.mk.includes(r.m) && inRange(r)), `${g.ic} ${g.title.toUpperCase()}`, clampN(rest[0]), raw, page, g.mk.length === 1, '', RANGE_TXT); }
  if (cmd === 'jogo') {
    const q = norm(arg);
    const pickKb = { inline_keyboard: [...d.games.map(g => [BTN(`${hourBR(g.utc)} ${LG[g.lg]?.[0] ?? ''} ${g.h} x ${g.a}`, `/jogo ${g.id}`)]), HOME] };
    if (!q) return { text: '<b>🏟️ Escolha o jogo</b>', kb: pickKb };
    const g = d.games.find(x => String(x.id) === q) ?? d.games.find(x => norm(x.h).includes(q) || norm(x.a).includes(q));
    if (!g) return { text: `Não achei jogo hoje com <b>${esc(arg)}</b>. Escolha abaixo:`, kb: pickKb };
    const out = list(d, d.rows.filter(r => r.g === g.id), `🏟️ ${g.h} x ${g.a} · ${hourBR(g.utc)}`, 16, `/jogo ${g.id}`, page, true, '', g.fase === 'escalacao' ? ' · escalação oficial' : ' · antes da escalação');
    (out.kb as { inline_keyboard: unknown[] } | undefined)?.inline_keyboard?.unshift([BTN('🔎 Raio-X do jogo', `/raiox ${g.id}`)]);
    return out;
  }
  if (cmd === 'jogador') {
    const q = norm(arg); if (q.length < 3) return { text: 'Digite o nome assim: <code>/jogador saka</code>', kb: { inline_keyboard: [HOME] } };
    const rows = d.rows.filter(r => r.k === 'p' && norm(r.n).includes(q)); if (!rows.length) return { text: `Nenhuma linha boa hoje para <b>${esc(arg)}</b>.`, kb: { inline_keyboard: [HOME] } };
    return list(d, rows, '👤 ' + rows[0].n.toUpperCase(), 12, raw, page, false);
  }
  if (cmd === 'multipla') return multipla(d, rest[0], om);
  if (cmd === 'jogos') {
    const rowsTxt = d.games.map(g => `${hourBR(g.utc)}  ${(short(g.h, 13) + ' x ' + short(g.a, 13)).padEnd(29)} ${short(LG[g.lg]?.[1] ?? '', 10)}`).join('\n');
    return { text: header(d, '🗓️ JOGOS DE HOJE') + (d.games.length ? `\n<pre>HORA   JOGO                          LIGA\n${rowsTxt}</pre>\n${d.houses?.length ? `<i>🏠 Casas lidas: ${d.houses.map(h => `${esc(h.house)} (${hourBR(h.at)})`).join(', ')}</i>\n` : ''}Toque num jogo para ver as linhas:` : '\nSem jogos das ligas do projeto hoje.'),
      kb: { inline_keyboard: [...d.games.slice(0, 30).map(g => [BTN(`${hourBR(g.utc)} ${g.h} x ${g.a}${g.fase === 'escalacao' ? ' ✅' : ''}`, `/jogo ${g.id}`)]), home('/jogos')] } };
  }
  if (cmd === 'desfalques') {
    const by = new Map<string, string[]>();
    for (const p of d.inj ?? []) { if (!by.has(p.t)) by.set(p.t, []); by.get(p.t)!.push(`${p.st === 'out' ? '🔴' : '🟡'} ${esc(p.n)}${p.why ? ` <i>(${esc(p.why)})</i>` : ''}`); }
    const teams = d.games.flatMap(g => [g.h, g.a]);
    const txt = teams.filter(t => by.has(t)).map(t => `<b>${esc(t)}</b>\n${by.get(t)!.join('\n')}`).join('\n\n');
    return { text: header(d, '🚑 DESFALQUES') + '\n' + (txt ? `<blockquote expandable>${txt}</blockquote>` : 'Nenhum desfalque listado.') + '\n<i>🔴 fora · 🟡 dúvida</i>', kb: { inline_keyboard: [home('/desfalques')] } };
  }
  if (cmd === 'resumo') {
    const o = open(d), a = o.filter(r => r.gr === 'A+' || r.gr === 'A'), ap = o.filter(r => r.gr === 'A+'), val = o.filter(r => r.d && (r.e ?? 0) >= .03);
    const out = (d.inj ?? []).filter(p => p.st === 'out').length, lu = d.games.filter(g => g.fase === 'escalacao').length;
    const top = o.find(inRange);
    const first = d.games.slice().sort((x, y) => x.utc.localeCompare(y.utc))[0];
    return { text: header(d, '📋 RESUMO DA RODADA') + `
<blockquote>🗓️ <b>${d.games.length}</b> jogos · primeiro às <b>${first ? hourBR(first.utc) : '–'}</b> · ✅ escalação em ${lu}
🔥 <b>${ap.length}</b> linhas A+ · ✅ <b>${a.length - ap.length}</b> linhas A
💰 <b>${val.length}</b> com valor na odd de casa
🚑 <b>${out}</b> desfalques confirmados</blockquote>
${top ? `⭐ <b>Destaque:</b> ${esc(top.n)}, mais de ${n1(top.l)} ${MK[top.m]} (${pc(top.p)}, nota ${top.nt})\n` : ''}` + FOOT, kb: MENU };
  }
  return { text: 'Não conheci esse comando. Escolha abaixo ou digite /ajuda.', kb: MENU };
}

async function sendCard(chatId: number, key: string) {
  const d = await data().catch(() => null);
  const r = d?.rows.find(x => keyOf(x) === key);
  if (!d || !r) { await TG('sendMessage', { chat_id: chatId, text: 'Essa entrada saiu da lista na última atualização. Abra o menu de novo.', reply_markup: MENU }); return; }
  const cap = `<b>${esc(r.gr)} · Nota ${r.nt} · ${esc(r.n)}</b>\nMais de ${n1(r.l)} ${MK[r.m] ?? r.m} · ${r.d ? `odd <b>${n2(r.d)}</b> ${esc(r.b ?? '')}` : `odd justa <b>${n2(1 / r.p)}</b>`}\n<i>${esc(vsTxt(r))} · ${hourBR(r.utc)}</i>\n<i>🔞 18+ · Aposte com responsabilidade</i>`;
  const res = await TG('sendPhoto', { chat_id: chatId, photo: cardUrl(d, r), caption: cap, parse_mode: 'HTML', reply_markup: { inline_keyboard: [HOME] } });
  if (!res.ok) await TG('sendMessage', { chat_id: chatId, text: card(d, r, 1) + '\n' + FOOT, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: { inline_keyboard: [HOME] } });
}
// 📄 PDF do dia (gerado pela coleta): entradas do método, maior chance por mercado, combinados, múltiplas e hora das odds
async function sendPDF(chatId: number, d?: Data) {
  d ??= await data().catch(() => undefined);
  if (!d) return false;
  const stale = (d.houses ?? []).some(h => Date.now() - Date.parse(h.at) >= 2 * 3600e3);
  const r = await TG('sendDocument', { chat_id: chatId, document: `${APP_URL}data/dia.pdf?v=${encodeURIComponent(d.gen)}`, parse_mode: 'HTML',
    caption: `📄 <b>PDF do dia</b> · ${dateBR(d.date)} · ${d.games.length} jogos\n<i>Entradas do método, maior chance por mercado, combinados e múltiplas. Odds lidas: ${(d.houses ?? []).map(h => `${esc(h.house)} ${hourBR(h.at)}`).join(', ') || 'nenhuma casa'}${stale ? ' ⏱️ (2 h+, confira)' : ''}.</i>`, disable_notification: quiet() }).catch(() => null);
  return !!r?.ok;
}
async function sendCards(chatId: number, arg?: string) {
  const d = await data().catch(() => null);
  if (!d) { await TG('sendMessage', { chat_id: chatId, text: 'Não consegui ler os dados agora. Tente de novo em instantes.' }); return; }
  const n = Math.max(1, Math.min(10, parseInt(arg ?? '', 10) || 5));
  const pick = open(d).filter(r => r.cd).slice(0, n);
  if (!pick.length) { await TG('sendMessage', { chat_id: chatId, text: 'Os cards do dia ainda estão sendo gerados (ou não há jogos hoje). Tente em alguns minutos ou veja o /top.', reply_markup: MENU }); return; }
  await TG('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: `<b>🖼️ AS ${pick.length} MELHORES DO DIA</b>\n<i>${dateBR(d.date)} · pela Nota BH · odds 1,40–3,50 · atualizado ${hourBR(d.gen)}</i>` });
  const cap = (r: Row) => `<b>${esc(r.gr)} · Nota ${r.nt} · ${esc(r.n)}</b>\nMais de ${n1(r.l)} ${MK[r.m] ?? r.m} · ${r.d ? `odd <b>${n2(r.d)}</b> ${esc(r.b ?? '')}` : `odd justa <b>${n2(1 / r.p)}</b>`}\n<i>${esc(vsTxt(r))} · ${hourBR(r.utc)}</i>`;
  const media = pick.map(r => ({ type: 'photo', media: cardUrl(d, r), caption: cap(r), parse_mode: 'HTML' }));
  const res = pick.length === 1 ? await TG('sendPhoto', { chat_id: chatId, photo: media[0].media, caption: media[0].caption, parse_mode: 'HTML' }) : await TG('sendMediaGroup', { chat_id: chatId, media });
  if (!res.ok) await TG('sendMessage', { chat_id: chatId, text: pick.map((r, i) => listCard(r, i + 1)).join('\n') + '\n' + FOOT, parse_mode: 'HTML', disable_web_page_preview: true });
  await TG('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: FOOT.trim(), reply_markup: { inline_keyboard: [[BTN('🔥 Top do dia em texto', '/top'), BTN('🎟️ Múltipla', '/multipla 3')], [BTN('🏠 Menu', '/menu')]] } });
}

async function handle(update: any) {
  const cq = update.callback_query;
  const msg = update.message ?? cq?.message;
  let text: string | undefined = update.message?.text ?? cq?.data;
  if (!msg || !text) return;
  const chatId: number = msg.chat.id;
  const allowed = (await cfg()).allowed;
  if (allowed.length && !allowed.includes(String(chatId))) {
    if (cq) await TG('answerCallbackQuery', { callback_query_id: cq.id });
    await TG('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: `🔒 <b>Bot fechado</b>\nO acesso é liberado por lista. Seu ID é <code>${chatId}</code>: já avisei o administrador. Quando ele liberar, você recebe uma mensagem aqui.` });
    // avisa o administrador uma vez por pessoa (marca REQ:<id>)
    const k = 'REQ:' + chatId, seen = await sb(`bot_config?key=eq.${k}&select=key`).catch(() => []);
    if (!seen?.length) {
      const u = update.message?.from ?? cq?.from ?? {}, who = [u.first_name, u.last_name].filter(Boolean).join(' ') + (u.username ? ` (@${u.username})` : '');
      await TG('sendMessage', { chat_id: +allowed[0], parse_mode: 'HTML', text: `🔔 <b>Pedido de acesso</b>\n${esc(who || 'sem nome')} · ID <code>${chatId}</code>\nPara liberar: <code>/liberar ${chatId}</code>`,
        reply_markup: { inline_keyboard: [[{ text: '✅ Liberar', callback_data: `/liberar ${chatId}` }]] } }).catch(() => null);
      await sb('bot_config?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key: k, value: who || '-' }) }).catch(() => null);
    }
    return;
  }
  if (!cq && KBMAP[text.trim()]) text = KBMAP[text.trim()];
  if (!cq && /^\/start(@\S+)?(\s|$)/i.test(text)) {
    // quem entra já recebe tudo (tops, estratégias e alertas); dá para desligar listas em /receber
    await sb('bot_subs?on_conflict=chat_id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ chat_id: chatId, est: true, top: true, chutes: true, faltas: true }) }).catch(() => null);
    await TG('sendMessage', { chat_id: chatId, text: '👇 Use os botões aqui embaixo para navegar: <b>Hoje</b>, <b>Modelo BH</b>, <b>Banca</b> e <b>Mais</b>.', parse_mode: 'HTML', reply_markup: RKB });
  }
  // registro de entrada: 📝 (bet/be:<chave>:<origem>), do /modelo (bm:pid:mk:linha), odd por botão (bo:id:odd), cancelar (bx:id)
  const bt = /^(bet|be|bm|bo|bx):(.+)$/.exec(text);
  if (bt) {
    if (cq) await TG('answerCallbackQuery', { callback_query_id: cq.id });
    let out: Out | null = null;
    try {
      if (bt[1] === 'bet' || bt[1] === 'be' || bt[1] === 'bm') {
        const d = await data();
        let r: Row | undefined, src = 'modelo';
        if (bt[1] !== 'bm') {
          const i = bt[2].lastIndexOf(':'); src = bt[2].slice(i + 1); const key = bt[2].slice(0, i);
          r = [...d.rows, ...(d.rowsU ?? [])].find(x => keyOf(x) === key);
          if (!r && !key.endsWith('|u')) { const [pid, mk, l] = key.split('|'); const base = d.rows.find(x => x.id === pid && x.m === mk); if (base) r = { ...base, l: +l, p: pAt(d, pid, mk, +l) ?? base.p }; }
        } else {
          const [pid, mk, line] = bt[2].split(':'); const m = d.mdl?.p?.[pid];
          if (m) r = { id: pid, n: m.n, t: m.tn, o: m.on, home: m.home, g: m.g, lg: 0, utc: m.utc, fase: '', k: 'p', m: mk, s: 'o', l: +line, p: pAt(d, pid, mk, +line) ?? .5, d: null, b: null, e: null, pj: 0, hit: null, h5: null, nt: null as unknown as number, gr: '' } as Row;
        }
        out = r ? await betStart(chatId, d, r, src) : { text: 'Essa entrada saiu da lista na última atualização. Abra a lista de novo.', kb: { inline_keyboard: [HOME] } };
      } else if (bt[1] === 'bo') { const [id, odd] = bt[2].split(':'); out = await betFinish(chatId, +id, odd); out ??= { text: 'Esse registro já foi concluído ou cancelado. Veja em /banca.', kb: { inline_keyboard: [HOME] } }; }
      else { await sb(`bets?id=eq.${+bt[2]}&chat_id=eq.${chatId}&status=eq.aguardando_odd`, { method: 'DELETE' }); out = { text: 'Registro cancelado.', kb: { inline_keyboard: [HOME] } }; }
    } catch (e) { out = { text: 'Não consegui registrar agora (' + esc(String((e as Error).message)) + ').', kb: { inline_keyboard: [HOME] } }; }
    const body = { chat_id: chatId, text: out!.text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: out!.kb };
    if (cq && bt[1] !== 'bet' && bt[1] !== 'bm') { const r = await TG('editMessageText', { ...body, message_id: msg.message_id }); if (!r.ok && !/not modified/i.test(r.description ?? '')) await TG('sendMessage', body); }
    else await TG('sendMessage', body);
    return;
  }
  if (!text.startsWith('/') && !cq) {
    const out = await betFinish(chatId, null, text).catch(() => null);
    if (out) { await TG('sendMessage', { chat_id: chatId, text: out.text, parse_mode: 'HTML', reply_markup: out.kb }); return; }
  }
  const cpm = /^cp:(chutes|faltas)$/.exec(text);
  if (cpm) {
    if (cq) await TG('answerCallbackQuery', { callback_query_id: cq.id });
    const d = await data().catch(() => null);
    await TG('sendMessage', { chat_id: chatId, text: d ? shareList(d, cpm[1]).slice(0, 4090) : 'Não consegui ler os dados agora.', parse_mode: 'HTML', disable_web_page_preview: true });
    return;
  }
  const im = /^i:(.+)$/.exec(text);
  if (im) { if (cq) await TG('answerCallbackQuery', { callback_query_id: cq.id }); await sendCard(chatId, im[1]); return; }
  if (/^\/pdf(@\S+)?(\s|$)/i.test(text)) { if (cq) await TG('answerCallbackQuery', { callback_query_id: cq.id }); if (!(await sendPDF(chatId))) await TG('sendMessage', { chat_id: chatId, text: 'O PDF do dia ainda não foi gerado. Tente de novo depois da próxima coleta (aos :20 e :50).' }); return; }
  if (/^\/cards(@\S+)?(\s|$)/i.test(text)) { if (cq) await TG('answerCallbackQuery', { callback_query_id: cq.id }); await sendCards(chatId, text.split(/\s+/)[1]); return; }
  let page = 1;
  const pm = /^([prx]):(\d+):(.+)$/.exec(text); let refreshed = false;
  if (pm) { page = pm[1] === 'x' ? -(+pm[2]) : +pm[2]; text = pm[3]; if (pm[1] === 'r') { CACHE = null; refreshed = true; } }
  if (cq) await TG('answerCallbackQuery', { callback_query_id: cq.id, ...(refreshed ? { text: '🔄 Dados atualizados' } : {}) });
  if (!text.startsWith('/')) { await TG('sendMessage', { chat_id: chatId, text: 'Escolha abaixo ou digite /ajuda.', reply_markup: MENU }); return; }
  let res: Out;
  try { res = await answer(text, chatId, page); } catch (e) { res = { text: 'Não consegui ler os dados agora (' + esc(String((e as Error).message)) + '). Tente de novo em instantes.', kb: { inline_keyboard: [HOME] } }; }
  const body = { chat_id: chatId, text: res.text.slice(0, 4090), parse_mode: 'HTML', disable_web_page_preview: true, ...(res.kb ? { reply_markup: res.kb } : {}) };
  if (cq) {
    const r = await TG('editMessageText', { ...body, message_id: msg.message_id });
    if (!r.ok && !/not modified/i.test(r.description ?? '')) await TG('sendMessage', body);
  } else await TG('sendMessage', body);
}

const json = (x: unknown) => new Response(JSON.stringify(x), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const { token: TOKEN, secret: SECRET } = await cfg();
  if (!TOKEN || !SECRET) return new Response('Falta configurar TELEGRAM_BOT_TOKEN e WEBHOOK_SECRET (tabela bot_config).', { status: 500 });
  if (req.method === 'GET') {
    if (url.searchParams.get('push') && url.searchParams.get('push') === SECRET)
      return json(await pushDaily(url.searchParams.get('force') === '1', +(url.searchParams.get('lead') || 0)).catch(e => ({ ok: false, erro: String(e) })));
    if (url.searchParams.get('morning') && url.searchParams.get('morning') === SECRET)
      return json(await morningPush(url.searchParams.get('force') === '1').catch(e => ({ ok: false, erro: String(e) })));
    if (url.searchParams.get('record') && url.searchParams.get('record') === SECRET) {
      CACHE = null;
      return json(await data().then(async d => d.demo ? { ok: true, skip: 'demonstração' } : d.date !== dayBR() ? { ok: true, skip: `dados de ${d.date}` } : { ok: true, date: d.date, gravados: await recordTops(d) }).catch(e => ({ ok: false, erro: String(e) })));
    }
    const rep = (await cfg()).report;
    if (rep && url.searchParams.get('csv') === rep) {
      const rows: any[] = await sb('top_picks?select=*&order=date.asc,list.asc,rank.asc&limit=10000').catch(() => []) ?? [];
      const head = ['data', 'lista', 'posicao', 'jogador', 'time', 'adversario', 'mercado', 'linha', 'odd', 'fonte_odd', 'chance_modelo', 'nota', 'resultado', 'status', 'lucro_u'];
      const q = (x: unknown) => { const t = x == null ? '' : String(x); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
      const body = rows.map(r => [r.date, r.list === 'chutes' ? 'Chutes' : 'Faltas e desarmes', r.rank, r.name, r.team, r.opp, MKN[r.mk] ?? r.mk, r.open_line ?? r.line, r.open_odd ?? r.odd, r.odd_src, r.p, r.nota, r.result,
        ({ aberta: 'Aberta', green: 'Green', red: 'Red', void: 'Anulada' } as Record<string, string>)[r.status] ?? r.status, r.status === 'aberta' ? '' : r.profit ?? '']);
      return new Response([head, ...body].map(l => l.map(q).join(',')).join('\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
    }
    if (url.searchParams.get('setup') !== SECRET) return new Response('ok');
    // dentro do Supabase o pedido chega como http e sem /functions/v1: o endereço público vem de SUPABASE_URL
    const self = `${Deno.env.get('SUPABASE_URL')}/functions/v1/telegram-bot`;
    const hook = await TG('setWebhook', { url: self, secret_token: SECRET, allowed_updates: ['message', 'callback_query'] });
    const cmds = await TG('setMyCommands', { commands: [
      ['top', 'Melhores do dia (ex.: /top 20)'], ['valor', 'Valor com odd de casa'], ['seguras', 'Chance de 65% ou mais'], ['chutes', 'Chutes'], ['nogol', 'Chutes ao gol'], ['primeiro', 'Chutes no 1º tempo'],
      ['faltas', 'Faltas cometidas'], ['sofridas', 'Faltas sofridas'], ['desarmes', 'Desarmes'], ['defesas', 'Defesas do goleiro'], ['times', 'Mercados de time'], ['totais', 'Totais do jogo'],
      ['jogo', 'Linhas de um jogo'], ['jogador', 'Linhas de um jogador'], ['cacador', 'Caçador de props (filtros)'], ['tendencia', 'Método Tendência'], ['sequencias', 'Sequências de 5+ jogos'], ['arbitros', 'Árbitros do dia'], ['raiox', 'Raio-X do jogo'], ['multipla', 'Múltipla (ex.: /multipla 3)'], ['jogos', 'Jogos de hoje'], ['desfalques', 'Desfalques'], ['resumo', 'Resumo da rodada'],
      ['cards', 'Melhores do dia em imagem'], ['pdf', 'PDF do dia'], ['modelo', 'Modelo BH: chance de qualquer linha'], ['testes', 'Testes do Modelo BH'], ['topchutes', 'Top 10 do modelo em chutes'], ['topfaltas', 'Top 10 em faltas e desarmes'],
      ['receber', 'Receber os tops todo dia'], ['odd', 'Odd mínima das entradas'], ['banca', 'Entradas registradas, lucro e ROI'], ['ontem', 'Resultado de ontem'], ['estrategias', 'Modelo por mercado: placar e entradas'], ['gabarito', 'Gabarito de ontem por mercado'],
      ['hoje', 'Listas de hoje'], ['acessos', 'Acessos ao bot (administrador)'], ['ajuda', 'Todos os comandos'], ['app', 'Abrir o app']].map(([command, description]) => ({ command, description })) });
    const me = await TG('getMe', {}), info = await TG('getWebhookInfo', {});
    return json({ ok: !!hook.ok, webhook: hook, endereco: info.result?.url, erro_recente: info.result?.last_error_message ?? null, comandos: cmds.ok, bot: me.result?.username ? '@' + me.result.username : null });
  }
  // alertas das estratégias: POST ?alertas=<WEBHOOK_SECRET> { entries: [...] } (chamado pela função estrategias)
  if (req.method === 'POST' && url.searchParams.get('alertas')) {
    if (url.searchParams.get('alertas') !== SECRET) return new Response('forbidden', { status: 403 });
    CACHE = null;
    const body = await req.json().catch(() => null);
    return json(await alertas(body?.entries ?? []).catch(e => ({ ok: false, erro: String(e) })));
  }
  if (req.headers.get('x-telegram-bot-api-secret-token') !== SECRET) return new Response('forbidden', { status: 403 });
  const update = await req.json().catch(() => null);
  if (update) await handle(update).catch(e => console.error(e));
  return new Response('ok');
});
