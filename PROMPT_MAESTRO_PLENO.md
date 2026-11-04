# Prompt maestro de PLENO

Copia todo lo que hay debajo de la línea `---` y pégalo en Claude Code (o tu IDE) con la carpeta del proyecto abierta.

---

Eres un equipo senior de producto, diseño y desarrollo full-stack: product manager, diseñador de producto con especialidad en motion, game designer de juegos diarios y desarrollador JavaScript. Tienes abierto el proyecto **PLENO**, una app de porras de LaLiga (index.html, styles.css, lib.js, app.js, server.mjs, sw.js, manifest.webmanifest) desplegada en Render, con datos de football-data.org mediante un servidor intermediario con caché. Quiero convertirla en una app profesional, legal y adictiva, que la gente quiera descargar y abrir todos los días, **con coste cero**.

## 0. REGLAS GENERALES

- Presupuesto 0 €: solo planes gratuitos (Supabase, Render o Cloudflare Pages, GitHub Actions, football-data.org, Wikidata).
- No inventes datos de fútbol. Si el plan gratuito no los da, dilo en la propia pantalla y propón alternativas con su coste.
- Nunca pongas claves en el código ni en el cliente.
- Interfaz en español. No cambies la puntuación (10 exacto, 7 signo y diferencia, 3 signo, 0 fallo, Joker x2 por jornada) salvo que yo lo pida.
- Primero audita lo que ya existe y dime qué falta; después construye por fases y espera mi visto bueno entre fases.

## 1. EL JUEGO PRINCIPAL

- Solo LaLiga EA Sports. Se pronostica el marcador antes del pitido inicial; cuanto más te acercas, más puntos.
- Solo se puede jugar dentro de una liga con amigos (crear liga o unirse con código o enlace de invitación).
- Una porra se cierra al empezar el partido. Modo ciego: las porras de los demás solo se ven cuando el partido empieza.
- Un Joker x2 por jornada.
- Clasificación por liga, por jornada y de temporada.

## 2. DATOS (plan gratuito de football-data.org)

- Escudos reales de los 20 clubes, con respaldo de siglas si fallan.
- Clasificación general, local y visitante; calendario de las 38 jornadas; resultados (con pequeño retraso en el plan gratuito); goleadores y asistencias.
- Sección **Clubes**: ficha de cada club con escudo, estadio, forma de los últimos 5 partidos, próximos y últimos partidos, goleadores, datos como porterías a cero y goles por partido, y la **estrella del equipo** (su máximo goleador).
- Plantilla actual y rendimiento por jugador, y alineación probable: el plan gratuito no los da. Investiga qué fuente gratuita y legal existe (por ejemplo Wikidata para plantillas) o dime qué plan de pago los incluye y cuánto cuesta. Mientras tanto, muestra un aviso claro, nunca datos inventados.
- Respeta el límite de 10 consultas por minuto: caché en el servidor, datos servidos desde la última copia si la API falla.

## 3. DISEÑO Y MOVIMIENTO (nivel Apple, Linear, Sofascore)

- Identidad PLENO: wordmark propio y favicon. Tres temas conmutables (Carbón con rojo, Blanco, Medianoche con cian), con tokens de diseño y transición suave al cambiar.
- Tarjetas de partido con escudos grandes. Al tocar un partido, la tarjeta se **amplía** (View Transitions con fallback CSS) hasta una hoja de pronóstico: escudos que flotan, goles con botones grandes y números que giran como un contador, frase reactiva según el marcador, barra de probabilidades con «sugerencia PLENO» (modelo de Poisson), Joker con partículas, guardado con check que se dibuja, confeti y vibración, y cierre con transición de vuelta a la tarjeta. Se cierra también con Esc o arrastrando hacia abajo.
- Partidos cerrados o en directo abren la misma hoja en modo lectura, con resultado, puntos ganados y porras de amigos.
- Píldora de navegación que se desliza entre pestañas, entrada escalonada de tarjetas solo al navegar, contadores animados, skeletons de carga, estados de pulsación, foco y desactivado cuidados.
- 60 fps en móviles de gama media (solo transform y opacity), prefers-reduced-motion respetado, accesibilidad completa (dialog con aria-modal, foco atrapado, teclado, etiquetas, contraste AA).

## 4. JUEGOS DIARIOS (con jugadores diferentes cada día, sin repetir)

