/**
 * Layout reconstruction.
 *
 * pdf.js hands us a bag of positioned text runs per page. This module turns
 * those runs into an ordered list of *lines*, each annotated with the
 * typographic and geometric features that downstream stages rely on:
 *
 *   - text, page, x0/x1 (horizontal extent), y (baseline), size (font size)
 *   - bold / italic (from the embedded font name when available)
 *   - emph: "visually emphasised" – bold, or set in a minority font
 *   - gapAbove: vertical distance to the previous line in body-line units
 *   - indent: horizontal offset from the dominant left margin
 *   - bullet: starts with a bullet glyph
 *   - continues: best guess that the line is a soft wrap of the previous one
 *
 * It also handles two-column layouts by detecting a vertical gutter and
 * reading each column top-to-bottom before moving on, and it recovers
 * small-caps headings that pdf.js emits as "E DUCATION".
 *
 * Everything is pure and runs in Node, which is what makes the extraction
 * step unit-testable and the evaluation harness reproducible.
 */

import { startsWithBullet, normalizeWhitespace, isAllCaps, endsSentence, wordCount } from "../parse/text.js";
import { findDateRanges, findDates } from "../parse/dates.js";

/** Horizontal gaps wider than this many font sizes are treated as tab stops. */
const TAB_GAP_FACTOR = 2.2;

const BOLD_RE = /bold|black|heavy|semibold|demibold|extrabold|ultrabold|\bbd\b|-b(?:old)?$|,b$/i;
const ITALIC_RE = /italic|oblique|\bit\b|-i(?:talic)?$|,i$/i;

/** Infer weight/style flags from a PostScript font name such as "ABCDEE+Cambria,Bold". */
export function classifyFontName(name) {
  const n = String(name || "");
  return { bold: BOLD_RE.test(n), italic: ITALIC_RE.test(n) };
}

/** Convert pdf.js text items into positioned runs with style flags. */
function toRuns(items, fonts) {
  const runs = [];
  for (const it of items || []) {
    if (!it || typeof it.str !== "string") continue;
    const t = it.transform || [1, 0, 0, 1, 0, 0];
    // Skip rotated text (vertical headers, watermarks).
    if (Math.abs(t[1]) > 0.01 || Math.abs(t[2]) > 0.01) continue;
    const size = Math.abs(t[3]) || Math.abs(t[0]) || it.height || 0;
    const x0 = t[4];
    const width = it.width || 0;
    const font = fonts[it.fontName] || {};
    const flags = font.bold != null ? font : classifyFontName(font.name);
    runs.push({
      str: it.str,
      x0,
      x1: x0 + width,
      y: t[5],
      size,
      fontName: it.fontName || "",
      bold: !!flags.bold,
      italic: !!flags.italic,
      isSpace: it.str.trim() === "",
    });
  }
  return runs;
}

/**
 * Group raw pdf.js text items of one page into lines, in reading order.
 *
 * Two-column pages are detected on the raw runs (a sidebar and the main
 * column share baselines, so this must happen before lines are formed).
 * Each column is read top-to-bottom; full-width lines (name header, footer)
 * act as separators between column blocks.
 *
 * @param {Array} items pdf.js TextItem[] ({str, transform, width, height, fontName, hasEOL})
 * @param {object} opts
 * @param {number} opts.page 1-based page number
 * @param {number} opts.pageWidth
 * @param {number} opts.pageHeight
 * @param {Object<string,{name?:string,bold?:boolean,italic?:boolean}>} [opts.fonts]
 * @returns {Array<object>} lines in reading order for this page
 */
