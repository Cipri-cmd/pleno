// PLENO · la porra de LaLiga (100 % gratis). Datos: football-data.org a través de server.mjs.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");
const errorText = (error) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  if (error && typeof error === "object") {
    const parts = [error.code, error.message, error.details, error.hint]
      .filter((part) => typeof part === "string" && part.trim());
    return parts.join(" · ") || "Error desconocido.";
  }
  return String(error);
};
const SB_URL = "https://qynmrpgahxeeafublofs.supabase.co";
const SB_KEY = "sb_publishable_It1kV2ryR-toeyDeA4WNyw_aXcPThkG";
let S = { league: null, me: "", preds: {}, joker: {}, friends: {}, th: "carbon" };
try { Object.assign(S, JSON.parse(localStorage.getItem("pleno"))); } catch {}
const save = () => { try { localStorage.setItem("pleno", JSON.stringify(S)); } catch {} };
const V = { tab: "i", team: null, sub: "res", md: null, challengeMd: null, leagueSection: "ranking", instructionsOpen: false, instructionsNeedsFocus: false, profileOpen: false, profileNeedsFocus: false, leaguePickerOpen: false, leaguePickerNeedsFocus: false, tbl: "all", q: "", tabDirection: 1 };
const D = { ready: false, err: null, matches: [], table: [], tH: [], tA: [], teams: [], by: {}, scorers: [], cur: 1, seasonStartYear: 0, tc: {}, polling: false, lastMatchesUpdate: 0, lastStandingsUpdate: 0, lastTeamsUpdate: 0, lastScorersUpdate: 0, lastStandingsPoll: 0, lastTeamsPoll: 0, lastScorersPoll: 0, matchesTimestampEstimated: false, standingsTimestampEstimated: false, teamsTimestampEstimated: false, scorersTimestampEstimated: false, matchesStale: false, standingsStale: false, teamsStale: false, scorersStale: false, matchesError: "", standingsError: "", teamsError: "", scorersError: "", minigames: { round_bonuses: [], minute_bonuses: [], red_cards: [] } };
const AUTH = { client: null, session: null, ready: false, busy: false, googleBusy: false, syncing: false, minigameSyncing: false, mode: "login", email: "", password: "", error: "" };
const ROOM = { loading: false, loaded: false, busy: false, archiving: false, error: "", archiveError: "", isAdmin: false, debts: [], chronicles: [], hallSeasons: [], dinnerLeaders: [], channel: null, leagueId: null, updatedAt: 0 };
const CHAT = { loading: false, sending: false, uploadingAvatar: false, error: "", messages: [], avatars: {}, avatarPaths: {}, channel: null, channelLeagueId: null, loadedLeagueId: null, subscribed: false, input: "" };
const PROFILE = { loading: false, error: "" };
const LEAGUES = {
  items: [], loading: false, busy: false, error: "", warning: "",
  createName: "", leagueName: "", joinName: "", inviteCode: ""
};
const GAME = { loading: false, busy: false, spinning: false, spinStage: "", wheelRotation: 0, wheelResult: null, data: null, error: "", date: "" };
const WHEEL_SECTIONS = [
  { type: "boots_gold", title: "Botas de Oro", subtitle: "+5 puntos" },
  { type: "joker_x2", title: "El Maletín", subtitle: "Joker x2" },
  { type: "red_card", title: "Tarjeta Roja", subtitle: "Sabotaje" },
  { type: "double_or_nothing", title: "Doble o Nada", subtitle: "Re-giro x2" },
  { type: "var_annulled", title: "Gol Anulado", subtitle: "Premio perdido" },
  { type: "second_chance", title: "Segunda Oportunidad", subtitle: "+1 intento" }
];
const PENDING_PREDS = new Set();
const FAILED_PREDS = new Map();
let instructionsReturnFocus = null;
const onboardingSeenMemory = new Set();

