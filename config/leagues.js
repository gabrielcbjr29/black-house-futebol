// Ligas da primeira versão (escolha do usuário em 13/11/2026). IDs da API-Football.
// "season" segue a regra da API-Football: o ano em que a temporada começa (2026 = 2026/27 na Europa; 2026 no Brasil).
export const LEAGUES = [
  { id: 39, key: 'PL', name: 'Premier League', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', season: 2026 },
  { id: 140, key: 'LL', name: 'La Liga', flag: '🇪🇸', season: 2026 },
  { id: 135, key: 'SA', name: 'Serie A', flag: '🇮🇹', season: 2026 },
  { id: 78, key: 'BL', name: 'Bundesliga', flag: '🇩🇪', season: 2026 },
  { id: 61, key: 'L1', name: 'Ligue 1', flag: '🇫🇷', season: 2026 },
  { id: 71, key: 'BR', name: 'Brasileirão', flag: '🇧🇷', season: 2026 },
  { id: 2, key: 'UCL', name: 'Champions League', flag: '🏆', season: 2026, cup: true },
  // incluídas em 26/11/2026 (pedido do usuário): copas, como a Champions
  { id: 3, key: 'UEL', name: 'Europa League', flag: '🟠', season: 2026, cup: true },
  { id: 848, key: 'UECL', name: 'Conference League', flag: '🟢', season: 2026, cup: true },
];
// temporadas guardadas no histórico: a atual e a anterior (base para o começo de temporada e para quem trocou de time)
export const HIST_SEASONS = [2025, 2026];
export const LEAGUE_BY_ID = Object.fromEntries(LEAGUES.map(l => [l.id, l]));
export const LEAGUE_IDS = new Set(LEAGUES.map(l => l.id));
// copas europeias: entram no modelo na escala da liga de cada jogo, mas não definem a liga do time nem o ranking de defesa
export const CUP_IDS = new Set(LEAGUES.filter(l => l.cup).map(l => l.id));
// ligas das estratégias em papel (as 7 de quando elas começaram): a Europa e a Conference ficam de fora para não mudar
// a regra de nenhuma estratégia com histórico (se forem entrar, é com versão nova)
export const STRAT_LEAGUES = new Set([39, 140, 135, 78, 61, 71, 2]);
// o "dia" do projeto segue o horário de Brasília (jogos o dia todo, da Europa ao Brasileirão)
export const TZ = 'America/Sao_Paulo';
export const dayBR = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
