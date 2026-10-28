-- Modo Narrador y modo jugador.
--
-- · Narrador: cualquier sesión que haya dado la contraseña común (se comprueba aquí, cifrada).
--   Todos los Narradores ven todas las partidas y guiones, así sirven varios dispositivos.
-- · Jugador: sesión anónima que se une con el código. Solo ve su asiento y la información pública
--   de su partida (guion, fase, quién vive). El Grimorio (games.data) nunca le llega.
--
-- La contraseña NO está en este archivo (el repositorio es público). Se guarda una vez desde el
-- SQL Editor de Supabase con:   select private.set_admin_password('la-contraseña');

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.admin_settings (
  id boolean primary key default true check (id),
  password_hash text
);

create table if not exists private.admin_attempts (
  user_id uuid not null,
  at timestamptz not null default now()
);

create or replace function private.set_admin_password(new_password text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.admin_settings (id, password_hash)
  values (true, extensions.crypt(new_password, extensions.gen_salt('bf')))
  on conflict (id) do update set password_hash = excluded.password_hash;
$$;
revoke all on function private.set_admin_password(text) from public, anon, authenticated;

-- ---------- Narradores ----------

create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
create policy "Cada uno ve si es Narrador" on public.admins for select using (user_id = auth.uid());

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Comprueba la contraseña y, si es correcta, convierte esta sesión en Narrador.
-- Máximo 5 intentos fallidos cada 10 minutos por sesión.
create or replace function public.claim_admin(password text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored text;
begin
  if auth.uid() is null then
    raise exception 'Sin sesión';
  end if;
  if (select count(*) from private.admin_attempts
      where user_id = auth.uid() and at > now() - interval '10 minutes') >= 5 then
    raise exception 'Demasiados intentos. Espera unos minutos.';
  end if;
  select password_hash into stored from private.admin_settings where id;
  if stored is null or extensions.crypt(password, stored) <> stored then
    insert into private.admin_attempts (user_id) values (auth.uid());
    return false;
  end if;
  insert into public.admins (user_id) values (auth.uid()) on conflict do nothing;
  return true;
end;
$$;

create or replace function public.leave_admin()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.admins where user_id = auth.uid();
$$;

-- Partidas y guiones: de los Narradores (de todos ellos).
drop policy if exists "El Narrador gestiona sus partidas" on public.games;
drop policy if exists "El Narrador gestiona sus guiones" on public.scripts;
create policy "Los Narradores gestionan las partidas" on public.games
  for all using (public.is_admin()) with check (public.is_admin());
create policy "Los Narradores gestionan los guiones" on public.scripts
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- Sala y vista pública de cada partida ----------

-- Existe desde que el Narrador abre la sala (antes de repartir). Es lo que pueden ver los
-- jugadores sentados: guion, fase y la lista pública de jugadores (nombre, vivo, voto).
create table if not exists public.game_public (
  game_id uuid primary key,
  join_code text not null unique,
  script_id text not null,
  script_name text not null,
  character_ids text[] not null,
  status text not null default 'lobby' check (status in ('lobby', 'in_progress', 'finished')),
  phase_label text,
  winner text,
  players jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

drop table if exists public.game_seats;
create table public.game_seats (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.game_public (game_id) on delete cascade,
  seat int not null,
  player_name text not null,
  user_id uuid references auth.users (id) on delete set null,
  -- Lo que el jugador cree ser (el Borracho ve su Aldeano falso). Nulo hasta el reparto.
  shown_character_id text,
  shown_alignment text check (shown_alignment in ('good', 'evil')),
  alive boolean not null default true,
  ghost_vote_used boolean not null default false,
  joined_at timestamptz not null default now()
);
create index if not exists game_seats_game_idx on public.game_seats (game_id, seat);
create index if not exists game_seats_user_idx on public.game_seats (user_id);

alter table public.game_public enable row level security;
alter table public.game_seats enable row level security;

create or replace function public.is_seated(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.game_seats where game_id = target and user_id = auth.uid());
$$;

create policy "Los Narradores gestionan las salas" on public.game_public
  for all using (public.is_admin()) with check (public.is_admin());
create policy "Los jugadores ven su partida" on public.game_public
  for select using (public.is_seated(game_id));

create policy "Los Narradores gestionan los asientos" on public.game_seats
  for all using (public.is_admin()) with check (public.is_admin());
create policy "Cada jugador ve su asiento" on public.game_seats
  for select using (user_id = auth.uid());

-- Unirse con el código. Si ya estaba sentado en esa partida, devuelve su asiento (volver a entrar).
create or replace function public.join_game(code text, name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.game_public;
  existing uuid;
  next_seat int;
begin
  if auth.uid() is null then
    raise exception 'Sin sesión';
  end if;
  select * into target from public.game_public where join_code = upper(trim(code));
  if target.game_id is null then
    raise exception 'No hay ninguna partida con ese código.';
  end if;
  select id into existing from public.game_seats where game_id = target.game_id and user_id = auth.uid();
  if existing is not null then
    return existing;
  end if;
  if target.status <> 'lobby' then
    raise exception 'Esa partida ya ha empezado. Pide al Narrador que te añada.';
  end if;
  if length(trim(coalesce(name, ''))) = 0 then
    raise exception 'Escribe tu nombre.';
  end if;
  select coalesce(max(seat), -1) + 1 into next_seat from public.game_seats where game_id = target.game_id;
  if next_seat >= 20 then
    raise exception 'La partida está llena.';
  end if;
  insert into public.game_seats (game_id, seat, player_name, user_id)
  values (target.game_id, next_seat, left(trim(name), 30), auth.uid())
  returning id into existing;
  return existing;
end;
$$;

-- Salir de la sala antes de que empiece.
create or replace function public.leave_game(seat_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.game_seats s
  using public.game_public g
  where s.id = seat_id and s.user_id = auth.uid() and g.game_id = s.game_id and g.status = 'lobby';
$$;

-- Tiempo real: los jugadores reciben su personaje y la fase al momento; el Narrador ve quién entra.
alter publication supabase_realtime add table public.game_public, public.game_seats;
