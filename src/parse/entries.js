/**
 * Entry segmentation shared by the experience, education, projects and
 * volunteer parsers.
 *
 * Within a section, lines first collapse into *paragraphs* (a line plus its
 * soft-wrapped continuations). Paragraphs then group into *entries*: a
 * header block (1-3 short, non-bullet lines carrying title / organisation /
 * dates / location) followed by body paragraphs (bullets or prose).
 *
 * An entry begins at a paragraph that:
 *   - is not a bullet, and
 *   - is emphasised (bold / minority font), or carries a date range, or
 *     is short and title-like right after a body paragraph or a vertical gap.
 */

import { findDateRanges, findDates, containsDate } from "./dates.js";
import { wordCount, endsSentence, isTitleCase, stripBullet, joinWrappedLines } from "./text.js";

/** Collapse lines into paragraphs using the `continues` flag from layout analysis. */
export function toParagraphs(lines) {
  const paras = [];
  for (const line of lines) {
    const last = paras[paras.length - 1];
    if (last && line.continues && !line.inline) {
      last.lines.push(line);
      last.text = joinWrappedLines([last.text, line.text]);
    } else {
      paras.push({
        lines: [line],
        text: line.text,
        bullet: line.bullet,
        emph: !!line.emph,
        gapAbove: line.gapAbove ?? 1,
        indent: line.indent ?? 0,
        textOnly: !!line.textOnly,
        first: line,
      });
    }
  }
  return paras;
}

function isHeaderLike(p, opts = {}) {
  if (p.bullet) return false;
  const text = p.text;
  const words = wordCount(text);
  if (words === 0) return false;
  const hasRange = findDateRanges(text).length > 0;
  const hasDate = hasRange || findDates(text).length > 0;
  if (p.emph && words <= 20) return true;
  if (hasRange && words <= 22 && p.lines.length <= 2) return true;
  if (words <= 14 && !endsSentence(text) && (isTitleCase(text) || hasDate) && !/^[a-z]/.test(text)) return true;
  if (opts.afterGap && words <= 14 && !endsSentence(text) && !/^[a-z]/.test(text)) return true;
  return false;
}

/**
 * Group paragraphs into entries.
 * @returns {Array<{header: Array<paragraph>, body: Array<paragraph>}>}
 */
export function segmentEntries(lines, { maxHeaderLines = 3 } = {}) {
  const paras = toParagraphs(lines);
  const entries = [];
  let cur = null;
  let prevWasBody = false;

  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    const afterGap = p.gapAbove > 1.4 || i === 0;
    const headerLike = isHeaderLike(p, { afterGap });

    const startNew =
      headerLike &&
      (!cur || cur.body.length > 0 || cur.header.length >= maxHeaderLines || prevWasBody || (p.gapAbove > 1.4 && cur.header.length > 0 && (p.emph || containsDate(p.text))) || (p.emph && cur.header.some((h) => h.emph) && !cur.header[cur.header.length - 1].emph && cur.header.length >= 2) || startsFreshBlock(p, cur));

    if (startNew) {
      cur = { header: [p], body: [] };
      entries.push(cur);
      prevWasBody = false;
      continue;
    }
    if (!cur) {
      // Body text before any header: treat as its own headerless entry.
      cur = { header: [], body: [p] };
      entries.push(cur);
      prevWasBody = true;
      continue;
    }
    if (headerLike && cur.body.length === 0 && cur.header.length < maxHeaderLines) {
      cur.header.push(p);
      prevWasBody = false;
    } else {
      cur.body.push(p);
      prevWasBody = true;
    }
  }
  return entries;
}

/** Two emphasised header paragraphs each with their own date range are two entries. */
function startsFreshBlock(p, cur) {
  if (!cur || cur.header.length === 0) return false;
  const curHasRange = cur.header.some((h) => findDateRanges(h.text).length > 0);
  const pHasRange = findDateRanges(p.text).length > 0;
  if (curHasRange && pHasRange) return true;
  const curEmph = cur.header[0].emph;
  return curEmph && p.emph && cur.header.length >= 1 && p.gapAbove > 1.2;
}

/** Body paragraphs -> highlights (bullets) and a prose summary. */
export function bodyToHighlights(body) {
  const highlights = [];
  const prose = [];
  for (const p of body) {
    const text = stripBullet(p.text).trim();
    if (!text) continue;
    if (p.bullet || highlights.length > 0 || (!p.textOnly && p.indent > 4)) {
      highlights.push(text);
    } else {
      prose.push(text);
    }
  }
  return { highlights, summary: prose.join(" ").trim() };
}
