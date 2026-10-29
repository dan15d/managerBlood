# Grimorio · Blood on the Clocktower

Webapp de Blood on the Clocktower pensada primero para el móvil, con dos modos:

- **Narrador** (con contraseña): prepara la partida en modo **manual** o con **IA** (OpenRouter + DeepSeek), abre una sala con código y QR, reparte y lleva el Grimorio: noche paso a paso, votos y final.
- **Jugador** (sin cuenta): se une con el código, ve su personaje (el Borracho ve el falso), la lista de personajes del guion, la fase y quién sigue vivo. Todo llega en tiempo real.

Se puede instalar en el móvil desde el navegador («Añadir a pantalla de inicio»).

- Guiones oficiales (Trouble Brewing, Bad Moon Rising, Sects & Violets) y **guiones personalizados** (con importación/exportación del JSON de la herramienta oficial).
- 181 personajes en español (nombres, habilidades, recordatorios y textos de noche de la [wiki de Villacuervos](https://villacuervos.es/wiki/)) con el **orden de noche oficial**.
- Reparto según la hoja de preparación, con los personajes que la cambian (Barón, Padrino, Fang Gu, Vigormortis…), Borracho/Lunático/Marioneta, faroles del Demonio y el falso positivo de la Pitonisa, el nieto de la Abuela y el gemelo de la Gemela malvada ya puestos.
- **Fábulas y Lóricos** al preparar y durante la partida (Centinela, Papa, Juguetero, Tor, Jardinero…), y las 131 **incompatibilidades** oficiales (jinxes) de la wiki: el Djinn entra solo si el guion las tiene, y se avisan en la preparación, el Grimorio y la IA. También se contemplan el Ateo, el Invocador, el Cazarrecompensas, el Tonto del pueblo y la Marioneta (junto al Demonio).
- **Guía de cada personaje** de la wiki, distinta según quién la lea. El Narrador ve el resumen, cómo narrarlo, ejemplos y detalles de reglas, más los casos especiales (incompatibilidades e interacciones) con lo que hay en juego. El jugador ve el resumen, ejemplos, consejos y cómo farolear del personaje que cree ser, y nunca nada que dependa de la partida. Cada guía se descarga al abrirla.
- Grimorio circular, recordatorios, vivos/muertos, voto fantasma, nominaciones y umbral de ejecución.
- Ayudas al Narrador: **Deshacer**, pantalla siempre encendida, la **respuesta verdadera** de los personajes de información (Empático, Chef, Lavandera, Bibliotecario, Investigador, Enterrador, Pitonisa, Relojero, Pregonero, Florista, Oráculo, Shugenja, Caballero, Noble, Administrador, Abuela, Sabio, Rey, Niño del coro, Cazarrecompensas, Padrino; y el Soñador, el Guardián de cuervos y el Tonto del pueblo al tocar a quién eligen), «Toca a quién elige» para poner el recordatorio de un toque (las fichas se mueven como en el Grimorio físico; el ataque del Demonio mata en el acto salvo protección, igual que el **Asesino** (aunque haya protección) y el **Padrino**, y los móviles lo ven al amanecer) y, al anochecer, quitar los recordatorios que ya no valen. Si muere el Demonio y la partida sigue (la Mujer escarlata con 5 o más vivos, o el pase del Diablillo a un Esbirro), lo avisa en vez de dar la victoria al Bien y lo convierte de un toque.
- Botón **Terminar** para declarar quién gana en cualquier momento. Victorias que avisa sola: el **Santo** ejecutado, el **Alcalde** con 3 vivos y sin ejecución. La **Virgen** ejecuta en el acto al Aldeano que la nomina, el **Exterminador** dispara de un toque (sin que cuente como ejecución) y hay **ejecución sin votación** (Juez, Visir…). Los que actúan al morir (**Guardián de cuervos**, Sabio, Granjero, Banshee…) solo se despiertan si les toca, y los votos del **Burócrata** (×3) y el **Ladrón** (−1) cuentan con su peso.
- Otras ediciones: **exilio de Viajeros** (votan todos, sin gastar voto, mitad de todos los jugadores); **Gemela malvada**, **Mente maestra** (día extra) y **Hereje** (invierte el ganador) en los avisos de victoria; el **Marinero**, el **Bufón** y el elegido del **Abogado del diablo** sobreviven; la **Abuela** muere con su nieto; el **Cultivador de opio** retrasa la información del Mal; el **Carnicero** nomina tras la ejecución; la **Banshee** nomina y vota dos veces; y con el **Voudon** solo votan él y los muertos. El **Encantador de serpientes** que elige al Demonio intercambia personaje y bando de un toque (el antiguo Demonio queda envenenado), y desde la ficha del jugador se puede **intercambiar personaje** con otro (Barbero, sin cambiar de bando). En las votaciones, el voto del **Mayordomo** sin su señor no cuenta y se marca al **Fanático** que debe votar; al nominar, el maldito de la **Bruja** muere y el **Gólem** mata a su nominado si no es el Demonio; y el **Fearmonger** que nomina y ejecuta a su elegido hace perder a su equipo.
- Más habilidades de Bad Moon Rising y Sects & Violets que aplica la app:
  - **Personajes que cambian quién es quién:**
    - El **Filósofo** elige personaje y pasa a despertar como él, y quien lo tenía queda borracho.
    - La **Pit-Hag** convierte a un jugador en otro personaje, que conserva su bando.
  - **Borracheras:**
    - Un Demonio borracho o envenenado no mata.
    - El **Matón** emborracha al primero que le elige y pasa a su bando.
    - El **Juglar** emborracha a todos tras ejecutar a un Esbirro.
    - El **Cortesano** solo actúa una vez.
  - **Muertes y resurrecciones:**
    - El **Profesor** resucita a un Aldeano.
    - La **Niña de la Luna** mata a su elegido si es bueno.
    - El Esbirro que mata el **Vigormortis** conserva su habilidad.
  - **Información para el Narrador:**
    - El **Tahúr** y la **Sirvienta** reciben su respuesta.
- Demonios con reglas propias: el **Pukka** mata a su víctima anterior al envenenar a otra; el **Fang Gu** salta al primer Forastero; el **Zombuul** parece muerto la primera vez y solo ataca si nadie ha muerto ese día; el **Lleech** envenena a su huésped y no muere mientras viva; **Lil' Monsta** no va en la bolsa (lo cuida un Esbirro); el **Vortox** y el **Leviatán** avisan de la victoria del Mal; el **Shabaloth** regurgita; y el **No Dashii** envenena a sus Aldeanos vecinos desde el principio.
- Para el jugador: **mantener pulsada la ficha** para ver su personaje (se oculta al soltar, al salir de la app o al minuto) y **notas privadas** sobre los demás (qué dicen ser y qué cree que son), guardadas solo en su móvil.
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
