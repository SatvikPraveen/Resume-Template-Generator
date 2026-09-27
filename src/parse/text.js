/**
 * Small, dependency-free text utilities shared by every parser stage.
 *
 * Everything here is pure: no DOM, no globals, safe to unit test in Node.
 */

/** Glyphs that commonly start a bulleted line in exported resumes. */
export const BULLET_GLYPHS = "•●▪◦‣⁃∙·-–—*»›➢➤✓✔○□■◆◇";

const BULLET_RE = new RegExp(`^[${BULLET_GLYPHS.replace(/[-\]\\]/g, "\\$&")}]\\s*`);

/** True when the text starts with a bullet glyph followed by content. */
export function startsWithBullet(text) {
  if (!text) return false;
  const t = text.trimStart();
  // A lone dash/en-dash that is part of a date range ("2019 - 2020") is not a bullet.
  if (/^[-–—]\s*\d/.test(t)) return false;
  return BULLET_RE.test(t) && t.replace(BULLET_RE, "").length > 0;
}

/** Remove a leading bullet glyph (and surrounding whitespace). */
export function stripBullet(text) {
  if (!text) return "";
  return text.trimStart().replace(BULLET_RE, "").trim();
}

/**
 * Collapse runs of whitespace and normalise exotic dashes and quotes.
 * A tab is preserved (as a single "\t") because the layout stage uses it to
 * mark a large horizontal gap – the boundary between "Title" and a
 * flush-right date on the same line.
 */
export function normalizeWhitespace(text) {
  if (!text) return "";
  return text
    .replace(/[   ]/g, " ")
    .replace(/[​-‍﻿]/g, "")
    .replace(/[“”„]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/ +/g, " ")
    .replace(/ *\t[ \t]*/g, "\t")
    .replace(/ +([.,;:])/g, "$1")
    .trim();
}

/** Replace layout tabs with a single space for prose output. */
export function untab(text) {
  return (text || "").replace(/\t/g, " ").replace(/ +/g, " ").trim();
}

/** Normalise dash variants to a plain hyphen surrounded by single spaces where they act as separators. */
export function normalizeDashes(text) {
  return (text || "").replace(/[–—―]/g, "-");
}

export function wordCount(text) {
  const t = (text || "").trim();
  return t ? t.split(/\s+/).length : 0;
}

/** True when every letter in the text is upper case (digits/punctuation ignored). */
export function isAllCaps(text) {
  const letters = (text || "").replace(/[^A-Za-z]/g, "");
  return letters.length >= 2 && letters === letters.toUpperCase();
}

/** True when most words start with a capital letter (Title Case heuristic). */
export function isTitleCase(text) {
  const words = (text || "").split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
  if (words.length === 0) return false;
  const caps = words.filter((w) => /^[A-Z(]/.test(w) || /^(of|and|the|in|for|at|to|a|an|&)$/i.test(w));
  return caps.length / words.length >= 0.8;
}

/** Lower-case, strip punctuation, collapse whitespace: used for fuzzy comparisons. */
export function canonical(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Ends with sentence punctuation. */
export function endsSentence(text) {
  return /[.!?;]\s*$/.test(text || "");
}

/** Escape HTML special characters. */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Split on a separator character while respecting parentheses and brackets so
 * "AWS (EMR, S3), Docker" yields ["AWS (EMR, S3)", "Docker"].
 */
export function splitOutsideParens(text, separators = ",;•|") {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of text || "") {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if (depth === 0 && separators.includes(ch)) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Remove a leading "and " or "& " from a list item ("and SQL" -> "SQL"). */
export function stripLeadingConjunction(item) {
  return (item || "").replace(/^(?:and|or|&)\s+/i, "").trim();
}

/** Join wrapped lines into a paragraph, de-hyphenating words split at line ends. */
export function joinWrappedLines(lines) {
  let out = "";
  for (const raw of lines) {
    const line = (raw || "").trim();
    if (!line) continue;
    if (!out) {
      out = line;
    } else if (/[a-z]-$/.test(out) && /^[a-z]/.test(line)) {
      out = out.slice(0, -1) + line;
    } else {
      out += " " + line;
    }
  }
  return out.replace(/\s+/g, " ").trim();
}