export function buildLines(items, opts) {
  const { page = 1, pageWidth = 612, pageHeight = 792, fonts = {} } = opts || {};
  const runs = toRuns(items, fonts);
  if (runs.length === 0) return [];

  const gutter = detectGutter(runs.filter((r) => !r.isSpace), pageWidth);
  let groups;
  if (gutter == null) {
    groups = [{ column: 0, runs }];
  } else {
    groups = [
      { column: 0, runs: runs.filter((r) => r.x0 < gutter - 2 && r.x1 > gutter + 2) },
      { column: 1, runs: runs.filter((r) => r.x1 <= gutter + 2) },
      { column: 2, runs: runs.filter((r) => r.x0 >= gutter - 2) },
    ];
  }
  const all = [];
  for (const g of groups) {
    for (const ln of linesFromRuns(g.runs)) all.push({ ...ln, column: g.column, page, pageWidth, pageHeight });
  }
  // Merge by baseline (top to bottom), full-width lines first on ties.
  all.sort((a, b) => b.y - a.y || a.column - b.column);
  return orderColumns(all);
}

/** Cluster runs into lines by baseline proximity and join their text. */
function linesFromRuns(runs) {
  const sorted = [...runs].sort((a, b) => b.y - a.y || a.x0 - b.x0);
  const lines = [];
  let current = null;
  for (const r of sorted) {
    const tol = Math.max(2, 0.4 * (r.size || 10));
    if (current && Math.abs(current.y - r.y) <= tol) {
      current.runs.push(r);
    } else {
      current = { y: r.y, runs: [r] };
      lines.push(current);
    }
  }

  const out = [];
  for (const ln of lines) {
    ln.runs.sort((a, b) => a.x0 - b.x0);
    const visible = ln.runs.filter((r) => !r.isSpace);
    if (visible.length === 0) continue;
    const size = Math.max(...visible.map((r) => r.size));
    const text = joinRuns(ln.runs, size);
    if (!text) continue;
    const boldChars = visible.reduce((n, r) => n + (r.bold ? r.str.length : 0), 0);
    const italicChars = visible.reduce((n, r) => n + (r.italic ? r.str.length : 0), 0);
    const totalChars = visible.reduce((n, r) => n + r.str.length, 0) || 1;
    const fontCounts = {};
    for (const r of visible) fontCounts[r.fontName] = (fontCounts[r.fontName] || 0) + r.str.length;
    out.push({
      text,
      x0: Math.min(...visible.map((r) => r.x0)),
      x1: Math.max(...visible.map((r) => r.x1)),
      y: ln.y,
      size,
      bold: boldChars / totalChars >= 0.6,
      italic: italicChars / totalChars >= 0.6,
      boldRatio: boldChars / totalChars,
      fontCounts,
      runs: mergeRuns(ln.runs, size),
    });
  }
  return out;
}

/** Join runs into text, inserting spaces where the horizontal gap implies a word break. */
function joinRuns(runs, lineSize) {
  let text = "";
  let prev = null;
  for (const r of runs) {
    if (r.isSpace) {
      // Word emits tab stops as a single space glyph stretched across the gap.
      const wide = r.x1 - r.x0 > TAB_GAP_FACTOR * (lineSize || 10);
      if (wide && text) text = text.replace(/ +$/, "") + "\t";
      else if (text && !text.endsWith(" ") && !text.endsWith("\t")) text += " ";
      prev = r;
      continue;
    }
    if (prev && !prev.isSpace) {
      const gap = r.x0 - prev.x1;
      const ref = Math.min(prev.size || lineSize, r.size || lineSize) || lineSize;
      const isHyphenJoin = /-$/.test(prev.str) || /^-/.test(r.str);
      if (gap > TAB_GAP_FACTOR * ref) {
        // A large horizontal gap is a tab stop: "Title <tab> Jun 2020 – Present".
        text = text.replace(/ +$/, "") + "\t";
      } else if (gap > (isHyphenJoin ? 0.6 : 0.16) * ref && !text.endsWith(" ")) {
        text += " ";
      }
    } else if (prev && prev.isSpace && prev.x1 > 0 && r.x0 - prev.x1 > TAB_GAP_FACTOR * (r.size || lineSize)) {
      text = text.replace(/ +$/, "") + "\t";
    }
    text += r.str;
    prev = r;
  }
  text = normalizeWhitespace(text);
  text = fixSmallCaps(text);
  text = text.replace(/(\w) - (\w)/g, (m, a, b) => (/\d/.test(a) && /\d/.test(b) ? m : `${a}-${b}`));
  return text;
}

