-- El Grimorio abierto en dos dispositivos a la vez: cada cambio guardado en games llega al otro por
-- Realtime. Solo lo reciben los Narradores (la política RLS de games se aplica también al canal).
alter publication supabase_realtime add table public.games;
