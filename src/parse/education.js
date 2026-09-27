/**
 * Education parsing: institution, degree type, field of study, dates,
 * location and score (GPA) per entry.
 */

import { findDateRanges, findDates, stripDates, toISO } from "./dates.js";
import { extractLocation } from "./contact.js";
import { segmentEntries, bodyToHighlights } from "./entries.js";
import { normalizeWhitespace, wordCount } from "./text.js";

const INSTITUTION_RE =
  /\b(university|universit[aé]t|universidad|universit[eé]|college|institute|institution|school|academy|polytechnic|iit|nit|iiit|bits|mit|conservatory|seminary|hochschule|ecole|école|lyc[eé]e|gymnasium|faculty)\b/i;

// Ordered from most to least specific so "MBA" is not swallowed by "MA".
const DEGREE_PATTERNS = [
  { re: /\b(?:ph\.?\s?d\.?|doctor(?:ate)?\s+of\s+philosophy|doctorate|d\.?phil\.?|ed\.?d\.?|dr\.?\s?rer\.?\s?nat\.?)\b/i, type: "PhD" },
  { re: /\b(?:m\.?d\.?|doctor of medicine|mbbs|j\.?d\.?|juris doctor|pharm\.?d\.?|d\.?d\.?s\.?|d\.?v\.?m\.?)\b/i, type: "Doctorate" },
  { re: /\b(?:mba|m\.b\.a\.?|master of business administration)\b/i, type: "MBA" },
  { re: /\b(?:master(?:'s|s)?(?:\s+degree)?(?:\s+of\s+(?:science|arts|technology|engineering|commerce|business administration|computer applications|fine arts|education|laws|architecture|design|public health|public administration|social work|philosophy|research|applied science))?|m\.?sc?\.?|m\.?s\.?c?\.?|m\.?a\.?|m\.?eng\.?|m\.?tech\.?|m\.?e\.?|m\.?phil\.?|m\.?f\.?a\.?|m\.?ed\.?|m\.?p\.?h\.?|m\.?p\.?a\.?|m\.?res\.?|mca|mcom|m\.?com\.?|msds|ms in|magister|meng|msc|llm|ll\.?m\.?)\b/i, type: "Master's" },
  { re: /\b(?:bachelor(?:'s|s)?(?:\s+degree)?(?:\s+of\s+(?:science|arts|technology|engineering|commerce|business administration|computer applications|fine arts|education|laws|architecture|design|pharmacy|nursing|medicine|applied science|computer science))?|b\.?sc?\.?|b\.?s\.?c?\.?|b\.?a\.?|b\.?eng\.?|b\.?tech\.?|b\.?e\.?|b\.?f\.?a\.?|b\.?ed\.?|b\.?b\.?a\.?|bca|bcom|b\.?com\.?|llb|ll\.?b\.?|beng|bsc|btech|hons|honours|honors)\b/i, type: "Bachelor's" },
  { re: /\b(?:associate(?:'s|s)?(?:\s+degree)?|a\.?a\.?s?\.?|a\.?s\.?)\b/i, type: "Associate" },
  { re: /\b(?:post[\s-]?graduate\s+diploma|pg\s*diploma|pgd|graduate\s+diploma|diploma|advanced\s+diploma)\b/i, type: "Diploma" },
  { re: /\b(?:certificate|certification|nanodegree|bootcamp|boot camp)\b/i, type: "Certificate" },
  { re: /\b(?:high\s+school|secondary\s+school|hsc|ssc|a[\s-]levels?|gcse|baccalaur[eé]at|abitur|matriculation|intermediate|12th|10th)\b/i, type: "High School" },
];

const FIELD_RE = /\b(?:in|of|on)\s+([A-Z][A-Za-z&/,()' -]+?)(?=\s*(?:[|•·\t]|\(|,\s*(?:GPA|CGPA|Grade|Minor)|\bGPA\b|\bCGPA\b|\bminor\b|\bconcentration\b|\bwith\b|$))/i;
const GPA_RE = /\b(?:c?gpa|grade|cgpa|percentage|score)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?(?:\s*\/\s*[0-9]+(?:\.[0-9]+)?)?%?)|\b([0-9]\.[0-9]{1,2})\s*\/\s*(4(?:\.0+)?|10(?:\.0+)?)\b|\bfirst[\s-]class\b|\bdistinction\b|\bsumma cum laude\b|\bmagna cum laude\b|\bcum laude\b/i;

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findDegree(text) {
  for (const { re, type } of DEGREE_PATTERNS) {
    const m = text.match(re);
    if (m) return { type, index: m.index, match: m[0] };
  }
  return null;
}

export function findField(text, degreeMatch) {
  if (!text) return "";
  const after = degreeMatch ? text.slice(degreeMatch.index + degreeMatch.match.length) : text;
  const m = after.match(FIELD_RE);
  if (m) return normalizeWhitespace(m[1]).replace(/[,.;]+$/, "");
  // "B.S. Computer Science" (no preposition)
  if (degreeMatch) {
    const rest = normalizeWhitespace(after).replace(/^[\s,:-]+/, "");
    const cut = rest.split(/\s*(?:[|•·(\t]|,\s*(?:GPA|CGPA)|\bGPA\b|\bCGPA\b|\bminor\b)/i)[0].trim();
    if (cut && wordCount(cut) <= 6 && /^[A-Z]/.test(cut)) return cut.replace(/[,.;]+$/, "");
  }
  return "";
}

export function findScore(text) {
  const m = (text || "").match(GPA_RE);
  if (!m) return "";
  if (m[1]) return m[1].replace(/\s+/g, "");
  if (m[2]) return `${m[2]}/${m[3]}`;
  return m[0];
}

/** Parse one education entry from its header + body paragraphs. */
function parseEntry(entry) {
  const headerText = entry.header.map((p) => p.text).join("\n");
  const bodyText = entry.body.map((p) => p.text).join("\n");
  const all = `${headerText}\n${bodyText}`;

  let startDate = "";
  let endDate = "";
  let current = false;
  const ranges = findDateRanges(all);
  if (ranges.length) {
    startDate = toISO(ranges[0].start);
    if (ranges[0].end.present) current = true;
    else endDate = toISO(ranges[0].end);
  } else {
    const singles = findDates(headerText).length ? findDates(headerText) : findDates(all);
    if (singles.length) endDate = toISO(singles[singles.length - 1].date);
  }

  const loc = extractLocation(all, { strict: true });
  const location = loc ? `${loc.city}, ${loc.region}` : "";
  const locRe = loc ? new RegExp(`${escapeRe(loc.city)},\\s*${escapeRe(loc.region)}(?:\\s+\\d{5})?`) : null;
  const stripLoc = (s) => (locRe ? s.replace(locRe, " ") : s);

  const lines = [...entry.header, ...entry.body].map((p) =>
    normalizeWhitespace(stripLoc(stripDates(p.text)).replace(/\t/g, " ")).replace(/[\s,|•·\-–—]+$/g, ""),
  );
  let institution = "";
  let degreeLine = "";
  let degree = null;
  for (const line of lines) {
    const d = findDegree(line);
    if (!institution && INSTITUTION_RE.test(line) && !(d && d.index < (line.search(INSTITUTION_RE)))) {
      institution = line;
      if (d) degreeLine = line;
      continue;
    }
    if (d && !degree) {
      degree = d;
      degreeLine = line;
    }
  }
  if (!degree && degreeLine) degree = findDegree(degreeLine);
  if (!institution && entry.header.length) {
    // No institution keyword: take the emphasised header line, else the first.
    const emph = entry.header.find((p) => p.emph && p.text !== degreeLine);
    institution = stripDates((emph || entry.header.find((p) => p.text !== degreeLine) || entry.header[0]).text);
  }

  const cleanup = (s) =>
    normalizeWhitespace(stripLoc(s).replace(/\t/g, " "))
      .replace(GPA_RE, "")
      .replace(/[\s,|•·\-–—(]+$/g, "")
      .replace(/^[\s,|•·\-–—)]+/g, "")
      .trim();

  institution = cleanup(institution);
  // "Institution, Degree" on one line: split at the degree.
  if (degree && degreeLine === institution && degree.index > 0) {
    institution = cleanup(institution.slice(0, degree.index));
  } else if (degree && degreeLine && institution.includes(degreeLine) && degree.index === 0) {
    institution = cleanup(institution.replace(degreeLine, ""));
  }
  const area = degree ? findField(degreeLine, degree) : findField(headerText, null);
  const score = findScore(all);
  const { highlights } = bodyToHighlights(entry.body.filter((p) => !findDegree(p.text)));

  if (!institution && !degree) return null;
  return {
    institution,
    area: normalizeWhitespace(area),
    studyType: degree ? degree.type : "",
    startDate,
    endDate,
    current,
    score,
    location,
    courses: highlights,
  };
}

/** Parse an education section into JSON Resume `education` entries. */
export function parseEducation(lines) {
  const entries = segmentEntries(lines, { maxHeaderLines: 3 });
  const out = [];
  for (const e of entries) {
    const parsed = parseEntry(e);
    if (parsed) out.push(parsed);
  }
  return out;
}