/** "E DUCATION" / "T ECHNICAL SKILLS" (small caps) -> "EDUCATION" / "TECHNICAL SKILLS". */
function fixSmallCaps(text) {
  if (!isAllCaps(text)) return text;
  return text.replace(/\b([A-Z]) (?=[A-Z]{2,}\b)/g, "$1");
}

/** Merge adjacent runs with the same style so a line becomes a few styled spans. */
function mergeRuns(runs, lineSize) {
  const spans = [];
  let prev = null;
  for (const r of runs) {
    if (r.isSpace) {
      const wide = r.x1 - r.x0 > TAB_GAP_FACTOR * (lineSize || 10);
      if (spans.length) spans[spans.length - 1].text += wide ? "\t" : " ";
      prev = r;
      continue;
    }
    const last = spans[spans.length - 1];
    const gap = prev && !prev.isSpace ? r.x0 - prev.x1 : 0;
    const isTab = prev && !prev.isSpace && gap > TAB_GAP_FACTOR * (Math.min(prev.size, r.size) || lineSize);
    const needSpace = prev && !prev.isSpace && gap > 0.16 * (Math.min(prev.size, r.size) || lineSize);
    if (last && !isTab && !last.text.endsWith("\t") && last.bold === r.bold && last.italic === r.italic && Math.abs(last.size - r.size) < 0.5) {
      last.text += (needSpace && !last.text.endsWith(" ") ? " " : "") + r.str;
      last.x1 = r.x1;
    } else {
      spans.push({ text: r.str, x0: r.x0, x1: r.x1, size: r.size, bold: r.bold, italic: r.italic });
    }
    prev = r;
  }
  return spans.map((s) => ({ ...s, text: normalizeWhitespace(s.text) })).filter((s) => s.text);
}

/**
 * Detect a two-column layout from positioned boxes (runs or lines): a
 * vertical band that almost nothing crosses, with substantial content on
 * both sides and a consistently aligned left edge on the right-hand side
 * (which rules out a flush-right column of dates).
 * @returns {number|null} the gutter x position
 */
export function detectGutter(boxes, pageWidth) {
  if (!boxes || boxes.length < 12) return null;
  const bins = 64;
  const binW = pageWidth / bins;
  const coverage = new Array(bins).fill(0);
  for (const b of boxes) {
    const a = Math.max(0, Math.floor(b.x0 / binW));
    const z = Math.min(bins - 1, Math.floor(b.x1 / binW));
    for (let i = a; i <= z; i++) coverage[i]++;
  }
  const n = boxes.length;
  let best = null;
  for (let i = Math.floor(bins * 0.2); i < Math.floor(bins * 0.8); i++) {
    if (coverage[i] > n * 0.03) continue;
    let j = i;
    while (j + 1 < bins && coverage[j + 1] <= n * 0.03) j++;
    const gutterX = ((i + j + 1) / 2) * binW;
    const left = boxes.filter((b) => b.x1 <= gutterX);
    const right = boxes.filter((b) => b.x0 >= gutterX);
    if (left.length >= n * 0.2 && right.length >= n * 0.2) {
      // The right column must have an aligned left edge.
      const edge = weightedMode(right.map((b) => [b.x0, 1]), (v) => Math.round(v / 3) * 3);
      const aligned = right.filter((b) => Math.abs(b.x0 - edge) <= 4).length / right.length;
      if (aligned >= 0.4 && (!best || j - i > best.span)) best = { x: gutterX, span: j - i };
    }
    i = j;
  }
  return best ? best.x : null;
}

/**
 * Order lines that carry a `column` property so each column block is read
 * top-to-bottom; full-width (column 0) lines flush pending column text.
 */
