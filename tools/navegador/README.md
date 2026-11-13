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

## Próximo passo

Quando você trouxer as 2 ou 3 casas escolhidas, o primeiro trabalho é mapear, em cada uma, como a página carrega os
mercados de jogador (como foi feito com os `typeIds` da 99play/Altenar) e escrever o leitor dela aqui nesta pasta.