Juegos, por prioridad (nombres y diseño propios; inspirados en el estilo de futbol-11.com, sin copiar nada suyo):
1. **Conexiones**: 16 nombres, 4 grupos de 4 con categoría oculta, 4 errores permitidos, categorías de 4 niveles de dificultad.
2. **Cruce 3x3**: 3 clubes, países o ligas en filas y 3 en columnas; elige un jugador que cumpla ambas condiciones; 9 intentos; puntos por rareza.
3. **Adivina al crack**: jugador secreto, 8 intentos, pistas comparativas por columna (club, país, posición, edad, dorsal, altura).
4. **Carrera**: se revela la trayectoria de clubes uno a uno; menos pistas, más puntos.
5. **Bingo**: cartón 3x3 de condiciones.
6. **Más o menos**: ¿quién tiene más goles, títulos o partidos?

Entrega primero 1, 2 y 3 muy pulidos y deja 4 a 6 preparados.

**Regla de oro: cada día, jugadores distintos, y ninguno se repite hasta haber agotado todo el conjunto elegible.**

- Construye un **pool de jugadores elegibles** desde Wikidata (CC0): jugadores con trayectoria verificable y notoriedad mínima (por ejemplo número de páginas en Wikipedia) y datos completos. Cuéntame cuántos entran: ese número es el tamaño del ciclo.
- Programa los jugadores secretos con un **ciclo completo**: mezcla el pool una sola vez con una semilla determinista secreta (salt del servidor) y recorre esa permutación día a día. Un jugador solo vuelve a aparecer cuando se han usado todos los demás. Con un pool de 3.000 jugadores, no hay repetición en más de 8 años.
- El mismo principio para clubes, grupos de Conexiones y casillas del Cruce 3x3: cooldown mínimo configurable (90 días jugadores secretos, 60 cuadrículas, 45 grupos) y **ledger anti-repetición** con el hash del contenido de cada puzzle publicado.
- Si no hay combinaciones suficientes, el script avisa de forma visible y baja el cooldown de forma controlada. Nunca repite en silencio. Queda registrada cada repetición.
- Cambio de día a las 00:00 en Europe/Madrid, igual para todos, probado con el cambio de hora de verano e invierno.
- Los puzzles no se generan en el navegador: `tools/generate-puzzles.mjs` los genera por adelantado y los guarda por fecha. Un cron gratuito (GitHub Actions) mantiene siempre 60 días de reserva y falla de forma visible si quedan menos de 14.
- Validación automática antes de publicar: solución única (Conexiones), entre 3 y 60 respuestas válidas por casilla (Cruce 3x3), sin ambigüedades ni duplicados, sin contenido ofensivo, dificultad medida con curva semanal (fácil el lunes, difícil el domingo).
- Archivo de días anteriores sin romper la racha, **modo práctica** ilimitado con un pool aparte, parche de emergencia (archivo de sustituciones) y botón «Reportar error».
- Las respuestas no viajan en claro al cliente: cada intento se valida contra un endpoint del servidor.
- Fotos de jugadores: no las uses por defecto (derechos de imagen). Usa siluetas, iniciales, dorsal y escudo. Si propones fotos de Wikimedia Commons, incluye autor y licencia y avísame del riesgo.
- Prohibido scrapear Transfermarkt, Sofascore, FBref u otros sitios que lo prohíban. Revisa los términos de cualquier fuente nueva.

## 5. ENGANCHE DIARIO

- **Racha diaria** (jugar un juego o hacer una porra la mantiene) con 1 o 2 congeladores al mes.
- **Avisos Web Push**: 1 hora antes del primer partido si faltan porras, resultado con tus puntos, «te han adelantado en la liga», y recordatorio del juego diario. Con control de frecuencia y opción de silenciar. Sin técnicas manipuladoras.
- **Tarjeta compartible** (imagen) con el resultado de tu jornada o del juego diario, sin spoilers, para WhatsApp.
- **Equipo favorito**: la app adopta sus colores y destaca su jornada.
- **Reto relámpago**: un partido destacado al día para pronosticar en 10 segundos.
- **Puntos en directo**: mientras se juega, cuántos puntos llevarías con el marcador actual y cómo cambia tu posición.
- **Extras por jornada** (primer goleador, equipo con más goles, sorpresa de la jornada) y **predicción de temporada** (campeón, descensos, pichichi).
- **Progresión**: XP, niveles, insignias («Pleno», «5 seguidos», «Remontada», «Un mes de racha»), historial de jornadas con gráfica y un resumen de fin de temporada tipo Wrapped.
- **Social**: reacciones a las porras de amigos, retos 1 contra 1, «rival de la jornada» y recompensas por invitar (un tema exclusivo, nunca dinero).
- Estadísticas de juegos: partidas, % de victorias, racha actual y máxima, distribución de intentos. Los juegos dan XP y puntúan en una clasificación diaria y semanal de tu liga.

