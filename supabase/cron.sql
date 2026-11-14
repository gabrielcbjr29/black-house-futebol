-- Agendamentos (pg_cron + pg_net) do projeto black-house-futebol. Aplicar depois de publicar as funções.
-- Horários em UTC (Brasília = UTC−3).
select cron.schedule('estrategias-record', '*/10 * * * *', $$select net.http_get(
  url := 'https://mccxlgtiulpknubdiyrz.supabase.co/functions/v1/estrategias?record=' || (select value from public.bot_config where key = 'WEBHOOK_SECRET'),
  timeout_milliseconds := 60000)$$);
-- conferência: 07h10, 13h10 e 23h40 de Brasília (depois que o histórico do GitHub trouxe os jogos encerrados)
select cron.schedule('estrategias-settle', '10 10,16 * * *', $$select net.http_get(
  url := 'https://mccxlgtiulpknubdiyrz.supabase.co/functions/v1/estrategias?settle=' || (select value from public.bot_config where key = 'WEBHOOK_SECRET'),
  timeout_milliseconds := 60000)$$);
select cron.schedule('estrategias-settle-noite', '40 2 * * *', $$select net.http_get(
  url := 'https://mccxlgtiulpknubdiyrz.supabase.co/functions/v1/estrategias?settle=' || (select value from public.bot_config where key = 'WEBHOOK_SECRET'),
  timeout_milliseconds := 60000)$$);
-- relatório da manhã (gabarito de ontem + placar + conferência das apostas): 08h05 de Brasília
select cron.schedule('bot-manha', '5 11 * * *', $$select net.http_get(
  url := 'https://mccxlgtiulpknubdiyrz.supabase.co/functions/v1/telegram-bot?morning=' || (select value from public.bot_config where key = 'WEBHOOK_SECRET'),
  timeout_milliseconds := 60000)$$);

-- Bot (criados direto no banco): Top 10 automático a cada 30 min (24 h), envio diário ~2h30 antes do 1º jogo
-- select cron.schedule('bot-record-tops', '*/30 * * * *', $$select net.http_get('<SUPABASE_URL>/functions/v1/telegram-bot?record=<WEBHOOK_SECRET>')$$);
-- select cron.schedule('bot-resumo-diario', '*/30 9-23,0-1 * * *', $$select net.http_get('<SUPABASE_URL>/functions/v1/telegram-bot?push=<WEBHOOK_SECRET>&lead=150')$$);
-- 14/11/2026: estrategias-record e bot-record-tops passaram a rodar 24 h (antes, 6h–23h50); madrugada sem som.
