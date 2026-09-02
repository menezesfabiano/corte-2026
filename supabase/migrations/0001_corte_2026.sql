-- Corte 2026, esquema do acompanhamento.
--
-- Tres tabelas: pesagem semanal, refeicao registrada e modelo escolhido do dia.
-- Cada linha pertence a um usuario autenticado e so ele le e escreve, por RLS.
-- A migracao e idempotente: pode rodar duas vezes sem estragar nada.

-- ---------------------------------------------------------------- tabelas

create table if not exists public.corte_pesagens (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  data date not null,
  peso numeric(5,2) check (peso is null or (peso > 20 and peso < 400)),
  cintura numeric(5,2) check (cintura is null or (cintura > 20 and cintura < 300)),
  atualizado_em timestamptz not null default now(),
  primary key (user_id, data)
);

comment on table public.corte_pesagens is
  'Uma medida por semana, na segunda-feira, com a media dos 7 dias anteriores em jejum.';

create table if not exists public.corte_refeicoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  data date not null,
  hora text not null check (hora ~ '^[0-9]{2}:[0-9]{2}$'),
  refeicao text not null,
  itens jsonb not null default '[]'::jsonb check (jsonb_typeof(itens) = 'array'),
  p numeric(6,1) not null check (p >= 0),
  c numeric(6,1) not null check (c >= 0),
  g numeric(6,1) not null check (g >= 0),
  kcal numeric(7,1) not null check (kcal >= 0),
  criado_em timestamptz not null default now()
);

comment on column public.corte_refeicoes.id is
  'Gerado no cliente com crypto.randomUUID() antes de salvar, para que apagar funcione offline.';

create table if not exists public.corte_dias (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  data date not null,
  modelo text not null check (modelo in ('t11', 't1630', 'off', 'fds')),
  atualizado_em timestamptz not null default now(),
  primary key (user_id, data)
);

comment on table public.corte_dias is
  'Modelo de dia escolhido pelo usuario. Sabado e domingo sao fds independente do que esteja aqui.';

-- ---------------------------------------------------------------- indices

create index if not exists corte_refeicoes_user_data_idx
  on public.corte_refeicoes (user_id, data);

-- ------------------------------------------------------ atualizado_em

-- O default so vale no insert. Como o cliente grava por upsert, o carimbo
-- precisa de gatilho, senao o desempate por atualizado_em fica velho.
create or replace function public.corte_toca_atualizado_em()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists corte_pesagens_atualizado_em on public.corte_pesagens;
create trigger corte_pesagens_atualizado_em
  before insert or update on public.corte_pesagens
  for each row execute function public.corte_toca_atualizado_em();

drop trigger if exists corte_dias_atualizado_em on public.corte_dias;
create trigger corte_dias_atualizado_em
  before insert or update on public.corte_dias
  for each row execute function public.corte_toca_atualizado_em();

-- -------------------------------------------------------------------- RLS

alter table public.corte_pesagens enable row level security;
alter table public.corte_refeicoes enable row level security;
alter table public.corte_dias enable row level security;

drop policy if exists corte_pesagens_dono on public.corte_pesagens;
create policy corte_pesagens_dono on public.corte_pesagens
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists corte_refeicoes_dono on public.corte_refeicoes;
create policy corte_refeicoes_dono on public.corte_refeicoes
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists corte_dias_dono on public.corte_dias;
create policy corte_dias_dono on public.corte_dias
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
