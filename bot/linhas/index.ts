// Recebe as fotos de linhas das casas (lidas no navegador do usuário, um leitor por casa) e entrega a mais recente
// de cada casa para a coleta do GitHub.
//   POST ?token=<LINHAS_TOKEN>  corpo { house, lines: [...] } (formato em tools/navegador/README.md)
//   GET  ?latest=1              { houses: [{ house, taken_at, payload }] } (última foto de cada casa, até 18 h)
// Toda foto fica guardada (line_snapshots): é o histórico de linhas reais para backtest e CLV.
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type' };
const json = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
async function sb(path: string, init: RequestInit = {}) {
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const r = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { apikey: key!, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error('banco ' + r.status + ' ' + (await r.text()).slice(0, 160));
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
// O leitor 99play do projeto da NBA (Tampermonkey no PC do usuário) também lê o futebol desde 28/11 e manda com o token dele.
// Este projeto não guarda esse token: confere com a própria função da NBA, que só entrega o script com o token certo.
const NBA_OK = new Set<string>();
async function tokenNBA(t: string) {
  if (NBA_OK.has(t)) return true;
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(t)) return false;
  const r = await fetch('https://brtexfomhlvltdsuezsi.supabase.co/functions/v1/c99-ingest/leitor99.user.js?token=' + encodeURIComponent(t)).catch(() => null);
  if (r) await r.body?.cancel();
  if (r?.status === 200) { NBA_OK.add(t); return true; }
  return false;
}
const MK = new Set(['SH', 'SOT', 'SH1', 'SOT1', 'FC', 'FS', 'TK', 'SV', 'TSH', 'TSOT', 'TFC', 'JSH', 'JSOT', 'JFC']);
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  try {
    if (req.method === 'GET') {
      if (!url.searchParams.get('latest')) return json({ ok: true });
      const rows = await sb('rpc/latest_lines', { method: 'POST', body: '{}' }) ?? [];
      return json({ houses: rows.map((r: any) => ({ house: r.house, taken_at: r.taken_at, payload: r.payload })) });
    }
    const tok = (await sb('bot_config?key=eq.LINHAS_TOKEN&select=value'))?.[0]?.value, got = url.searchParams.get('token') ?? '';
    if (!got || (got !== tok && !(await tokenNBA(got)))) return json({ ok: false, erro: 'token' }, 403);
    const raw = await req.text();
    if (raw.length > 8_000_000) return json({ ok: false, erro: 'grande demais' }, 413);
    const p = JSON.parse(raw);
    const house = String(p?.house ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30);
    if (!house || !Array.isArray(p?.lines)) return json({ ok: false, erro: 'formato: { house, lines: [...] }' }, 400);
    // só o que o modelo usa: mercado conhecido, linha e odd válidas (MAIS; MENOS vem com side 'u', só em time e jogo)
    const lines = p.lines.filter((x: any) => MK.has(x?.mk) && +x.line >= 0 && +x.odd > 1 && x.home && x.away && (x.type === 'match' || x.team || x.player))
      .map((x: any) => ({ home: String(x.home).slice(0, 60), away: String(x.away).slice(0, 60), utc: x.utc ?? null, league: x.league ?? null, type: x.type === 'team' || x.type === 'match' ? x.type : 'player',
        player: x.player ? String(x.player).slice(0, 60) : undefined, team: x.team ? String(x.team).slice(0, 60) : undefined, mk: x.mk, line: +x.line, odd: +x.odd, side: x.side === 'u' ? 'u' : undefined }));
    await sb('line_snapshots', { method: 'POST', body: JSON.stringify({ house, n_lines: lines.length, payload: { lines } }) });
    return json({ ok: true, house, linhas: lines.length, descartadas: p.lines.length - lines.length });
  } catch (e) { return json({ ok: false, erro: String((e as Error).message) }, 500); }
});
