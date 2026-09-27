import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLines, classifyFontName, detectGutter, computeStats, annotateLines } from "../src/extract/layout.js";

/** Minimal pdf.js-like text item. */
function item(str, x, y, { size = 11, font = "body", width } = {}) {
  const w = width ?? str.length * size * 0.5;
  return { str, transform: [size, 0, 0, size, x, y], width: w, height: size, fontName: font, hasEOL: false };
}

const FONTS = { body: { name: "Cambria" }, bold: { name: "Cambria,Bold" }, italic: { name: "Cambria-Italic" } };

test("font names map to weight and style flags", () => {
  assert.deepEqual(classifyFontName("ABCDEE+Cambria,Bold"), { bold: true, italic: false });
  assert.deepEqual(classifyFontName("Helvetica-BoldOblique"), { bold: true, italic: true });
  assert.deepEqual(classifyFontName("TimesNewRoman"), { bold: false, italic: false });
});

test("runs on one baseline join into a line; large gaps become tab stops", () => {
  const items = [
    item("DePaul", 47, 600, { font: "bold" }),
    item("University", 88, 600, { font: "bold" }),
    item("Sep 2023 – Jun 2025", 450, 600, { font: "italic" }),
    item("Master's in Computer Science", 47, 586),
    item("Chicago, USA", 500, 586),
  ];
  const lines = buildLines(items, { page: 1, pageWidth: 612, pageHeight: 792, fonts: FONTS });
  assert.equal(lines.length, 2);
  assert.equal(lines[0].text, "DePaul University\tSep 2023 – Jun 2025");
  assert.equal(lines[0].bold, false, "mixed bold/italic line is not majority bold");
  assert.equal(lines[0].runs.length, 2);
  assert.equal(lines[0].runs[0].bold, true);
  assert.equal(lines[1].text, "Master's in Computer Science\tChicago, USA");
});

test("small-caps headings are stitched back together", () => {
  const items = [item("E", 36, 700, { size: 14, font: "bold" }), item("DUCATION", 44, 700, { size: 11, font: "bold" })];
  const [line] = buildLines(items, { page: 1, fonts: FONTS });
  assert.equal(line.text, "EDUCATION");
});

test("wide space glyphs (Word tab stops) are tab stops too", () => {
  const items = [item("Title", 47, 600), item(" ", 80, 600, { width: 300 }), item("2020 – 2021", 380, 600)];
  const [line] = buildLines(items, { page: 1, fonts: FONTS });
  assert.equal(line.text, "Title\t2020 – 2021");
});

test("continuation lines are distinguished from new bullets by indent geometry", () => {
  const y = (i) => 700 - i * 14;
  const items = [
    item("Company Name", 47, y(0), { font: "bold" }),
    item("Developed REST APIs and created workflows to automate", 71, y(1)),
    item("request and change processes", 76, y(2)),
    item("Integrated third-party tools such as SAP", 71, y(3)),
    item("Resolved incidents", 71, y(4)),
  ];
  const lines = buildLines(items, { page: 1, fonts: FONTS });
  annotateLines(lines, computeStats(lines));
  assert.equal(lines[1].continues, false, "indented block after a title starts a new item");
  assert.equal(lines[2].continues, true, "hanging indent continues the bullet");
  assert.equal(lines[3].continues, false, "outdent starts a new bullet");
  assert.equal(lines[4].continues, false);
});

test("two-column pages are read column by column", () => {
  const items = [item("Jane Doe", 200, 750, { size: 18, font: "bold" })];
  for (let i = 0; i < 12; i++) {
    items.push(item(`Left ${i}`, 40, 700 - i * 14, { width: 150 }));
    items.push(item(`Right ${i}`, 320, 700 - i * 14, { width: 200 }));
  }
  const boxes = items.map((it) => ({ x0: it.transform[4], x1: it.transform[4] + it.width }));
  const gutter = detectGutter(boxes, 612);
  assert.ok(gutter > 190 && gutter < 320, `gutter at ${gutter}`);
  const lines = buildLines(items, { page: 1, pageWidth: 612, fonts: FONTS });
  const texts = lines.map((l) => l.text);
  assert.equal(texts[0], "Jane Doe");
  assert.deepEqual(texts.slice(1, 13), Array.from({ length: 12 }, (_, i) => `Left ${i}`));
  assert.deepEqual(texts.slice(13), Array.from({ length: 12 }, (_, i) => `Right ${i}`));
});

test("a flush-right date column is not a second text column", () => {
  const items = [];
  for (let i = 0; i < 14; i++) {
    items.push(item(`Some body text line number ${i} that runs across most of the page width`, 47, 700 - i * 14, { width: 480 }));
    if (i % 4 === 0) items.push(item("Jan 2020 – Present", 440, 700 - i * 14, { width: 120 }));
  }
  const boxes = items.map((it) => ({ x0: it.transform[4], x1: it.transform[4] + it.width }));
  assert.equal(detectGutter(boxes, 612), null);
});
