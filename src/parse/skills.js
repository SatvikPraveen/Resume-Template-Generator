/**
 * Skills parsing: "Category: a, b, c" lines become named groups; bare lists
 * become an "Skills" group; wrapped continuation lines attach to the
 * preceding group. Splitting respects parentheses ("AWS (EMR, S3)") and
 * keeps compound tokens such as "C/C++" and "HTML/CSS" intact.
 */

import { splitOutsideParens, stripLeadingConjunction, normalizeWhitespace, stripBullet, wordCount } from "./text.js";

const NOISE = /^(?:etc\.?|and more|others?|more)$/i;

export function splitSkillList(text) {
  return splitOutsideParens(text, ",;•|·")
    .map((s) => stripLeadingConjunction(stripBullet(s)))
    .map((s) => s.replace(/\.$/, "").trim())
    .filter((s) => s && s.length <= 60 && !NOISE.test(s));
}

/** Does the text look like a category label rather than a skill? */
function isCategory(label) {
  return label && wordCount(label) <= 6 && !/[,;]/.test(label);
}

/**
 * @param {Array} lines annotated lines of the skills section
 * @returns {Array<{name:string, keywords:string[]}>}
 */
export function parseSkills(lines) {
  const groups = [];
  let last = null;
  for (const line of lines) {
    const text = normalizeWhitespace(stripBullet(line.text));
    if (!text) continue;
    const colon = text.indexOf(":");
    const dash = text.match(/^([A-Za-z&/ ]{2,40})\s[-–—]\s(.+)$/);
    let label = "";
    let rest = text;
    if (colon > 0 && colon <= 45 && isCategory(text.slice(0, colon))) {
      label = text.slice(0, colon).trim();
      rest = text.slice(colon + 1).trim();
    } else if (dash && isCategory(dash[1]) && /[,;]/.test(dash[2])) {
      label = dash[1].trim();
      rest = dash[2].trim();
    }

    const keywords = splitSkillList(rest);
    if (label) {
      last = { name: label, keywords };
      groups.push(last);
      continue;
    }
    // No label: continuation of the previous group when the layout says the
    // line wraps, or when the previous group's line did not end with a
    // terminator and this one is a plain list; otherwise a new bare group.
    const wraps = line.continues || (last && !line.bullet && line.gapAbove <= 1.1 && !line.emph && keywords.length > 0);
    if (last && wraps && (last.keywords.length > 0 || keywords.length > 1)) {
      last.keywords.push(...keywords);
    } else if (keywords.length) {
      last = { name: "Skills", keywords };
      groups.push(last);
    }
  }
  // Merge consecutive bare groups and de-duplicate keywords.
  const merged = [];
  for (const g of groups) {
    const prev = merged[merged.length - 1];
    if (prev && prev.name === "Skills" && g.name === "Skills") prev.keywords.push(...g.keywords);
    else merged.push({ ...g });
  }
  return merged
    .map((g) => ({ name: g.name, keywords: [...new Set(g.keywords)] }))
    .filter((g) => g.keywords.length > 0);
}
