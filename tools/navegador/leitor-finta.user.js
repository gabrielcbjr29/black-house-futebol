// ==UserScript==
// @name         Black House Futebol · leitor finta.win
// @namespace    blackhouse-futebol
// @version      0.1
// @description  Com uma aba da finta.win aberta no seu navegador, descobre a plataforma de apostas do site e, se for Altenar (a mesma da 99play), lê de 30 em 30 min as linhas de chutes, chutes ao gol e defesas e manda para o Black House Futebol. Se for outra plataforma, mostra um diagnóstico para copiar e mandar no chat.
// @match        https://finta.win/*
// @match        https://*.finta.win/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
// Roda dentro da página da finta, no seu navegador. Primeiro só OLHA quais endereços o próprio site já chamou
// (lista de recursos do navegador); não intercepta nada. Se achar a Altenar, pede os dados do mesmo jeito que o site pede.
// Nada de servidor, proxy ou cabeçalho falso. Instale no Tampermonkey e deixe uma aba fixada.
(() => {
  const TOKEN = '__LINHAS_TOKEN__'; // troque pelo LINHAS_TOKEN (o mesmo do leitor da 99play; fica só no seu Tampermonkey)
  const POST = 'https://mccxlgtiulpknubdiyrz.supabase.co/functions/v1/linhas?token=';
  const HOUSE = 'finta', KEY = 'bh_fut_finta_ultimo', LOCK = 'bh_fut_finta_lock', CFG = 'bh_fut_finta_altenar';
  // ligas do projeto (champIds da Altenar, iguais em todos os sites da plataforma)
  const CHAMPS = { 2936: 'Premier League', 2941: 'La Liga', 2942: 'Serie A', 2950: 'Bundesliga', 2943: 'Ligue 1', 11318: 'Brasileirão', 16808: 'Champions League', 16809: 'Europa League', 31608: 'Conference League' };
  const PLAYER = { 15735: 'SH', 15734: 'SOT', 17938: 'SV', 5025: 'SH1', 5026: 'SOT1', 31453: 'FC' };
  const TEAM = { 15728: ['TSH', 0], 15729: ['TSH', 1], 15726: ['TSOT', 0], 15727: ['TSOT', 1], 15732: ['TFC', 0], 15733: ['TFC', 1] };
  const MATCH = { 15738: 'JSH', 15737: 'JSOT', 15740: 'JFC' };
  const hhmm = t => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const lineOf = o => +(String(o.name).match(/(\d+(?:[.,]\d+)?)/)?.[1] ?? '').replace(',', '.');

  // ---------- 1. descobrir a plataforma pelos endereços que o site já carregou ----------
  const seen = new Set();
  const note = u => { try { const x = new URL(u, location.href); if (/^https?:$/.test(x.protocol)) seen.add(x.href); } catch {} };
  const scan = () => {
    for (const e of performance.getEntriesByType('resource')) note(e.name);
    for (const f of document.querySelectorAll('iframe[src],script[src]')) note(f.src);
  };
  try { new PerformanceObserver(l => l.getEntries().forEach(e => note(e.name))).observe({ type: 'resource', buffered: true }); } catch {}
  function altenar() {
    const saved = JSON.parse(localStorage.getItem(CFG) || 'null');
    for (const u of seen) {
      const m = u.match(/^(https:\/\/[^/]*(?:biahosted|altenar)[^/]*\/api\/widget\/)/i);
      const integ = new URL(u).searchParams.get('integration');
      if (m && integ) { const c = { base: m[1], integration: integ }; localStorage.setItem(CFG, JSON.stringify(c)); return c; }
      // sportsbook num iframe da Altenar: o endereço do iframe costuma trazer a integração
      if (/altenar|biahosted/i.test(u) && integ) { const c = { base: 'https://sb2frontend-altenar2.biahosted.com/api/widget/', integration: integ }; localStorage.setItem(CFG, JSON.stringify(c)); return c; }
    }
    return saved;
  }
  // diagnóstico: só endereços (domínio + caminho), sem parâmetros, sem token, sem dados seus
  function diagnostico() {
    scan();
    const hosts = new Map();
    for (const u of seen) { const x = new URL(u); if (/\.(png|jpe?g|webp|gif|svg|woff2?|ttf|css)$/i.test(x.pathname)) continue; const k = x.host + x.pathname.split('/').slice(0, 4).join('/'); hosts.set(k, (hosts.get(k) || 0) + 1); }
    return ['finta.win · diagnóstico BH ' + new Date().toISOString(), 'página: ' + location.pathname,
      ...[...hosts].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, n]) => `${n}× ${k}`)].join('\n');
  }

  // ---------- 2. coleta (plataforma Altenar) ----------
  async function coletar(c, horas = 36) {
    const qs = x => new URLSearchParams({ culture: 'pt-BR', timezoneOffset: '180', integration: c.integration, deviceType: '1', numFormat: 'en-GB', countryCode: 'BR', ...x });
    const get = async p => { const r = await fetch(c.base + p); if (!r.ok) throw new Error(p.split('?')[0] + ' ' + r.status); return r.json(); };
    const ev = await get('GetEvents?' + qs({ eventCount: '0', sportId: '66', champIds: Object.keys(CHAMPS).join(',') }));
    const now = Date.now(), comp = Object.fromEntries((ev.competitors || []).map(x => [x.id, x.name]));
    const events = (ev.events || []).filter(e => CHAMPS[e.champId] && Date.parse(e.startDate) > now && Date.parse(e.startDate) < now + horas * 3600e3);
    const lines = [], erros = [];
    for (const e of events) {
      try {
        const d = await get('GetEventDetails?' + qs({ eventId: String(e.id) }));
        const names = (d.competitors || []).map(x => x.name), [home, away] = names.length === 2 ? names : (e.competitorIds || []).map(i => comp[i]);
        const base = { home, away, utc: e.startDate, league: CHAMPS[e.champId] };
        const odds = Object.fromEntries((d.odds || []).map(o => [o.id, o]));
        const pick = (m, t) => (m.desktopOddIds || []).flat().map(i => odds[i]).filter(o => o && o.typeId === t && !o.oddStatus && o.price > 1);
        const team = Object.fromEntries((d.competitors || []).map(x => [x.id, x.name]));
        for (const m of d.childMarkets || []) {
          const mk = PLAYER[m.typeId]; if (!mk || !m.childName) continue;
          for (const o of pick(m, 12)) lines.push({ ...base, type: 'player', player: m.childName, team: team[m.competitorId], mk, line: lineOf(o), odd: o.price });
        }
        const ids = new Set();
        for (const m of d.markets || []) {
          if (ids.has(m.id)) continue; ids.add(m.id);
          if (TEAM[m.typeId]) {
            const [mk, side] = TEAM[m.typeId], tn = names.find(n => String(m.name).includes(n)) ?? (side ? away : home);
            for (const o of pick(m, 12)) lines.push({ ...base, type: 'team', team: tn, mk, line: lineOf(o), odd: o.price });
            for (const o of pick(m, 13)) lines.push({ ...base, type: 'team', team: tn, mk, line: lineOf(o), odd: o.price, side: 'u' });
          } else if (MATCH[m.typeId]) {
            for (const o of pick(m, 12)) lines.push({ ...base, type: 'match', mk: MATCH[m.typeId], line: lineOf(o), odd: o.price });
            for (const o of pick(m, 13)) lines.push({ ...base, type: 'match', mk: MATCH[m.typeId], line: lineOf(o), odd: o.price, side: 'u' });
          }
        }
      } catch (err) { erros.push(e.id + ': ' + err.message); }
      await sleep(400); // sem pressa: um jogo de cada vez
    }
    const key = x => [x.home, x.away, x.type, x.player ?? x.team ?? '', x.mk, x.line, x.side ?? 'o'].join('|'), u = new Map();
    for (const x of lines) if (x.line >= 0) u.set(key(x), x);
    return { jogos: events.length, lines: [...u.values()], erros };
  }

  // ---------- 3. selo no canto da tela ----------
  const badge = document.createElement('div');
  badge.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483647;font:12px/1.3 system-ui,sans-serif;background:#111;color:#9f9;padding:4px 8px;border-radius:6px;opacity:.9;max-width:70vw';
  const show = (txt, ok = true, btn = null) => {
    badge.textContent = 'BH ⚽ finta · ' + txt; badge.style.color = ok ? '#9f9' : '#fc6';
    if (btn) { const b = document.createElement('button'); b.textContent = btn.label; b.style.cssText = 'margin-left:8px;font:12px system-ui;cursor:pointer'; b.onclick = btn.fn; badge.appendChild(b); }
    if (!badge.isConnected) document.body.appendChild(badge);
  };
  const copiarDiag = async () => { const t = diagnostico(); try { await navigator.clipboard.writeText(t); show('diagnóstico copiado: cole no chat do Claude ✓'); } catch { console.log(t); show('não deu para copiar: abra o console (F12) e copie o texto de lá', false); } };

  async function ler() {
    scan();
    const c = altenar();
    if (!c) { show('ainda não reconheci a plataforma. Abra um jogo de futebol e espere 1 min, ou', false, { label: 'copiar diagnóstico', fn: copiarDiag }); return; }
    if (Date.now() - (+localStorage.getItem(LOCK) || 0) < 5 * 60e3) return; // outra aba já está lendo
    localStorage.setItem(LOCK, String(Date.now()));
    show('lendo as linhas…');
    try {
      if (TOKEN.startsWith('__')) throw new Error('falta o LINHAS_TOKEN no script');
      const foto = await coletar(c);
      if (!foto.lines.length) { localStorage.setItem(KEY, String(Date.now())); show(`${hhmm(Date.now())} · ${foto.jogos} jogos, nenhuma linha aberta`, foto.jogos > 0, foto.jogos ? null : { label: 'copiar diagnóstico', fn: copiarDiag }); return; }
      const r = await fetch(POST + TOKEN, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ house: HOUSE, lines: foto.lines }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error('envio ' + r.status + (j.erro ? ' ' + j.erro : ''));
      localStorage.setItem(KEY, String(Date.now()));
      show(`${hhmm(Date.now())} · ${foto.jogos} jogos, ${j.linhas} linhas ✓`);
    } catch (err) {
      show(`${hhmm(Date.now())} · erro: ${err.message} (tento de novo em 10 min)`, false, { label: 'copiar diagnóstico', fn: copiarDiag });
      localStorage.setItem(KEY, String(Date.now() - 20 * 60e3));
    } finally { localStorage.removeItem(LOCK); }
  }
  window.__bhFintaDiag = diagnostico; // no console: __bhFintaDiag()
  window.__bhFintaColetar = () => coletar(altenar()); // no console: await __bhFintaColetar()
  const last = () => +localStorage.getItem(KEY) || 0;
  const due = () => { const m = new Date().getMinutes(); return Date.now() - last() > 30 * 60e3 || ((m >= 5 && m < 20) || (m >= 35 && m < 50)) && Date.now() - last() > 25 * 60e3; };
  setTimeout(() => { if (Date.now() - last() > 25 * 60e3) ler(); else show(`última leitura ${hhmm(last())} ✓`); }, 15000);
  setInterval(() => { if (due() || !altenar()) ler(); }, 60e3);
})();