## 6. BACKEND REAL (Supabase, plan gratuito)

- Auth con enlace mágico por email y Google; tablas profiles, leagues, league_members, predictions, matches (sincronizada desde football-data.org), game_results, streaks.
- Row Level Security: cada usuario escribe solo lo suyo; las porras de los demás solo se leen cuando `kickoff <= now()`.
- El cierre antes del pitido y el modo ciego los valida el servidor con la hora real del partido, nunca el navegador.
- Puntos y clasificaciones calculados en el servidor al terminar cada partido.
- Varias ligas por usuario, administrador de liga (renombrar, expulsar) y enlace directo `/unirse/CÓDIGO`.
- Migración de lo que hoy está en localStorage a la cuenta, la primera vez que entren.

## 7. LEGAL (España y UE)

- Aviso legal con identificación del titular (LSSI-CE, art. 10), política de privacidad (RGPD y LOPDGDD), política de cookies y almacenamiento, términos de uso y pantalla de créditos. Todo accesible desde un pie visible y desde la pantalla de entrada.
- Casilla obligatoria de aceptación y edad mínima de 14 años (art. 7 LOPDGDD).
- Aviso visible de que **PLENO no gestiona dinero, premios ni apuestas** y no es un operador de juego (Ley 13/2011). Sin afiliación con LaLiga ni con ningún club; escudos y marcas solo con fines identificativos.
- Atribución a football-data.org y a las demás fuentes (Wikidata CC0, etc.). Comprueba en sus términos si el plan gratuito permite una app pública y dímelo; si no, propón alternativa.
- Actualiza la privacidad y las cookies cada vez que se guarde algo nuevo (cuentas, rachas, avisos push, analítica).
- Banner o gestor de consentimiento solo si añades cookies o analítica que lo requieran.
- Requisitos de tiendas: URL de política de privacidad, ficha de seguridad de datos de Google Play, etiquetas de privacidad de Apple y clasificación por edad. Cuéntame el coste de las cuentas de desarrollador.
- Indica con claridad qué debo completar yo (nombre, NIF, domicilio, email) y avísame de que estos textos son una base, no asesoramiento legal.

## 8. LANZAMIENTO Y ROBUSTEZ

- PWA completa: iconos PNG de 192 y 512 y maskable, pantalla sin conexión, botón e indicaciones para instalar en Android e iOS, aviso de nueva versión.
- Mantener despierto el servidor de Render (ping con cron-job.org) o proponer alojamiento gratuito que no duerma. Monitor de errores gratuito.
- Cabeceras de seguridad, límite de peticiones en `/api`, escape de todo texto dinámico, sin claves en el cliente.
- SEO básico y tarjeta de compartir del enlace (Open Graph).
- Pruebas automáticas de puntuación, cierre de porras, modo ciego, generador diario (determinismo, ciclo sin repetición, unicidad, validación), cambio de día en Madrid y cálculo de rachas.
- Lighthouse móvil > 90.
- Plan de distribución gratuito: dominio, instalación como PWA y, si compensa, publicación en Google Play como TWA.

## CÓMO TRABAJAR

1. **Fase 0, auditoría.** Lee todo el código y entrégame una lista priorizada (P0 imprescindible, P1 importante, P2 deseable) de lo que falta o falla, con esfuerzo estimado. No cambies nada todavía. Espera mi visto bueno.
2. **Fase 1, base real.** Supabase, cuentas, ligas compartidas, servidor como fuente de verdad.
3. **Fase 2, legal y lanzamiento mínimo.** Textos, consentimiento, PWA completa y despliegue sin dormir.
4. **Fase 3, juegos diarios.** Pool de Wikidata, generador con ciclo completo sin repetición, ledger, validación, cron, y los juegos 1, 2 y 3.
5. **Fase 4, enganche.** Rachas, push, tarjetas para compartir, equipo favorito, progresión y social.
6. **Fase 5, pulido.** Diseño y movimiento, accesibilidad, rendimiento y pruebas.
7. Tras cada fase dime qué has cambiado, qué has probado y qué tengo que configurar yo (claves, Supabase, variables en Render). Si algo es ambiguo, haz una sola pregunta concreta; si no, decide y cuéntamelo.
