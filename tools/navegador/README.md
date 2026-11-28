# Leitores de casas (navegador)

Cada casa tem um leitor próprio que roda **no seu navegador**, na aba da casa aberta (como o da 99play na NBA):
nada de servidor fingindo ser navegador, proxy ou cabeçalho falso. O leitor junta as linhas de jogador e de time
dos jogos das ligas do projeto e manda uma "foto" para a função `linhas` do Supabase.

## Para onde mandar

```
POST https://mccxlgtiulpknubdiyrz.supabase.co/functions/v1/linhas?token=<LINHAS_TOKEN>
Content-Type: application/json
```

O `LINHAS_TOKEN` fica na tabela privada `bot_config` (nunca no repositório). No userscript, ele é digitado uma vez e
guardado no próprio Tampermonkey.

## Formato da foto

```json
{
  "house": "betano",
  "lines": [
    { "home": "Arsenal", "away": "Chelsea", "utc": "2026-11-14T15:00:00Z", "league": "Premier League",
      "type": "player", "player": "Bukayo Saka", "mk": "SOT", "line": 0.5, "odd": 1.95 },
    { "home": "Arsenal", "away": "Chelsea", "type": "team", "team": "Arsenal", "mk": "TSH", "line": 13.5, "odd": 1.83 },
    { "home": "Arsenal", "away": "Chelsea", "type": "match", "mk": "JFC", "line": 21.5, "odd": 1.90 }
  ]
}
```

- `home`/`away`: nomes como a casa escreve (o encaixe com a API-Football é por semelhança, com apelidos em português).
- `utc`: horário do jogo (opcional, ajuda a separar jogos com nomes parecidos).
- `type`: `player`, `team` ou `match`. Só a odd do **MAIS**.
- `mk` (mercado):

| Código | Mercado |
|---|---|
| SH | Chutes do jogador |
| SOT | Chutes ao gol do jogador |
| SH1 | Chutes do jogador no 1º tempo |
| SOT1 | Chutes ao gol do jogador no 1º tempo |
| FC | Faltas cometidas |
| FS | Faltas sofridas |
| TK | Desarmes |
| SV | Defesas do goleiro |
| TSH / TSOT / TFC | Chutes / chutes ao gol / faltas do time |
| JSH / JSOT / JFC | Chutes / chutes ao gol / faltas no jogo (total) |

A função descarta o que não estiver nesse formato e devolve quantas linhas guardou. Toda foto fica no banco
(`line_snapshots`): é o histórico de linhas para backtest e CLV. Sem foto nova, a coleta usa a última de cada casa por
até 18 horas.

## Casas mapeadas (14/11/2026)

| Casa | Leitor | Plataforma | Mercados de jogador | Time e jogo |
|---|---|---|---|---|
| 99play | `leitor-99play.user.js` | Altenar (widget `sb2frontend-altenar2.biahosted.com`, `integration=24games1`) | Chutes (15735), Chutes a Gol (15734), Defesas do Goleiro (17938) | Chutes do time (15728 casa / 15729 fora), Chutes a Gol do time (15726 / 15727), Totais chutes (15738), Totais chutes a gol (15737) |
| finta.win | `leitor-finta.user.js` (v0.1, 28/11) | a confirmar: o leitor descobre sozinho. Se for Altenar, pega o `integration` do próprio site e lê como a 99play; se não, mostra o botão "copiar diagnóstico" (só domínios e caminhos) para fazer o leitor certo | como a 99play, se for Altenar | como a 99play, se for Altenar |
| farra.bet | `leitor-farra.user.js` | própria (páginas prontas no servidor, botões com `data-mercado`/`data-rotulo`/`data-odd`) | Chutes do jogador, Faltas cometidas, Desarmes, Defesas do goleiro ("N ou mais" = mais de N−0,5) | Finalizações casa/fora, Chutes a gol casa/fora, Total de finalizações, Total de chutes a gol |

- **99play:** odd `typeId` 12 = MAIS, 13 = MENOS; `oddStatus` 0 = aberta. Ligas (`champIds`): Premier 2936, La Liga 2941,
  Serie A 2942, Bundesliga 2950, Ligue 1 2943, Brasileirão 11318, Champions 16808, Europa League 16809, Conference League 31608. Cada jogador vem com a escada
  0,5 / 1,5 / 2,5. Sem faltas, desarmes nem 1º tempo de jogador (pelo menos no Brasileirão).
- **farra:** ligas por código (`soccer_brazil_campeonato`, `soccer_epl`, `soccer_spain_la_liga`, `soccer_italy_serie_a`,
  `soccer_germany_bundesliga`, `soccer_france_ligue_one`, `soccer_uefa_champs_league`/`soccer_ls_32644`, Europa League `soccer_ls_30444`, Conference League `soccer_ls_45863`). Horário na lista
  como "Hoje 18:30" / "21/11 09:30" (Brasília). Chutes do jogador começam em 2+ (mais de 1,5). Sem chutes ao gol de jogador,
  faltas sofridas, faltas de time nem 1º tempo.
- **Ninguém abre:** faltas sofridas, chutes de jogador no 1º tempo, faltas do time/jogo. Esses mercados seguem só com a
  linha de referência do modelo.

## Como instalar

1. Instale a extensão **Tampermonkey** no Chrome ou Edge (no Chrome, ligue "Permitir scripts do usuário" nos detalhes da extensão).
2. Crie um script novo, cole o conteúdo do leitor e troque `__LINHAS_TOKEN__` pelo token (o arquivo pronto, com o token,
   é entregue fora do repositório).
3. Deixe uma aba de cada casa aberta e fixada (fora da economia de memória). O selo "BH ⚽" no canto mostra a última leitura.
4. Leitura de 30 em 30 min (aos :05 e :35), antes da coleta do GitHub (:20 e :50).
