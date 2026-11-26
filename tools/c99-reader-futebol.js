// Leitor das linhas de futebol da 99play para a tarefa agendada (mesma estrutura do Black House NBA).
// Roda na aba da 99play aberta no navegador do app Claude, no computador do usuário, pedindo os dados do mesmo jeito
// que o próprio site pede (Altenar). Nada de servidor, proxy ou cabeçalho falso.
// Uso: abrir https://99play.io/ e executar com javascript_tool, trocando __LINHAS_TOKEN__ pelo LINHAS_TOKEN
// (lido da tabela bot_config na hora; o token nunca fica no repositório nem no texto da tarefa).
// Mesma lógica do tools/navegador/leitor-99play.user.js (Tampermonkey): mudou só o jeito de disparar.
await (async (TOKEN) => {
  const POST = 'https://mccxlgtiulpknubdiyrz.supabase.co/functions/v1/linhas?token=';
  const BASE = 'https://sb2frontend-altenar2.biahosted.com/api/widget/';
  const CHAMPS = { 2936: 'Premier League', 2941: 'La Liga', 2942: 'Serie A', 2950: 'Bundesliga', 2943: 'Ligue 1', 11318: 'Brasileirão', 16808: 'Champions League', 16809: 'Europa League', 31608: 'Conference League' };
  const PLAYER = { 15735: 'SH', 15734: 'SOT', 17938: 'SV' };
  const TEAM = { 15728: ['TSH', 0], 15729: ['TSH', 1], 15726: ['TSOT', 0], 15727: ['TSOT', 1] };
  const MATCH = { 15738: 'JSH', 15737: 'JSOT' };
  const qs = x => new URLSearchParams({ culture: 'pt-BR', timezoneOffset: '180', integration: '24games1', deviceType: '1', numFormat: 'en-GB', countryCode: 'BR', ...x });
  const get = async p => { const r = await fetch(BASE + p); if (!r.ok) throw new Error(p.split('?')[0] + ' ' + r.status); return r.json(); };
  const lineOf = o => +(String(o.name).match(/(\d+(?:[.,]\d+)?)/)?.[1] ?? '').replace(',', '.');
  const ev = await get('GetEvents?' + qs({ eventCount: '0', sportId: '66', champIds: Object.keys(CHAMPS).join(',') }));
  const now = Date.now(), comp = Object.fromEntries((ev.competitors || []).map(c => [c.id, c.name]));
  const events = (ev.events || []).filter(e => CHAMPS[e.champId] && Date.parse(e.startDate) > now && Date.parse(e.startDate) < now + 36 * 3600e3);
  const lines = [], erros = [];
  for (const e of events) {
    try {
      const d = await get('GetEventDetails?' + qs({ eventId: String(e.id) }));
      const names = (d.competitors || []).map(c => c.name), [home, away] = names.length === 2 ? names : (e.competitorIds || []).map(i => comp[i]);
      const base = { home, away, utc: e.startDate, league: CHAMPS[e.champId] };
      const odds = Object.fromEntries((d.odds || []).map(o => [o.id, o]));
      const pick = (m, t) => (m.desktopOddIds || []).flat().map(i => odds[i]).filter(o => o && o.typeId === t && !o.oddStatus && o.price > 1);
      const team = Object.fromEntries((d.competitors || []).map(c => [c.id, c.name]));
      for (const m of d.childMarkets || []) {
        const mk = PLAYER[m.typeId]; if (!mk || !m.childName) continue;
        for (const o of pick(m, 12)) lines.push({ ...base, type: 'player', player: m.childName, team: team[m.competitorId], mk, line: lineOf(o), odd: o.price });
      }
      const seen = new Set();
      for (const m of d.markets || []) {
        if (seen.has(m.id)) continue; seen.add(m.id);
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
    await new Promise(r => setTimeout(r, 400)); // sem pressa: um jogo de cada vez
  }
  const key = x => [x.home, x.away, x.type, x.player ?? x.team ?? '', x.mk, x.line, x.side ?? 'o'].join('|'), u = new Map();
  for (const x of lines) if (x.line >= 0) u.set(key(x), x);
  if (!u.size) return { jogos: events.length, linhas: 0, envio: null, erros };
  const r = await fetch(POST + TOKEN, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ house: '99play', lines: [...u.values()] }) });
  return { jogos: events.length, linhas: u.size, envio: r.status, resposta: await r.json().catch(() => null), erros: erros.slice(0, 5) };
})('__LINHAS_TOKEN__');
