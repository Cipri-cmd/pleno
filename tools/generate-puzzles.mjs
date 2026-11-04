import { buildSchedule, madridDate, validateCatalog } from "./puzzle-pipeline.mjs";

const DAYS = 60;

async function main() {
  const secret = process.env.PUZZLE_SEED_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY;
  if (!secret || !supabaseUrl || !serviceKey) {
    throw new Error("Configura PUZZLE_SEED_SECRET, SUPABASE_URL y SUPABASE_SECRET_KEY.");
  }

  const catalogResponse = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/puzzle-catalog/catalog.json`, {
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
    signal: AbortSignal.timeout(20000)
  });
  if (!catalogResponse.ok) {
    throw new Error(`No se pudo cargar el catálogo privado de Supabase: ${catalogResponse.status} ${(await catalogResponse.text()).slice(0, 300)}`);
  }
  const catalog = await catalogResponse.json();
  validateCatalog(catalog);
  const start = madridDate();
  const endDate = new Date(`${start}T12:00:00Z`);
  endDate.setUTCDate(endDate.getUTCDate() + DAYS - 1);
  const historyResponse = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/get_daily_game_schedule`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ p_start_date: start, p_end_date: endDate.toISOString().slice(0, 10) }),
    signal: AbortSignal.timeout(20000)
  });
  const historyText = await historyResponse.text();
  if (!historyResponse.ok) {
    throw new Error(`No se pudo consultar el ledger de Supabase: ${historyResponse.status} ${historyText.slice(0, 300)}`);
  }
  const history = JSON.parse(historyText);
  const schedule = buildSchedule(catalog, start, DAYS, secret, history);
  const entityResponse = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/publish_daily_game_entities`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ p_entities: catalog.entities }),
    signal: AbortSignal.timeout(20000)
  });
  if (!entityResponse.ok) {
    throw new Error(`No se pudieron sincronizar las entidades verificadas: ${entityResponse.status} ${(await entityResponse.text()).slice(0, 300)}`);
  }
  let published = 0;
  for (const puzzle of schedule) {
    if (puzzle.existing) continue;
    const response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/publish_daily_game_puzzle`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        p_game: puzzle.game,
        p_puzzle_date: puzzle.puzzle_date,
        p_payload: puzzle.payload,
        p_solution: puzzle.solution,
        p_content_hash: puzzle.content_hash,
        p_difficulty: puzzle.difficulty,
        p_repeat_key_hashes: puzzle.repeat_key_hashes,
        p_repeat_window_days: puzzle.repeat_window_days,
        p_source_refs: puzzle.source_refs
      }),
      signal: AbortSignal.timeout(20000)
    });
    const result = await response.text();
    if (!response.ok) {
      throw new Error(`No se pudo publicar ${puzzle.game} del ${puzzle.puzzle_date}: ${response.status} ${result.slice(0, 300)}`);
    }
    if (result === "true") published++;
  }
  console.log(`Calendario validado: ${schedule.length} puzzles para ${DAYS} días; ${published} nuevos, desde ${start} (Europe/Madrid).`);
}

main().catch((error) => {
  console.error(`Generación diaria fallida: ${error.message}`);
  process.exitCode = 1;
});
