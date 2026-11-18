# CLAUDE.md · Black House Futebol

Contexto para o Claude Code continuar este projeto. **Responda sempre em português (Brasil).** O dono é tipster;
fuso America/Sao_Paulo (o "dia" do projeto segue Brasília).

## O que é
Props de futebol com modelo próprio (Modelo BH), copiando a arquitetura do Black House da NBA (fábrica de estratégias).
- Jogador: chutes, chutes ao gol, chutes 1º tempo, no gol 1º tempo, faltas cometidas, faltas sofridas, desarmes, defesas.
- Time e jogo: chutes, chutes ao gol, faltas (MAIS; MENOS só com linha de casa, em `rowsU`).
- Ligas: PL, La Liga, Serie A, Bundesliga, Ligue 1, Brasileirão, Champions (`config/leagues.js`).
- Fábrica de estratégias: papel → ROI/CLV → stake. Só sai do papel com 50+ entradas, ROI+ e CLV+; revisão com 150–200.
- Valuestats (valuestats.com) é a **referência de funcionalidades** do usuário. Os termos dele proíbem copiar e
  redistribuir o conteúdo e o robots.txt bloqueia /api/, então **não raspe nem use dados do Valuestats**: as ideias
  dele foram refeitas com o nosso histórico (Raio-X, tendências L x/y, árbitros completos).

## Arquitetura
```
API-Football Pro ─► GitHub Actions (relogio.yml dispara atualizar.yml às :20 e :50, 24h)
   testes → histórico (data/hist/*.ndjson) → calibração → build (slate, bot, hunt, raiox, strategies, results) → commit → cards + PDF → Pages
Tarefa agendada "Black House Futebol · Linhas da 99play" (navegador do app Claude no PC do usuário, :05 e :35) e
leitores Tampermonkey (99play, farra) ─► função linhas (Supabase)
Supabase mccxlgtiulpknubdiyrz: telegram-bot · estrategias · linhas · pg_cron (supabase/cron.sql)
```
| Caminho | Papel |
|---|---|
| `collector/history.js` | histórico próprio; layout das linhas `P` (jogador) e `T` (time) |
| `collector/profiles.js` | médias da liga, times, jogadores (hx, ss, sq), árbitro (`refKey`), defesa por posição |
| `collector/model.js` | modelo do dia (abertura e escalação) |
| `public/engine.js` | matemática (binomial negativa, P(mais), EV, Nota BH), compartilhada app/coleta |
| `collector/lines.js` | encaixe das linhas das casas (nome do jogador estrito; testes em `test/lines.test.js`) |
| `collector/botdata.js` | `bot.json` / `hunt.json` |
| `collector/strategies.js` | estratégias m-*/t-*/j-*, top10-forte, oport-forte, tendencia |
| `collector/raiox.js` + `public/raiox-lib.js` | Raio-X do jogo, tendências L x/y (time, jogo, jogador), árbitros → `raiox.json` |
| `public/` | PWA (app.js, hunter.js, raiox.js, avatar.js, sw.js — **suba a versão do cache ao mudar o shell**) |
| `bot/telegram/index.ts` | bot (Deno) |
| `bot/estrategias/index.ts` | registro, alerta, monitor de risco, conferência |
| `bot/linhas/index.ts` | recebe as fotos dos leitores |
| `tools/navegador/` | leitores das casas (placeholder `__LINHAS_TOKEN__`, nunca o token real) |
| `tools/c99-reader-futebol.js` | o mesmo leitor da 99play em formato de tarefa agendada (javascript_tool na aba da 99play); o token é lido da `bot_config` na hora |
| `scripts/cards.mjs`, `scripts/pdf.mjs` | imagens e PDF do dia (Playwright) |

## Regras (não negociáveis)
- **Segredos:** nada de chave, token ou senha no repositório (é público). Ficam nos secrets do GitHub e na tabela
  privada `bot_config`. Não reimprima segredos em respostas.
- **Casas:** os sites das casas só são lidos no navegador do usuário (leitores). Nada de proxy, servidor fingindo ser
  navegador ou cabeçalhos falsos; não contornar bloqueios de sites.
- **Conteúdo:** sem fotos de pessoas reais (avatar = camisa do clube); todo conteúdo com 🔞 18+ e aviso de jogo
  responsável. Não estimar odd para alerta (sem odd de casa, só "odd justa" informativa).
- **Estratégias:** não mude a regra de uma estratégia que já tem histórico; crie uma versão nova.
- **Etapas:** implemente por etapas e mostre o resultado de cada uma.
- **Testes:** `npm test` precisa passar antes de qualquer push (o CI roda os testes e não publica se falhar).
- **Banco:** migrações no Supabase só com aprovação do usuário naquele momento. Se uma der timeout, não repita na mesma hora.
- **Regulatório:** a MP 1.394/2026 (vigente desde 25/09/2026) proíbe oferta de aposta de quota fixa a quem está no
  Brasil e a publicidade. As casas usadas operam contra isso e a distribuição pelo bot pode contar como publicidade.
  Já foi avisado (não somos advogados); o bot está fechado (`ALLOWED_CHATS`, primeiro ID = admin; /liberar, /bloquear, /acessos).

## Deploy das funções do Supabase
As funções são carregadores de uma linha que importam o código do repositório fixado por commit:
```ts
// Carregador: o código fica no repositório público, fixado pelo commit (publicar = commit, push e trocar o hash aqui).
import 'https://raw.githubusercontent.com/gabrielcbjr29/black-house-futebol/<HASH>/bot/telegram/index.ts';
```
Publicar: commit → push → deploy do carregador com o hash novo (`verify_jwt: false`). A função `linhas` é publicada
com o código inteiro (inline). Ao mudar a lista de comandos do bot: chamar `<url>/telegram-bot?setup=<WEBHOOK_SECRET>`.
A máquina de desenvolvimento pode não alcançar supabase.co/github.io; teste pelo pg_net ou pelo pipeline.

## Comandos úteis
- `npm test` · `npm run demo` (dados simulados em public/data) · `npm run serve` (app em localhost:8080)
- `node collector/build.js` precisa de `APIFOOTBALL_KEY` (só no CI); `node collector/bot.js` refaz bot.json sem gastar a API
- Checar o bot localmente: `deno check bot/telegram/index.ts`

## Pendências conhecidas
- 99play: lida pela tarefa agendada (precisa do PC ligado com o app Claude aberto). farra.bet: só pelo Tampermonkey, ainda não instalado.
- Escanteios, cartões e gols aparecem só como informação (Raio-X); modelo e estratégias continuam nos mercados de sempre.
- Doc de estado no projeto do claude.ai: `claude/black-house-futebol-estado.md`.
