-- Cuenta atrás del Narrador (debate, nominaciones): los jugadores la ven en su móvil.
alter table public.game_public add column if not exists timer_ends_at timestamptz;
