const test = require("node:test");
const assert = require("node:assert/strict");
const { dailyGameSummary, pts } = require("../lib.js");

test("daily statistics count wins, streaks, and attempt distribution without archived streaks", () => {
  const history = [
    { date: "2026-03-30", completed: true, outcome: "won", attempts_count: 2 },
    { date: "2026-03-31", completed: true, outcome: "won", attempts_count: 1 },
    { date: "2026-04-01", completed: true, outcome: "lost", attempts_count: 8 },
    { date: "2026-04-02", completed: true, outcome: "won", attempts_count: 3, streak_eligible: false },
    { date: "2026-04-03", completed: true, outcome: "won", attempts_count: 4 }
  ];
  assert.deepEqual(dailyGameSummary(history, "2026-04-03"), {
    played: 5,
    wins: 4,
    winRate: 80,
    currentStreak: 1,
    longestStreak: 2,
    distribution: [1, 1, 1, 1, 0, 0, 0, 0, 0]
  });
});

test("a loss today breaks the current daily streak", () => {
  const history = [
    { date: "2026-04-02", completed: true, outcome: "won", attempts_count: 2 },
    { date: "2026-04-03", completed: true, outcome: "lost", attempts_count: 8 }
  ];
  assert.equal(dailyGameSummary(history, "2026-04-03").currentStreak, 0);
});

test("scores an exact prediction for 10 points", () => {
  assert.equal(pts({ h: 2, a: 1 }, { h: 2, a: 1 }, false), 10);
});

test("scores matching sign and goal difference for 7 points", () => {
  assert.equal(pts({ h: 3, a: 1 }, { h: 2, a: 0 }, false), 7);
});

test("scores matching sign only for 3 points", () => {
  assert.equal(pts({ h: 2, a: 1 }, { h: 3, a: 1 }, false), 3);
});

test("scores a wrong sign for 0 points", () => {
  assert.equal(pts({ h: 0, a: 2 }, { h: 2, a: 1 }, false), 0);
});

test("doubles every score with a Joker", () => {
  assert.equal(pts({ h: 2, a: 1 }, { h: 2, a: 1 }, true), 20);
  assert.equal(pts({ h: 3, a: 1 }, { h: 2, a: 0 }, true), 14);
  assert.equal(pts({ h: 2, a: 1 }, { h: 3, a: 1 }, true), 6);
});
