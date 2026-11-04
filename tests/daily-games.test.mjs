import test from "node:test";
import assert from "node:assert/strict";
import { buildSchedule, difficultyForDate, madridDate, preparePuzzle, validateCatalog } from "../tools/puzzle-pipeline.mjs";

const secret = "test-only-seed-secret-that-is-never-published";
const qid = (n) => `Q${n}`;
const source = (n) => [qid(10000 + n)];

function catalogForThirtyDays() {
  const catalog = { entities: [], connections: [], grid: [], player: [] };
  let index = 1;
  const register = (id, name, attributes = {}) => {
    if (!catalog.entities.some((entity) => entity.id === id)) {
      catalog.entities.push({ id, name, attributes });
    }
  };
  const add = (game, difficulty) => {
    const base = index++ * 100;
    if (game === "connections") {
      const groups = Array.from({ length: 4 }, (_, group) => ({
        category: `Categoría ${base}-${group}`,
        color: ["yellow", "green", "blue", "purple"][group],
        members: Array.from({ length: 4 }, (_, member) => qid(base + group * 4 + member + 1))
      }));
      groups.forEach((group) => group.members.forEach((id, member) => register(id, `${id} futbolista ${member + 1}`)));
      catalog.connections.push({
        id: `test-${base}`, difficulty, source_refs: source(base),
        repeat_keys: groups.flatMap((group) => group.members),
        possible_groups: groups,
        public: { tiles: groups.flatMap((group) => group.members) }, solution: { groups }
      });
    } else if (game === "grid") {
      const cells = Array.from({ length: 9 }, (_, cell) =>
        Array.from({ length: 3 }, (_, answer) => qid(base + cell * 3 + answer + 1)));
      cells.flat().forEach((id, answer) => register(id, `${id} jugador ${answer + 1}`));
      catalog.grid.push({
        id: `test-${base}`, difficulty, source_refs: source(base),
        repeat_keys: cells.flat(),
        public: { rows: ["Fila 1", "Fila 2", "Fila 3"], columns: ["Columna 1", "Columna 2", "Columna 3"] },
        solution: { cells }
      });
    } else {
      const id = qid(base + 1);
      const attributes = { club: "Equipo", country: "País", position: "Delantero", age: 25, shirt_number: 9, height_cm: 180 };
      register(id, `${id} crack`, attributes);
      catalog.player.push({
        id: `test-${base}`, difficulty, source_refs: source(base),
        repeat_keys: [id],
        public: { player: attributes },
        solution: { player: id }
      });
    }
  };
  for (let day = 0; day < 30; day++) {
    const date = new Date("2026-01-05T12:00:00Z");
    date.setUTCDate(date.getUTCDate() + day);
    const difficulty = difficultyForDate(date.toISOString().slice(0, 10));
    for (const game of ["connections", "grid", "player"]) {
      for (let candidate = 0; candidate < 5; candidate++) add(game, difficulty);
    }
  }
  return catalog;
}

test("Madrid date changes at midnight and follows daylight saving transitions", () => {
  assert.equal(madridDate(new Date("2026-01-04T22:59:00Z")), "2026-01-04");
  assert.equal(madridDate(new Date("2026-01-04T23:00:00Z")), "2026-01-05");
  assert.equal(madridDate(new Date("2026-07-04T21:59:00Z")), "2026-07-04");
  assert.equal(madridDate(new Date("2026-07-04T22:00:00Z")), "2026-07-05");
});

test("difficulty rises Monday to Sunday", () => {
  assert.deepEqual(
    ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09", "2026-01-10", "2026-01-11"].map(difficultyForDate),
    [1, 2, 3, 4, 5, 6, 7]
  );
});

test("30-day test schedule is deterministic, complete, private, and non-repeating", () => {
  const catalog = catalogForThirtyDays();
  const first = buildSchedule(catalog, "2026-01-05", 30, secret);
  const second = buildSchedule(catalog, "2026-01-05", 30, secret);
  assert.equal(first.length, 90);
  assert.deepEqual(first, second);
  for (const game of ["connections", "grid", "player"]) {
    const entries = first.filter((puzzle) => puzzle.game === game);
    assert.equal(entries.length, 30);
    assert.equal(new Set(entries.map((puzzle) => puzzle.content_hash)).size, 30);
    assert.equal(new Set(entries.map((puzzle) => puzzle.puzzle_date)).size, 30);
    for (const puzzle of entries) {
      assert.ok(puzzle.solution);
      assert.ok(puzzle.content_hash);
      assert.ok(puzzle.repeat_key_hashes.length);
    }
  }
});

test("player answers never appear in the public payload", () => {
  const catalog = catalogForThirtyDays();
  const candidate = catalog.player[0];
  const puzzle = preparePuzzle("player", candidate, "2026-01-05", secret);
  assert.deepEqual(puzzle.payload, {});
  assert.equal(JSON.stringify(puzzle.payload).includes(candidate.solution.player), false);
  assert.equal(JSON.stringify(puzzle.payload).includes(candidate.public.player.club), false);
});

test("catalog rejects duplicate display names and missing answer entities", () => {
  const duplicateNameCatalog = catalogForThirtyDays();
  duplicateNameCatalog.entities[1].name = duplicateNameCatalog.entities[0].name;
  assert.throws(() => validateCatalog(duplicateNameCatalog), /nombres vacíos.*ambiguos/);

  const missingEntityCatalog = catalogForThirtyDays();
  const missingId = missingEntityCatalog.connections[0].solution.groups[0].members[0];
  missingEntityCatalog.entities = missingEntityCatalog.entities.filter((entity) => entity.id !== missingId);
  assert.throws(() => validateCatalog(missingEntityCatalog), /entidades ausentes/);
});

test("Connections rejects ambiguous partitions", () => {
  const candidate = catalogForThirtyDays().connections[0];
  candidate.possible_groups = [...candidate.possible_groups, {
    category: "Categoría ambigua",
    color: "yellow",
    members: candidate.public.tiles.slice(0, 4)
  }];
  assert.throws(() => preparePuzzle("connections", candidate, "2026-01-05", secret), /única solución/);
});
