// ==UserScript==
// @name         Black House Futebol · leitor 99play
// @namespace    blackhouse-futebol
// @version      1.0
// @description  Com uma aba da 99play aberta no seu navegador, lê de 30 em 30 min as linhas de chutes, chutes ao gol e defesas (jogador, time e jogo) das ligas do projeto e manda para o Black House Futebol.
// @match        https://99play.io/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
// Roda dentro da página da 99play, no seu navegador, pedindo os dados do mesmo jeito que o próprio site pede
// (plataforma Altenar). Nada de servidor, proxy ou cabeçalho falso. Instale no Tampermonkey e deixe uma aba fixada.
(() => {
  const TOKEN = '__LINHAS_TOKEN__'; // troque pelo LINHAS_TOKEN (fica só no seu Tampermonkey, nunca no repositório)
  const POST = 'https://mccxlgtiulpknubdiyrz.supabase.co/functions/v1/linhas?token=';
  const HOUSE = '99play', KEY = 'bh_fut_99_ultimo', LOCK = 'bh_fut_99_lock';
  const BASE = 'https://sb2frontend-altenar2.biahosted.com/api/widget/';
  // ligas do projeto (champIds da Altenar)
  const CHAMPS = { 2936: 'Premier League', 2941: 'La Liga', 2942: 'Serie A', 2950: 'Bundesliga', 2943: 'Ligue 1', 11318: 'Brasileirão', 16808: 'Champions League' };
  // mercados de jogador (childMarkets) e de time/jogo (markets). Odd typeId 12 = MAIS, 13 = MENOS; oddStatus 0 = aberta
  const PLAYER = { 15735: 'SH', 15734: 'SOT', 17938: 'SV' };
  const TEAM = { 15728: ['TSH', 0], 15729: ['TSH', 1], 15726: ['TSOT', 0], 15727: ['TSOT', 1] };
  const MATCH = { 15738: 'JSH', 15737: 'JSOT' };
  const qs = x => new URLSearchParams({ culture: 'pt-BR', timezoneOffset: '180', integration: '24games1', deviceType: '1', numFormat: 'en-GB', countryCode: 'BR', ...x });
  const get = async p => { const r = await fetch(BASE + p); if (!r.ok) throw new Error(p.split('?')[0] + ' ' + r.status); return r.json(); };
  const hhmm = t => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const lineOf = o => +(String(o.name).match(/(\d+(?:[.,]\d+)?)/)?.[1] ?? '').replace(',', '.');

  async function coletar(horas = 36) {
    const ev = await get('GetEvents?' + qs({ eventCount: '0', sportId: '66', champIds: Object.keys(CHAMPS).join(',') }));
    const now = Date.now(), comp = Object.fromEntries((ev.competitors || []).map(c => [c.id, c.name]));
    const events = (ev.events || []).filter(e => CHAMPS[e.champId] && Date.parse(e.startDate) > now && Date.parse(e.startDate) < now + horas * 3600e3);
    const lines = [], erros = [];
    for (const e of events) {
      try {
        const d = await get('GetEventDetails?' + qs({ eventId: String(e.id) }));
        const names = (d.competitors || []).map(c => c.name), [home, away] = names.length === 2 ? names : (e.competitorIds || []).map(i => comp[i]);
        const base = { home, away, utc: e.startDate, league: CHAMPS[e.champId] };
        const odds = Object.fromEntries((d.odds || []).map(o => [o.id, o]));
        const overs = m => (m.desktopOddIds || []).flat().map(i => odds[i]).filter(o => o && o.typeId === 12 && !o.oddStatus && o.price > 1);
        const team = Object.fromEntries((d.competitors || []).map(c => [c.id, c.name]));
        for (const m of d.childMarkets || []) {
          const mk = PLAYER[m.typeId]; if (!mk || !m.childName) continue;
          for (const o of overs(m)) lines.push({ ...base, type: 'player', player: m.childName, team: team[m.competitorId], mk, line: lineOf(o), odd: o.price });
        }
        const seen = new Set();
        for (const m of d.markets || []) {
          if (seen.has(m.id)) continue; seen.add(m.id);
          if (TEAM[m.typeId]) {
            const [mk, side] = TEAM[m.typeId];
            const tn = names.find(n => String(m.name).includes(n)) ?? (side ? away : home);
            for (const o of overs(m)) lines.push({ ...base, type: 'team', team: tn, mk, line: lineOf(o), odd: o.price });
          } else if (MATCH[m.typeId]) for (const o of overs(m)) lines.push({ ...base, type: 'match', mk: MATCH[m.typeId], line: lineOf(o), odd: o.price });
        }
      } catch (err) { erros.push(e.id + ': ' + err.message); }
      await sleep(400); // sem pressa: um jogo de cada vez
    }
    // tira repetidos (o mesmo mercado aparece em mais de um grupo)
    const key = x => [x.home, x.away, x.type, x.player ?? x.team ?? '', x.mk, x.line].join('|'), u = new Map();
    for (const x of lines) if (x.line >= 0) u.set(key(x), x);
    return { house: HOUSE, jogos: events.length, lines: [...u.values()], erros };
  }

  // selo discreto no canto da tela com o status da última leitura
  const badge = document.createElement('div');
  badge.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483647;font:12px/1.3 system-ui,sans-serif;background:#111;color:#9f9;padding:4px 8px;border-radius:6px;opacity:.85;pointer-events:none';
  const show = (txt, ok = true) => { badge.textContent = 'BH ⚽ ' + txt; badge.style.color = ok ? '#9f9' : '#f99'; if (!badge.isConnected) document.body.appendChild(badge); };
  async function ler() {
    if (Date.now() - (+localStorage.getItem(LOCK) || 0) < 5 * 60e3) return; // outra aba já está lendo
    localStorage.setItem(LOCK, String(Date.now()));
    show('lendo as linhas…');
    try {
      if (TOKEN.startsWith('__')) throw new Error('falta o LINHAS_TOKEN no script');
      const foto = await coletar();
      if (!foto.lines.length) { localStorage.setItem(KEY, String(Date.now())); show(`${hhmm(Date.now())} · ${foto.jogos} jogos, nenhuma linha aberta`); return; }
      const r = await fetch(POST + TOKEN, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ house: HOUSE, lines: foto.lines }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error('envio ' + r.status + (j.erro ? ' ' + j.erro : ''));
      localStorage.setItem(KEY, String(Date.now()));
      show(`${hhmm(Date.now())} · ${foto.jogos} jogos, ${j.linhas} linhas ✓`);
    } catch (err) {
      show(`${hhmm(Date.now())} · erro: ${err.message} (tento de novo em 10 min)`, false);
      localStorage.setItem(KEY, String(Date.now() - 20 * 60e3)); // nova tentativa em ~10 min
    } finally { localStorage.removeItem(LOCK); }
  }
  window.__bhColetar99 = coletar; // para conferir à mão no console: await __bhColetar99()
  // lê de 30 em 30 min, nos :05 e :35 (a coleta do GitHub roda aos :20 e :50), e logo ao abrir se a última tiver mais de 25 min
  const last = () => +localStorage.getItem(KEY) || 0;
  const due = () => { const m = new Date().getMinutes(); return Date.now() - last() > 30 * 60e3 || ((m >= 5 && m < 20) || (m >= 35 && m < 50)) && Date.now() - last() > 25 * 60e3; };
  setTimeout(() => { if (Date.now() - last() > 25 * 60e3) ler(); else show(`última leitura ${hhmm(last())} ✓`); }, 8000);
  setInterval(() => { if (due()) ler(); }, 60e3);
})();
