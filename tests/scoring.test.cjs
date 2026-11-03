const test = require("node:test");
const assert = require("node:assert/strict");
const { pts } = require("../lib.js");

test("scores an exact prediction for 10 points", () => {
  assert.equal(pts({ h: 2, a: 1 }, { h: 2, a: 1 }, false), 10);
});

test("scores matching sign and goal difference for 7 points", () => {
  assert.equal(pts({ h: 3, a: 1 }, { h: 2, a: 0 }, false), 7);
});

test("scores matching sign only for 3 points", () => {
  assert.equal(pts({ h: 2, a: 0 }, { h: 3, a: 1 }, false), 3);
});

test("scores a wrong sign for 0 points", () => {
  assert.equal(pts({ h: 0, a: 2 }, { h: 2, a: 1 }, false), 0);
});

test("doubles every score with a Joker", () => {
  assert.equal(pts({ h: 2, a: 1 }, { h: 2, a: 1 }, true), 20);
  assert.equal(pts({ h: 3, a: 1 }, { h: 2, a: 0 }, true), 14);
  assert.equal(pts({ h: 2, a: 0 }, { h: 3, a: 1 }, true), 6);
});
