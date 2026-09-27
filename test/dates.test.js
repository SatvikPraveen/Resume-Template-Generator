import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDateToken, findDateRanges, findDates, toISO, formatDate, formatDateRange, stripDates } from "../src/parse/dates.js";

test("parseDateToken understands common resume date spellings", () => {
  assert.deepEqual(parseDateToken("January 2020"), { year: 2020, month: 1 });
  assert.deepEqual(parseDateToken("Sept. 2021"), { year: 2021, month: 9 });
  assert.deepEqual(parseDateToken("Jun 19"), { year: 2019, month: 6 });
  assert.deepEqual(parseDateToken("Jan '21"), { year: 2021, month: 1 });
  assert.deepEqual(parseDateToken("06/2020"), { year: 2020, month: 6 });
  assert.deepEqual(parseDateToken("2020-06"), { year: 2020, month: 6 });
  assert.deepEqual(parseDateToken("Summer 2019"), { year: 2019, month: 6 });
  assert.deepEqual(parseDateToken("2018"), { year: 2018, month: null });
  assert.deepEqual(parseDateToken("Present"), { present: true });
  assert.equal(parseDateToken("1234"), null, "implausible years are rejected");
  assert.equal(parseDateToken("hello"), null);
});

test("findDateRanges extracts ranges with mixed separators", () => {
  const text = "Acme Corp\tJan 2019 – Present\nBeta Inc 2015 to 2018\nGamma 03/2020 - 12/2023";
  const ranges = findDateRanges(text);
  assert.equal(ranges.length, 3);
  assert.equal(toISO(ranges[0].start), "2019-01");
  assert.equal(ranges[0].end.present, true);
  assert.equal(toISO(ranges[1].start), "2015");
  assert.equal(toISO(ranges[1].end), "2018");
  assert.equal(toISO(ranges[2].end), "2023-12");
});

test("reversed ranges and phone-number-like digits are not dates", () => {
  assert.equal(findDateRanges("2020 - 2015").length, 0);
  assert.equal(findDates("555-0142").length, 0);
});

test("stripDates removes dates and qualifiers", () => {
  assert.equal(stripDates("University of X\tExpected May 2026"), "University of X");
  assert.equal(stripDates("Role (Jan 2020 - Mar 2021)"), "Role");
  assert.equal(stripDates("Lead (Autodesk, Fortive)\tJune 2020 – Aug 2023"), "Lead (Autodesk, Fortive)");
});

test("formatDate never renders Invalid Date", () => {
  assert.equal(formatDate("Present"), "Present");
  assert.equal(formatDate("2021"), "2021");
  assert.equal(formatDate("2020-06"), "Jun 2020");
  assert.equal(formatDate("June 2020"), "Jun 2020");
  assert.equal(formatDate("garbage"), "garbage");
  assert.equal(formatDateRange("2019-01", "", { current: true }), "Jan 2019 – Present");
  assert.equal(formatDateRange("2016", "2020"), "2016 – 2020");
  assert.equal(formatDateRange("", ""), "");
});
