# Black House Futebol

Props de futebol com modelo próprio, na mesma arquitetura e lógica do Black House da NBA: coleta e modelo no GitHub
Actions, app PWA no GitHub Pages, bot do Telegram e fábrica de estratégias no Supabase (projeto `black-house-futebol`,
separado do da NBA, com segredos próprios).

**Mercados (só MAIS; as casas não abrem o "menos"):**
jogador: chutes, chutes ao gol, chutes no 1º tempo, chutes ao gol no 1º tempo, faltas cometidas, faltas sofridas,
desarmes, defesas do goleiro · time: chutes, chutes ao gol e faltas (do time e total do jogo).

**Ligas (v1):** Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Brasileirão e Champions League.

**Casas:** qualquer casa, sem uma principal. Cada casa ganha um leitor no navegador (ver `tools/navegador/`); a coleta
usa a melhor odd entre as casas lidas. Sem casa, o app mostra a odd justa da linha de referência do modelo.

## Como funciona

```
API-Football (Pro) ──► GitHub Actions (:20 e :50, 6h–23h50) ──► GitHub Pages (app + JSONs)
                          │ histórico → perfis → modelo → linhas      │ bot.json, strategies.json, results.json
Leitores no navegador ──► Supabase: função linhas ────────────────────┘
                          Supabase: estrategias (papel, alerta, risco, conferência) · telegram-bot · pg_cron
```

| Caminho | Função |
|---|---|
| `config/leagues.js` | Ligas e temporadas (IDs da API-Football) |
| `collector/history.js` | Histórico próprio, jogo a jogo (`data/hist/*.ndjson`), incremental |
| `collector/profiles.js` | Médias da liga, força dos times, taxas por 90 dos jogadores, titularidade, árbitro |
| `collector/model.js` | Modelo do dia: projeção dos times e dos jogadores, nas fases abertura e escalação |
| `public/engine.js` | Matemática do Modelo BH (binomial negativa, P(mais), EV, Nota BH), usada no app e na coleta |
| `collector/lines.js` | Linhas das casas: encaixe de jogo, jogador e time por nome |
| `collector/botdata.js` | Linhas do bot e do app (`bot.json`) |
| `collector/strategies.js` | Uma estratégia por mercado (papel) |
| `collector/raiox.js`, `public/raiox-lib.js` | Raio-X do jogo, tendências L x/y e árbitros completos (`raiox.json`), no estilo do Valuestats com dados próprios |
| `collector/calibrate.js` | Validação walk-forward com o histórico real (`calib.json`) e k calibrado |
| `collector/demo.js` | Dados simulados para testes e demonstração |
| `bot/telegram`, `bot/estrategias`, `bot/linhas` | Funções do Supabase |
| `supabase/schema.sql`, `supabase/cron.sql` | Banco e agendamentos |

## Comandos

```
npm test            # roda antes de cada publicação (se falhar, nada é publicado)
npm run historico   # preenche o histórico (precisa de APIFOOTBALL_KEY)
npm run update      # coleta do dia completa
npm run calibrar    # validação do modelo com o histórico
npm run demo        # gera dados simulados em public/data
npm run serve       # app em http://localhost:8080
```

🔞 18+ · Apostas podem causar dependência. Jogue com responsabilidade.
