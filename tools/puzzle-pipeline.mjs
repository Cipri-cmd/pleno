import { createHash, createHmac } from "node:crypto";

export const GAMES = ["connections", "grid", "player"];
export const REPEAT_DAYS = { connections: 45, grid: 60, player: 90 };
const COLORS = new Set(["yellow", "green", "blue", "purple"]);
const PLAYER_FIELDS = ["club", "country", "position", "age", "shirt_number", "height_cm"];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function unique(values) {
  return new Set(values).size === values.length;
}

function entityId(value) {
  return typeof value === "string" && /^Q\d+$/.test(value);
}

function countPartitions(tiles, groups) {
  const tileSet = new Set(tiles);
  const candidates = groups.filter((group) =>
    group.members.length === 4 && group.members.every((member) => tileSet.has(member))
  );
  let count = 0;
  const visit = (remaining, usedGroups) => {
    if (count > 1) return;
    if (remaining.size === 0) {
      count++;
      return;
    }
    const first = remaining.values().next().value;
    for (let index = 0; index < candidates.length; index++) {
      if (usedGroups.has(index)) continue;
      const members = candidates[index].members;
      if (!members.includes(first) || members.some((member) => !remaining.has(member))) continue;
      const next = new Set(remaining);
      members.forEach((member) => next.delete(member));
      const nextGroups = new Set(usedGroups);
      nextGroups.add(index);
      visit(next, nextGroups);
    }
  };
  visit(tileSet, new Set());
  return count;
}

export function madridDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function difficultyForDate(date) {
  assert(/^\d{4}-\d{2}-\d{2}$/.test(date), "La fecha debe usar AAAA-MM-DD.");
  const parsed = new Date(`${date}T12:00:00Z`);
  assert(!Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date, "La fecha no existe.");
  const day = parsed.getUTCDay();
  return day === 0 ? 7 : day;
}

