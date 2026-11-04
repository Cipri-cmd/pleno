// Lógica pura de PLENO: puntuación, sugerencias de marcador y códigos para compartir porras.

// 10 exacto · 7 signo y diferencia · 3 solo signo · 0 fallo · Joker x2
function pts(p, r, joker) {
  const sg = Math.sign, exact = p.h === r.h && p.a === r.a;
  const base = exact ? 10 : sg(p.h - p.a) === sg(r.h - r.a) ? (p.h - p.a === r.h - r.a ? 7 : 3) : 0;
  return joker ? base * 2 : base;
}

function dailyGameSummary(history, today) {
  const completed = history.filter((entry) => entry.completed);
  const wins = completed.filter((entry) => entry.outcome === "won");
  const streakDates = new Set(wins
    .filter((entry) => entry.streak_eligible !== false)
    .map((entry) => entry.date));
  const priorDay = (date) => {
    const value = new Date(`${date}T12:00:00Z`);
    value.setUTCDate(value.getUTCDate() - 1);
    return value.toISOString().slice(0, 10);
  };
  let currentStreak = 0;
  const playedToday = completed.some((entry) =>
    entry.date === today && entry.streak_eligible !== false
  );
  let cursor = streakDates.has(today) ? today : playedToday ? "" : priorDay(today);
  while (streakDates.has(cursor)) {
    currentStreak++;
    cursor = priorDay(cursor);
  }
  let longestStreak = 0;
  let runningStreak = 0;
  let previousDate = "";
  for (const date of [...streakDates].sort()) {
    runningStreak = previousDate === priorDay(date) ? runningStreak + 1 : 1;
    longestStreak = Math.max(longestStreak, runningStreak);
    previousDate = date;
  }
  return {
    played: completed.length,
    wins: wins.length,
    winRate: completed.length ? Math.round(wins.length * 100 / completed.length) : 0,
    currentStreak,
    longestStreak,
    distribution: Array.from({ length: 9 }, (_, index) =>
      wins.filter((entry) => entry.attempts_count === index + 1).length
    )
  };
}

const pois = (l, k) => { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; };

// Sugerencia basada en goles a favor/en contra de cada club como local y como visitante (modelo de Poisson).
function predict(homeId, awayId, H, A) {
  const sum = (t, k) => t.reduce((s, r) => s + r[k], 0);
  const avgH = sum(H, "goalsFor") / Math.max(1, sum(H, "playedGames")) || 1.4;
  const avgA = sum(A, "goalsFor") / Math.max(1, sum(A, "playedGames")) || 1.1;
  const rh = H.find((r) => r.team.id === homeId), ra = A.find((r) => r.team.id === awayId);
  if (!rh || !ra || rh.playedGames < 2 || ra.playedGames < 2) return null;
  const lh = (rh.goalsFor / rh.playedGames / avgH) * (ra.goalsAgainst / ra.playedGames / avgH) * avgH;
  const la = (ra.goalsFor / ra.playedGames / avgA) * (rh.goalsAgainst / rh.playedGames / avgA) * avgA;
  let w = 0, d = 0, l = 0, best = { p: -1, h: 0, a: 0 };
  for (let h = 0; h <= 7; h++) for (let a = 0; a <= 7; a++) {
    const p = pois(lh, h) * pois(la, a);
    if (h > a) w += p; else if (h === a) d += p; else l += p;
    if (p > best.p) best = { p, h, a };
  }
  const s = w + d + l;
  return { h: best.h, a: best.a, w: w / s, d: d / s, l: l / s };
}

// Código para compartir tu porra con amigos (sin servidor)
const enc = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o))));
function dec(s) {
  const o = JSON.parse(decodeURIComponent(escape(atob(String(s).trim()))));
  const clean = { n: String(o.n || "Amigo").slice(0, 20), p: {}, j: {} };
  const int = (v) => Math.min(20, Math.max(0, parseInt(v) || 0));
  for (const [id, v] of Object.entries(o.p || {})) if (/^\d+$/.test(id) && Array.isArray(v)) clean.p[id] = [int(v[0]), int(v[1])];
  for (const [md, id] of Object.entries(o.j || {})) if (/^\d+$/.test(md) && /^\d+$/.test(String(id))) clean.j[md] = +id;
  return clean;
}
if (typeof module !== "undefined") module.exports = { pts, dailyGameSummary, predict, enc, dec };
