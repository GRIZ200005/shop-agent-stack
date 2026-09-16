import assert from "node:assert/strict";
import test from "node:test";
import { parseApiDate } from "../src/datetime.ts";

test("JDBC and explicit-offset timestamps describe the same order instant", () => {
  const expected = Date.parse("2026-09-16T07:07:11Z");
  for (const value of [
    "2026-09-16T07:07:11",
    "2026-09-16 07:07:11",
    "2026-09-16T07:07:11Z",
    "2026-09-16T15:07:11+08:00",
  ]) assert.equal(parseApiDate(value).getTime(), expected, value);
});

test("fractional seconds are preserved and invalid dates stay invalid", () => {
  assert.equal(parseApiDate("2026-09-16T07:07:11.123").toISOString(), "2026-09-16T07:07:11.123Z");
  assert.ok(Number.isNaN(parseApiDate("invalid").getTime()));
});
