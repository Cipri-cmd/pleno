// Servidor sin dependencias: sirve la web y hace de intermediario con football-data.org (plan gratuito).
// Guarda las respuestas en caché para no pasar el límite de 10 consultas por minuto.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const KEY = process.env.FOOTBALL_DATA_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const PORT = process.env.PORT || 3000;
const ALLOWED = /^(competitions\/PD\/(standings|matches|teams|scorers)|teams\/\d+)$/;
const types = { ".html": "text/html;charset=utf-8", ".css": "text/css;charset=utf-8", ".js": "text/javascript;charset=utf-8", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const cache = new Map();
const inFlight = new Map();
let warnedMissingSupabase = false;
const send = (res, code, body, headers = {}) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store", ...headers }); res.end(body); };
const sendFootballData = (res, result) => send(res, result.status, result.body, result.updatedAt ? {
  "x-data-updated-at": new Date(result.updatedAt).toISOString(),
  "x-data-stale": String(result.stale)
} : {});
const ttlFor = (ep) => ep.endsWith("/matches") ? 30e3 : ep.endsWith("/standings") ? 60e3 : /scorers/.test(ep) ? 6e5 : ep.startsWith("teams/") ? 36e5 : 864e5;
async function syncMatchSchedule(matches) {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    if (!warnedMissingSupabase) {
      console.warn("Sincronización de pronósticos desactivada: configura SUPABASE_URL y SUPABASE_SECRET_KEY en .env");
      warnedMissingSupabase = true;
    }
    return;
  }
  const rows = matches.map((match) => ({
    match_id: match.id,
    kickoff: match.utcDate,
    matchday: match.matchday ?? null,
    status: match.status,
    home_goals: Number.isInteger(match.score?.fullTime?.home) ? match.score.fullTime.home : null,
    away_goals: Number.isInteger(match.score?.fullTime?.away) ? match.score.fullTime.away : null
  }));
  const response = await fetch(`${SUPABASE_URL}/rest/v1/league_matches?on_conflict=match_id`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SECRET_KEY,
      authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates"
    },
    body: JSON.stringify(rows),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) console.error(`No se pudo sincronizar el calendario con Supabase (${response.status}): ${await response.text()}`);
}
async function syncMinuteOfGoldResults(matches) {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) return;
  const rows = matches
    .filter((match) => match.status === "FINISHED" && Array.isArray(match.goals))
    .map((match) => {
      const firstGoal = match.goals
        .map((goal) => ({
          minute: Number(goal.minute),
          injuryTime: Number(goal.injuryTime) || 0
        }))
        .filter((goal) => Number.isInteger(goal.minute) && goal.minute > 0)
        .map((goal) => Math.min(90, goal.minute + goal.injuryTime))
        .sort((a, b) => a - b)[0] ?? null;
      return { match_id: match.id, first_goal_minute: firstGoal };
    });
  if (!rows.length) return;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/minute_of_gold_results?on_conflict=match_id`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SECRET_KEY,
      authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates"
    },
    body: JSON.stringify(rows),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    console.error(`No se pudieron sincronizar los goles del Minuto de Oro (${response.status}): ${await response.text()}`);
  }
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname.startsWith("/api/")) {
    const ep = u.pathname.slice(5);
    if (!ALLOWED.test(ep)) return send(res, 404, '{"message":"Ruta no permitida"}');
    if (!KEY) return send(res, 500, '{"message":"Falta FOOTBALL_DATA_KEY en el archivo .env"}');
    const k = ep + u.search, hit = cache.get(k);
    if (hit && Date.now() - hit.t < ttlFor(ep)) return sendFootballData(res, { status: 200, body: hit.b, updatedAt: hit.t, stale: false });
    let request = inFlight.get(k);
    if (!request) {
      request = (async () => {
        try {
          const r = await fetch(`https://api.football-data.org/v4/${ep}${u.search}`, { headers: { "X-Auth-Token": KEY }, signal: AbortSignal.timeout(15e3) });
          const b = await r.text();
          if (r.ok) {
            const refreshed = { t: Date.now(), b };
            cache.set(k, refreshed);
            if (ep === "competitions/PD/matches") {
              try {
                const matches = JSON.parse(b).matches || [];
                await syncMatchSchedule(matches);
                await syncMinuteOfGoldResults(matches);
              }
              catch (e) { console.error(`Error al sincronizar el calendario con Supabase: ${e.message}`); }
            }
            return { status: 200, body: b, updatedAt: refreshed.t, stale: false };
          }
          if (hit) return { status: 200, body: hit.b, updatedAt: hit.t, stale: true };
          return { status: r.status, body: b };
        } catch (e) {
          if (hit) return { status: 200, body: hit.b, updatedAt: hit.t, stale: true };
          return { status: 502, body: JSON.stringify({ message: "No se pudo conectar con football-data.org: " + e }) };
        }
      })();
      inFlight.set(k, request);
      request.then(() => inFlight.delete(k), () => inFlight.delete(k));
    }
    return sendFootballData(res, await request);
  }
  const f = normalize(join(root, u.pathname === "/" ? "index.html" : u.pathname));
  if (!f.startsWith(root) || /server\.mjs|\.env/.test(f)) { res.writeHead(403); return res.end(); }
  try { const data = await readFile(f); res.writeHead(200, { "content-type": types[extname(f)] || "application/octet-stream" }); res.end(data); }
  catch { res.writeHead(404); res.end("No encontrado"); }
}).listen(PORT, () => console.log(`PLENO listo en http://localhost:${PORT}`));
