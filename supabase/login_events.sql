-- Tabla de historial de ingresos al dashboard.
-- Correr UNA VEZ en el SQL Editor de Supabase (dashboard del proyecto → SQL Editor → New query → Run).
-- Se accede sólo desde el servidor con la service role key (SUPABASE_ROOT), nunca desde el browser,
-- por eso queda con RLS activado y sin policies: ningún cliente anon/authenticated puede leerla o escribirla.

create table if not exists public.login_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  email text not null,
  created_at timestamptz not null default now()
);

create index if not exists login_events_user_id_idx on public.login_events (user_id);
create index if not exists login_events_created_at_idx on public.login_events (created_at desc);

alter table public.login_events enable row level security;
