-- Fábulas y Lóricos en juego: el Narrador los anuncia, así que los ve toda la mesa.

alter table public.game_public add column if not exists fabled_ids text[] not null default '{}';
