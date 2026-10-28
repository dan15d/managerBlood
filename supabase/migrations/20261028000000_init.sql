-- Esquema inicial del Grimorio (Supabase, plan gratuito).
-- Cada Narrador entra con una sesión anónima (Authentication → Sign In / Providers → Anonymous)
-- y solo ve sus partidas y guiones gracias a RLS.

create table if not exists public.games (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  script_name text not null,
  player_count int not null,
  phase_label text not null,
  status text not null check (status in ('in_progress', 'finished')),
  -- Código corto para que los jugadores se unan desde su móvil (fase futura).
  join_code text unique,
  -- La partida completa (agregado Game del dominio). Incluye el Grimorio: nunca se expone a jugadores.
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists games_owner_idx on public.games (owner_id, updated_at desc);

create table if not exists public.scripts (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  author text,
  description text,
  character_ids text[] not null,
  updated_at timestamptz not null default now()
);

alter table public.games enable row level security;
alter table public.scripts enable row level security;

create policy "El Narrador gestiona sus partidas" on public.games
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "El Narrador gestiona sus guiones" on public.scripts
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Preparado para la app de jugadores (todavía no se usa):
-- cada jugador se une con el código y solo puede leer SU asiento. El Narrador asigna el
-- personaje que el jugador cree ser (el Borracho ve su Aldeano falso), nunca el Grimorio.
-- ---------------------------------------------------------------------------
create table if not exists public.game_seats (
  game_id uuid not null references public.games (id) on delete cascade,
  seat int not null,
  player_name text not null,
  user_id uuid references auth.users (id) on delete set null,
  shown_character_id text,
  alignment_hint text,
  primary key (game_id, seat)
);

alter table public.game_seats enable row level security;

create policy "El Narrador gestiona los asientos" on public.game_seats
  for all using (exists (select 1 from public.games g where g.id = game_id and g.owner_id = auth.uid()))
  with check (exists (select 1 from public.games g where g.id = game_id and g.owner_id = auth.uid()));

create policy "Cada jugador ve su asiento" on public.game_seats
  for select using (user_id = auth.uid());