function onboardingKey(userId = AUTH.session?.user?.id) {
  return userId ? `pleno:hasSeenOnboarding:v1:${userId}` : "";
}
function hasSeenOnboarding(userId) {
  const key = onboardingKey(userId);
  if (!key) return true;
  if (onboardingSeenMemory.has(key)) return true;
  try { return localStorage.getItem(key) === "true"; }
  catch { return false; }
}
function markOnboardingSeen(userId) {
  const key = onboardingKey(userId);
  if (!key) return;
  onboardingSeenMemory.add(key);
  try { localStorage.setItem(key, "true"); }
  catch { toast("No se pudo guardar esta preferencia en este navegador."); }
}
function openInstructions() {
  if (!AUTH.session || V.instructionsOpen) return;
  instructionsReturnFocus = document.activeElement;
  V.instructionsOpen = true;
  V.instructionsNeedsFocus = true;
  render();
}
function closeInstructions() {
  if (!V.instructionsOpen) return;
  markOnboardingSeen(AUTH.session?.user?.id);
  V.instructionsOpen = false;
  document.body.classList.remove("instructions-visible");
  render();
  requestAnimationFrame(() => {
    const target = instructionsReturnFocus?.isConnected
      ? instructionsReturnFocus
      : document.querySelector(".info-button");
    target?.focus();
    instructionsReturnFocus = null;
  });
}
function syncInstructionsModal() {
  const modal = document.querySelector(".instructions-overlay, .profile-overlay, .league-picker-overlay");
  document.body.classList.toggle("instructions-visible", Boolean(modal));
  if (modal && V.leaguePickerOpen && (V.leaguePickerNeedsFocus || !modal.contains(document.activeElement))) {
    V.leaguePickerNeedsFocus = false;
    modal.querySelector(".league-picker-close")?.focus();
  } else if (modal && V.profileOpen && (V.profileNeedsFocus || !modal.contains(document.activeElement))) {
    V.profileNeedsFocus = false;
    modal.querySelector(".profile-close")?.focus();
  } else if (modal && V.instructionsNeedsFocus) {
    V.instructionsNeedsFocus = false;
    modal.querySelector(".instructions-close")?.focus();
  }
}
function handleInstructionsKeydown(event) {
  const modal = V.leaguePickerOpen
    ? document.querySelector(".league-picker-dialog")
    : V.profileOpen
    ? document.querySelector(".profile-dialog")
    : V.instructionsOpen ? document.querySelector(".instructions-dialog") : null;
  if (!modal) return;
  if (event.key === "Escape") {
    event.preventDefault();
    if (V.leaguePickerOpen) closeLeaguePicker();
    else if (V.profileOpen) closeProfile();
    else closeInstructions();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = [...modal.querySelectorAll('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
  if (!focusable.length) return;
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function freshnessLabel(name, timestamp, stale, error) {
  if (error) {
    if (!timestamp) return `${name}: sin datos · no se pudo conectar`;
    const age = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
    return `${name}: sin respuesta · última actualización hace ${age} min`;
  }
  if (!timestamp) return `${name}: conectando…`;
  if (stale) return `${name}: datos guardados`;
  return "";
}
const freshnessClass = (stale, error) => error ? "is-error" : stale ? "is-stale" : "";
const mainDataSnapshot = () => JSON.stringify([
  D.matches, D.table, D.tH, D.tA, D.teams, D.scorers, D.cur, D.err,
  freshnessLabel("Partidos", D.lastMatchesUpdate, D.matchesStale, D.matchesError),
  freshnessLabel("Clasificación", D.lastStandingsUpdate, D.standingsStale, D.standingsError),
  freshnessLabel("Clubes", D.lastTeamsUpdate, D.teamsStale, D.teamsError),
  freshnessLabel("Goleadores", D.lastScorersUpdate, D.scorersStale, D.scorersError)
]);

async function api(p, q = {}) {
  const r = await fetch(`/api/${p}?${new URLSearchParams(q)}`);
  let j = {}; try { j = await r.json(); } catch {}
  if (!r.ok) throw new Error(j.message || `Error ${r.status}`);
  if (["competitions/PD/matches", "competitions/PD/standings", "competitions/PD/teams", "competitions/PD/scorers"].includes(p)) {
    const updatedAtHeader = r.headers.get("x-data-updated-at");
    const updatedAt = Date.parse(updatedAtHeader || "");
    const hasValidTimestamp = Boolean(updatedAtHeader) && Number.isFinite(updatedAt);
    const lastUpdated = hasValidTimestamp ? updatedAt : Date.now();
    const stale = r.headers.get("x-data-stale") === "true";
    if (p.endsWith("/matches")) {
      D.lastMatchesUpdate = lastUpdated;
      D.matchesStale = stale;
      D.matchesTimestampEstimated = !hasValidTimestamp;
    } else if (p.endsWith("/standings")) {
      D.lastStandingsUpdate = lastUpdated;
      D.standingsStale = stale;
      D.standingsTimestampEstimated = !hasValidTimestamp;
    } else if (p.endsWith("/teams")) {
      D.lastTeamsUpdate = lastUpdated;
      D.teamsStale = stale;
      D.teamsTimestampEstimated = !hasValidTimestamp;
    } else {
      D.lastScorersUpdate = lastUpdated;
      D.scorersStale = stale;
      D.scorersTimestampEstimated = !hasValidTimestamp;
    }
  }
  return j;
}
let toastTimeout;
const toast = (m, type = "") => {
  const t = $("#toast");
  if (!t) return;
  t.textContent = m;
  t.classList.toggle("toast-error", type === "error");
  t.classList.add("v");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => t.classList.remove("v"), 3200);
};
const fb = (i) => { i.outerHTML = `<span class="crest-fallback ${i.classList.contains("l") ? "l" : ""}">${esc(i.dataset.t)}</span>`; };
const crest = (t, c = "") => `<img class="cr ${c}" src="${esc(t.crest)}" alt="" loading="lazy" data-t="${esc(t.tla || (t.name || "").slice(0, 3).toUpperCase())}" onerror="fb(this)">`;
const clubName = (t) => t.name || t.shortName || "Club";
const nm = (t) => esc(clubName(t));
const fmtD = (d) => new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(d));
const cd = (d) => { const ms = new Date(d) - Date.now(); if (ms <= 0) return "ahora"; const h = Math.floor(ms / 36e5); return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${Math.floor(ms % 36e5 / 6e4)}min`; };
const live = (m) => m.status === "IN_PLAY" || m.status === "PAUSED";
const fin = (m) => m.status === "FINISHED";
const PREDICTION_LOCK_MS = 60 * 60 * 1000;
const predictionCutoff = (m) => new Date(m.utcDate).getTime() - PREDICTION_LOCK_MS;
const open = (m) => ["SCHEDULED", "TIMED"].includes(m.status) && Date.now() < predictionCutoff(m);
const predictionLocked = (m) => ["SCHEDULED", "TIMED"].includes(m.status)
  && Date.now() >= predictionCutoff(m)
  && Date.now() < new Date(m.utcDate).getTime();
const res = (m) => ({ h: m.score?.fullTime?.home ?? 0, a: m.score?.fullTime?.away ?? 0 });

/* ---------- datos ---------- */
function ingest(st, mt) {
  if (st) {
    const get = (t) => st.standings.find((s) => s.type === t)?.table || [];
    D.table = get("TOTAL"); D.tH = get("HOME"); D.tA = get("AWAY"); D.cur = st.season?.currentMatchday || D.cur;
    const seasonStart = Date.parse(st.season?.startDate || "");
    if (Number.isFinite(seasonStart)) D.seasonStartYear = new Date(seasonStart).getUTCFullYear();
  }
  if (mt) {
    D.matches = mt.matches;
    if (!D.seasonStartYear && mt.matches.length) {
      const firstKickoff = mt.matches.map((match) => Date.parse(match.utcDate)).filter(Number.isFinite).sort((a, b) => a - b)[0];
      if (firstKickoff) D.seasonStartYear = new Date(firstKickoff).getUTCFullYear();
    }
  }
}
async function loadMain() {
  const [standings, matches, teams, scorers] = await Promise.allSettled([
    api("competitions/PD/standings"),
    api("competitions/PD/matches"),
    api("competitions/PD/teams"),
    api("competitions/PD/scorers", { limit: 200 })
  ]);
  if (standings.status === "fulfilled") {
    ingest(standings.value, null);
    D.lastStandingsPoll = Date.now();
    D.standingsError = "";
  } else D.standingsError = errorText(standings.reason);
  if (matches.status === "fulfilled") {
    ingest(null, matches.value);
    D.matchesError = "";
  } else D.matchesError = errorText(matches.reason);
  if (teams.status === "fulfilled") {
    D.teams = teams.value.teams;
    D.by = Object.fromEntries(teams.value.teams.map((team) => [team.id, team]));
    D.teamsError = "";
    D.lastTeamsPoll = Date.now();
  } else D.teamsError = errorText(teams.reason);
  if (scorers.status === "fulfilled") {
    D.scorers = scorers.value.scorers;
    D.scorersError = "";
    D.lastScorersPoll = Date.now();
  } else D.scorersError = errorText(scorers.reason);
  D.err = standings.status === "rejected" && matches.status === "rejected"
    ? (errorText(matches.reason).includes("Failed to fetch") ? "No hay servidor. Arráncalo con: node --env-file=.env server.mjs" : errorText(matches.reason))
    : null;
  D.ready = true; render();
}
async function poll() {
  if (!D.ready || D.polling || document.visibilityState === "hidden") return;
  D.polling = true;
  const previous = mainDataSnapshot();
  try {
    const tasks = [{ type: "matches", request: api("competitions/PD/matches") }];
    const refreshStandings = Date.now() - D.lastStandingsPoll >= 60000;
    const refreshTeams = Date.now() - D.lastTeamsPoll >= 86400000;
    const refreshScorers = Date.now() - D.lastScorersPoll >= 600000;
    if (refreshStandings) tasks.push({ type: "standings", request: api("competitions/PD/standings") });
    if (refreshTeams) tasks.push({ type: "teams", request: api("competitions/PD/teams") });
    if (refreshScorers) tasks.push({ type: "scorers", request: api("competitions/PD/scorers", { limit: 200 }) });
    const results = await Promise.allSettled(tasks.map((task) => task.request));
    tasks.forEach((task, index) => {
      const result = results[index];
      if (task.type === "matches") {
        if (result.status === "fulfilled") {
          D.matches = result.value.matches;
          D.matchesError = "";
        } else D.matchesError = errorText(result.reason);
      } else if (task.type === "standings") {
        if (result.status === "fulfilled") {
          ingest(result.value, null);
          D.lastStandingsPoll = Date.now();
          D.standingsError = "";
        } else D.standingsError = errorText(result.reason);
      } else if (task.type === "teams") {
        if (result.status === "fulfilled") {
          D.teams = result.value.teams;
          D.by = Object.fromEntries(result.value.teams.map((team) => [team.id, team]));
          D.lastTeamsPoll = Date.now();
          D.teamsError = "";
        } else D.teamsError = errorText(result.reason);
      } else if (task.type === "scorers") {
        if (result.status === "fulfilled") {
          D.scorers = result.value.scorers;
          D.lastScorersPoll = Date.now();
          D.scorersError = "";
        } else D.scorersError = errorText(result.reason);
      }
    });
    if (!D.matchesError || !D.standingsError) D.err = null;
    else D.err = D.matchesError;
  } finally {
    D.polling = false;
  }
  if (AUTH.session && S.league?.id) refreshMinigameScoreData(false);
  if (V.tab === "l") loadRoomData();
  if (laLigaSeasonComplete() && AUTH.session && S.league?.id) {
    if (!ROOM.loaded && !ROOM.loading) loadRoomData(true);
    else maybeArchiveLeagueSeason();
  }
  const current = mainDataSnapshot();
  if (current !== previous && !document.activeElement?.matches?.("input,textarea")) render();
}
async function loadTeam(id) {
  const cached = D.tc[id];
  if (cached?.loading || (cached && (cached.error || Date.now() - cached.updatedAt < 3600000))) return;
  const o = (D.tc[id] = { loading: true }); render();
  try { const t = await api(`teams/${id}`); o.sq = t.squad || []; o.coach = t.coach?.name; o.updatedAt = Date.now(); }
  catch (error) { o.sq = []; o.error = errorText(error); }
  o.loading = false; render();
}
function retryTeam(id) {
  delete D.tc[id];
  loadTeam(id);
}

/* ---------- puntos y liga entre amigos ---------- */
const mine = () => ({ id: AUTH.session?.user?.id || "me", n: S.me || "Tú", p: Object.fromEntries(Object.entries(S.preds).map(([k, v]) => [k, [v.h, v.a]])), j: S.joker });
const redCarded = (userId, matchId) => D.minigames.red_cards.some((card) => card.target_user_id === userId && String(card.match_id) === String(matchId));
const minuteBonus = (userId, matchId) => D.minigames.minute_bonuses
  .filter((bonus) => bonus.user_id === userId && String(bonus.match_id) === String(matchId))
  .reduce((sum, bonus) => sum + Number(bonus.points || 0), 0);
const roundBonus = (userId, matchday) => D.minigames.round_bonuses
  .filter((bonus) => bonus.user_id === userId && Number(bonus.matchday) === Number(matchday))
  .reduce((sum, bonus) => sum + Number(bonus.points || 0), 0);
function total(pl) {
  const r = { pts: 0, ex: 0, ok: 0, sg: 0 };
  D.matches.filter(fin).forEach((m) => {
    const p = pl.p[m.id];
    if (!p) { r.pts += minuteBonus(pl.id, m.id); return; }
    const joker = pl.j[m.matchday] === m.id || pl.j[m.id] === true;
    const g = redCarded(pl.id, m.id) ? 0 : pts({ h: p[0], a: p[1] }, res(m), joker);
    r.pts += g; const b = joker ? g / 2 : g; if (b === 10) r.ex++; else if (b === 7) r.ok++; else if (b === 3) r.sg++;
    r.pts += minuteBonus(pl.id, m.id);
  });
  for (const matchday of new Set(D.matches.filter(fin).map((match) => match.matchday))) {
    r.pts += roundBonus(pl.id, matchday);
  }
  return r;
}
const board = () => [{ ...mine(), me: 1 }, ...Object.entries(S.friends).map(([id, player]) => ({ ...player, id }))].map((pl) => ({ ...pl, ...total(pl) })).sort((a, b) => b.pts - a.pts || b.ex - a.ex);
function roundBoard(md) {
  const matches = D.matches.filter((m) => m.matchday === md), finished = matches.filter(fin);
  const players = [{ ...mine(), me: true }, ...Object.entries(S.friends).map(([id, player]) => ({ ...player, me: false, id }))];
  const rows = players.map((pl) => {
    const score = { pts: 0, exact: 0, played: 0 };
    for (const match of finished) {
      const prediction = pl.p[match.id];
      if (prediction) {
        const joker = pl.j[md] === match.id || pl.j[match.id] === true;
        const points = redCarded(pl.id, match.id) ? 0 : pts({ h: prediction[0], a: prediction[1] }, res(match), joker);
        score.pts += points;
        score.played++;
        if (points === (joker ? 20 : 10)) score.exact++;
      }
      score.pts += minuteBonus(pl.id, match.id);
    }
    if (finished.length) score.pts += roundBonus(pl.id, md);
    return { ...pl, ...score };
  }).sort((a, b) => b.pts - a.pts || b.exact - a.exact || b.played - a.played);
  return { matches, finished, rows };
}
async function copyLeagueCode() {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(S.league.code);
    else {
      const field = document.createElement("textarea");
      field.value = S.league.code;
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.append(field);
      field.select();
      const copied = document.execCommand("copy");
      field.remove();
      if (!copied) throw new Error("El navegador no permitió copiar");
    }
    toast("Código de liga copiado");
  } catch (e) { toast(`No se pudo copiar: ${e.message}`); }
}
async function shareLeague() {
  const text = `Únete a mi liga de PLENO con el código ${S.league.code}`;
  if (!navigator.share) return copyLeagueCode();
  try { await navigator.share({ title: "Mi liga PLENO", text }); }
  catch (e) { if (e.name !== "AbortError") toast(`No se pudo compartir: ${e.message}`); }
}
function stp(id, s, d) { const el = $("#" + s + id); el.value = Math.min(20, Math.max(0, (parseInt(el.value) || 0) + d)); }
function useS(id, h, a) { $("#h" + id).value = h; $("#a" + id).value = a; }
function sv(id) {
  const m = D.matches.find((x) => x.id === id);
  if (!m || !open(m)) return toast("Los pronósticos se cierran una hora antes del partido.");
  const previous = S.preds[id] ? { ...S.preds[id] } : null;
  const next = { h: Math.min(20, parseInt($("#h" + id).value) || 0), a: Math.min(20, parseInt($("#a" + id).value) || 0) };
  S.preds[id] = next;
  save(); render();
  persistPrediction(id)
    .then(() => toast(`Pronóstico sincronizado: ${nm(m.homeTeam)} ${next.h}–${next.a} ${nm(m.awayTeam)}`))
    .catch((e) => {
      FAILED_PREDS.delete(String(id));
      if (S.preds[id]?.h === next.h && S.preds[id]?.a === next.a) {
        if (previous) S.preds[id] = previous;
        else delete S.preds[id];
        save();
        render();
      }
      const message = /one hour before kickoff|predictions close/i.test(e.message)
        ? "El plazo de edición ya terminó: los pronósticos se cierran una hora antes."
        : `No se pudo sincronizar el pronóstico: ${e.message}`;
      toast(message);
    });
}
function jok(md, id) {
  const selected = S.joker[md] === id || S.joker[id] === true;
  S.joker[md] = selected ? null : id;
  delete S.joker[id];
  const match = D.matches.find((m) => m.id === id);
  save(); render();
  if (S.preds[id] && match) persistPrediction(id).catch((e) => toast(`El Joker no se sincronizó: ${e.message}`));
}

function resetLeagueState() {
  PENDING_PREDS.clear();
  FAILED_PREDS.clear();
  if (ROOM.channel && AUTH.client) AUTH.client.removeChannel(ROOM.channel);
  Object.assign(ROOM, { loading: false, loaded: false, busy: false, archiving: false, error: "", archiveError: "", isAdmin: false, debts: [], chronicles: [], hallSeasons: [], dinnerLeaders: [], channel: null, channelLeagueId: null, leagueId: null, updatedAt: 0 });
  if (CHAT.channel && AUTH.client) AUTH.client.removeChannel(CHAT.channel);
  Object.assign(CHAT, { loading: false, sending: false, uploadingAvatar: false, error: "", messages: [], avatars: {}, avatarPaths: {}, channel: null, channelLeagueId: null, loadedLeagueId: null, subscribed: false, input: "" });
  S = { league: null, me: "", preds: {}, joker: {}, friends: {}, th: S.th };
  D.minigames = { round_bonuses: [], minute_bonuses: [], red_cards: [] };
  save();
}
async function syncLeagueData(leagueId, userId) {
  const { data: members, error: memberError } = await AUTH.client.from("league_members")
    .select("user_id,display_name")
    .eq("league_id", leagueId);
  if (memberError) throw memberError;
  const friends = Object.fromEntries((members || [])
    .filter((member) => member.user_id !== userId)
    .map((member) => [member.user_id, { n: member.display_name, p: {}, j: {} }]));
  const { data: predictions, error: predictionError } = await AUTH.client.from("predictions")
    .select("user_id,match_id,home_goals,away_goals,joker")
    .eq("league_id", leagueId);
  if (predictionError) throw predictionError;
  const preds = {}, joker = {};
  for (const p of predictions || []) {
    const matchId = String(p.match_id);
    if (p.user_id === userId) {
      preds[matchId] = { h: p.home_goals, a: p.away_goals };
      if (p.joker) joker[matchId] = true;
    } else if (friends[p.user_id]) {
      friends[p.user_id].p[matchId] = [p.home_goals, p.away_goals];
      if (p.joker) friends[p.user_id].j[matchId] = true;
    }
  }
  S.preds = preds;
  S.joker = joker;
  S.friends = friends;
  save();
}
async function loadCloudLeague(preferredLeagueId = null) {
  const loadMemberships = (includeOwner) => AUTH.client.from("league_members")
    .select(`league_id,display_name,leagues!inner(id,name,invite_code${includeOwner ? ",owner_id" : ""})`)
    .eq("user_id", AUTH.session.user.id)
    .order("joined_at", { ascending: true });
  LEAGUES.warning = "";
  let { data, error } = await loadMemberships(true);
  let hasOwnerColumn = true;
  const errorMessage = errorText(error).toLowerCase();
  if (error && errorMessage.includes("owner_id") &&
      (error.code === "42703" || error.code === "PGRST204" || /does not exist|not find|schema cache/.test(errorMessage))) {
    ({ data, error } = await loadMemberships(false));
    if (!error) {
      hasOwnerColumn = false;
      LEAGUES.warning = "Tus ligas se han cargado, pero falta la migración de borrado de ligas. Ejecuta supabase-delete-league.sql en el SQL Editor de Supabase para activar esa función.";
    }
  }
  if (error) throw error;
  LEAGUES.items = (data || []).map((member) => {
    const league = Array.isArray(member.leagues) ? member.leagues[0] : member.leagues;
    return league ? { id: league.id, name: league.name, code: league.invite_code, displayName: member.display_name, ownerId: hasOwnerColumn ? league.owner_id : null } : null;
  }).filter(Boolean);
  let preferredId = preferredLeagueId;
  if (!preferredId) {
    try { preferredId = localStorage.getItem(`pleno:activeLeague:${AUTH.session.user.id}`); }
    catch {}
  }
  const member = LEAGUES.items.find((league) => league.id === preferredId)
    ? (data || []).find((row) => row.league_id === preferredId)
    : (data || [])[0];
  if (!member) {
    resetLeagueState();
    LEAGUES.items = [];
    return;
  }
  const league = Array.isArray(member.leagues) ? member.leagues[0] : member.leagues;
  if (!league) throw new Error("No se pudo cargar la liga asociada a tu cuenta");
  try { localStorage.setItem(`pleno:activeLeague:${AUTH.session.user.id}`, league.id); }
  catch { toast("No se pudo guardar la liga activa en este navegador."); }
  S.league = { id: league.id, name: league.name, code: league.invite_code };
  S.me = member.display_name;
  await syncLeagueData(league.id, AUTH.session.user.id);
}
async function persistPrediction(id) {
  if (!AUTH.session || !S.league?.id) throw new Error("Inicia sesión y únete a una liga para sincronizar");
  PENDING_PREDS.add(String(id));
  try {
    const { error } = await AUTH.client.from("predictions").upsert({
      league_id: S.league.id,
      user_id: AUTH.session.user.id,
      match_id: id,
      home_goals: S.preds[id].h,
      away_goals: S.preds[id].a,
      joker: Object.values(S.joker).includes(id) || S.joker[id] === true
    }, { onConflict: "league_id,user_id,match_id" });
    if (error) throw error;
    FAILED_PREDS.delete(String(id));
  } catch (e) {
    FAILED_PREDS.set(String(id), {
      prediction: { ...S.preds[id] },
      joker: Object.values(S.joker).includes(id) || S.joker[id] === true
    });
    throw e;
  } finally {
    PENDING_PREDS.delete(String(id));
  }
}
async function refreshCloudPredictions() {
  if (document.visibilityState === "hidden" || !AUTH.session || !S.league?.id || !AUTH.client || AUTH.syncing || PENDING_PREDS.size || document.activeElement?.matches?.("input,textarea")) return;
  const previous = JSON.stringify([S.preds, S.joker, S.friends]);
  AUTH.syncing = true;
  try { await syncLeagueData(S.league.id, AUTH.session.user.id); }
  catch (e) {
    if (!AUTH.syncError) toast(`No se pudieron actualizar los datos de la liga: ${e.message}`);
    AUTH.syncError = true;
    return;
  } finally { AUTH.syncing = false; }
  AUTH.syncError = false;
  for (const [id, failed] of FAILED_PREDS) {
    S.preds[id] = failed.prediction;
    if (failed.joker) S.joker[id] = true;
    else delete S.joker[id];
  }
  if (JSON.stringify([S.preds, S.joker, S.friends]) !== previous) render();
}
async function handleAuthSession(session) {
  const userId = session?.user?.id ?? null;
  const previousId = AUTH.userId;
  AUTH.session = session;
  AUTH.ready = true;
  AUTH.userId = userId;
  AUTH.error = "";
  if (previousId !== userId) {
    V.profileOpen = false;
    V.profileNeedsFocus = false;
    V.leaguePickerOpen = false;
    V.leaguePickerNeedsFocus = false;
    PROFILE.loading = false;
    PROFILE.error = "";
    resetLeagueState();
    GAME.data = null;
    GAME.score = 0;
    GAME.leaderboard = [];
    GAME.error = "";
    GAME.date = "";
  }
  if (session) {
    try { await loadCloudLeague(); }
    catch (e) { resetLeagueState(); AUTH.error = `No se pudieron cargar tus datos: ${e.message}`; }
    if (userId && previousId !== userId && !hasSeenOnboarding(userId)) {
      V.instructionsOpen = true;
      V.instructionsNeedsFocus = true;
    }
  } else {
    V.instructionsOpen = false;
    V.instructionsNeedsFocus = false;
    resetLeagueState();
  }
  render();
  if (session && S.league?.id) refreshMinigameScoreData(false);
}
async function initializeAuth() {
  try {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    AUTH.client = createClient(SB_URL, SB_KEY);
    AUTH.client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") AUTH.mode = "update";
      setTimeout(() => handleAuthSession(session), 0);
    });
    const { data, error } = await AUTH.client.auth.getSession();
    if (error) throw error;
    await handleAuthSession(data.session);
  } catch (e) {
    AUTH.ready = true;
    AUTH.error = `No se pudo conectar con Supabase: ${e.message}`;
    render();
  }
}
function setAuthMode(mode) {
  AUTH.mode = mode;
  AUTH.password = "";
  AUTH.error = "";
  render();
}
function togglePasswordVisibility(button) {
  const password = $("#auth-password");
  if (!password) return;
  const isVisible = password.type === "password";
  password.type = isVisible ? "text" : "password";
  button.classList.toggle("is-visible", isVisible);
  button.setAttribute("aria-pressed", String(isVisible));
  button.setAttribute("aria-label", isVisible ? "Ocultar contraseña" : "Mostrar contraseña");
  button.title = isVisible ? "Ocultar contraseña" : "Mostrar contraseña";
}
async function submitAuth() {
  const email = $("#auth-email")?.value.trim() || "";
  const password = $("#auth-password")?.value || "";
  if (!email || !password) return toast("Escribe tu correo y contraseña");
  if (password.length < 6) return toast("La contraseña debe tener al menos 6 caracteres");
  AUTH.email = email;
  AUTH.password = password;
  AUTH.busy = true;
  AUTH.error = "";
  render();
  try {
    const result = AUTH.mode === "signup"
      ? await AUTH.client.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } })
      : await AUTH.client.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    if (AUTH.mode === "signup" && !result.data.session) {
      AUTH.busy = false;
      AUTH.mode = "login";
      AUTH.error = "Cuenta creada. Revisa tu correo y confirma la dirección antes de iniciar sesión.";
      render();
      return;
    }
    AUTH.busy = false;
    AUTH.email = "";
    AUTH.password = "";
    if (result.data.session) await handleAuthSession(result.data.session);
  } catch (e) {
    AUTH.busy = false;
    const invalidCredentials = AUTH.mode === "login" &&
      (e?.code === "invalid_credentials" || /invalid login credentials/i.test(errorText(e)));
    AUTH.error = invalidCredentials ? "" : e.message;
    render();
    if (invalidCredentials) toast("Credenciales incorrectas", "error");
  }
}
async function signInGoogle() {
  if (!AUTH.client) return toast("La conexión de Supabase todavía no está lista");
  if (AUTH.busy || AUTH.googleBusy) return;
  AUTH.googleBusy = true;
  AUTH.error = "";
  render();
  try {
    const { error } = await AUTH.client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: location.origin }
    });
    if (error) throw error;
  } catch (error) {
    AUTH.error = `No se pudo iniciar con Google: ${errorText(error)}. Comprueba que el proveedor Google esté configurado en Supabase.`;
    render();
  } finally {
    AUTH.googleBusy = false;
    render();
  }
}
async function resetPassword() {
  const email = $("#auth-email")?.value.trim() || AUTH.email;
  if (!email) return toast("Escribe primero tu correo");
  const { error } = await AUTH.client.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
  if (error) { AUTH.error = error.message; render(); return; }
  AUTH.error = "Si existe una cuenta con ese correo, recibirás un enlace para cambiar la contraseña.";
  render();
}
async function updatePassword() {
  const password = $("#auth-password")?.value || "";
  if (password.length < 6) return toast("La contraseña debe tener al menos 6 caracteres");
  const { error } = await AUTH.client.auth.updateUser({ password });
  if (error) { AUTH.error = error.message; render(); return; }
  AUTH.mode = "login";
  AUTH.error = "";
  toast("Contraseña actualizada");
  if (AUTH.session) await handleAuthSession(AUTH.session);
}
async function signOut() {
  const { error } = await AUTH.client.auth.signOut();
  if (error) toast(`No se pudo cerrar sesión: ${error.message}`);
}

function madridDate() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function featuredMatch() {
  return D.matches.filter(open)
    .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))[0] || null;
}
async function refreshMinigameScoreData(showError = true) {
  if (!AUTH.client || !AUTH.session || !S.league?.id || AUTH.minigameSyncing) return false;
  AUTH.minigameSyncing = true;
  let synced = false;
  try {
    const { data, error } = await AUTH.client.rpc("get_minigame_score_modifiers", {
      p_league_id: S.league.id
    });
    if (error) throw error;
    AUTH.minigameSyncError = false;
    const next = {
      round_bonuses: data?.round_bonuses || [],
      minute_bonuses: data?.minute_bonuses || [],
      red_cards: data?.red_cards || []
    };
    if (JSON.stringify(next) !== JSON.stringify(D.minigames)) {
      D.minigames = next;
      render();
    }
    synced = true;
  } catch (error) {
    if (showError || !AUTH.minigameSyncError) toast(`No se actualizaron los bonus de los minijuegos: ${errorText(error)}`);
    AUTH.minigameSyncError = true;
  } finally {
    AUTH.minigameSyncing = false;
  }
  return synced;
}
async function loadRoomData(force = false) {
  const leagueId = S.league?.id;
  if (!AUTH.client || !AUTH.session || !leagueId || ROOM.loading) return;
  if (!force && ROOM.loaded && ROOM.leagueId === leagueId && Date.now() - ROOM.updatedAt < 20000) return;
  ROOM.loading = true;
  ROOM.error = "";
  try {
    const memberIds = [AUTH.session.user.id, ...Object.keys(S.friends)];
    const [debts, chronicles, admin, profiles, hall] = await Promise.all([
      AUTH.client.from("room_debts").select("*").eq("room_id", leagueId).order("created_at", { ascending: false }),
      AUTH.client.from("room_chronicles").select("*").eq("room_id", leagueId).order("season_start_year", { ascending: false }).order("matchday", { ascending: false }).limit(10),
      AUTH.client.rpc("is_room_admin", { p_room_id: leagueId }),
      AUTH.client.from("user_profiles").select("user_id,avatar_path").in("user_id", memberIds),
      AUTH.client.rpc("get_room_hall_of_fame", { p_room_id: leagueId })
    ]);
    if (debts.error) throw debts.error;
    if (chronicles.error) throw chronicles.error;
    if (admin.error) throw admin.error;
    if (profiles.error) throw profiles.error;
    if (hall.error) throw hall.error;
    ROOM.debts = debts.data || [];
    ROOM.chronicles = chronicles.data || [];
    ROOM.isAdmin = admin.data === true;
    ROOM.hallSeasons = hall.data?.seasons || [];
    ROOM.dinnerLeaders = hall.data?.dinners || [];
    CHAT.avatarPaths = Object.fromEntries((profiles.data || [])
      .filter((profile) => profile.avatar_path)
      .map((profile) => [profile.user_id, profile.avatar_path]));
    const avatarEntries = await Promise.all((profiles.data || [])
      .filter((profile) => profile.avatar_path)
      .map(async (profile) => {
        const { data, error } = await AUTH.client.storage.from("room-avatars")
          .createSignedUrl(profile.avatar_path, 3600);
        if (error) throw error;
        return [profile.user_id, data.signedUrl];
      }));
    CHAT.avatars = Object.fromEntries(avatarEntries);
    if (V.tab === "l") render();
    ROOM.leagueId = leagueId;
    ROOM.updatedAt = Date.now();
    ROOM.loaded = true;
    if (!ROOM.channel || ROOM.channelLeagueId !== leagueId) {
      if (ROOM.channel) await AUTH.client.removeChannel(ROOM.channel);
      ROOM.channel = AUTH.client.channel(`room-features:${leagueId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "room_debts", filter: `room_id=eq.${leagueId}` }, () => loadRoomData(true))
        .on("postgres_changes", { event: "*", schema: "public", table: "room_chronicles", filter: `room_id=eq.${leagueId}` }, () => loadRoomData(true))
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "room_season_hall", filter: `room_id=eq.${leagueId}` }, () => loadRoomData(true))
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            ROOM.error = "La conexión en directo se ha interrumpido; usa Actualizar para volver a cargar.";
            if (V.tab === "l") render();
          }
        });
      ROOM.channelLeagueId = leagueId;
    }
  } catch (error) {
    const message = errorText(error);
    ROOM.error = message.includes("get_room_hall_of_fame") || message.includes("archive_room_season")
      ? `${message} · Ejecuta supabase-hall-of-fame.sql en Supabase`
      : message;
  } finally {
    ROOM.loading = false;
  }
  if (V.tab === "l") render();
  maybeArchiveLeagueSeason();
}
function laLigaSeasonComplete() {
  return D.matches.length >= 380
    && new Set(D.matches.map((match) => match.matchday).filter(Number.isInteger)).size >= 38
    && D.matches.every(fin);
}
async function maybeArchiveLeagueSeason() {
  if (!AUTH.client || !AUTH.session || !S.league?.id || !ROOM.loaded || ROOM.error || !ROOM.isAdmin || ROOM.archiving) return;
  if (!laLigaSeasonComplete() || !D.seasonStartYear) return;
  if (ROOM.hallSeasons.some((entry) => Number(entry.season_start_year) === D.seasonStartYear)) return;
  ROOM.archiving = true;
  ROOM.archiveError = "";
  try {
    if (!await refreshMinigameScoreData(false)) {
      throw new Error("No se pudieron confirmar los bonus de temporada; vuelve a intentarlo.");
    }
    const scoreboard = board().map((player, index) => ({
      user_id: player.id,
      name: player.n,
      points: player.pts,
      exact_scores: player.ex,
      position: index + 1
    }));
    if (!scoreboard.length) throw new Error("No hay jugadores para archivar la temporada.");
    const { error } = await AUTH.client.rpc("archive_room_season", {
      p_room_id: S.league.id,
      p_season_start_year: D.seasonStartYear,
      p_league_name: S.league.name,
      p_scoreboard: scoreboard
    });
    if (error) throw error;
    toast(`Temporada ${D.seasonStartYear}/${String(D.seasonStartYear + 1).slice(-2)} guardada en la Vitrina.`);
    await loadRoomData(true);
  } catch (error) {
    const message = errorText(error);
    if (ROOM.archiveError !== message) toast(`No se pudo guardar la temporada en la Vitrina: ${message}`);
    ROOM.archiveError = message;
  } finally {
    ROOM.archiving = false;
    if (V.tab === "l") render();
  }
}
async function loadRoomChat(force = false) {
  const roomId = S.league?.id;
  if (!AUTH.client || !AUTH.session || !roomId || CHAT.loading) return;
  if (!force && CHAT.loadedLeagueId === roomId) return;
  CHAT.loading = true;
  CHAT.error = "";
  CHAT.channelLeagueId = roomId;
  if (!CHAT.channel) {
    CHAT.channel = AUTH.client.channel(`room-chat:${roomId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "room_messages", filter: `room_id=eq.${roomId}` }, (event) => {
        if (CHAT.channelLeagueId !== roomId) return;
        const incoming = event.new;
        if (!CHAT.messages.some((item) => item.id === incoming.id)) {
          CHAT.messages.push(incoming);
          CHAT.messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
          if (CHAT.messages.length > 100) CHAT.messages.splice(0, CHAT.messages.length - 100);
          if (V.tab === "l") {
            render();
            requestAnimationFrame(scrollRoomChatToBottom);
          }
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          CHAT.subscribed = true;
          if (CHAT.loadedLeagueId === roomId) loadRoomChat(true);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          CHAT.subscribed = false;
          CHAT.error = "Conexión en directo interrumpida; puedes actualizar el chat.";
          if (V.tab === "l") render();
        }
      });
  }
  try {
    const { data, error } = await AUTH.client.from("room_messages")
      .select("id,room_id,user_id,message,created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(100);
    if (error) throw error;
    const newest = new Map((data || []).map((item) => [item.id, item]));
    for (const item of CHAT.messages) newest.set(item.id, item);
    CHAT.messages = [...newest.values()]
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .slice(-100);
    CHAT.loadedLeagueId = roomId;
    CHAT.error = "";
  } catch (error) {
    CHAT.error = errorText(error);
  } finally {
    CHAT.loading = false;
  }
  if (V.tab === "l") {
    render();
    requestAnimationFrame(scrollRoomChatToBottom);
  }
}
function scrollRoomChatToBottom() {
  const list = document.querySelector(".room-chat-messages");
  if (list) list.scrollTop = list.scrollHeight;
}
function chatAvatar(userId, name, className = "") {
  const initials = [...String(name || "?").trim()].slice(0, 2).join("").toUpperCase();
  const source = CHAT.avatars[userId];
  return `<span class="room-avatar ${className}">${source ? `<img src="${esc(source)}" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false">` : ""}<span ${source ? "hidden" : ""}>${esc(initials || "?")}</span></span>`;
}
async function prepareAvatar(file) {
  if (!file.type.startsWith("image/")) throw new Error("Selecciona un archivo de imagen.");
  if (file.size > 10 * 1024 * 1024) throw new Error("La imagen original no puede superar los 10 MB.");
  if (typeof createImageBitmap !== "function") throw new Error("Este navegador no permite preparar la foto. Prueba con otro navegador actualizado.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo procesar la imagen.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error("No se pudo convertir la foto.")),
      "image/webp",
      0.84
    ));
    if (blob.size > 2 * 1024 * 1024) throw new Error("La foto procesada supera el límite de 2 MB.");
    return blob;
  } finally {
    bitmap.close();
  }
}
async function uploadProfilePhoto(event) {
  const file = event.currentTarget.files?.[0];
  event.currentTarget.value = "";
  if (!file || CHAT.uploadingAvatar) return;
  if (!AUTH.client || !AUTH.session || !S.league?.id) {
    toast("Inicia sesión y únete a una liga para cambiar tu foto.");
    return;
  }
  CHAT.uploadingAvatar = true;
  CHAT.error = "";
  PROFILE.error = "";
  render();
  let uploadedPath = "";
  try {
    const blob = await prepareAvatar(file);
    const userId = AUTH.session.user.id;
    const oldPath = CHAT.avatarPaths?.[userId] || "";
    uploadedPath = `${userId}/${crypto.randomUUID()}.webp`;
    const { error: uploadError } = await AUTH.client.storage.from("room-avatars")
      .upload(uploadedPath, blob, { contentType: "image/webp", cacheControl: "3600", upsert: false });
    if (uploadError) throw uploadError;
    const { data: signed, error: signedError } = await AUTH.client.storage.from("room-avatars")
      .createSignedUrl(uploadedPath, 3600);
    if (signedError) throw signedError;
    const { error: profileError } = await AUTH.client.from("user_profiles").upsert({
      user_id: userId,
      avatar_path: uploadedPath,
      updated_at: new Date().toISOString()
    });
    if (profileError) throw profileError;
    const newPath = uploadedPath;
    CHAT.avatars[userId] = signed.signedUrl;
    CHAT.avatarPaths = { ...(CHAT.avatarPaths || {}), [userId]: newPath };
    uploadedPath = "";
    if (oldPath && oldPath !== newPath) {
      const { error: removeError } = await AUTH.client.storage.from("room-avatars").remove([oldPath]);
      if (removeError) console.warn(`No se pudo limpiar la foto de perfil anterior: ${removeError.message}`);
    }
    toast("Foto de perfil actualizada.");
  } catch (error) {
    if (uploadedPath) {
      const { error: cleanupError } = await AUTH.client.storage.from("room-avatars").remove([uploadedPath]);
      if (cleanupError) console.warn(`No se pudo limpiar la foto de perfil sin guardar: ${cleanupError.message}`);
    }
    CHAT.error = errorText(error);
    if (V.profileOpen) PROFILE.error = CHAT.error;
    toast(`No se pudo actualizar la foto: ${CHAT.error}`);
  } finally {
    CHAT.uploadingAvatar = false;
    render();
  }
}
function openProfile() {
  if (!AUTH.session || V.profileOpen) return;
  V.profileOpen = true;
  V.profileNeedsFocus = true;
  PROFILE.error = "";
  render();
  loadOwnProfilePhoto();
}
function closeProfile() {
  if (!V.profileOpen) return;
  V.profileOpen = false;
  document.body.classList.remove("instructions-visible");
  render();
  requestAnimationFrame(() => document.querySelector(".profile-button")?.focus());
}
async function loadOwnProfilePhoto() {
  const userId = AUTH.session?.user?.id;
  if (!userId || !AUTH.client) return;
  PROFILE.loading = true;
  PROFILE.error = "";
  render();
  try {
    const { data, error } = await AUTH.client.from("user_profiles")
      .select("avatar_path")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (AUTH.session?.user?.id !== userId) return;
    const path = data?.avatar_path || "";
    if (path) {
      const { data: signed, error: signedError } = await AUTH.client.storage.from("room-avatars")
        .createSignedUrl(path, 3600);
      if (signedError) throw signedError;
      CHAT.avatarPaths[userId] = path;
      CHAT.avatars[userId] = signed.signedUrl;
    } else {
      delete CHAT.avatarPaths[userId];
      delete CHAT.avatars[userId];
    }
  } catch (error) {
    if (AUTH.session?.user?.id === userId) PROFILE.error = errorText(error);
  } finally {
    if (AUTH.session?.user?.id === userId) {
      PROFILE.loading = false;
      if (V.profileOpen) render();
    }
  }
}
async function removeProfilePhoto() {
  const userId = AUTH.session?.user?.id;
  if (!userId || !AUTH.client || CHAT.uploadingAvatar) return;
  CHAT.uploadingAvatar = true;
  PROFILE.error = "";
  render();
  const oldPath = CHAT.avatarPaths[userId] || "";
  try {
    const { error } = await AUTH.client.from("user_profiles").upsert({
      user_id: userId,
      avatar_path: null,
      updated_at: new Date().toISOString()
    });
    if (error) throw error;
    delete CHAT.avatarPaths[userId];
    delete CHAT.avatars[userId];
    if (oldPath) {
      const { error: removeError } = await AUTH.client.storage.from("room-avatars").remove([oldPath]);
      if (removeError) {
        console.warn(`No se pudo limpiar la foto de perfil anterior: ${removeError.message}`);
        toast("Foto quitada. No se pudo borrar el archivo anterior.");
        return;
      }
    }
    toast("Foto de perfil quitada.");
  } catch (error) {
    PROFILE.error = errorText(error);
    toast(`No se pudo quitar la foto: ${PROFILE.error}`);
  } finally {
    CHAT.uploadingAvatar = false;
    render();
  }
}
function appendChatEmoji(emoji) {
  CHAT.input = `${CHAT.input}${emoji}`.slice(0, 500);
  render();
  const input = document.querySelector("#room-chat-input");
  input?.focus();
  if (input) input.setSelectionRange(input.value.length, input.value.length);
}
async function sendRoomMessage(event) {
  event.preventDefault();
  if (CHAT.sending) return;
  const input = document.querySelector("#room-chat-input");
  const message = String(input?.value ?? CHAT.input).trim();
  if (!message) return;
  if (message.length > 500) {
    toast("El mensaje no puede superar los 500 caracteres.");
    return;
  }
  CHAT.sending = true;
  CHAT.input = message;
  try {
    const { data, error } = await AUTH.client.from("room_messages")
      .insert({ room_id: S.league.id, user_id: AUTH.session.user.id, message })
      .select("id,room_id,user_id,message,created_at")
      .single();
    if (error) throw error;
    CHAT.input = "";
    if (!CHAT.messages.some((item) => item.id === data.id)) {
      CHAT.messages.push(data);
      CHAT.messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      if (CHAT.messages.length > 100) CHAT.messages.splice(0, CHAT.messages.length - 100);
    }
    CHAT.error = "";
    render();
    requestAnimationFrame(scrollRoomChatToBottom);
  } catch (error) {
    CHAT.error = errorText(error);
    toast(`No se pudo enviar el mensaje: ${errorText(error)}`);
  } finally {
    CHAT.sending = false;
    if (V.tab === "l") render();
  }
}
function roomChat() {
  if (CHAT.loadedLeagueId !== S.league?.id && !CHAT.loading) queueMicrotask(() => loadRoomChat());
  const names = new Map([
    [AUTH.session?.user?.id, S.me || "Tú"],
    ...Object.entries(S.friends).map(([id, member]) => [id, member.n])
  ]);
  const messages = CHAT.messages.map((item) => {
    const mine = item.user_id === AUTH.session?.user?.id;
    const stamp = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.created_at));
    const name = names.get(item.user_id) || "Jugador";
    return `<article class="room-chat-row ${mine ? "is-mine" : ""}">${!mine ? chatAvatar(item.user_id, name) : ""}<div class="room-chat-bubble">${!mine ? `<b>${esc(name)}</b>` : ""}<p>${esc(item.message)}</p><time datetime="${esc(item.created_at)}">${stamp}</time></div>${mine ? chatAvatar(item.user_id, name) : ""}</article>`;
  }).join("");
  const quickEmojis = ["⚽", "😂", "😭", "🔥", "👀", "🫡"].map((emoji) =>
    `<button type="button" class="room-chat-emoji" onclick="appendChatEmoji('${emoji}')" aria-label="Añadir emoji ${emoji}">${emoji}</button>`
  ).join("");
  return `<section class="room-chat card" aria-label="Chat de la liga"><header class="room-chat-heading"><div><span class="round-kicker">EN DIRECTO CON TU LIGA</span><h2>El Vestuario</h2></div><span class="room-chat-live"><i></i>EN VIVO</span><button class="league-copy-button" type="button" onclick="loadRoomChat(true)" ${CHAT.loading ? "disabled" : ""}>Actualizar</button></header>${CHAT.error ? `<p class="room-chat-error" role="status">${esc(CHAT.error)}</p>` : ""}<div class="room-chat-messages" role="log" aria-live="polite" aria-relevant="additions text">${messages || (CHAT.loading ? '<p class="room-chat-empty">Cargando conversación…</p>' : '<p class="room-chat-empty">Aún no hay mensajes. Rompe el hielo con una porra ⚽</p>')}</div><div class="room-chat-tools" aria-label="Emojis rápidos">${quickEmojis}</div><form class="room-chat-compose" onsubmit="sendRoomMessage(event)"><label class="sr-only" for="room-chat-input">Escribe un mensaje para la liga</label><textarea id="room-chat-input" name="message" rows="1" maxlength="500" required placeholder="Escribe al vestuario…" oninput="CHAT.input=this.value" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();this.form.requestSubmit()}" ${CHAT.sending ? "disabled" : ""}>${esc(CHAT.input)}</textarea><button class="btn room-chat-send" type="submit" aria-label="Enviar mensaje" ${CHAT.sending ? "disabled" : ""}>${CHAT.sending ? "…" : "Enviar"}</button></form><p class="room-chat-hint">Enter para enviar · Mayús + Enter para nueva línea · máx. 500 caracteres</p></section>`;
}
async function createRoomDebt(event) {
  event.preventDefault();
  if (!ROOM.isAdmin || ROOM.busy) return;
  const form = event.currentTarget;
  const formData = new FormData(form);
  const amount = Number(formData.get("amount"));
  const debtor = String(formData.get("debtor") || "");
  const description = String(formData.get("description") || "").trim();
  if (!Number.isFinite(amount) || amount <= 0 || !debtor || !description) {
    toast("Revisa el importe, la persona y el motivo.");
    return;
  }
  ROOM.busy = true;
  try {
    const { error } = await AUTH.client.rpc("create_room_debt", {
      p_room_id: S.league.id,
      p_debtor_user_id: debtor,
      p_amount: amount,
      p_description: description
    });
    if (error) throw error;
    form.reset();
    await loadRoomData(true);
    toast("Cuenta añadida a la sala.");
  } catch (error) {
    toast(`No se pudo crear la deuda: ${errorText(error)}`);
  } finally {
    ROOM.busy = false;
    if (V.tab === "l") render();
  }
}
async function reportRoomDebtPayment(debtId) {
  if (ROOM.busy) return;
  ROOM.busy = true;
  try {
    const { error } = await AUTH.client.rpc("report_room_debt_payment", { p_debt_id: debtId });
    if (error) throw error;
    await loadRoomData(true);
    toast("Pago avisado. Falta la validación del administrador.");
  } catch (error) {
    toast(`No se pudo avisar del pago: ${errorText(error)}`);
  } finally {
    ROOM.busy = false;
    if (V.tab === "l") render();
  }
}
async function confirmRoomDebtPayment(debtId) {
  if (ROOM.busy || !ROOM.isAdmin) return;
  ROOM.busy = true;
  try {
    const { error } = await AUTH.client.rpc("confirm_room_debt_payment", { p_debt_id: debtId });
    if (error) throw error;
    await loadRoomData(true);
    toast("Pago validado.");
  } catch (error) {
    toast(`No se pudo validar el pago: ${errorText(error)}`);
  } finally {
    ROOM.busy = false;
    if (V.tab === "l") render();
  }
}
function roomFeatures() {
  if (!ROOM.loaded && !ROOM.loading && !ROOM.error) queueMicrotask(() => loadRoomData());
  const memberNames = new Map([
    [AUTH.session?.user?.id, S.me || "Tú"],
    ...Object.entries(S.friends).map(([id, member]) => [id, member.n])
  ]);
  const statusText = { pending: "Pendiente", payment_reported: "Bizum avisado · por validar", paid: "Pagado" };
  const debtRows = ROOM.debts.map((debt) => {
    const mine = debt.debtor_user_id === AUTH.session?.user?.id;
    const actions = debt.status === "pending" && mine
      ? `<button class="btn ghost room-action" onclick="reportRoomDebtPayment('${debt.id}')" ${ROOM.busy ? "disabled" : ""}>Ya he pagado el Bizum</button>`
      : debt.status === "payment_reported" && ROOM.isAdmin
        ? `<button class="btn room-action" onclick="confirmRoomDebtPayment('${debt.id}')" ${ROOM.busy ? "disabled" : ""}>Validar pago</button>`
        : "";
    return `<article class="room-debt"><div class="room-debt-main"><div><b>${esc(memberNames.get(debt.debtor_user_id) || "Miembro")}${mine ? " (tú)" : ""}</b><small>${esc(debt.description)}</small></div><strong>${Number(debt.amount).toFixed(2)} €</strong></div><div class="room-debt-foot"><span class="room-debt-status ${debt.status}">${statusText[debt.status] || "Estado desconocido"}</span>${actions}</div></article>`;
  }).join("");
  const chronicles = ROOM.chronicles.map((chronicle) => {
    const podium = Array.isArray(chronicle.scoreboard) ? chronicle.scoreboard.slice(0, 3).map((player) =>
      `<li><span>${Number(player.position) || "—"}. ${esc(player.name || "Jugador")}</span><b>${Number(player.points) || 0} pts</b></li>`
    ).join("") : "";
    return `<article class="room-chronicle"><div class="room-chronicle-head"><span>CRÓNICA · ${chronicle.season_start_year}/${String(chronicle.season_start_year + 1).slice(-2)}</span><b>J${chronicle.matchday}</b></div><p>${esc(chronicle.content)}</p>${podium ? `<ol class="room-podium">${podium}</ol>` : ""}</article>`;
  }).join("");
  const memberOptions = [...memberNames.entries()].filter(([id]) => id).map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join("");
  const adminForm = ROOM.loading && !ROOM.loaded
    ? `<p class="room-note">Comprobando permisos de la sala…</p>`
    : ROOM.isAdmin
      ? `<form class="room-debt-form" onsubmit="createRoomDebt(event)"><label>Jugador<select name="debtor" required>${memberOptions}</select></label><label>Importe (€)<input name="amount" type="number" min="0.01" max="10000" step="0.01" required placeholder="1.00"></label><label>Motivo<input name="description" maxlength="120" required placeholder="Jornada perdida, ronda…"></label><button class="btn" type="submit" ${ROOM.busy ? "disabled" : ""}>Añadir a la cuenta</button></form><p class="room-note">Administrador de sala: primer miembro registrado.</p>`
      : `<p class="room-note">Solo el administrador de la sala puede añadir cuentas y validar pagos.</p>`;
  const unpaidTotal = ROOM.debts.filter((debt) => debt.status !== "paid").reduce((total, debt) => total + Number(debt.amount), 0);
  const lowerError = ROOM.error.toLowerCase();
  const missingMigration = lowerError.includes("does not exist") || lowerError.includes("42p01") || lowerError.includes("pgrst205") || lowerError.includes("could not find the table");
  return `<section class="room-extras"><div class="room-extras-heading"><div><span class="round-kicker">EL TERCER TIEMPO</span><h2>Bote y crónicas</h2></div><button class="league-copy-button" onclick="loadRoomData(true)" ${ROOM.loading ? "disabled" : ""}>Actualizar</button></div>${ROOM.error ? `<p class="room-error" role="alert">No se pudo cargar el panel: ${esc(ROOM.error)}.${missingMigration ? " Ejecuta supabase-room-features.sql y supabase-profile.sql en Supabase." : ""}</p>` : ""}<div class="room-extras-grid"><section class="card room-panel"><div class="room-panel-heading"><h3>El tesorero</h3><span>${ROOM.debts.filter((debt) => debt.status !== "paid").length} pendientes · ${unpaidTotal.toFixed(2)} €</span></div>${adminForm}<div class="room-debts">${debtRows || (ROOM.loading ? '<p class="room-empty">Cargando las cuentas…</p>' : '<p class="room-empty">Todavía no hay cuentas en esta sala.</p>')}</div></section><section class="card room-panel room-chronicles-panel"><div class="room-panel-heading"><h3>Roast bot</h3><span>Jornadas cerradas</span></div><p class="room-note">Crónicas automáticas con humor sobre los pronósticos, sin ataques personales.</p><div class="room-chronicles">${chronicles || (ROOM.loading ? '<p class="room-empty">Buscando crónicas…</p>' : '<p class="room-empty">La primera crónica aparecerá al terminar una jornada y configurar el generador.</p>')}</div></section></div></section>`;
}
async function refreshScoutState(showError = true) {
  if (!AUTH.client || !AUTH.session || !S.league?.id) return;
  const date = madridDate();
  try {
    const match = featuredMatch();
    const [{ data, error }, modifiers] = await Promise.all([
      AUTH.client.rpc("get_daily_minigames_state", {
        p_challenge_date: date,
        p_league_id: S.league.id,
        p_match_id: match?.id ?? null
      }),
      AUTH.client.rpc("get_minigame_score_modifiers", { p_league_id: S.league.id })
    ]);
    if (error) throw error;
    if (modifiers.error) throw modifiers.error;
    GAME.data = data;
    GAME.date = date;
    if (data?.spin && !GAME.spinning) {
      const sectionIndex = Number(data.spin.resolved_section_index || data.spin.section_index);
      GAME.wheelRotation = (330 - 60 * (sectionIndex - 1) + 360) % 360;
    }
    GAME.error = "";
    D.minigames = {
      round_bonuses: modifiers.data?.round_bonuses || [],
      minute_bonuses: modifiers.data?.minute_bonuses || [],
      red_cards: modifiers.data?.red_cards || []
    };
  } catch (error) {
    const message = error.message || String(error);
    GAME.error = /get_daily_minigames_state|submit_daily_player_guess|spin_daily_var|schema cache/i.test(message)
      ? "Falta ejecutar supabase-minigames.sql en Supabase para instalar los tres juegos."
      : `No se pudieron cargar los minijuegos: ${message}`;
    if (showError) toast(GAME.error);
  } finally {
    if (V.tab === "g") render();
  }
}
async function loadScoutGame() {
  if (GAME.loading || !AUTH.session || !S.league?.id) return;
  GAME.loading = true;
  GAME.error = "";
  render();
  await refreshScoutState();
  GAME.loading = false;
  if (V.tab === "g") render();
}
async function submitScoutGuess() {
  const guess = $("#scout-guess")?.value.trim() || "";
  if (!guess) {
    GAME.error = "Escribe el nombre de un futbolista.";
    render();
    return;
  }
  if (GAME.busy || !GAME.data?.available || GAME.data.attempt?.solved) return;
  GAME.busy = true;
  GAME.error = "";
  render();
  try {
    const { data, error } = await AUTH.client.rpc("submit_daily_player_guess", {
      p_challenge_date: GAME.date,
      p_league_id: S.league.id,
      p_guess: guess
    });
    if (error) throw error;
    navigator.vibrate?.(data?.correct ? [35, 40, 70] : 20);
    await refreshScoutState(false);
  } catch (error) {
    GAME.error = `No se pudo validar la respuesta: ${error.message || error}`;
  } finally {
    GAME.busy = false;
    render();
  }
}
async function spinDailyVar() {
  if (GAME.busy || GAME.loading || !GAME.data?.attempt?.solved || GAME.data.spin) return;
  GAME.busy = true;
  GAME.error = "";
  render();
  navigator.vibrate?.([18, 55, 18, 55, 25, 55, 35, 60, 45, 70, 60, 80, 85]);
  try {
    const { data, error } = await AUTH.client.rpc("spin_daily_var", {
      p_challenge_date: GAME.date,
      p_league_id: S.league.id
    });
    if (error) throw error;
    GAME.wheelResult = data;
    GAME.data.spin = data;
    const sectionRotation = (sectionIndex) => (330 - 60 * (Number(sectionIndex) - 1) + 360) % 360;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const duration = reducedMotion ? 0 : 4200;
    const animateTo = async (sectionIndex, turns) => {
      const stopAt = 360 * turns + sectionRotation(sectionIndex);
      await new Promise((resolve) => {
        requestAnimationFrame(() => {
          $(".scout-wheel-disc")?.style.setProperty("--wheel-rotation", `${stopAt}deg`);
          setTimeout(resolve, duration);
        });
      });
      GAME.wheelRotation = stopAt;
    };
    GAME.wheelRotation = 0;
    GAME.spinning = true;
    GAME.spinStage = "first";
    render();
    await animateTo(data.section_index, 7);
    if (data.outcome === "double_or_nothing") {
      GAME.spinStage = "first-result";
      render();
      await new Promise((resolve) => setTimeout(resolve, 900));
      GAME.spinStage = "second";
      navigator.vibrate?.([24, 55, 24, 55, 35]);
      render();
      await animateTo(data.resolved_section_index, 13);
    }
    GAME.spinStage = "result";
    render();
    navigator.vibrate?.(data.final_reward === "var_annulled" ? [80, 50, 80] : [50, 40, 90]);
    await refreshScoutState(false);
  } catch (error) {
    GAME.error = `La ruleta no pudo resolverse: ${error.message || error}`;
  } finally {
    GAME.spinning = false;
    GAME.spinStage = "";
    GAME.busy = false;
    render();
  }
}
function selectGameMatch(itemId) { return Number($(`#item-match-${itemId}`)?.value); }
async function equipGameJoker(itemId) {
  const matchId = selectGameMatch(itemId);
  if (!matchId || GAME.busy) return toast("Elige un partido futuro.");
  GAME.busy = true;
  render();
  try {
    const { error } = await AUTH.client.rpc("equip_minigame_joker", {
      p_league_id: S.league.id, p_inventory_id: itemId, p_match_id: matchId
    });
    if (error) throw error;
    await syncLeagueData(S.league.id, AUTH.session.user.id);
    await refreshScoutState(false);
    toast("Joker aplicado al pronóstico.");
  } catch (error) {
    GAME.error = `No se pudo usar el Joker: ${error.message || error}`;
  } finally {
    GAME.busy = false;
    render();
  }
}
async function useGameRedCard(itemId) {
  const targetId = $(`#item-target-${itemId}`)?.value;
  const matchId = selectGameMatch(itemId);
  if (!targetId || !matchId || GAME.busy) return toast("Elige a un amigo y un partido.");
  GAME.busy = true;
  render();
  try {
    const { error } = await AUTH.client.rpc("use_minigame_red_card", {
      p_league_id: S.league.id,
      p_inventory_id: itemId,
      p_target_user_id: targetId,
      p_match_id: matchId
    });
    if (error) throw error;
    await refreshScoutState(false);
    toast("Tarjeta Roja enviada. Solo se puede usar antes de que se cierre el plazo, una hora antes del partido.");
  } catch (error) {
    GAME.error = `No se pudo usar la Tarjeta Roja: ${error.message || error}`;
  } finally {
    GAME.busy = false;
    render();
  }
}
async function submitMinuteOfGold() {
  const match = featuredMatch();
  const minute = Number($("#gold-minute")?.value);
  if (!match) return toast("No hay ningún partido futuro disponible para el Minuto de Oro.");
  if (!Number.isInteger(minute) || minute < 1 || minute > 90) return toast("Elige un minuto entre 1 y 90.");
  if (GAME.busy) return;
  GAME.busy = true;
  render();
  try {
    const { error } = await AUTH.client.rpc("submit_minute_of_gold_prediction", {
      p_league_id: S.league.id, p_match_id: match.id, p_minute: minute
    });
    if (error) throw error;
    navigator.vibrate?.(30);
    await refreshScoutState(false);
    toast(`Minuto ${minute} guardado para ${clubName(match.homeTeam)}–${clubName(match.awayTeam)}.`);
  } catch (error) {
    GAME.error = `No se pudo guardar el Minuto de Oro: ${error.message || error}`;
  } finally {
    GAME.busy = false;
    render();
  }
}
function tJuego() {
  if (GAME.loading && !GAME.data) return `<section class="scout-shell"><div class="scout-skeleton"></div><div class="scout-skeleton"></div><div class="scout-skeleton"></div></section>`;
  const data = GAME.data;
  if (GAME.error && !data) return `<section class="scout-shell"><div class="scout-panel scout-empty"><span class="scout-kicker">PLENO · JUEGOS DIARIOS</span><h1>No se pudo abrir la competición</h1><p>${esc(GAME.error)}</p><button class="btn" onclick="loadScoutGame()">Reintentar</button></div></section>`;
  const challenge = data?.challenge || {};
  const attempt = data?.attempt || null;
  const guesses = Array.isArray(attempt?.guesses) ? attempt.guesses : [];
  const clues = Array.isArray(attempt?.clues) ? attempt.clues : [];
  const maxAttempts = Number(attempt?.max_attempts || (data?.can_use_extra_guess ? 6 : 5));
  const attempts = Number(attempt?.attempts_count || 0);
  const solved = Boolean(attempt?.solved);
  const exhausted = attempts >= maxAttempts && !solved;
  const playerClues = clues.map((clue, index) => {
    const item = clue && typeof clue === "object" ? clue : { text: clue };
    return `<article class="scout-clue" style="--clue-index:${index}"><span>0${index + 1}</span><div><small>${esc(item.label || `PISTA ${index + 1}`)}</small><b>${esc(item.text || item.description || item.value || "")}</b></div><i aria-hidden="true">✓</i></article>`;
  }).join("");
  const guessRows = Array.from({ length: maxAttempts }, (_, index) => {
    const value = guesses[index];
    return `<span class="scout-guess-slot ${value ? (solved && index === guesses.length - 1 ? "is-hit" : "is-used") : ""}">${value ? esc(value) : "—"}</span>`;
  }).join("");
  const errorMessage = GAME.error ? `<p class="scout-error" role="alert">${esc(GAME.error)}</p>` : "";
  const dailySection = !data?.available
    ? `<section class="scout-panel scout-empty"><span class="scout-status">SIN RETO PUBLICADO</span><h2>El Fichaje Clandestino</h2><p>El reto de hoy todavía no está publicado. Vuelve cuando aparezca el nuevo expediente.</p><button class="btn ghost" onclick="loadScoutGame()">Actualizar</button></section>`
    : `<section class="scout-panel"><div class="scout-panel-head"><div><span class="scout-status ${!solved && !exhausted && data.playable ? "is-open" : ""}">${solved ? "FICHAJE CONFIRMADO" : exhausted ? "INTENTOS AGOTADOS" : data.playable ? "RETO DIARIO EN JUEGO" : "PLAZO CERRADO"}</span><h2>${esc(challenge.title || "El Fichaje Clandestino")}</h2></div><div class="scout-progress"><b>${attempts}<i>/${maxAttempts}</i></b><small>intentos usados</small></div></div>
      <span class="scout-difficulty">MODO OJEADOR · SIN SUGERENCIAS</span>
      <div class="scout-progress-track"><i style="width:${Math.min(100, attempts / maxAttempts * 100)}%"></i></div>
      <div class="scout-guess-board">${guessRows}</div>
      ${playerClues ? `<div class="scout-clues">${playerClues}</div>` : `<div class="scout-blind"><span>?</span><b>Informe sellado</b><small>El primer dato se desbloquea tras tu primer intento.</small></div>`}
      ${!solved && !exhausted && data.playable ? `<form class="scout-guess-form" onsubmit="event.preventDefault();submitScoutGuess()"><label for="scout-guess">¿Quién es el jugador?</label><div><input id="scout-guess" maxlength="80" autocomplete="off" required placeholder="Escribe nombre y apellido" ${GAME.busy ? "disabled" : ""}><button class="btn" type="submit" ${GAME.busy ? "disabled" : ""}>${GAME.busy ? "Comprobando…" : "Probar jugador"}</button></div><small>Sin sugerencias: cada fallo desbloquea una pista. Tienes ${maxAttempts - attempts} intento${maxAttempts - attempts === 1 ? "" : "s"}.</small></form>` : ""}
      ${solved || exhausted ? `<section class="scout-result ${solved ? "is-correct" : "is-wrong"}" aria-live="polite"><span>${solved ? "FICHAJE CONFIRMADO" : "INFORME CERRADO"}</span><h2>${solved ? "Buen ojo, ojeador." : "Esta vez no hubo fichaje."}</h2><p>${solved ? `Lo encontraste en ${attempts} intento${attempts === 1 ? "" : "s"}.` : `El jugador era ${esc(attempt.answer || "la respuesta correcta")}.`}</p></section>` : ""}
    </section>`;

  const wheel = WHEEL_SECTIONS.map((section, index) => {
    const start = (index * 60 - 90) * Math.PI / 180;
    const end = ((index + 1) * 60 - 90) * Math.PI / 180;
    const startPoint = { x: 120 + 108 * Math.cos(start), y: 120 + 108 * Math.sin(start) };
    const endPoint = { x: 120 + 108 * Math.cos(end), y: 120 + 108 * Math.sin(end) };
    const center = ((index + 0.5) * 60 - 90) * Math.PI / 180;
    const labelPoint = { x: 120 + 70 * Math.cos(center), y: 120 + 70 * Math.sin(center) };
    const fill = ["#173f37", "#1a2e49", "#4b2527", "#513f20", "#3b3038", "#25424b"][index];
    return `<path d="M120 120L${startPoint.x.toFixed(2)} ${startPoint.y.toFixed(2)}A108 108 0 0 1 ${endPoint.x.toFixed(2)} ${endPoint.y.toFixed(2)}Z" fill="${fill}" stroke="#0d1114" stroke-width="2"/><text x="${labelPoint.x.toFixed(2)}" y="${labelPoint.y.toFixed(2)}" fill="#f3f4f6" font-size="8" font-weight="800" text-anchor="middle" dominant-baseline="middle" transform="rotate(${index * 60 - 60} ${labelPoint.x.toFixed(2)} ${labelPoint.y.toFixed(2)})">${esc(section.title)}</text>`;
  }).join("");
  const spin = data?.spin || GAME.wheelResult;
  const spinSection = spin ? WHEEL_SECTIONS[Number(spin.section_index) - 1] : null;
  const finalReward = spin?.final_reward ? WHEEL_SECTIONS.find((section) => section.type === spin.final_reward) : null;
  const centerReward = spin && (!GAME.spinning || GAME.spinStage === "result") ? finalReward : GAME.spinStage === "first-result" ? spinSection : null;
  const centerLines = centerReward ? ({
    boots_gold: ["BOTAS", "DE ORO"],
    joker_x2: ["EL", "MALETÍN"],
    red_card: ["TARJETA", "ROJA"],
    double_or_nothing: ["DOBLE", "O NADA"],
    var_annulled: ["GOL", "ANULADO"],
    second_chance: ["SEGUNDA", "OPORTUNIDAD"]
  }[centerReward.type] || ["PREMIO", ""]) : GAME.spinStage === "second" ? ["RE", "GIRO"] : ["PLENO", ""];
  const wheelResult = spin && !GAME.spinning ? `<div class="scout-wheel-result ${spin.final_reward === "var_annulled" ? "is-zero" : ""}"><b>${spin.outcome === "double_or_nothing" ? "DOBLE O NADA · RE-GIRO" : esc(spinSection?.title || "RESULTADO")}</b><strong>${spin.final_reward === "var_annulled" ? "GOL ANULADO" : `${esc(finalReward?.title || "")}${spin.quantity > 1 ? ` ×${spin.quantity}` : ""}`}</strong><small>${spin.final_reward === "var_annulled" ? "La recompensa de esta ruleta se ha perdido." : esc(finalReward?.subtitle || "")}</small></div>` : "";
  const canSpin = Boolean(solved && !data.spin && !GAME.busy && !GAME.spinning);
  const wheelSection = `<section class="scout-panel scout-wheel-panel"><div class="scout-panel-head"><div><span class="scout-kicker">PREMIO DE HOY</span><h2>La Ruleta del VAR</h2></div><span class="scout-wheel-odds">6 sectores · 1/6 cada uno</span></div><div class="scout-wheel-layout"><div class="scout-wheel-frame ${GAME.spinning ? "is-spinning" : ""}"><i class="scout-wheel-pointer"></i><svg class="scout-wheel-disc ${GAME.spinning ? "is-spinning" : ""}" viewBox="0 0 240 240" style="--wheel-rotation:${GAME.wheelRotation}deg" role="img" aria-label="Ruleta con seis recompensas">${wheel}<circle cx="120" cy="120" r="23" fill="#0c1112" stroke="#90a6a0" stroke-width="2"/><text class="scout-wheel-center-label" text-anchor="middle" fill="#fff" font-size="5.5" font-weight="900"><tspan x="120" y="118">${esc(centerLines[0])}</tspan><tspan x="120" y="125">${esc(centerLines[1])}</tspan></text></svg></div><div class="scout-wheel-copy"><p>${solved ? "Premio aleatorio, resuelto en Supabase. Doble o Nada re-gira por una recompensa doble; Gol Anulado puede dejarte sin ella." : "Resuelve El Fichaje Clandestino para desbloquear un giro diario."}</p><button class="btn scout-spin ${canSpin ? "is-available" : ""}" onclick="spinDailyVar()" ${!canSpin ? "disabled" : ""}>${GAME.spinning ? (GAME.spinStage === "second" ? "Doble o Nada: segundo giro…" : "El VAR está revisando…") : data?.spin ? "Giro ya utilizado" : solved ? "Girar ruleta" : "Desbloqueada al acertar"}</button></div></div>${wheelResult}</section>`;

  const match = featuredMatch();
  const nextMatch = D.matches
    .filter((fixture) => ["SCHEDULED", "TIMED"].includes(fixture.status) && new Date(fixture.utcDate) > new Date())
    .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))[0] || null;
  const minutePick = data?.minute_pick;
  const minuteHistory = Array.isArray(data?.minute_history) ? data.minute_history : [];
  const minuteHistoryMarkup = minuteHistory.length ? `<div class="scout-minute-history">${minuteHistory.map((entry) => `<div><span>J${esc(entry.matchday ?? "–")} · ${esc(fmtD(entry.kickoff))}</span><b>${entry.predicted_minute}' → ${entry.first_goal_minute == null ? "sin goles" : `${entry.first_goal_minute}'`}</b><strong>${entry.settled ? `+${entry.points} pts` : "Pendiente"}</strong></div>`).join("")}</div>` : "";
  const minutePanel = `<section class="scout-panel scout-minute-panel"><div class="scout-panel-head"><div><span class="scout-kicker">PREDICCIÓN DE PARTIDO</span><h2>El Minuto de Oro</h2></div><span class="scout-minute-reward">+10 pts · ±3 min</span></div>${match ? `<div class="scout-featured-match"><span>PRÓXIMO PARTIDO · JORNADA ${esc(match.matchday)}</span><b>${esc(clubName(match.homeTeam))} <i>vs</i> ${esc(clubName(match.awayTeam))}</b><small>${esc(fmtD(match.utcDate))}</small></div>${minutePick ? `<div class="scout-minute-confirmed"><span>Tu predicción</span><b>${minutePick.predicted_minute}'</b><strong>${minutePick.settled ? minutePick.points ? "¡ACIERTO! +10 PTS" : "Resultado: +0 pts" : "A la espera del primer gol"}</strong>${minutePick.first_goal_minute != null ? `<small>Primer gol: ${minutePick.first_goal_minute}'</small>` : ""}</div>` : `<div class="scout-slider-value"><span>Tu minuto</span><strong id="gold-time">45'</strong></div><input class="scout-minute-slider" id="gold-minute" type="range" min="1" max="90" value="45" oninput="$('#gold-time').textContent=this.value+&quot;'&quot;" aria-label="Minuto del primer gol"><div class="scout-slider-scale"><span>1'</span><span>45'</span><span>90'</span></div><button class="btn" onclick="submitMinuteOfGold()" ${GAME.busy ? "disabled" : ""}>${GAME.busy ? "Guardando…" : "Fijar minuto"}</button>`}` : nextMatch && predictionLocked(nextMatch) ? `<p class="mu">El próximo partido es ${esc(fmtD(nextMatch.utcDate))}. El plazo para pronosticar se cerró una hora antes del inicio.</p>` : `<p class="mu">No hay un partido futuro publicado en el calendario para pronosticar.</p>`}${minuteHistoryMarkup}</section>`;

  const futureMatches = D.matches.filter(open).sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
  const matchOptions = (itemId, requirePrediction = false) => futureMatches
    .filter((fixture) => !requirePrediction || (
      S.preds[fixture.id]
      && String(S.joker[fixture.matchday]) !== String(fixture.id)
      && S.joker[fixture.id] !== true
    ))
    .map((fixture) => `<option value="${fixture.id}">${esc(clubName(fixture.homeTeam))}–${esc(clubName(fixture.awayTeam))} · J${fixture.matchday}</option>`)
    .join("");
  const inventoryNames = {
    boots_gold: ["Botas de Oro", "+5 puntos directos en tu clasificación de la jornada."],
    joker_x2: ["Comodín x2", "Duplica los puntos de uno de tus pronósticos guardados."],
    red_card: ["Tarjeta Roja", "Anula la puntuación de un pronóstico rival si la usas más de una hora antes del partido."],
    second_chance: ["Segunda Oportunidad", "Añade un intento al próximo Fichaje Clandestino."]
  };
  const inventory = data?.inventory || [];
  const inventoryMarkup = inventory.length
    ? inventory.map((item) => {
      const [name, description] = inventoryNames[item.reward_type] || ["Ventaja", "Recompensa de juego."];
      let action = "";
      if (item.reward_type === "joker_x2") action = matchOptions(item.id, true)
        ? `<div class="scout-item-controls"><select id="item-match-${item.id}" aria-label="Partido para aplicar Joker">${matchOptions(item.id, true)}</select><button class="btn ghost" onclick="equipGameJoker('${item.id}')" ${GAME.busy ? "disabled" : ""}>Aplicar</button></div>`
        : `<small class="scout-item-note">Necesitas un pronóstico futuro guardado que todavía no tenga Joker.</small>`;
      if (item.reward_type === "red_card") {
        const friends = Object.entries(S.friends);
        const options = friends.map(([id, friend]) => `<option value="${esc(id)}">${esc(friend.n)}</option>`).join("");
        const fixtures = matchOptions(item.id, false);
        action = options && fixtures
          ? `<div class="scout-item-controls"><select id="item-target-${item.id}" aria-label="Amigo rival">${options}</select><select id="item-match-${item.id}" aria-label="Partido donde aplicar tarjeta roja">${fixtures}</select><button class="btn ghost" onclick="useGameRedCard('${item.id}')" ${GAME.busy ? "disabled" : ""}>Usar tarjeta</button></div>`
          : `<small class="scout-item-note">Necesitas un amigo en la liga y un partido futuro.</small>`;
      }
      if (item.reward_type === "boots_gold") action = `<small class="scout-item-note">Aplicadas automáticamente · jornada ${esc(item.target_matchday || "siguiente")}</small>`;
      if (item.reward_type === "second_chance") action = `<small class="scout-item-note">Se activa automáticamente al empezar el próximo reto.</small>`;
      return `<article class="scout-inventory-item"><span class="scout-inventory-icon" aria-hidden="true">${item.reward_type === "boots_gold" ? "＋" : item.reward_type === "joker_x2" ? "×2" : item.reward_type === "red_card" ? "🟥" : "↻"}</span><div><b>${esc(name)}${item.quantity > 1 ? ` ×${item.quantity}` : ""}</b><small>${esc(description)}</small>${action}</div></article>`;
    }).join("")
    : `<p class="scout-inventory-empty">Aún no tienes ventajas. Resuelve el reto diario para desbloquear la ruleta.</p>`;
  const inventoryPanel = `<section class="scout-panel scout-inventory-panel"><div class="scout-panel-head"><div><span class="scout-kicker">VENTAJAS PARA LA JORNADA</span><h2>Tu inventario</h2></div><span class="scout-inventory-count">${inventory.length} ${inventory.length === 1 ? "objeto" : "objetos"}</span></div><div class="scout-inventory-list">${inventoryMarkup}</div></section>`;
  const errorPanel = errorMessage ? `<div class="scout-error" role="alert">${errorMessage}</div>` : "";
  return `<section class="scout-shell">
    <header class="scout-hero"><div><span class="scout-kicker">PLENO · RETOS DE LUNES A VIERNES</span><h1>Entre jornadas, <em>compites.</em></h1><p>Tres retos de fútbol. Puntos y ventajas que sí llegan a tu liga.</p><div class="scout-chips"><span>Jugador oculto</span><span>Ruleta con resultado seguro</span><span>Minuto exacto de gol</span></div></div><div class="scout-field" aria-hidden="true"><span>SCOUTING</span><i></i><b>90'</b></div></header>
    <p class="prediction-rule-note">Los pronósticos se pueden guardar o actualizar hasta una hora antes del partido. Al llegar a ese límite se bloquean también el Minuto de Oro, el Joker y la Tarjeta Roja.</p>
    ${errorPanel}
    <div class="scout-game-grid">${dailySection}${wheelSection}${minutePanel}${inventoryPanel}</div>
    <footer class="scout-footnote"><span>◇</span><p>Las respuestas, giros, inventario y bonus se validan en Supabase. El Minuto de Oro se liquida al sincronizar el resultado oficial del partido.</p></footer>
  </section>`;
}

