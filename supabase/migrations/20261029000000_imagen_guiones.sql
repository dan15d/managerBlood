-- Imagen de portada de los guiones personalizados.
-- Se guarda ya reducida desde el navegador (data URL webp de unos 50-150 kB) o como URL
-- (el logo del JSON de la herramienta oficial). El límite evita que alguien llene la base de datos.

alter table public.scripts add column if not exists image text;

alter table public.scripts drop constraint if exists scripts_image_size;
alter table public.scripts add constraint scripts_image_size check (image is null or length(image) <= 1500000);
