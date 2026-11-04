import { randomInt } from "node:crypto";
import { pathToFileURL } from "node:url";

const API_BASE = "https://api.football-data.org/v4";
const REQUEST_GAP_MS = 6200;

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function normalizeName(value) {
  return String(value || "").trim().toLocaleLowerCase("es").replace(/\s+/g, " ");
}

function spanishPosition(position) {
  return ({
    Goalkeeper: "portero",
    Defence: "defensa",
    Midfield: "centrocampista",
    Offence: "delantero"
  })[position] || position;
}

export function buildCandidates(teams) {
  const candidates = new Map();
  for (const team of teams) {
    if (!team?.name || !Array.isArray(team.squad)) continue;
    for (const player of team.squad) {
      const id = player?.id == null ? "" : String(player.id);
      const name = String(player?.name || "").trim();
      const birthYear = /^(\d{4})/.exec(player?.dateOfBirth || "")?.[1];
      const shirtNumber = Number(player?.shirtNumber);
      if (
        !id || !name || name.length > 80 || !player.position ||
        !player.nationality || !birthYear ||
        !Number.isInteger(shirtNumber) || shirtNumber < 1 || shirtNumber > 99
      ) continue;

      const aliases = [...new Set([
        name,
        player.shortName,
        player.knownAs,
        [player.firstName, player.lastName].filter(Boolean).join(" ")
      ]
        .map(normalizeName)
        .filter((alias) => alias && alias.length <= 80 && alias !== normalizeName(name)))];
      candidates.set(id, {
        id,
        name,
        answer: normalizeName(name),
        aliases,
        clues: [
          { label: "Demarcación", text: `Juega como ${spanishPosition(player.position)}.` },
          { label: "Nacionalidad", text: `Su nacionalidad es ${player.nationality}.` },
          { label: "Equipo", text: `Forma parte de la plantilla del ${team.name}.` },
          { label: "Nacimiento", text: `Nació en ${birthYear}.` },
          { label: "Dorsal", text: `Viste el número ${shirtNumber}.` }
        ]
      });
    }
  }
  return [...candidates.values()];
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index--) {
    const swapIndex = randomInt(index + 1);
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

async function fetchJson(url, headers, label) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${label}: football-data.org respondió ${response.status}: ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label}: football-data.org devolvió una respuesta JSON no válida.`);
  }
}

async function loadTeams(apiKey) {
  const headers = { "X-Auth-Token": apiKey };
  const competition = await fetchJson(`${API_BASE}/competitions/PD/teams`, headers, "LaLiga");
  if (!Array.isArray(competition.teams) || competition.teams.length === 0) {
    throw new Error("football-data.org no devolvió los equipos actuales de LaLiga.");
  }

  const teams = [];
  let lastRequestAt = Date.now();
  for (const team of competition.teams) {
    if (!team?.id || !team?.name) continue;
    let squad = team.squad;
    if (!Array.isArray(squad) || squad.length === 0) {
      await wait(Math.max(0, REQUEST_GAP_MS - (Date.now() - lastRequestAt)));
      const details = await fetchJson(`${API_BASE}/teams/${team.id}`, headers, `Plantilla de ${team.name}`);
      squad = details.squad;
      lastRequestAt = Date.now();
    }
    if (Array.isArray(squad)) teams.push({ name: team.name, squad });
  }
  return teams;
}

async function publishChallenge(candidate, challengeDate, supabaseUrl, secretKey) {
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/publish_daily_challenge`, {
    method: "POST",
    headers: {
      apikey: secretKey,
      authorization: `Bearer ${secretKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      p_challenge_date: challengeDate,
      p_title: "El Fichaje Diario",
      p_clues: candidate.clues,
      p_featured_match_id: null,
      p_answer_normalized: candidate.answer,
      p_accepted_answers: candidate.aliases,
      p_source_player_id: candidate.id
    }),
    signal: AbortSignal.timeout(20000)
  });
  const text = await response.text();
  if (!response.ok) {
    let message = text;
    try { message = JSON.parse(text).message || text; } catch {}
    throw new Error(`Supabase respondió ${response.status}: ${message}`);
  }
  return text === "true";
}

export async function publishDailyChallenge({
  apiKey,
  supabaseUrl,
  secretKey,
  now = new Date()
}) {
  if (!apiKey || !supabaseUrl || !secretKey) {
    throw new Error("Faltan FOOTBALL_DATA_KEY, SUPABASE_URL o SUPABASE_SECRET_KEY.");
  }
  const dateParts = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const datePart = (type) => dateParts.find((part) => part.type === type)?.value;
  const challengeDate = `${datePart("year")}-${datePart("month")}-${datePart("day")}`;
  const teams = await loadTeams(apiKey);
  const candidates = shuffle(buildCandidates(teams));
  if (candidates.length === 0) {
    throw new Error("No hay suficientes jugadores actuales de LaLiga con datos completos para crear el reto.");
  }

  for (const candidate of candidates) {
    try {
      const published = await publishChallenge(candidate, challengeDate, supabaseUrl, secretKey);
      console.log(published
        ? `Reto de ${challengeDate} publicado: ${candidate.name} (${candidate.id}).`
        : `Ya existe el reto de ${challengeDate}; no se modificó.`);
      return;
    } catch (error) {
      if (/player used within the last 30 days/i.test(error.message)) continue;
      throw error;
    }
  }
  throw new Error("No se encontró un jugador que no haya aparecido en los últimos 30 días.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  publishDailyChallenge({
    apiKey: process.env.FOOTBALL_DATA_KEY,
    supabaseUrl: process.env.SUPABASE_URL,
    secretKey: process.env.SUPABASE_SECRET_KEY
  }).catch((error) => {
    console.error(`No se pudo publicar el reto diario: ${error.message}`);
    process.exitCode = 1;
  });
}