/* ---------- vistas ---------- */
const infoButton = () => `<button class="info-button" type="button" onclick="openInstructions()" aria-label="Cómo se juega" title="Cómo se juega"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></svg></button>`;
const profileButton = () => `<button class="profile-button" type="button" onclick="openProfile()" aria-label="Abrir perfil" title="Mi perfil"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></svg></button>`;
function instructionsModal() {
  if (!V.instructionsOpen || !AUTH.session) return "";
  return `<div class="instructions-overlay" role="presentation" onclick="if(event.target===this)closeInstructions()"><section class="instructions-dialog" role="dialog" aria-modal="true" aria-labelledby="instructions-title" aria-describedby="instructions-intro" tabindex="-1"><header class="instructions-heading"><div><span class="instructions-kicker">GUÍA RÁPIDA · PLENO</span><h2 id="instructions-title">Aquí se juega así.</h2><p id="instructions-intro">LaLiga se disfruta más cuando cada partido cuenta.</p></div><button class="instructions-close" type="button" onclick="closeInstructions()" aria-label="Cerrar instrucciones">×</button></header><div class="instructions-grid"><article class="instructions-card"><span class="instructions-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 8h18v12H3zM7 8V5h10v3M7 13h4m-4 3h7"/></svg></span><div><h3>El objetivo</h3><p>Adivina los resultados de LaLiga, suma puntos y compite con tus amigos. Crea una liga o únete con su código.</p></div></article><article class="instructions-card"><span class="instructions-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3z"/></svg></span><div><h3>Puntúa por acertar</h3><p><b>10 puntos</b> por pleno, <b>7</b> por acertar el signo y la diferencia, y <b>3</b> por acertar el signo del resultado.</p></div></article><article class="instructions-card"><span class="instructions-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3v18m6-15H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H5"/></svg></span><div><h3>El comodín</h3><p>Activa tu <b>Joker x2</b> en un partido y duplica los puntos que consigas en ese pronóstico.</p></div></article><article class="instructions-card"><span class="instructions-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.5"/><path d="m4 4 16 16"/></svg></span><div><h3>Modo ciego</h3><p>Las porras de los demás permanecen ocultas hasta el pitido inicial. Así nadie puede copiar antes de jugar.</p></div></article></div><footer class="instructions-footer"><span>⚽ Una hora antes del partido, los pronósticos se bloquean.</span><button class="btn instructions-done" type="button" onclick="closeInstructions()">¡A jugar!</button></footer></section></div>`;
}
function profileModal() {
  if (!V.profileOpen || !AUTH.session) return "";
  const userId = AUTH.session.user.id;
  const source = CHAT.avatars[userId];
  const profileBusy = CHAT.uploadingAvatar || PROFILE.loading;
  const initials = [...String(S.me || AUTH.session.user.email || "Tú").trim()].slice(0, 2).join("").toUpperCase();
  const image = source
    ? `<img src="${esc(source)}" alt="Foto de perfil de ${esc(S.me || "tu cuenta")}">`
    : `<span class="profile-photo-placeholder">${esc(initials || "?")}</span>`;
  const uploadLabel = source ? "Cambiar foto" : "Añadir foto";
  return `<div class="instructions-overlay profile-overlay" role="presentation" onclick="if(event.target===this)closeProfile()"><section class="instructions-dialog profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-title" tabindex="-1"><header class="instructions-heading"><div><span class="instructions-kicker">TU CUENTA · PLENO</span><h2 id="profile-title">Mi perfil</h2><p>${esc(S.me || AUTH.session.user.email || "Jugador")}</p></div><button class="instructions-close profile-close" type="button" onclick="closeProfile()" aria-label="Cerrar perfil">×</button></header><div class="profile-photo-stage">${image}</div>${PROFILE.loading ? '<p class="profile-status" role="status">Cargando foto de perfil…</p>' : ""}${PROFILE.error ? `<p class="profile-error" role="alert">No se pudo completar la acción: ${esc(PROFILE.error)}</p>` : ""}<div class="profile-actions"><label class="btn profile-upload ${profileBusy || !S.league?.id ? "is-disabled" : ""}">${CHAT.uploadingAvatar ? "Guardando…" : uploadLabel}<input type="file" accept="image/*" onchange="uploadProfilePhoto(event)" ${profileBusy || !S.league?.id ? "disabled" : ""}></label>${source ? `<button class="btn ghost profile-remove" type="button" onclick="removeProfilePhoto()" ${profileBusy ? "disabled" : ""}>Quitar foto</button>` : ""}</div>${!S.league?.id ? '<p class="profile-hint">Únete a una liga para añadir una foto de perfil.</p>' : ""}</section></div>`;
}
function leaguePickerModal() {
  if (!V.leaguePickerOpen || !AUTH.session) return "";
  const rows = LEAGUES.items.map((league) => {
    const isOwner = league.ownerId === AUTH.session.user.id;
    return `<div class="league-picker-row"><button class="league-picker-option ${league.id === S.league?.id ? "is-current" : ""}" type="button" onclick="switchLeague('${esc(league.id)}')" ${LEAGUES.busy ? "disabled" : ""}><span><b>${esc(league.name)}</b><small>${league.id === S.league?.id ? "Liga actual" : `Jugando como ${esc(league.displayName)}`}${isOwner ? " · Creador" : ""}</small></span>${league.id === S.league?.id ? '<strong>ACTIVA</strong>' : '<i aria-hidden="true">→</i>'}</button>${isOwner ? `<button class="league-delete-button" type="button" onclick="deleteLeague('${esc(league.id)}')" aria-label="Borrar liga ${esc(league.name)}" title="Borrar liga" ${LEAGUES.busy ? "disabled" : ""}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>` : ""}</div>`;
  }).join("");
  return `<div class="instructions-overlay league-picker-overlay" role="presentation" onclick="if(event.target===this)closeLeaguePicker()"><section class="instructions-dialog league-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="league-picker-title" tabindex="-1"><header class="instructions-heading"><div><span class="instructions-kicker">TUS COMPETICIONES</span><h2 id="league-picker-title">Mis ligas</h2><p>Cambia de liga o únete a otra con su código.</p></div><button class="instructions-close league-picker-close" type="button" onclick="closeLeaguePicker()" aria-label="Cerrar ligas">×</button></header><div class="league-picker-list">${rows || '<p class="profile-hint">Todavía no perteneces a ninguna liga.</p>'}</div>${LEAGUES.warning ? `<p class="profile-hint" role="status">${esc(LEAGUES.warning)}</p>` : ""}<form class="league-picker-join" onsubmit="event.preventDefault();joinAnotherLeague()"><label for="league-join-code">Unirme a otra liga</label><div><input class="t" id="league-join-code" maxlength="10" autocomplete="off" placeholder="Código de invitación" required ${LEAGUES.busy ? "disabled" : ""}><button class="btn" type="submit" ${LEAGUES.busy ? "disabled" : ""}>${LEAGUES.busy ? "Uniéndote…" : "Unirme"}</button></div></form>${LEAGUES.error ? `<p class="profile-error" role="alert">${esc(LEAGUES.error)}</p>` : ""}</section></div>`;
}
async function deleteLeague(leagueId) {
  const league = LEAGUES.items.find((item) => item.id === leagueId);
  if (!league || league.ownerId !== AUTH.session?.user?.id || LEAGUES.busy) return;
  const confirmed = window.confirm(`¿Borrar la liga «${league.name}» para siempre?\n\nSe eliminarán para todos sus miembros los pronósticos, mensajes, premios e historial de esta liga. Esta acción no se puede deshacer.`);
  if (!confirmed) return;
  LEAGUES.busy = true;
  LEAGUES.error = "";
  let deleted = false;
  render();
  try {
    const { error } = await AUTH.client.rpc("delete_league", { p_league_id: leagueId });
    if (error) throw error;
    deleted = true;
    LEAGUES.items = LEAGUES.items.filter((item) => item.id !== leagueId);
    if (S.league?.id === leagueId) {
      const nextLeague = LEAGUES.items[0];
      if (nextLeague) await activateLeague(nextLeague.id, nextLeague.displayName);
      else {
        await loadCloudLeague();
        V.leaguePickerOpen = false;
      }
    }
    toast(`La liga «${league.name}» se ha borrado.`);
  } catch (error) {
    LEAGUES.error = deleted
      ? `La liga se borró, pero no se pudo actualizar la pantalla: ${errorText(error)}. Recarga la página.`
      : `No se pudo borrar la liga: ${errorText(error)}`;
  } finally {
    LEAGUES.busy = false;
    render();
  }
}
const authGate = () => `<div class="auth-shell"><section class="auth-brand" aria-label="PLENO, la porra de LaLiga">
  <a class="auth-brand-name" href="/" aria-label="PLENO, inicio"><img class="auth-brand-mark" src="icon.svg" alt=""><span>PLENO</span><i>FÚTBOL · AMIGOS · PORRA</i></a>
  <span class="auth-eyebrow"><span aria-hidden="true"></span> LA PORRA EMPIEZA AQUÍ</span>
  <h1><span class="auth-heading-line">El fútbol no se mira.</span><span class="auth-heading-accent">Se vive en equipo.</span></h1>
  <p>Haz tu porra. Reta a los tuyos. Que hable el marcador.</p>
  <div class="auth-pitch-wrap">
  <svg class="auth-illustration" viewBox="0 0 640 330" role="img" aria-labelledby="auth-pitch-title auth-pitch-description">
    <title id="auth-pitch-title">Pizarra táctica PLENO</title>
    <desc id="auth-pitch-description">Un campo de fútbol digital con jugadores en movimiento y una porra de dos a uno.</desc>
    <defs>
      <linearGradient id="auth-pitch-border" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ff6a2a" stop-opacity=".55"/><stop offset=".52" stop-color="#ffffff" stop-opacity=".08"/><stop offset="1" stop-color="#f43f5e" stop-opacity=".32"/></linearGradient>
      <linearGradient id="auth-pitch-line" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ff7438"/><stop offset="1" stop-color="#fb365c"/></linearGradient>
      <linearGradient id="auth-route" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffb454" stop-opacity=".15"/><stop offset=".55" stop-color="#ff7638"/><stop offset="1" stop-color="#ff3559"/></linearGradient>
      <radialGradient id="auth-pitch-light"><stop stop-color="#ff6638" stop-opacity=".18"/><stop offset="1" stop-color="#ff6638" stop-opacity="0"/></radialGradient>
      <pattern id="auth-pitch-grid" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M22 0H0V22" fill="none" stroke="#fff" stroke-opacity=".035" stroke-width="1"/></pattern>
      <filter id="auth-player-glow" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <rect x="15" y="18" width="610" height="292" rx="24" fill="#101014" stroke="url(#auth-pitch-border)"/>
    <rect x="16" y="19" width="608" height="290" rx="23" fill="url(#auth-pitch-grid)"/>
    <ellipse cx="321" cy="164" rx="258" ry="131" fill="url(#auth-pitch-light)"/>
    <g class="auth-pitch-lines" fill="none" stroke="#d7d2d5" stroke-opacity=".25" stroke-width="1.3">
      <rect x="43" y="45" width="554" height="238" rx="5"/>
      <path d="M320 45v238M43 111h67v106H43m554-106h-67v106h67"/>
      <path d="M43 142h26v44H43m554-44h-26v44h26"/>
      <circle cx="320" cy="164" r="48"/><circle cx="320" cy="164" r="2.5" fill="#d7d2d5"/>
      <circle cx="91" cy="164" r="2.5" fill="#d7d2d5"/><circle cx="549" cy="164" r="2.5" fill="#d7d2d5"/>
    </g>
    <path class="auth-route auth-route-one" d="M129 210C173 202 174 133 232 145s67 52 102 20 47-68 91-46 33 33 59 20" fill="none" stroke="url(#auth-route)" stroke-width="2.5" stroke-linecap="round"/>
    <path class="auth-route auth-route-two" d="M193 91c26 31 16 59 47 67s38-22 66-16 29 40 56 52" fill="none" stroke="#ffbd72" stroke-opacity=".75" stroke-width="1.5" stroke-dasharray="3 7" stroke-linecap="round"/>
    <g transform="translate(129 210)"><g class="auth-player auth-player-a" filter="url(#auth-player-glow)"><circle r="13" fill="#ff6338" fill-opacity=".12" stroke="#ff7145" stroke-opacity=".6"/><circle r="6.5" fill="#ff7546"/><circle r="2" fill="#fff2e9"/></g></g>
    <g transform="translate(232 145)"><g class="auth-player auth-player-b" filter="url(#auth-player-glow)"><circle r="13" fill="#ff6338" fill-opacity=".12" stroke="#ff7145" stroke-opacity=".6"/><circle r="6.5" fill="#ff7546"/><circle r="2" fill="#fff2e9"/></g></g>
    <g transform="translate(334 165)"><g class="auth-player auth-player-c" filter="url(#auth-player-glow)"><circle r="13" fill="#ff6338" fill-opacity=".12" stroke="#ff7145" stroke-opacity=".6"/><circle r="6.5" fill="#ff7546"/><circle r="2" fill="#fff2e9"/></g></g>
    <g transform="translate(425 119)"><g class="auth-player auth-player-d" filter="url(#auth-player-glow)"><circle r="13" fill="#ff6338" fill-opacity=".12" stroke="#ff7145" stroke-opacity=".6"/><circle r="6.5" fill="#ff7546"/><circle r="2" fill="#fff2e9"/></g></g>
    <g transform="translate(484 139)"><g class="auth-player auth-player-e" filter="url(#auth-player-glow)"><circle r="13" fill="#ff6338" fill-opacity=".12" stroke="#ff7145" stroke-opacity=".6"/><circle r="6.5" fill="#ff7546"/><circle r="2" fill="#fff2e9"/></g></g>
    <g transform="translate(184 108)"><g class="auth-player auth-player-f" filter="url(#auth-player-glow)"><circle r="13" fill="#ff6338" fill-opacity=".12" stroke="#ff7145" stroke-opacity=".6"/><circle r="6.5" fill="#ff7546"/><circle r="2" fill="#fff2e9"/></g></g>
    <g transform="translate(276 167)"><g class="auth-player auth-player-g" filter="url(#auth-player-glow)"><circle r="13" fill="#ff6338" fill-opacity=".12" stroke="#ff7145" stroke-opacity=".6"/><circle r="6.5" fill="#ff7546"/><circle r="2" fill="#fff2e9"/></g></g>
    <g transform="translate(362 214)"><g class="auth-player auth-player-h" filter="url(#auth-player-glow)"><circle r="13" fill="#ff6338" fill-opacity=".12" stroke="#ff7145" stroke-opacity=".6"/><circle r="6.5" fill="#ff7546"/><circle r="2" fill="#fff2e9"/></g></g>
    <g transform="translate(511 189)"><g class="auth-player auth-player-i" filter="url(#auth-player-glow)"><circle r="13" fill="#ff6338" fill-opacity=".12" stroke="#ff7145" stroke-opacity=".6"/><circle r="6.5" fill="#ff7546"/><circle r="2" fill="#fff2e9"/></g></g>
    <g class="auth-ball" transform="translate(355 164)"><circle r="7" fill="#fff8ef"/><path d="m-2.5-2 3-.8 2 2-1 3h-3l-1.4-2.5z" fill="#262229"/></g>
    <g class="auth-scoreboard" transform="rotate(-4 487 89)">
      <rect x="408" y="53" width="158" height="73" rx="14" fill="#17161a" fill-opacity=".9" stroke="#ffffff" stroke-opacity=".18"/>
      <path d="M408 67h158" stroke="#ffffff" stroke-opacity=".08"/>
      <circle class="auth-score-light" cx="426" cy="60" r="2" fill="#ffb454"/><circle class="auth-score-light auth-score-light-two" cx="548" cy="114" r="1.7" fill="#ff6648"/>
      <text x="426" y="83" fill="#a5a1a5" font-family="Inter, sans-serif" font-size="9" font-weight="700" letter-spacing="1.8">TU PORRA</text>
      <text x="426" y="111" fill="#fff" font-family="Space Grotesk, sans-serif" font-size="25" font-weight="700">2 <tspan fill="#ff7443">—</tspan> 1</text>
      <rect x="518" y="94" width="29" height="14" rx="7" fill="#ff7546" fill-opacity=".13"/><text x="523" y="104" fill="#ff9a67" font-family="Inter, sans-serif" font-size="7" font-weight="700" letter-spacing=".8">LIVE</text>
    </g>
    <circle class="auth-pitch-particle auth-pitch-particle-a" cx="370" cy="73" r="1.5" fill="#ffb454"/><circle class="auth-pitch-particle auth-pitch-particle-b" cx="251" cy="250" r="1.5" fill="#ff6848"/><circle class="auth-pitch-particle auth-pitch-particle-c" cx="576" cy="176" r="1.2" fill="#ffb454"/>
    <text x="43" y="299" fill="#8c858b" font-family="Inter, sans-serif" font-size="8" font-weight="700" letter-spacing="1.4">LECTURA DE JUEGO · JORNADA 01</text>
    <text x="574" y="299" fill="#ff8b57" font-family="Inter, sans-serif" font-size="8" font-weight="700" letter-spacing="1.1" text-anchor="end">01:24</text>
  </svg>
  </div>
  <div class="auth-brand-foot"><span class="auth-live-dot"></span> TU EQUIPO. TU JORNADA. TU PORRA.</div>
  </section><section class="card auth-card" aria-labelledby="auth-title">
  <div class="auth-card-top"><span class="auth-card-kicker"><span></span> ACCESO DE JUGADOR</span><span class="auth-card-index">PL<span>·</span>01</span></div>
  <h2 id="auth-title">${AUTH.mode === "signup" ? "CREAR CUENTA" : AUTH.mode === "update" ? "NUEVA CONTRASEÑA" : "INICIAR SESIÓN"}</h2>
  <p class="auth-card-intro">${AUTH.mode === "signup" ? "Empieza a jugar con los tuyos." : AUTH.mode === "update" ? "Elige una contraseña segura para tu cuenta." : "Vuelve a la jornada. Tus amigos ya están jugando."}</p>
  ${AUTH.error ? `<p class="auth-message" role="status">${esc(AUTH.error)}</p>` : ""}
  <form class="auth-form" onsubmit="event.preventDefault();${AUTH.mode === "update" ? "updatePassword()" : "submitAuth()"}">
    ${AUTH.mode === "update" ? "" : `<label for="auth-email">CORREO ELECTRÓNICO</label><div class="auth-input-wrap"><svg class="auth-input-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/></svg><input class="t" id="auth-email" type="email" autocomplete="email" required value="${esc(AUTH.email)}" placeholder="tu@correo.com"></div>`}
    <label for="auth-password">${AUTH.mode === "update" ? "NUEVA CONTRASEÑA" : "CONTRASEÑA"}</label>
    <div class="auth-input-wrap auth-password-field"><svg class="auth-input-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg><input class="t" id="auth-password" type="password" autocomplete="${AUTH.mode === "signup" || AUTH.mode === "update" ? "new-password" : "current-password"}" minlength="6" required value="${esc(AUTH.password)}" placeholder="Al menos 6 caracteres"><button class="password-visibility" type="button" onclick="togglePasswordVisibility(this)" aria-label="Mostrar contraseña" aria-pressed="false" title="Mostrar contraseña"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/><path class="password-eye-slash" d="m4 4 16 16"/></svg></button></div>
    ${AUTH.mode === "login" ? `<div class="auth-forgot-row"><button class="auth-link" type="button" onclick="resetPassword()">¿Olvidaste la contraseña?</button></div>` : ""}
    <button class="btn auth-submit" type="submit" ${AUTH.busy || AUTH.googleBusy || !AUTH.client ? "disabled" : ""}>${AUTH.busy ? '<svg class="auth-spinner" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-opacity=".28" stroke-width="3"/><path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>Entrando…' : AUTH.mode === "signup" ? "Crear cuenta" : AUTH.mode === "update" ? "Guardar contraseña" : 'Entrar <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>'}</button>
  </form>
  ${AUTH.mode === "login" ? `<div class="auth-divider"><span>O CONTINÚA CON</span></div><button class="btn ghost auth-submit google-submit" onclick="signInGoogle()" ${AUTH.busy || AUTH.googleBusy || !AUTH.client ? "disabled" : ""}><svg class="google-mark" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12S17.4 12 24 12c3.1 0 5.9 1.2 8.1 3.1l5.7-5.7C34.1 5.8 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/><path fill="#34A853" d="M6.3 14.7l6.6 4.8C14.5 15.1 18.9 12 24 12c3.1 0 5.9 1.2 8.1 3.1l5.7-5.7C34.1 5.8 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#FBBC05" d="M24 44c5.2 0 9.9-1.7 13.2-4.6l-6.1-5.2c-1.7 1.2-4.2 2-7.1 2-5.3 0-9.7-3.3-11.3-7.9l-6.6 5.1C9.4 39.6 16.1 44 24 44z"/><path fill="#EA4335" d="M6.3 14.7C4.8 17.4 4 20.6 4 24s.8 6.6 2.3 9.3l6.6-5.1c-.6-1.3-.9-2.7-.9-4.2s.3-2.9.9-4.2z"/></svg>${AUTH.googleBusy ? "Abriendo Google…" : "Continuar con Google"}</button>` : ""}
  ${AUTH.mode === "login" || AUTH.mode === "signup" ? `<p class="auth-switch">${AUTH.mode === "signup" ? "¿Ya tienes cuenta?" : "¿Aún no tienes cuenta?"} <button class="auth-link" onclick="setAuthMode('${AUTH.mode === "signup" ? "login" : "signup"}')">${AUTH.mode === "signup" ? "Inicia sesión" : "Regístrate"}</button></p>` : ""}
  <p class="auth-privacy"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.7 2.9 8.1 7 10 4.1-1.9 7-5.3 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg>Tu cuenta mantiene tus ligas y pronósticos sincronizados.</p>
  </section></div>`;
const leagueGate = () => `<div class="top"><div class="bar"><a class="brand-lockup" href="/" aria-label="PLENO, inicio"><img src="icon.svg" alt=""><span class="logo">PLENO</span></a><span class="sp"></span><div class="top-actions">${infoButton()}<button class="btn ghost auth-logout" onclick="signOut()" aria-label="Cerrar sesión" title="Cerrar sesión"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3m9-7h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-6"/></svg></button></div></div></div><main class="league-gate">
<section class="hero" aria-labelledby="league-gate-title"><span class="league-gate-kicker">PLENO <i></i> LA PORRA DE LALIGA</span><h1 id="league-gate-title">Acierta el marcador.<br>Gana a tus amigos.</h1><p>Pronostica antes del pitido y suma puntos con cada partido.</p></section>
${AUTH.error ? `<div class="card err" role="alert">${esc(AUTH.error)}</div>` : ""}
${LEAGUES.warning ? `<div class="card league-setup-warning" role="status">${esc(LEAGUES.warning)}</div>` : ""}
<h2 class="league-gate-heading">Elige cómo empezar</h2><div class="gate league-gate-options">
<form class="card league-choice league-choice-create" onsubmit="event.preventDefault();mk()"><div class="league-choice-heading"><span class="league-choice-number">01</span><div><h3>Crear una liga</h3><p>Invita a tus amigos y montad vuestra porra.</p></div></div><label for="gn">Tu nombre</label><input class="t" id="gn" name="display-name" autocomplete="name" placeholder="¿Cómo te llamamos?" maxlength="30" required value="${esc(LEAGUES.createName)}"><label for="ln">Nombre de la liga</label><input class="t" id="ln" name="league-name" placeholder="p. ej., La porra del sábado" maxlength="50" required value="${esc(LEAGUES.leagueName)}"><button class="btn league-choice-submit" type="submit">Crear mi liga <span aria-hidden="true">→</span></button></form>
<form class="card league-choice league-choice-join" onsubmit="event.preventDefault();jn()"><div class="league-choice-heading"><span class="league-choice-number">02</span><div><h3>Unirme a una liga</h3><p>¿Te han pasado un código? Entra aquí.</p></div></div><label for="gn2">Tu nombre</label><input class="t" id="gn2" name="display-name" autocomplete="name" placeholder="¿Cómo te llamamos?" maxlength="30" required value="${esc(LEAGUES.joinName)}"><label for="lc">Código de invitación</label><input class="t league-code-input" id="lc" name="invite-code" placeholder="Escribe el código" maxlength="10" autocapitalize="characters" spellcheck="false" required value="${esc(LEAGUES.inviteCode)}"><button class="btn ghost league-choice-submit" type="submit">Unirme a la liga <span aria-hidden="true">→</span></button></form></div>
<p class="league-gate-footnote"><span aria-hidden="true">✓</span> Tus ligas y pronósticos se guardan en tu cuenta y se sincronizan entre dispositivos.</p></main>`;
async function activateLeague(id, displayName) {
  if (ROOM.leagueId && ROOM.leagueId !== id) {
    if (ROOM.channel && AUTH.client) AUTH.client.removeChannel(ROOM.channel);
    Object.assign(ROOM, { loading: false, loaded: false, busy: false, archiving: false, error: "", archiveError: "", isAdmin: false, debts: [], chronicles: [], hallSeasons: [], dinnerLeaders: [], channel: null, channelLeagueId: null, leagueId: null, updatedAt: 0 });
  }
  if (CHAT.channel && AUTH.client) await AUTH.client.removeChannel(CHAT.channel);
  Object.assign(CHAT, { loading: false, sending: false, uploadingAvatar: false, error: "", messages: [], avatars: {}, avatarPaths: {}, channel: null, channelLeagueId: null, loadedLeagueId: null, subscribed: false, input: "" });
  const { data, error } = await AUTH.client.from("leagues").select("id,name,invite_code").eq("id", id).single();
  if (error) throw error;
  PENDING_PREDS.clear();
  FAILED_PREDS.clear();
  S.league = { id: data.id, name: data.name, code: data.invite_code };
  V.leagueSection = "ranking";
  S.me = displayName;
  S.preds = {};
  S.joker = {};
  S.friends = {};
  await loadCloudLeague(id);
  GAME.data = null;
  GAME.date = "";
  GAME.wheelResult = null;
  if (V.tab === "g") loadScoutGame();
  refreshMinigameScoreData(false);
}
async function mk() {
  const n = $("#ln").value.trim(), me = $("#gn").value.trim();
  if (!n || !me) return toast("Escribe tu nombre y el de la liga");
  try {
    const { data, error } = await AUTH.client.rpc("create_league", { p_name: n, p_display_name: me });
    if (error) throw error;
    Object.assign(LEAGUES, { createName: "", leagueName: "" });
    await activateLeague(data, me);
    render();
  } catch (e) {
    LEAGUES.createName = me;
    LEAGUES.leagueName = n;
    AUTH.error = `No se pudo crear la liga: ${e.message}`;
    render();
  }
}
async function jn() {
  const c = $("#lc").value.trim().toUpperCase(), me = $("#gn2").value.trim();
  if (!c || !me) return toast("Escribe tu nombre y el código");
  try {
    const { data, error } = await AUTH.client.rpc("join_league", { p_invite_code: c, p_display_name: me });
    if (error) throw error;
    Object.assign(LEAGUES, { joinName: "", inviteCode: "" });
    await activateLeague(data, me);
    render();
  } catch (e) {
    LEAGUES.joinName = me;
    LEAGUES.inviteCode = c;
    AUTH.error = `No se pudo unir a la liga: ${e.message}`;
    render();
  }
}
function openLeaguePicker() {
  if (!AUTH.session || V.leaguePickerOpen) return;
  LEAGUES.error = "";
  V.leaguePickerOpen = true;
  V.leaguePickerNeedsFocus = true;
  render();
}
function closeLeaguePicker() {
  if (!V.leaguePickerOpen) return;
  V.leaguePickerOpen = false;
  document.body.classList.remove("instructions-visible");
  render();
  requestAnimationFrame(() => document.querySelector(".league-switcher")?.focus());
}
async function joinAnotherLeague() {
  const code = $("#league-join-code")?.value.trim().toUpperCase() || "";
  if (!code) {
    LEAGUES.error = "Escribe el código de invitación.";
    render();
    return;
  }
  if (LEAGUES.busy) return;
  LEAGUES.busy = true;
  LEAGUES.error = "";
  render();
  try {
    const { data, error } = await AUTH.client.rpc("join_league", {
      p_invite_code: code,
      p_display_name: S.me || AUTH.session.user.email || "Jugador"
    });
    if (error) throw error;
    await activateLeague(data, S.me || AUTH.session.user.email || "Jugador");
    V.leaguePickerOpen = false;
    toast("Te has unido a la liga.");
  } catch (error) {
    LEAGUES.error = `No se pudo unir a la liga: ${errorText(error)}`;
  } finally {
    LEAGUES.busy = false;
    render();
  }
}
async function switchLeague(id) {
  if (!id || id === S.league?.id || LEAGUES.busy) return closeLeaguePicker();
  LEAGUES.busy = true;
  LEAGUES.error = "";
  render();
  try {
    const league = LEAGUES.items.find((item) => item.id === id);
    if (!league) throw new Error("No se encontró esa liga en tu cuenta.");
    await activateLeague(id, league.displayName);
    V.leaguePickerOpen = false;
  } catch (error) {
    LEAGUES.error = `No se pudo cambiar de liga: ${errorText(error)}`;
  } finally {
    LEAGUES.busy = false;
    render();
  }
}

const status = (m) => live(m) ? `<span class="live">● EN DIRECTO</span>` : fin(m) ? "Finalizado" : m.status === "POSTPONED" ? "Aplazado" : fmtD(m.utcDate);
function sugg(m) {
  const s = predict(m.homeTeam.id, m.awayTeam.id, D.tH, D.tA); if (!s) return "";
  const P = (x) => Math.round(x * 100);
  return `<div class="sg"><span>Sugerencia PLENO: <b>${s.h}–${s.a}</b></span><div class="pb" title="Local / Empate / Visitante"><i style="width:${P(s.w)}%">${P(s.w)}</i><u style="width:${P(s.d)}%">${P(s.d)}</u><s style="width:${P(s.l)}%">${P(s.l)}</s></div><button class="jk" onclick="useS(${m.id},${s.h},${s.a})">Usar</button></div>`;
}
function mc(m) {
  const id = m.id, p = S.preds[id], jk = S.joker[m.matchday] === id || S.joker[id] === true, o = open(m), lock = predictionLocked(m), f = fin(m), l = live(m), r = res(m);
  const mid = f || l ? `<div class="big">${r.h}<i>–</i>${r.a}</div>` : `<div class="big mu">vs</div>`;
  let foot;
  if (o) foot = `<div class="pred"><div class="sc"><button onclick="stp(${id},'h',-1)" aria-label="Menos goles local">−</button><input id="h${id}" value="${p ? p.h : 0}" inputmode="numeric" aria-label="Goles local"><button onclick="stp(${id},'h',1)" aria-label="Más goles local">+</button><b>:</b><button onclick="stp(${id},'a',-1)" aria-label="Menos goles visitante">−</button><input id="a${id}" value="${p ? p.a : 0}" inputmode="numeric" aria-label="Goles visitante"><button onclick="stp(${id},'a',1)" aria-label="Más goles visitante">+</button></div><button class="jk ${jk ? "on" : ""}" onclick="jok(${m.matchday},${id})">★ Joker x2</button><button class="btn" onclick="sv(${id})">${p ? "Actualizar" : "Guardar porra"}</button></div>${sugg(m)}`;
  else {
    const g = f && p ? pts(p, r, jk) : null;
    const fr = Object.values(S.friends).filter((x) => x.p[id]).map((x) => `<span class="chip">${esc(x.n)} ${x.p[id][0]}–${x.p[id][1]}</span>`).join("");
    foot = `<div class="pred done"><span>${p ? `Tu porra: <b>${p.h}–${p.a}</b>${jk ? " ★" : ""}` : '<span class="mu">Sin porra</span>'}</span>${g != null ? `<span class="pts p${g ? 1 : 0}">+${g} pts</span>` : ""}</div>${lock ? `<p class="prediction-lock-note">Pronósticos cerrados: se bloquean una hora antes del inicio (${fmtD(m.utcDate)}).</p>` : ""}${fr ? `<div class="chips">${fr}</div>` : ""}`;
  }
  return `<article class="mc ${l ? "isl" : ""} ${f ? "finished" : ""} ${o ? "predictable" : ""}"><div class="mh"><span>${status(m)}</span><span>JORNADA ${m.matchday}</span></div><div class="row"><div class="tm" onclick="openTeam(${m.homeTeam.id})">${crest(m.homeTeam)}<b>${nm(m.homeTeam)}</b></div>${mid}<div class="tm" onclick="openTeam(${m.awayTeam.id})">${crest(m.awayTeam)}<b>${nm(m.awayTeam)}</b></div></div>${foot}</article>`;
}
const trow = (r, i) => { const gd = Number.isFinite(r.goalDifference) ? r.goalDifference : null; return `<tr><td>${i + 1}</td><td><div class="tc" onclick="openTeam(${r.team.id})">${crest(r.team, "s")}${nm(r.team)}</div></td><td>${r.playedGames}</td><td>${r.won}</td><td>${r.draw}</td><td>${r.lost}</td><td>${gd == null ? "–" : `${gd > 0 ? "+" : ""}${gd}`}</td><td><b>${r.points}</b></td></tr>`; };

function upcomingCompetitions() {
  const competitions = [
    { group: "GRANDES LIGAS", emblem: "A", name: "Serie A", country: "Italia" },
    { group: "GRANDES LIGAS", emblem: "B", name: "Bundesliga", country: "Alemania" },
    { group: "GRANDES LIGAS", emblem: "L1", name: "Ligue 1", country: "Francia" },
    { group: "EUROPA", emblem: "★", name: "Champions League", country: "UEFA" },
    { group: "EUROPA", emblem: "UE", name: "Europa League", country: "UEFA" },
    { group: "EUROPA", emblem: "UC", name: "Conference League", country: "UEFA" },
    { group: "SELECCIONES", emblem: "WC", name: "Mundial", country: "FIFA" },
    { group: "SELECCIONES", emblem: "EU", name: "Eurocopa", country: "UEFA" },
    { group: "SELECCIONES", emblem: "N", name: "Nations League", country: "UEFA" },
    { group: "SELECCIONES", emblem: "Q", name: "Clasificatorias", country: "Selecciones" },
    { group: "SELECCIONES", emblem: "INT", name: "Amistosos", country: "Internacionales" }
  ];
  const lock = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="10" width="15" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/></svg>`;
  const cards = competitions.map((competition, index) => `<article class="roadmap-card" style="--roadmap-index:${index}"><span class="roadmap-group">${competition.group}</span><div class="roadmap-card-top"><span class="roadmap-emblem" aria-hidden="true">${competition.emblem}</span><span class="roadmap-lock">${lock}</span></div><h3>${competition.name}</h3><div class="roadmap-card-foot"><span>${competition.country}</span><b>PRÓXIMAMENTE</b></div></article>`).join("");
  return `<section class="roadmap-section"><div class="roadmap-heading"><div><span class="round-kicker">EL MAPA SE EXPANDE</span><h2>Lo próximo en PLENO</h2><p>Más competiciones, más piques y más formas de jugar. Estamos trabajando en ello.</p></div><span class="roadmap-count">11 · EN DESARROLLO</span></div><div class="roadmap-grid">${cards}</div></section>`;
}

