-- Black House Futebol · banco (projeto Supabase black-house-futebol). Mesma estrutura da NBA, com:
--   só lado "o" (mais), jogo (gid) e fase (abertura/escalacao) em cada entrada, casa da odd, e fotos de várias casas.
-- Todas as tabelas com RLS ligado e sem política pública: só as funções (chave de serviço) leem e gravam.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.bot_config (key text primary key, value text not null, updated_at timestamptz default now());
create table if not exists public.bot_subs (chat_id bigint primary key, est boolean not null default true, top boolean not null default true,
  created_at timestamptz default now(), updated_at timestamptz default now());

-- apostas reais do usuário (botão 📝)
create table if not exists public.bets (
  id bigserial primary key, chat_id bigint not null, created_at timestamptz default now(), date text not null,
  pid text not null, name text not null, team text, opp text, gid bigint, mk text not null, line numeric not null,
  side text not null default 'o' check (side = 'o'), p_model numeric, nota int, src text not null default 'lista',
  odd numeric, house text, stake numeric not null default 1,
  status text not null default 'aguardando_odd' check (status in ('aguardando_odd','aberta','green','red','void')),
  result numeric, profit numeric, settled_at timestamptz);

-- testes do /modelo
create table if not exists public.model_tests (
  id bigserial primary key, chat_id bigint not null, created_at timestamptz default now(), date text not null,
  pid text not null, name text not null, gid bigint, mk text not null, line numeric not null, p numeric not null, mu numeric, odd numeric,
  result numeric, hit boolean, settled_at timestamptz);

-- fotos das linhas de cada casa (histórico completo: base de backtest e de CLV)
create table if not exists public.line_snapshots (
  id bigserial primary key, house text not null, taken_at timestamptz not null default now(), source text default 'navegador',
  n_lines int, payload jsonb not null);
create index if not exists line_snapshots_house_at on public.line_snapshots (house, taken_at desc);

-- fábrica de estratégias
create table if not exists public.strategies (id text primary key, name text not null, descr text, markets text[],
  status text not null default 'papel', created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists public.strategy_picks (
  id bigserial primary key, date date not null, strategy_id text not null references public.strategies(id),
  pid text not null, name text, team text, opp text, gid bigint, mk text not null, stat text, side text not null default 'o',
  line numeric, odd numeric, odd_src text, p numeric, edge numeric, nota int, tip_utc timestamptz, fase text,
  status text not null default 'aberta', result numeric, profit numeric, settled_at timestamptz, manual boolean not null default false,
  open_line numeric, open_odd numeric,
  clv_line numeric generated always as (case when open_line is null then null else open_line - line end) stored,
  clv_odd numeric generated always as (case when open_odd is null or odd is null or open_line is distinct from line then null else round(open_odd / odd - 1, 4) end) stored,
  first_at timestamptz default now(), updated_at timestamptz default now(),
  risk text, p_now numeric, risk_at timestamptz, alerted boolean not null default false,
  unique (date, strategy_id, pid, mk));
-- CLV no mercado de MAIS: a linha que SOBE depois da entrada é a nosso favor (pegamos a mais baixa).
-- clv_line = linha da entrada − linha de fechamento (negativo = a linha subiu = bom) → ver a view abaixo.

-- a primeira gravação guarda a linha e a odd da ENTRADA (open_*); as seguintes só atualizam o fechamento
create or replace function public.strategy_picks_keep_open() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.open_line := coalesce(new.open_line, new.line); new.open_odd := coalesce(new.open_odd, new.odd);
  else new.open_line := coalesce(old.open_line, old.line); new.open_odd := coalesce(old.open_odd, old.odd); new.first_at := old.first_at; end if;
  return new;
end $$;
drop trigger if exists strategy_picks_keep_open on public.strategy_picks;
create trigger strategy_picks_keep_open before insert or update on public.strategy_picks for each row execute function public.strategy_picks_keep_open();

create or replace view public.strategy_stats with (security_invoker = true) as
select s.id, s.name, s.status,
  count(p.*) filter (where p.status in ('green','red')) as n,
  count(p.*) filter (where p.status = 'green') as g,
  count(p.*) filter (where p.status = 'red') as r,
  count(p.*) filter (where p.status = 'void') as v,
  count(p.*) filter (where p.status = 'aberta') as abertas,
  round(sum(p.profit) filter (where p.status in ('green','red')), 2) as lucro,
  round(sum(p.profit) filter (where p.status in ('green','red')) / nullif(count(p.*) filter (where p.status in ('green','red')), 0), 4) as roi,
  round(avg(coalesce(p.open_odd, p.odd)) filter (where p.status in ('green','red')), 3) as odd_media,
  -- CLV positivo = a linha subiu depois da entrada (ou a odd caiu na mesma linha)
  round(avg(-p.clv_line), 3) as clv_linha_media,
  round(avg((p.clv_line < 0)::int) filter (where p.clv_line is not null and p.clv_line <> 0), 3) as clv_pos,
  round(avg(p.clv_odd) filter (where p.clv_odd is not null), 4) as clv_odd_media,
  round(avg(p.edge), 4) as edge_medio, min(p.date) as desde
from public.strategies s left join public.strategy_picks p on p.strategy_id = s.id
group by s.id, s.name, s.status;

-- última foto de cada casa (a coleta lê por GET na função "linhas")
create or replace function public.latest_lines(max_age interval default '18 hours') returns setof public.line_snapshots
language sql stable set search_path = public as $$
  select distinct on (house) * from public.line_snapshots where taken_at > now() - max_age order by house, taken_at desc
$$;
revoke execute on function public.latest_lines(interval) from anon, authenticated;

alter table public.bot_config enable row level security;
alter table public.bot_subs enable row level security;
alter table public.bets enable row level security;
alter table public.model_tests enable row level security;
alter table public.line_snapshots enable row level security;
alter table public.strategies enable row level security;
alter table public.strategy_picks enable row level security;

-- segredos novos (nunca os da NBA): gerados aqui, dentro do banco
insert into public.bot_config (key, value) values
  ('WEBHOOK_SECRET', replace(gen_random_uuid()::text, '-', '')),
  ('REPORT_TOKEN', replace(gen_random_uuid()::text, '-', '')),
  ('LINHAS_TOKEN', replace(gen_random_uuid()::text, '-', '')),
  ('ALERT_EV', '0.05')
on conflict (key) do nothing;
