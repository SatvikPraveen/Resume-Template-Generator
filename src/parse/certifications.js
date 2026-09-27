/**
 * Certifications, awards, publications and languages: line-oriented lists
 * where each paragraph is one item with an optional date and issuer.
 */

import { findDateRanges, findDates, stripDates, toISO } from "./dates.js";
import { toParagraphs } from "./entries.js";
import { normalizeWhitespace, stripBullet, wordCount } from "./text.js";
import { extractUrls } from "./contact.js";

const ISSUER_RE = /\s*(?:[-–—|]|,|\bby\b|\bfrom\b|\bissued by\b|\bvia\b)\s*([A-Z][\w&.,' ()-]{1,60})$/;

function splitNameIssuer(text) {
  let name = text;
  let issuer = "";
  const paren = text.match(/^(.+?)\s*\(([^)]{2,60})\)\s*$/);
  if (paren && !/\d{4}/.test(paren[2])) {
    name = paren[1];
    issuer = paren[2];
  } else {
    const m = text.match(ISSUER_RE);
    if (m && wordCount(m[1]) <= 6 && wordCount(text.slice(0, m.index)) >= 1) {
      name = text.slice(0, m.index);
      issuer = m[1];
    }
  }
  return { name: normalizeWhitespace(name).replace(/[\s,|•·\-–—:]+$/g, ""), issuer: normalizeWhitespace(issuer) };
}

/** Generic "one item per paragraph" list parser. */
function parseList(lines) {
  const items = [];
  for (const p of toParagraphs(lines)) {
    const raw = normalizeWhitespace(stripBullet(p.text));
    if (!raw) continue;
    const urls = extractUrls(raw);
    let text = raw;
    for (const u of urls) text = text.replace(u, " ");
    const ranges = findDateRanges(text);
    let date = "";
    if (ranges.length) date = toISO(ranges[0].end.present ? ranges[0].start : ranges[0].end);
    else {
      const singles = findDates(text);
      if (singles.length) date = toISO(singles[singles.length - 1].date);
    }
    text = normalizeWhitespace(stripDates(text).replace(/\(\s*\)/g, ""));
    items.push({ ...splitNameIssuer(text), date, url: urls[0] || "" });
  }
  return items.filter((i) => i.name);
}

export function parseCertifications(lines) {
  return parseList(lines).map((i) => ({ name: i.name, issuer: i.issuer, date: i.date, url: i.url }));
}

export function parseAwards(lines) {
  return parseList(lines).map((i) => ({ title: i.name, awarder: i.issuer, date: i.date, summary: "" }));
}

export function parsePublications(lines) {
  return parseList(lines).map((i) => ({ name: i.name, publisher: i.issuer, releaseDate: i.date, url: i.url, summary: "" }));
}

const FLUENCY_RE = /\b(native|bilingual|fluent|professional(?: working)?(?: proficiency)?|full professional|limited working|advanced|intermediate|elementary|basic|beginner|conversational|proficient|c[12]|b[12]|a[12])\b/i;

export function parseLanguages(lines) {
  const out = [];
  const seen = new Set();
  for (const p of toParagraphs(lines)) {
    const text = stripBullet(p.text);
    for (const piece of text.split(/\s*[,;|•·]\s*/)) {
      if (!piece) continue;
      const m = piece.match(/^([A-Za-z][A-Za-z ]{1,30}?)\s*(?:[:(\-–—]\s*(.+?)\)?)?$/);
      if (!m) continue;
      const language = normalizeWhitespace(m[1]).replace(/[:(]$/, "").trim();
      let fluency = normalizeWhitespace(m[2] || "");
      const inName = language.match(FLUENCY_RE);
      let lang = language;
      if (inName && !fluency) {
        fluency = inName[0];
        lang = language.replace(FLUENCY_RE, "").trim();
      }
      const key = lang.toLowerCase();
      if (!lang || seen.has(key) || wordCount(lang) > 3) continue;
      seen.add(key);
      out.push({ language: lang, fluency });
    }
  }
  return out;
}