export function orderColumns(lines) {
  const ordered = [];
  let left = [];
  let right = [];
  const flush = () => {
    ordered.push(...left, ...right);
    left = [];
    right = [];
  };
  for (const ln of lines) {
    if (ln.column === 1) left.push(ln);
    else if (ln.column === 2) right.push(ln);
    else {
      flush();
      ordered.push({ ...ln, column: 0 });
    }
  }
  flush();
  return ordered;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * (sorted.length - 1))));
  return sorted[idx];
}

function weightedMode(pairs, round = (v) => v) {
  const counts = new Map();
  for (const [value, weight] of pairs) {
    const key = round(value);
    counts.set(key, (counts.get(key) || 0) + weight);
  }
  let best = null;
  for (const [k, w] of counts) if (best == null || w > best.w) best = { k, w };
  return best ? best.k : 0;
}

/**
 * Compute document-level statistics (body font size, left margin, line
 * height, dominant font) used to normalise per-line features.
 */
export function computeStats(lines) {
  const textLines = lines.filter((l) => l.text);
  if (!textLines.length) {
    return { bodySize: 10, bodyLeft: 0, lineHeight: 12, rightMargin: 612, bodyFont: "" };
  }
  const bodySize = weightedMode(
    textLines.map((l) => [l.size, l.text.length]),
    (v) => Math.round(v * 2) / 2,
  );
  const fontTotals = {};
  for (const l of textLines) {
    for (const [f, n] of Object.entries(l.fontCounts || {})) fontTotals[f] = (fontTotals[f] || 0) + n;
  }
  const bodyFont = Object.entries(fontTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  const bodyLines = textLines.filter((l) => Math.abs(l.size - bodySize) <= 0.75);
  const bodyLeft = weightedMode(
    (bodyLines.length ? bodyLines : textLines).map((l) => [l.x0, 1]),
    (v) => Math.round(v),
  );
  const gaps = [];
  for (let i = 1; i < textLines.length; i++) {
    const a = textLines[i - 1];
    const b = textLines[i];
    if (a.page === b.page && (a.column || 0) === (b.column || 0)) {
      const g = a.y - b.y;
      if (g > 0 && g < bodySize * 4) gaps.push(g);
    }
  }
  const lineHeight = gaps.length ? percentile(gaps, 0.5) : bodySize * 1.2;
  const rightMargin = percentile(textLines.map((l) => l.x1), 0.97);
  return { bodySize, bodyLeft, lineHeight, rightMargin, bodyFont };
}

/**
 * Annotate ordered lines with relative features (gapAbove, indent, emph,
 * bullet, continues). Mutates and returns the array.
 */
export function annotateLines(lines, stats = computeStats(lines)) {
  const { bodySize, bodyLeft, lineHeight, bodyFont } = stats;
  // Right margin per column (text in a sidebar wraps at the sidebar edge).
  const columnRight = new Map();
  for (const l of lines) {
    const key = l.column || 0;
    const arr = columnRight.get(key) || [];
    arr.push(l.x1);
    columnRight.set(key, arr);
  }
  const rightFor = (l) => Math.max(percentile(columnRight.get(l.column || 0) || [l.x1], 0.97), stats.rightMargin || 0);

  let prev = null;
  for (const l of lines) {
    const sameFlow = prev && prev.page === l.page && (prev.column || 0) === (l.column || 0);
    l.gapAbove = sameFlow ? Math.max(0, (prev.y - l.y) / (lineHeight || 1)) : 2;
    l.indent = l.x0 - bodyLeft;
    l.bullet = startsWithBullet(l.text);
    const minorityFont = bodyFont && l.fontCounts && !(bodyFont in l.fontCounts);
    l.emph = l.bold || (minorityFont && l.size >= bodySize - 0.5 && wordCount(l.text) <= 14);
    l.larger = l.size >= bodySize * 1.12;
    l.allCaps = isAllCaps(l.text);
    l.words = wordCount(l.text);
    l.tabGap = l.text.includes("\t");
    l.continues = sameFlow ? guessContinues(l, prev, bodySize, rightFor) : false;
    prev = l;
  }
  return lines;
}

/** Does `line` look like a soft wrap of `prev`? Uses geometry first, prose cues second. */
function guessContinues(line, prev, bodySize, rightFor) {
  if (!prev) return false;
  if (line.gapAbove > 1.6) return false;
  if (line.bullet) return false;
  if (Math.abs(line.size - prev.size) > 1) return false;
  if (line.emph && !prev.emph) return false;
  if (prev.emph && !line.emph && prev.words <= 12) return false;
  // A line with a tab stop ("Title <tab> Date") is complete by construction;
  // the same holds for a line that ends in a date range.
  if (prev.tabGap || line.tabGap) return false;
  if (endsWithDate(prev.text)) return false;
  const dx = line.x0 - prev.x0;
  if (dx > 1.5 && dx <= 0.75 * (prev.size || bodySize)) return true; // hanging-indent continuation
  if (dx > 1.5) return false; // a larger indent starts a nested block (e.g. bullets under a title)
  if (dx < -1.5) return false; // outdent -> new item
  // Same left edge: would the first word of this line have fit on the previous line?
  const firstWord = line.text.split(/\s+/)[0] || "";
  const avgChar = line.text.length ? (line.x1 - line.x0) / line.text.length : bodySize * 0.5;
  const needed = prev.x1 + avgChar * (firstWord.length + 1);
  const wouldNotFit = needed > rightFor(prev) - avgChar;
  // One sentence per bullet is the norm: a completed sentence followed by a
  // capitalised line is a new item even when the word would not have fit.
  if (wouldNotFit && !(endsSentence(prev.text) && /^[A-Z]/.test(line.text))) return true;
  // Prose cue: previous line clearly mid-sentence and this line starts in lower case.
  if (!endsSentence(prev.text) && /^[a-z]/.test(line.text)) return true;
  return false;
}

function endsWithDate(text) {
  const ranges = findDateRanges(text);
  if (ranges.length) {
    const r = ranges[ranges.length - 1];
    if (r.index + r.length >= text.length - 2) return true;
  }
  const singles = findDates(text);
  if (singles.length) {
    const d = singles[singles.length - 1];
    if (d.index + d.length >= text.length - 2) return true;
  }
  return false;
}

/** Plain text for the whole document, one line per layout line, blank line at large gaps. */
export function linesToText(lines) {
  let out = "";
  for (const l of lines) {
    if (out && l.gapAbove > 1.6) out += "\n";
    out += l.text + "\n";
  }
  return out.trim();
}

/**
 * Build pseudo-lines from plain text so the same downstream stages can run
 * on text-only input (tests, pasted text, fixtures without geometry).
 */
export function linesFromText(text) {
  const raw = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  const lines = [];
  let blank = 1;
  for (const r of raw) {
    const trimmed = normalizeWhitespace(r);
    if (!trimmed) {
      blank++;
      continue;
    }
    const leading = r.match(/^[ \t]*/)[0].replace(/\t/g, "    ").length;
    lines.push({
      text: trimmed,
      page: 1,
      x0: leading,
      x1: leading + trimmed.length,
      y: -lines.length,
      size: 1,
      bold: false,
      italic: false,
      boldRatio: 0,
      fontCounts: {},
      runs: [{ text: trimmed, bold: false, italic: false, size: 1 }],
      gapAbove: blank > 1 ? 2 : 1,
      textOnly: true,
    });
    blank = 1;
  }
  let prev = null;
  for (const l of lines) {
    l.indent = l.x0;
    l.bullet = startsWithBullet(l.text);
    l.emph = false;
    l.larger = false;
    l.allCaps = isAllCaps(l.text);
    l.words = wordCount(l.text);
    l.continues =
      !!prev &&
      l.gapAbove <= 1 &&
      !l.bullet &&
      ((/^[a-z]/.test(l.text) && !endsSentence(prev.text)) || (l.indent > prev.indent + 1 && !endsSentence(prev.text)));
    prev = l;
  }
  return lines;
}