export function validateCandidate(game, candidate) {
  assert(GAMES.includes(game), `Juego no admitido: ${game}`);
  assert(candidate && typeof candidate === "object", "Candidato inválido.");
  assert(typeof candidate.id === "string" && candidate.id.trim(), "Cada candidato necesita un identificador.");
  assert(Number.isInteger(candidate.difficulty) && candidate.difficulty >= 1 && candidate.difficulty <= 7,
    "La dificultad debe estar entre 1 y 7.");
  assert(Array.isArray(candidate.source_refs) && candidate.source_refs.length > 0 &&
    candidate.source_refs.every(entityId), "Cada puzzle necesita referencias verificables de Wikidata.");
  assert(Array.isArray(candidate.repeat_keys) && candidate.repeat_keys.length > 0 &&
    candidate.repeat_keys.every(entityId) && unique(candidate.repeat_keys),
  "Las claves anti-repetición deben ser QID únicos.");
  assert(candidate.public && typeof candidate.public === "object", "Falta el contenido público.");
  assert(candidate.solution && typeof candidate.solution === "object", "Falta la solución privada.");

  if (game === "connections") {
    const groups = candidate.solution.groups;
    assert(Array.isArray(groups) && groups.length === 4, "Conexiones necesita cuatro grupos.");
    assert(groups.every((group) => typeof group.category === "string" && group.category.trim() &&
      COLORS.has(group.color) && Array.isArray(group.members) && group.members.length === 4 &&
      group.members.every(entityId)), "Cada grupo debe tener categoría, color y cuatro entidades.");
    assert(unique(groups.map((group) => group.category.trim())) &&
      unique(groups.map((group) => group.color)),
    "Las categorías y niveles de Conexiones deben ser distintos.");
    const members = groups.flatMap((group) => group.members);
    assert(unique(members) && members.length === 16, "Conexiones necesita 16 respuestas distintas.");
    assert(members.every((member) => candidate.repeat_keys.includes(member)),
      "Las 16 respuestas de Conexiones deben estar cubiertas por el ledger anti-repetición.");
    assert(Array.isArray(candidate.public.tiles) && candidate.public.tiles.length === 16 &&
      candidate.public.tiles.every(entityId) && unique(candidate.public.tiles) &&
      members.every((member) => candidate.public.tiles.includes(member)),
    "Las 16 fichas públicas deben corresponder exactamente a las respuestas.");
    assert(Array.isArray(candidate.possible_groups) && candidate.possible_groups.length >= 4 &&
      candidate.possible_groups.every((group) => typeof group.category === "string" &&
        Array.isArray(group.members) && group.members.length === 4 &&
        group.members.every(entityId) && unique(group.members)) &&
      countPartitions(candidate.public.tiles, candidate.possible_groups) === 1,
    "Conexiones debe tener una única solución entre las categorías verificadas.");
  } else if (game === "grid") {
    assert(Array.isArray(candidate.public.rows) && candidate.public.rows.length === 3 &&
      candidate.public.rows.every((condition) => typeof condition === "string" && condition.trim()) &&
      unique(candidate.public.rows) &&
      Array.isArray(candidate.public.columns) && candidate.public.columns.length === 3 &&
      candidate.public.columns.every((condition) => typeof condition === "string" && condition.trim()) &&
      unique(candidate.public.columns),
    "La cuadrícula necesita tres filas y tres columnas.");
    const cells = candidate.solution.cells;
    assert(Array.isArray(cells) && cells.length === 9, "La cuadrícula necesita nueve casillas.");
    for (let index = 0; index < 9; index++) {
      const answers = cells[index];
      assert(Array.isArray(answers) && answers.length >= 3 && answers.length <= 60 &&
        answers.every(entityId) && unique(answers), `La casilla ${index + 1} debe tener entre 3 y 60 respuestas únicas.`);
    }
    assert(cells.flat().every((answer) => candidate.repeat_keys.includes(answer)),
      "Las respuestas de la cuadrícula deben estar cubiertas por el ledger anti-repetición.");
  } else {
    assert(entityId(candidate.solution.player), "Adivina al crack necesita un jugador secreto QID.");
    assert(candidate.public.player && typeof candidate.public.player === "object", "Faltan los atributos verificados del jugador.");
    for (const field of PLAYER_FIELDS) {
      assert(candidate.public.player[field] !== undefined && candidate.public.player[field] !== null,
        `Falta el atributo verificable ${field}.`);
    }
    assert(Number.isInteger(candidate.public.player.age) && candidate.public.player.age > 0 &&
      Number.isInteger(candidate.public.player.shirt_number) && candidate.public.player.shirt_number > 0 &&
      Number.isInteger(candidate.public.player.height_cm) && candidate.public.player.height_cm > 0,
    "Edad, dorsal y altura deben ser valores verificados.");
    assert(candidate.repeat_keys.includes(candidate.solution.player),
      "El jugador secreto debe estar incluido en las claves anti-repetición.");
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function seededOrder(candidates, secret, date, game) {
  return candidates.map((candidate) => ({
    candidate,
    order: createHmac("sha256", secret).update(`${date}:${game}:${candidate.id}`).digest("hex")
  })).sort((a, b) => a.order.localeCompare(b.order)).map(({ candidate }) => candidate);
}

export function publicPuzzle(game, candidate) {
  if (game === "connections") return { tiles: candidate.public.tiles };
  if (game === "grid") return { rows: candidate.public.rows, columns: candidate.public.columns };
  return {};
}

export function preparePuzzle(game, candidate, date, secret) {
  validateCandidate(game, candidate);
  const id = createHmac("sha256", secret).update(`${date}:${game}:${candidate.id}`).digest("hex");
  return {
    game,
    puzzle_date: date,
    puzzle_id: id,
    difficulty: candidate.difficulty,
    payload: publicPuzzle(game, candidate),
    solution: candidate.solution,
    content_hash: digest({ game, payload: candidate.public, solution: candidate.solution }),
    repeat_key_hashes: [...new Set(candidate.repeat_keys.map((key) =>
      createHmac("sha256", secret).update(`${game}:${key}`).digest("hex")
    ))],
    source_refs: candidate.source_refs
  };
}

export function buildSchedule(catalog, startDate, days, secret, existing = {}) {
  assert(typeof secret === "string" && secret.length >= 32, "PUZZLE_SEED_SECRET debe tener al menos 32 caracteres.");
  assert(Number.isInteger(days) && days > 0 && days <= 60, "El calendario debe tener entre 1 y 60 días.");
  const dates = Array.from({ length: days }, (_, index) => {
    const date = new Date(`${startDate}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
  const recentKeys = new Map(GAMES.map((game) => [game, new Map()]));
  const contentHashes = new Map(GAMES.map((game) => [game, new Set(existing.content_hashes?.[game] || [])]));
  const persisted = new Map();
  const startBoundary = startDate;
  for (const puzzle of existing.puzzles || []) {
    assert(GAMES.includes(puzzle.game) && /^\d{4}-\d{2}-\d{2}$/.test(puzzle.puzzle_date) &&
      /^[0-9a-f]{64}$/.test(puzzle.content_hash) && Array.isArray(puzzle.repeat_key_hashes),
    "El historial publicado de Supabase tiene un formato inválido.");
    persisted.set(`${puzzle.puzzle_date}:${puzzle.game}`, puzzle);
    if (puzzle.puzzle_date < startBoundary) {
      for (const key of puzzle.repeat_key_hashes) {
        const lastUsed = recentKeys.get(puzzle.game).get(key);
        if (!lastUsed || puzzle.puzzle_date > lastUsed) recentKeys.get(puzzle.game).set(key, puzzle.puzzle_date);
      }
    }
  }
  const schedule = [];

  for (const date of dates) {
    const difficulty = difficultyForDate(date);
    for (const game of GAMES) {
      const alreadyPublished = persisted.get(`${date}:${game}`);
      if (alreadyPublished) {
        schedule.push({ ...alreadyPublished, existing: true });
        for (const key of alreadyPublished.repeat_key_hashes) recentKeys.get(game).set(key, date);
        continue;
      }
      const candidates = catalog[game];
      assert(Array.isArray(candidates) && candidates.length > 0, `El catálogo no contiene candidatos para ${game}.`);
      assert(unique(candidates.map((candidate) => candidate.id)), `Hay identificadores duplicados en el catálogo de ${game}.`);
      const ordered = seededOrder(candidates, secret, date, game);
      let selected;
      for (const candidate of ordered) {
        validateCandidate(game, candidate);
        if (candidate.difficulty !== difficulty) continue;
        const puzzle = preparePuzzle(game, candidate, date, secret);
        if (contentHashes.get(game).has(puzzle.content_hash)) continue;
        const previousDates = puzzle.repeat_key_hashes
          .map((key) => recentKeys.get(game).get(key))
          .filter(Boolean);
        const minimumWindow = 30;
        const windows = Array.from(
          { length: Math.floor((REPEAT_DAYS[game] - minimumWindow) / 15) + 1 },
          (_, index) => REPEAT_DAYS[game] - index * 15
        );
        const repeatWindowDays = windows.find((windowDays) => previousDates.every((previousDate) => {
          const elapsed = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${previousDate}T00:00:00Z`)) / 86400000;
          return elapsed > windowDays;
        }));
        if (repeatWindowDays !== undefined) {
          selected = puzzle;
          selected.repeat_window_days = repeatWindowDays;
          selected.repeated_from = previousDates
            .filter((previousDate) => Date.parse(`${date}T00:00:00Z`) - Date.parse(`${previousDate}T00:00:00Z`) <= REPEAT_DAYS[game])
            .sort()
            .at(-1) || null;
          break;
        }
      }
      assert(selected, `No hay candidato único y sin repetición para ${game} el ${date} (dificultad ${difficulty}).`);
      if (selected.repeat_window_days < REPEAT_DAYS[game]) {
        console.warn(`Repetición controlada: ${game} ${date}; ventana ${selected.repeat_window_days} días; última coincidencia ${selected.repeated_from}.`);
      }
      schedule.push(selected);
      contentHashes.get(game).add(selected.content_hash);
      for (const key of selected.repeat_key_hashes) recentKeys.get(game).set(key, date);
    }
  }
  return schedule;
}
