# Grimorio · Blood on the Clocktower

Webapp de Blood on the Clocktower pensada primero para el móvil, con dos modos:

- **Narrador** (con contraseña): prepara la partida en modo **manual** o con **IA** (OpenRouter + DeepSeek), abre una sala con código y QR, reparte y lleva el Grimorio: noche paso a paso, votos y final.
- **Jugador** (sin cuenta): se une con el código, ve su personaje (el Borracho ve el falso), la lista de personajes del guion, la fase y quién sigue vivo. Todo llega en tiempo real.

Se puede instalar en el móvil desde el navegador («Añadir a pantalla de inicio»).

- Guiones oficiales (Trouble Brewing, Bad Moon Rising, Sects & Violets) y **guiones personalizados** (con importación/exportación del JSON de la herramienta oficial).
- 181 personajes en español (nombres, habilidades, recordatorios y textos de noche de la [wiki de Villacuervos](https://villacuervos.es/wiki/)) con el **orden de noche oficial**.
- Reparto según la hoja de preparación, con los personajes que la cambian (Barón, Padrino, Fang Gu, Vigormortis…), Borracho/Lunático/Marioneta y faroles del Demonio.
- **Fábulas y Lóricos** al preparar y durante la partida (Centinela, Papa, Juguetero, Tor, Jardinero…), y las 131 **incompatibilidades** oficiales (jinxes) de la wiki: el Djinn entra solo si el guion las tiene, y se avisan en la preparación, el Grimorio y la IA. También se contemplan el Ateo, el Invocador, el Cazarrecompensas, el Tonto del pueblo y la Marioneta (junto al Demonio).
- Grimorio circular, recordatorios, vivos/muertos, voto fantasma, nominaciones y umbral de ejecución.
- «Repartir»: se pasa el móvil y cada jugador ve su personaje en secreto.

## Empezar

```bash
npm install
npm run dev
```

Sin configurar nada funciona en modo manual y guarda las partidas en el navegador.

```bash
npm test        # reglas del dominio
npm run build   # comprueba tipos y genera dist/
```

## Arquitectura (Clean Architecture + SOLID)

```
src/
  domain/          Reglas puras del juego. No conoce React, Supabase ni la IA.
    entities/        Character, Script, Game, Player…
    services/        SetupRules (hoja de preparación), SetupGenerator (bolsa al azar, faroles),
                     NightOrder (hoja de noche), GameRules (muertes, votos, ejecución, victoria)
  application/     Casos de uso y puertos (interfaces).
    ports/           CharacterCatalog, GameRepository, CustomScriptRepository, AiStoryteller…
    use-cases/       CreateGame, GenerateAiSetup, SuggestRandomSetup, AskAiAdvice, SaveCustomScript…
  infrastructure/  Implementaciones de los puertos.
    catalog/         Personajes y guiones oficiales (JSON)
    persistence/     LocalStorage* (sin cuenta) y Supabase* (nube)
    ai/              LlmStoryteller + transportes (Edge Function de Supabase o navegador)
  presentation/    React. app/container.ts es la raíz de composición: el único sitio que
                   decide qué implementación se usa.
```

- Las dependencias apuntan hacia dentro: `presentation → application → domain`; `infrastructure` implementa los puertos de `application`.
- La IA **propone** y el dominio **valida**: si el reparto de la IA no cumple la hoja de preparación, se le devuelven los errores y lo corrige; si no, se avisa.
- Cambiar de proveedor de IA o de base de datos es añadir un adaptador nuevo, sin tocar dominio ni pantallas.

## Modo Narrador y modo jugador

- Al abrir la web: «Unirme a una partida» o «Soy el Narrador». El Narrador escribe la contraseña común; la comprueba la base de datos (`claim_admin`), nunca la web, y solo se guarda cifrada.
- Todos los Narradores ven todas las partidas: con la contraseña entras desde el móvil o el PC y tienes lo mismo.
- Los jugadores solo pueden leer su asiento (`game_seats`) y la información pública de su partida (`game_public`); el Grimorio (`games`) es solo de Narradores. Lo hacen cumplir las políticas RLS de `supabase/migrations/`.
- Tiempo real con Supabase Realtime: el Narrador ve entrar a los jugadores; los jugadores reciben su personaje y los cambios (fase, muertes) al momento.

Para poner o cambiar la contraseña de Narrador, en Supabase → SQL Editor:

```sql
select private.set_admin_password('la-contraseña');
```

## Base de datos en la nube (Supabase, gratis)

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. **Authentication → Sign In / Providers → Anonymous**: actívalo (cada Narrador entra sin registrarse).
3. **SQL Editor**: ejecuta, en orden, los archivos de `supabase/migrations/`, y después pon la contraseña de Narrador (ver arriba).
4. Copia `.env.example` a `.env.local` y rellena `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (Project Settings → API).

La clave *anon* es pública por diseño; los datos los protegen las políticas RLS (cada uno ve solo lo suyo).

Cada navegador tiene su sesión anónima. Para el Narrador no importa (lo que cuenta es la contraseña); un jugador que borre los datos del navegador tendrá que volver a unirse (o el Narrador lo añade a mano).

Prueba de punta a punta contra Supabase (no corre con `npm test`): ver `src/tests/table.integration.test.ts`.

## Modo IA (OpenRouter + DeepSeek)

Recomendado, con Supabase: la clave vive en una Edge Function y nunca llega al navegador.

```bash
npx supabase login
npx supabase link --project-ref <tu-proyecto>
npx supabase secrets set OPENROUTER_API_KEY=sk-or-...
npx supabase functions deploy ai-storyteller
```

Pon un **límite de gasto** a la clave en OpenRouter: cualquiera que abra la web puede usar la función. La función solo acepta los modelos de `ALLOWED_MODELS` (por defecto `deepseek/deepseek-v4.1-flash`).

Para pruebas sin Supabase: en **Ajustes** de la app se puede pegar una clave de OpenRouter, que se guarda solo en ese navegador.

## Publicar en GitHub Pages

1. Sube el repositorio a GitHub (rama `main`).
2. **Settings → Pages → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions → Variables**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y, si quieres, `VITE_AI_MODEL`.
4. Cada push a `main` pasa los tests, compila y publica (`.github/workflows/deploy.yml`) en `https://<usuario>.github.io/<repositorio>/`.

## Datos

Los iconos de los personajes se cargan directamente desde la wiki de Villacuervos (no se copian al repositorio). Si no cargan, la ficha muestra sus iniciales. Los textos de los personajes son de la wiki de Villacuervos y el orden de noche del repositorio oficial `ThePandemoniumInstitute/botc-release`. Blood on the Clocktower es una marca de The Pandemonium Institute; este proyecto es una herramienta no oficial para uso personal.