function tInicio() {
  const nxt = D.matches.filter((m) => !fin(m) && m.status !== "POSTPONED").sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
  const lv = D.matches.filter(live), n = nxt.find((m) => !live(m)), me = total(mine()), rank = board().findIndex((x) => x.me) + 1;
  const pend = D.matches.filter((m) => m.matchday === D.cur && open(m) && !S.preds[m.id]).length;
  const nextCard = n ? `<div class="home-next"><span class="home-next-label">${live(n) ? "PARTIDO EN JUEGO" : "PRÓXIMO PARTIDO"}</span><div class="home-next-teams"><span>${esc(clubName(n.homeTeam))}</span><b>VS</b><span>${esc(clubName(n.awayTeam))}</span></div><small>${live(n) ? "Sigue el marcador en directo" : `${fmtD(n.utcDate)} · empieza en ${cd(n.utcDate)}`}</small></div>` : `<div class="home-next"><span class="home-next-label">LALIGA EA SPORTS</span><div class="home-next-teams"><span>La jornada</span><b>38</b></div><small>Consulta la clasificación y las estadísticas de la temporada.</small></div>`;
  return `<section class="home-hero">
    <div class="home-hero-copy"><span class="home-kicker"><i></i> TU JUEGO · TU LIGA</span><h1>La jornada se juega <em>también aquí.</em></h1><p>Pronostica, suma puntos y escala posiciones. Cada partido cuenta.</p>
      <button class="btn home-cta" onclick="switchTab('p')">Hacer mis pronósticos <span aria-hidden="true">→</span></button>
    </div>
    <div class="home-hero-visual"><div class="home-field" role="img" aria-label="Campo de fútbol con una formación de jugadores"><span class="field-label">LA JORNADA <i>·</i> 90 MINUTOS</span><span class="field-markings"></span><i class="field-player fp1"></i><i class="field-player fp2"></i><i class="field-player fp3"></i><i class="field-player fp4"></i><i class="field-player fp5"></i><i class="field-player fp6"></i><i class="field-ball"></i><span class="field-caption">TODO SE DECIDE EN EL CAMPO</span></div></div>
    ${nextCard}
  </section>
  <div class="stats home-stats"><div><span>TUS PUNTOS</span><b>${me.pts}</b><small>en la temporada</small></div><div><span>POSICIÓN</span><b>${rank}<i>º</i></b><small>en ${esc(S.league.name)}</small></div><div><span>MARCADOR EXACTO</span><b>${me.ex}</b><small>plenos conseguidos</small></div></div>
  <button class="home-scout" onclick="switchTab('g')"><span class="home-scout-icon" aria-hidden="true">✦</span><span><small>RETOS DIARIOS · PLENO</small><b>Compite incluso entre jornadas</b><i>Scouting, ruleta VAR y Minuto de Oro.</i></span><strong>Jugar <span aria-hidden="true">→</span></strong></button>
  ${pend ? `<div class="alert home-alert"><span><b>Te faltan ${pend} pronóstico${pend === 1 ? "" : "s"}</b> para completar la jornada ${D.cur}.</span><button class="btn" onclick="switchTab('p')">Completar ahora <span aria-hidden="true">→</span></button></div>` : ""}
  ${lv.length ? `<div class="section-title"><span class="section-pulse"></span><h2>En directo</h2><span class="section-rule"></span><small>${lv.length} ${lv.length === 1 ? "partido" : "partidos"}</small></div>${lv.map(mc).join("")}` : ""}
  ${n ? `<div class="section-title"><h2>La próxima cita</h2><span class="section-rule"></span><small>${cd(n.utcDate)}</small></div>${mc(n)}` : ""}
  <div class="home-lower"><section><div class="section-title"><h2>Clasificación LaLiga</h2><span class="section-rule"></span><button class="section-link" onclick="switchTab('c')">Ver todo →</button></div><div class="card home-table"><table aria-label="Primeros puestos de la clasificación de LaLiga"><thead><tr><th scope="col">#</th><th scope="col">Club</th><th scope="col" title="Partidos jugados">PJ</th><th scope="col" title="Ganados">G</th><th scope="col" title="Empatados">E</th><th scope="col" title="Perdidos">P</th><th scope="col" title="Diferencia de goles">DG</th><th scope="col">PTS</th></tr></thead><tbody>${D.table.slice(0, 5).map(trow).join("")}</tbody></table><div class="home-table-foot"><span>TOP 5 · JORNADA ${D.cur}</span><button onclick="switchTab('c')">Ver tabla completa <span aria-hidden="true">→</span></button></div></div></section>
  <section><div class="section-title"><h2>Pichichi</h2><span class="section-rule"></span><button class="section-link" onclick="switchTab('s')">Estadísticas →</button></div><div class="card home-scorers">${D.scorers.slice(0, 5).map(plRow).join("") || '<span class="mu">Sin datos</span>'}</div></section></div>${upcomingCompetitions()}`;
}
function plRow(s, i) { return `<div class="pl"><b class="mu" style="width:18px">${i + 1}</b>${crest(s.team, "s")}<div><div class="n">${esc(s.player.name)}</div><small class="mu">${nm(s.team)} · ${s.playedMatches} PJ</small></div><div class="r"><span class="mu">${s.assists ?? 0} A</span><b>${s.goals} G</b></div></div>`; }
function tPart() {
  const md = V.md || D.cur, list = D.matches.filter((m) => m.matchday === md).sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
  return `<div class="mdn"><button class="btn ghost" onclick="V.md=${md - 1};render()" ${md <= 1 ? "disabled" : ""}>‹</button><b>Jornada ${md}</b><button class="btn ghost" onclick="V.md=${md + 1};render()" ${md >= 38 ? "disabled" : ""}>›</button></div><p class="prediction-rule-note">Puedes guardar y actualizar tu pronóstico hasta una hora antes del inicio. Después se bloquea para todos.</p>${list.map(mc).join("") || '<p class="mu">Sin partidos.</p>'}<p class="mu" style="font-size:12px">Con el plan gratuito, los marcadores llegan con un pequeño retraso.</p>`;
}
function tClas() {
  const t = { all: D.table, home: D.tH, away: D.tA }[V.tbl], n = t.length;
  const col = (i) => V.tbl !== "all" ? "transparent" : i < 4 ? "#3B82F6" : i < 6 ? "#FF7A00" : i === 6 ? "#22C55E" : i >= n - 3 ? "#EF4444" : "transparent";
  return `<div class="subs">${[["all", "General"], ["home", "Local"], ["away", "Visitante"]].map(([k, x]) => `<button class="${V.tbl === k ? "on" : ""}" onclick="V.tbl='${k}';render()">${x}</button>`).join("")}</div><div class="card" style="overflow-x:auto;padding:6px 10px"><table><tr><th>#</th><th>Club</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>DG</th><th>PTS</th></tr>${t.map((r, i) => trow(r, i).replace("<tr>", `<tr class="z" style="--zc:${col(i)}">`)).join("")}</table></div><p class="mu" style="font-size:12px">Azul: Champions · Naranja: Europa League · Verde: Conference · Rojo: descenso (orientativo).</p>`;
}
function tClubs() {
  if (V.team) return tTeam();
  const q = V.q.toLowerCase(), pos = Object.fromEntries(D.table.map((r, i) => [r.team.id, [i + 1, r.points]]));
  return `<input class="t" placeholder="Buscar club…" value="${esc(V.q)}" oninput="V.q=this.value;render();const i=document.querySelector('.t');i.focus();i.setSelectionRange(99,99)"><div class="grid">${D.teams.filter((t) => t.name.toLowerCase().includes(q)).map((t) => `<button class="club" onclick="openTeam(${t.id})">${crest(t, "l")}${nm(t)}<small>${pos[t.id] ? `${pos[t.id][0]}º · ${pos[t.id][1]} pts` : ""}</small></button>`).join("")}</div>`;
}
function openTeam(id) { V.team = id; V.tab = "k"; V.sub = "res"; loadTeam(id); render(); window.scrollTo(0, 0); }
const age = (d) => d ? Math.floor((Date.now() - new Date(d)) / 31557600000) : "";
const grp = (p = "") => /Goalkeeper/.test(p) ? 0 : /Back|Defen/.test(p) ? 1 : /Midfield/.test(p) ? 2 : 3;
function tTeam() {
  const t = D.by[V.team]; if (!t) return "";
  const o = D.tc[V.team] || { loading: true }, row = D.table.findIndex((r) => r.team.id === V.team), rw = D.table[row];
  const ms = D.matches.filter((m) => m.homeTeam.id === V.team || m.awayTeam.id === V.team).sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
  const done = ms.filter(fin), next = ms.find((m) => !fin(m) && m.status !== "POSTPONED");
  const wdl = (m) => { const r = res(m), h = m.homeTeam.id === V.team, d = h ? r.h - r.a : r.a - r.h; return d > 0 ? "W" : d < 0 ? "L" : "D"; };
  const sc = D.scorers.filter((s) => s.team.id === V.team), star = sc[0];
  const head = `<button class="btn ghost" onclick="V.team=null;render()">← Clubes</button><div class="th" style="margin-top:12px">${crest(t, "l")}<h1>${esc(t.name)}</h1><div class="mu">${esc(t.venue || "")}${t.founded ? " · fundado en " + t.founded : ""}</div>${rw ? `<div class="stats"><div><b>${row + 1}º</b>posición</div><div><b>${rw.points}</b>puntos</div><div><b>${rw.goalsFor}-${rw.goalsAgainst}</b>goles</div></div>` : ""}</div>
  <div class="subs">${[["res", "Resumen"], ["pla", "Plantilla"], ["gol", "Goleadores"], ["dat", "Datos"]].map(([k, x]) => `<button class="${V.sub === k ? "on" : ""}" onclick="V.sub='${k}';render()">${x}</button>`).join("")}</div>`;
  if (V.sub === "res") return head + `<div class="card"><b>Forma</b><div class="form big">${done.slice(-5).map((m) => `<i class="${wdl(m)}">${{ W: "G", D: "E", L: "P" }[wdl(m)]}</i>`).join("") || '<span class="mu">Sin partidos</span>'}</div></div>
  ${star ? `<h2>★ Estrella del equipo</h2><div class="card star"><div><div class="mu">Máximo goleador · ${esc(star.player.position || "")}</div><h1>${esc(star.player.name)}</h1><div class="stats" style="grid-template-columns:repeat(4,1fr)"><div><b>${star.goals}</b>goles</div><div><b>${star.assists ?? 0}</b>asist.</div><div><b>${star.penalties ?? 0}</b>penaltis</div><div><b>${star.playedMatches}</b>partidos</div></div></div></div>` : ""}
  ${next ? `<h2>Próximo partido</h2>${mc(next)}` : ""}<h2>Últimos resultados</h2>${done.slice(-5).reverse().map(mc).join("")}`;
  if (V.sub === "pla") {
    if (o.loading) return head + `<div class="skel"></div><div class="skel"></div>`;
    if (o.error) return head + `<div class="card err"><b>No se pudo cargar la plantilla</b><p>${esc(o.error)}</p><button class="btn ghost" onclick="retryTeam(${V.team})">Reintentar</button></div>`;
    if (!o.sq.length) return head + `<div class="card mu">El proveedor no ha publicado datos de plantilla para este club. Los goleadores sí aparecen en su pestaña.</div>`;
    return head + (o.coach ? `<div class="card"><span class="mu">Entrenador</span> <b>${esc(o.coach)}</b></div>` : "") + ["Porteros", "Defensas", "Centrocampistas", "Delanteros"].map((n, g) => { const a = o.sq.filter((p) => grp(p.position) === g); return a.length ? `<h2>${n}</h2><div class="card">${a.map((p) => `<div class="pl"><div><div class="n">${esc(p.name)}</div><small class="mu">${esc(p.nationality || "")}</small></div><div class="r mu">${age(p.dateOfBirth)} años</div></div>`).join("")}</div>` : ""; }).join("");
  }
  if (V.sub === "gol") return head + `<div class="card">${sc.map(plRow).join("") || '<span class="mu">Ningún jugador de este club figura aún entre los goleadores.</span>'}</div>`;
  const H = D.tH.find((r) => r.team.id === V.team), A = D.tA.find((r) => r.team.id === V.team), cs = done.filter((m) => (m.homeTeam.id === V.team ? res(m).a : res(m).h) === 0).length;
  const line = (n, r) => r ? `<tr><td>${n}</td><td>${r.playedGames}</td><td>${r.won}</td><td>${r.draw}</td><td>${r.lost}</td><td>${r.goalsFor}</td><td>${r.goalsAgainst}</td></tr>` : "";
  return head + `<div class="card" style="overflow-x:auto"><table><tr><th></th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th></tr>${line("Local", H)}${line("Visitante", A)}</table></div><div class="stats"><div><b>${cs}</b>porterías a cero</div><div><b>${rw ? (rw.goalsFor / Math.max(1, rw.playedGames)).toFixed(2) : "–"}</b>goles/partido</div><div><b>${rw ? (rw.goalsAgainst / Math.max(1, rw.playedGames)).toFixed(2) : "–"}</b>encaja/partido</div></div>`;
}
function tStats() {
  const top = (arr, f, fmt) => `<div class="card" style="padding:6px 16px">${arr.slice(0, 8).map((x, i) => `<div class="pl"><b class="mu" style="width:18px">${i + 1}</b>${crest(x.team, "s")}<div class="n">${esc(x.name)}</div><div class="r"><b>${fmt(x)}</b></div></div>`).join("")}</div>`;
  const sc = D.scorers.map((s) => ({ name: s.player.name, team: s.team, g: s.goals, a: s.assists ?? 0 }));
  const tb = D.table.map((r) => ({ name: clubName(r.team), team: r.team, gf: r.goalsFor, gc: r.goalsAgainst, w: r.won }));
  return `<h2>Pichichi · goles</h2>${top([...sc].sort((a, b) => b.g - a.g), 0, (x) => x.g + " G")}<h2>Asistencias</h2>${top([...sc].sort((a, b) => b.a - a.a), 0, (x) => x.a + " A")}<h2>Mejor ataque</h2>${top([...tb].sort((a, b) => b.gf - a.gf), 0, (x) => x.gf + " goles")}<h2>Mejor defensa</h2>${top([...tb].sort((a, b) => a.gc - b.gc), 0, (x) => x.gc + " encajados")}<h2>Más victorias</h2>${top([...tb].sort((a, b) => b.w - a.w), 0, (x) => x.w + " V")}`;
}
function leagueSectionTabs() {
  return `<nav class="league-section-tabs" aria-label="Secciones de la liga"><button type="button" class="${V.leagueSection === "ranking" ? "active" : ""}" onclick="setLeagueSection('ranking')">Temporada</button><button type="button" class="${V.leagueSection === "hall" ? "active" : ""}" onclick="setLeagueSection('hall')">🏆 Vitrina</button></nav>`;
}
function setLeagueSection(section) {
  if (!["ranking", "hall"].includes(section)) return;
  V.leagueSection = section;
  render();
}
function roomHallOfFame() {
  const seasonCards = ROOM.hallSeasons.map((season) => {
    const year = Number(season.season_start_year);
    const players = Array.isArray(season.scoreboard) ? season.scoreboard : [];
    const rows = players.map((player) =>
      `<div class="hall-rank-row"><span>${Number(player.position) || "—"}</span><b>${esc(player.name || "Jugador")}</b><strong>${Number(player.points) || 0} pts</strong></div>`
    ).join("");
    return `<article class="hall-season-card"><header><span>LA TEMPORADA</span><b>${year}/${String(year + 1).slice(-2)}</b></header><div class="hall-champions"><div><small>CAMPEÓN</small><strong>♛ ${esc(season.winner_name)}</strong><span>${Number(season.winner_points)} puntos</span></div><div class="hall-last-place"><small>FAROLILLO ROJO</small><strong>${esc(season.last_name)}</strong><span>${Number(season.last_points)} puntos</span></div></div><details class="hall-full-ranking"><summary>Ver clasificación completa (${players.length})</summary><div>${rows}</div></details><footer>Grabado el ${new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(new Date(season.archived_at))}</footer></article>`;
  }).join("");
  const dinnerRows = ROOM.dinnerLeaders.map((member, index) =>
    `<div class="hall-dinner-row"><span class="hall-dinner-place">${index === 0 ? "♛" : index + 1}</span><b>${esc(member.display_name || "Miembro")}</b><span>${Number(member.meals)} ${Number(member.meals) === 1 ? "cena" : "cenas"}</span><strong>${Number(member.amount).toFixed(2)} €</strong></div>`
  ).join("");
  const complete = laLigaSeasonComplete();
  const alreadyArchived = ROOM.hallSeasons.some((entry) => Number(entry.season_start_year) === D.seasonStartYear);
  const archiveAction = complete && ROOM.isAdmin && !alreadyArchived
    ? `<button class="btn hall-archive-button" type="button" onclick="maybeArchiveLeagueSeason()" ${ROOM.archiving ? "disabled" : ""}>${ROOM.archiving ? "Guardando temporada…" : "Guardar temporada en la Vitrina"}</button>`
    : "";
  return `<section class="hall-shell"><header class="hall-hero"><span class="round-kicker">LA HISTORIA DE TU LIGA</span><h2>La Vitrina</h2><p>Los campeones, el farolillo rojo y las cenas que ya son historia. Cada temporada archivada queda como un recuerdo permanente.</p>${archiveAction}</header>${ROOM.error ? `<p class="room-error" role="alert">No se pudo cargar la Vitrina: ${esc(ROOM.error)} <button class="room-action" type="button" onclick="loadRoomData(true)">Reintentar</button></p>` : ""}${ROOM.archiveError ? `<p class="room-error" role="alert">No se pudo archivar la temporada: ${esc(ROOM.archiveError)}</p>` : ""}<section class="hall-section"><div class="hall-section-heading"><div><span class="round-kicker">PALMARÉS</span><h3>Temporadas grabadas</h3></div><span>${ROOM.hallSeasons.length} ${ROOM.hallSeasons.length === 1 ? "temporada" : "temporadas"}</span></div>${seasonCards ? `<div class="hall-season-grid">${seasonCards}</div>` : `<div class="hall-empty"><span>♛</span><b>Aún no hay temporadas en la Vitrina</b><p>${ROOM.loading ? "Cargando el historial…" : "Al acabar LaLiga, el administrador debe abrir PLENO para archivar automáticamente al campeón, al último clasificado y la tabla completa."}</p></div>`}</section><section class="hall-section hall-dinners"><div class="hall-section-heading"><div><span class="round-kicker">TERCER TIEMPO</span><h3>Los que más invitan</h3></div><span>historial de la sala</span></div><p class="room-note">Cada cuenta del tesorero que se valida como pagada suma una cena al historial.</p>${dinnerRows ? `<div class="hall-dinner-list">${dinnerRows}</div>` : '<div class="hall-empty hall-empty-small"><b>Aún no hay cenas pagadas</b><p>Cuando el administrador valide un pago, quedará registrado aquí para siempre.</p></div>'}</section></section>`;
}
function tLiga() {
  if (!ROOM.loaded && !ROOM.loading && !ROOM.error) queueMicrotask(() => loadRoomData());
  const b = board(), rounds = [...new Set(D.matches.map((m) => m.matchday).filter(Number.isInteger))].sort((a, c) => a - c);
  const md = rounds.includes(V.challengeMd) ? V.challengeMd : rounds.includes(D.cur) ? D.cur : rounds[rounds.length - 1];
  const challenge = md ? roundBoard(md) : { matches: [], finished: [], rows: [] };
  const crowns = new Map();
  for (const round of rounds) {
    const result = roundBoard(round);
    if (!result.matches.length || result.finished.length + result.matches.filter((m) => m.status === "POSTPONED").length !== result.matches.length) continue;
    const eligible = result.rows.filter((player) => player.played > 0);
    const winner = eligible[0];
    if (!winner || winner.pts <= 0) continue;
    for (const player of eligible) {
      if (player.pts !== winner.pts || player.exact !== winner.exact || player.played !== winner.played) break;
      crowns.set(player.id, (crowns.get(player.id) || 0) + 1);
    }
  }
  const leader = challenge.rows[0], hasResults = challenge.finished.length > 0;
  const roundOptions = rounds.map((round) => `<option value="${round}" ${round === md ? "selected" : ""}>Jornada ${round}${round === D.cur ? " · actual" : ""}</option>`).join("");
  const roundRows = challenge.rows.map((player, index) => `<div class="round-player ${index === 0 && player.pts > 0 ? "round-winner" : ""}"><b class="round-place">${index === 0 && player.pts > 0 ? "★" : index + 1}</b><div class="round-player-info"><b>${esc(player.n)}${player.me ? ' <span class="league-you">(tú)</span>' : ""}</b><small>${player.played} de ${challenge.finished.length} partidos puntuados${player.exact ? ` · ${player.exact} pleno${player.exact === 1 ? "" : "s"}` : ""}</small></div><span class="round-crowns" title="${crowns.get(player.id) || 0} jornadas ganadas">♛ ${crowns.get(player.id) || 0}</span><b class="round-points">${player.pts}<small> pts</small></b></div>`).join("");
  const crownRows = challenge.rows.map((player) => ({ ...player, crowns: crowns.get(player.id) || 0 })).filter((player) => player.crowns > 0).sort((a, c) => c.crowns - a.crowns || c.pts - a.pts).map((player, index) => `<div class="crown-player"><b>${index + 1}</b><span>${esc(player.n)}${player.me ? ' <small>(tú)</small>' : ""}</span><strong>♛ ${player.crowns}</strong></div>`).join("");
  const lowerSections = V.leagueSection === "hall" ? roomHallOfFame() : `${roomChat()}${roomFeatures()}`;
  return `<div class="league-head card"><div class="league-profile"><label class="league-avatar-picker" for="profile-avatar-input" title="Cambiar foto de perfil" aria-label="Cambiar foto de perfil">${chatAvatar(AUTH.session?.user?.id, S.me || "Tú", "league-avatar")}<span class="league-avatar-edit" aria-hidden="true">+</span><input id="profile-avatar-input" type="file" accept="image/*" onchange="uploadProfilePhoto(event)" ${CHAT.uploadingAvatar ? "disabled" : ""}></label><div class="league-profile-copy"><span class="league-kicker">MI LIGA</span><h1>${esc(S.league.name)}</h1><p class="mu">Jugando como <b>${esc(S.me)}</b> · <span>${CHAT.uploadingAvatar ? "Subiendo foto…" : "Cambiar foto"}</span></p></div></div><div class="league-code"><span>CÓDIGO DE LIGA</span><div class="league-code-row"><b>${esc(S.league.code)}</b><button class="league-copy-button" onclick="copyLeagueCode()" aria-label="Copiar código de la liga" title="Copiar código"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg><span>Copiar</span></button></div></div></div>
  ${leagueSectionTabs()}<div class="league-main-view" ${V.leagueSection === "hall" ? "hidden" : ""}><section class="round-challenge"><div class="round-heading"><div><span class="round-kicker">COMPETICIÓN PARALELA</span><h2>Reto de la jornada</h2><p>Gana puntos en cada partido y suma coronas durante toda la temporada.</p></div><label class="round-select-label" for="challenge-round">Elegir jornada<select id="challenge-round" onchange="V.challengeMd=Number(this.value);render()" ${roundOptions ? "" : "disabled"}>${roundOptions || '<option>No hay jornadas</option>'}</select></label></div><div class="round-summary"><span><b>${challenge.finished.length}<i>/${challenge.matches.length}</i></b><small>partidos terminados</small></span><span><b>${challenge.rows.length}</b><small>jugadores en la carrera</small></span><span class="round-leader"><b>${hasResults && leader?.pts > 0 ? esc(leader.n) : "—"}</b><small>${hasResults ? leader?.pts > 0 ? "va ganando la jornada" : "sin puntos todavía" : "esperando los primeros resultados"}</small></span></div><div class="round-ranking">${roundRows || '<p class="mu">Todavía no hay participantes en esta liga.</p>'}</div>${!hasResults ? '<p class="round-note">Los puntos de la jornada aparecerán aquí cuando terminen los partidos.</p>' : ""}</section><section class="round-hall"><div class="round-hall-heading"><div><span class="round-kicker">PALMARÉS DE TEMPORADA</span><h2>Campeones de jornada</h2></div><span class="round-hall-note">Gana una corona al ser el mejor de una jornada completa</span></div><div class="crown-list">${crownRows || '<p class="mu">Aún no hay jornadas completas con puntos. La primera corona está en juego.</p>'}</div></section>
  <div class="league-layout">
    <section class="league-board"><div class="league-section-head"><div><h2>Clasificación</h2><p class="mu">Así vais esta temporada</p></div><span class="league-count">${b.length} ${b.length === 1 ? "participante" : "participantes"}</span></div>
      <div class="card league-rank">${b.map((x, i) => `<div class="pl"><b class="league-place ${i === 0 ? "first" : ""}">${i + 1}</b><div class="league-player"><div class="n">${esc(x.n)}${x.me ? ' <span class="league-you">(tú)</span>' : ""}</div><small class="mu">${x.ex} plenos · ${x.ok} dif. · ${x.sg} signos</small></div><div class="r"><b>${x.pts} <small>pts</small></b></div></div>`).join("")}</div>
    </section>
    <aside class="league-side"><section class="card invite-card"><h2>Invita a tus amigos</h2><p class="mu">Comparte el código de esta liga. Al unirse, aparecerán aquí y sus pronósticos se sincronizarán automáticamente.</p>
      <div class="invite-code league-invite-code" aria-label="Código de invitación">${esc(S.league.code)}</div><div class="invite-actions"><button class="btn ghost" onclick="shareLeague()">Compartir liga</button></div>
      <p class="invite-note">Por privacidad, los pronósticos de los demás solo se muestran cuando empieza cada partido.</p>
    </section>
    <section class="card league-scoring"><b>Puntuación</b><p class="mu">10 marcador exacto · 7 signo y diferencia · 3 solo signo · 0 fallo. Un Joker por jornada duplica los puntos de ese partido.</p></section>
    <button class="btn ghost league-exit" onclick="signOut()">Cerrar sesión</button>
    </aside>
  </div></div>${lowerSections}`;
}
function setTh(x) {
  if (!["carbon", "blanco", "medianoche"].includes(x)) return;
  S.th = x;
  document.documentElement.dataset.th = x;
  save();
  render();
}
function cycleTheme() {
  const themes = ["carbon", "blanco", "medianoche"];
  setTh(themes[(themes.indexOf(S.th) + 1) % themes.length]);
}
function switchTab(tab) {
  if (V.tab === tab) return;
  const order = ["i", "p", "c", "k", "s", "l", "g"];
  V.tabDirection = order.indexOf(tab) >= order.indexOf(V.tab) ? 1 : -1;
  const update = () => { V.tab = tab; V.team = null; render(); };
  if (typeof document.startViewTransition === "function") {
    document.startViewTransition(update);
    if (tab === "g" && GAME.date !== madridDate()) loadScoutGame();
    return;
  }
  update();
  if (tab === "g" && GAME.date !== madridDate()) loadScoutGame();
  const main = $("#app main");
  if (main) {
    main.classList.remove("tab-enter");
    void main.offsetWidth;
    main.classList.add("tab-enter");
    main.addEventListener("animationend", (event) => {
      if (event.target === main) main.classList.remove("tab-enter");
    });
  }
}
function render() {
  const a = $("#app");
  if (!AUTH.ready) {
    a.innerHTML = `<main class="auth-shell"><div class="card auth-card">Conectando con el servicio de cuentas…</div></main>`;
    syncInstructionsModal();
    return;
  }
  if (!AUTH.session || AUTH.mode === "update") {
    a.innerHTML = authGate();
    syncInstructionsModal();
    return;
  }
  if (!S.league) {
    a.innerHTML = `${leagueGate()}${instructionsModal()}`;
    syncInstructionsModal();
    return;
  }
  const tabs = [["i", "Inicio"], ["p", "Partidos"], ["c", "Clasificación"], ["k", "Clubes"], ["s", "Estadísticas"], ["l", "Mi liga"], ["g", "Juego"]];
  let body;
  if (!D.ready) body = `<div class="skel"></div><div class="skel"></div><div class="skel"></div>`;
  else if (D.err && V.tab !== "g") body = `<div class="card err"><b>No se pudieron cargar los datos</b><p>${esc(D.err)}</p></div>`;
  else body = { i: tInicio, p: tPart, c: tClas, k: tClubs, s: tStats, l: tLiga, g: tJuego }[V.tab]();
  const themeName = { carbon: "carbón", blanco: "claro", medianoche: "medianoche" }[S.th] || "carbón";
  const syncError = Boolean(D.matchesError || D.standingsError || D.teamsError || D.scorersError);
  const syncStale = D.matchesStale || D.standingsStale || D.teamsStale || D.scorersStale;
  a.innerHTML = `<div class="top"><div class="bar"><a class="brand-lockup" href="/" aria-label="PLENO, inicio"><img src="icon.svg" alt=""><span class="logo">PLENO</span></a><button class="league-switcher" type="button" onclick="openLeaguePicker()" aria-label="Mis ligas: cambiar de liga o unirme a otra" title="Mis ligas · cambiar de liga o unirme a otra"><span class="league-switcher-label">Mis ligas</span><b>${esc(S.league.name)}</b><i aria-hidden="true">⌄</i></button><span class="sp"></span><div class="top-actions"><button class="btn ghost theme-button ${S.th}" onclick="cycleTheme()" aria-label="Cambiar fondo. Tema actual: ${themeName}" title="Cambiar fondo · ${themeName}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17M12 3.5a8.5 8.5 0 0 0 0 17z"/></svg></button><button class="btn ghost auth-logout" onclick="signOut()" aria-label="Cerrar sesión" title="Cerrar sesión"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3m9-7h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-6"/></svg></button></div></div><nav aria-label="Secciones principales">${tabs.map(([k, n]) => `<button class="${V.tab === k ? "on" : ""}" onclick="switchTab('${k}')" ${V.tab === k ? 'aria-current="page"' : ""}>${n}</button>`).join("")}</nav><div class="data-sync ${syncError ? "has-error" : syncStale ? "is-stale" : ""}" aria-label="Estado de actualización de datos" title="Actualización automática: partidos cada 30 segundos, clasificación cada minuto, goleadores cada 10 minutos y clubes cada día"><i></i><span class="${freshnessClass(D.matchesStale, D.matchesError)}">${esc(freshnessLabel("Partidos", D.lastMatchesUpdate, D.matchesStale, D.matchesError))}</span><span class="${freshnessClass(D.standingsStale, D.standingsError)}">${esc(freshnessLabel("Clasificación", D.lastStandingsUpdate, D.standingsStale, D.standingsError))}</span><span class="${freshnessClass(D.teamsStale, D.teamsError)}">${esc(freshnessLabel("Clubes", D.lastTeamsUpdate, D.teamsStale, D.teamsError))}</span><span class="${freshnessClass(D.scorersStale, D.scorersError)}">${esc(freshnessLabel("Goleadores", D.lastScorersUpdate, D.scorersStale, D.scorersError))}</span></div></div><main class="tab-content" style="--tab-shift:${V.tabDirection * 1}">${body}</main>`;
  const topActions = a.querySelector(".top-actions");
  if (topActions) topActions.insertAdjacentHTML("afterbegin", infoButton() + profileButton());
  a.insertAdjacentHTML("beforeend", instructionsModal() + profileModal() + leaguePickerModal());
  syncInstructionsModal();
  const syncStatus = a.querySelector(".data-sync");
  if (syncStatus) {
    const label = document.createElement("span");
    label.className = "sync-summary";
    label.textContent = syncError ? "Problemas al actualizar" : syncStale ? "Mostrando datos guardados" : "Actualización automática activa";
    syncStatus.prepend(label);
  }
}
if (typeof document !== "undefined" && document.documentElement) {
  document.documentElement.dataset.th = S.th;
  document.addEventListener("keydown", handleInstructionsKeydown);
  render(); loadMain(); initializeAuth(); setInterval(poll, 30000); setInterval(refreshCloudPredictions, 15000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") poll(); });
  window.addEventListener("online", () => poll());
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("/sw.js").catch((error) => console.error("No se pudo registrar el service worker de PLENO:", error));
}
