/**
 * Date recognition and normalisation.
 *
 * Resumes express dates in dozens of ways: "Jan 2020", "January 2020",
 * "Sept. 2021", "06/2020", "2020-06", "Summer 2019", "Apr 21", "2018 – Present",
 * "2016 to 2020", "Fall 2022 – May 2024". This module finds them, normalises
 * them into {year, month} parts and formats them as ISO 8601 partial dates
 * ("2020-01" or "2020") as required by the JSON Resume schema.
 */

const MONTHS = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const SEASONS = { spring: 3, summer: 6, fall: 9, autumn: 9, winter: 12 };

const MONTH_NAME = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
const SEASON_NAME = "(?:spring|summer|fall|autumn|winter)";
const YEAR4 = "(?:19|20)\\d{2}";
const YEAR2 = "\\d{2}";

// Sub-patterns. Each alternative is wrapped so we can tell which one matched.
const DATE_ALTS = [
  // Month YYYY  |  Month, YYYY  |  Month YY  |  Month 'YY
  `(?:${MONTH_NAME}|${SEASON_NAME})\\s*,?\\s*(?:${YEAR4}|['’]?${YEAR2}(?![\\d]))`,
  // MM/YYYY, MM-YYYY, MM.YYYY
  `(?:0?[1-9]|1[0-2])\\s*[/.-]\\s*${YEAR4}`,
  // YYYY-MM (ISO) and YYYY/MM
  `${YEAR4}\\s*[/-]\\s*(?:0?[1-9]|1[0-2])(?![\\d/-])`,
  // Bare YYYY
  `${YEAR4}`,
];
const DATE_PATTERN = `(?:${DATE_ALTS.join("|")})`;
const PRESENT_PATTERN = "(?:present|current(?:ly)?|now|ongoing|to\\s+date|till\\s+date|today|continuing)";
const RANGE_SEP = "\\s*(?:-|–|—|―|to|until|through|thru|till|~)\\s*";

const RANGE_RE = new RegExp(
  `(?<![\\w/])(${DATE_PATTERN})${RANGE_SEP}(${DATE_PATTERN}|${PRESENT_PATTERN})(?![\\w/])`,
  "gi",
);
const SINGLE_RE = new RegExp(`(?<![\\w/])(${DATE_PATTERN})(?![\\w/])`, "gi");
const PRESENT_RE = new RegExp(`^${PRESENT_PATTERN}$`, "i");

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 1950;
const MAX_YEAR = CURRENT_YEAR + 6;

/** Expand a two digit year using a sliding window (00-(now+6) => 20xx, else 19xx). */
export function expandYear(yearText) {
  const n = parseInt(yearText, 10);
  if (Number.isNaN(n)) return null;
  if (yearText.length === 4) return n;
  const pivot = (CURRENT_YEAR + 6) % 100;
  return n <= pivot ? 2000 + n : 1900 + n;
}

/**
 * Parse a single date token into {year, month|null}. Returns null when the
 * text is not a recognisable date or the year is outside a plausible range.
 */
export function parseDateToken(text) {
  if (!text) return null;
  const t = text.trim().toLowerCase().replace(/\.$/, "").replace(/['’]/g, "");
  if (PRESENT_RE.test(t)) return { present: true };

  let m;
  // Month/season + year
  m = t.match(/^([a-z]+)\.?\s*,?\s*(\d{2}|\d{4})$/);
  if (m) {
    const name = m[1];
    const month = MONTHS[name] ?? SEASONS[name] ?? null;
    if (month == null) return null;
    const year = expandYear(m[2]);
    return validYear(year) ? { year, month } : null;
  }
  // MM/YYYY
  m = t.match(/^(\d{1,2})\s*[/.-]\s*(\d{4})$/);
  if (m) {
    const month = parseInt(m[1], 10);
    const year = parseInt(m[2], 10);
    return month >= 1 && month <= 12 && validYear(year) ? { year, month } : null;
  }
  // YYYY-MM
  m = t.match(/^(\d{4})\s*[/-]\s*(\d{1,2})$/);
  if (m) {
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    return month >= 1 && month <= 12 && validYear(year) ? { year, month } : null;
  }
  // YYYY-MM-DD (already ISO)
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    return validYear(year) ? { year, month } : null;
  }
  // YYYY
  m = t.match(/^(\d{4})$/);
  if (m) {
    const year = parseInt(m[1], 10);
    return validYear(year) ? { year, month: null } : null;
  }
  return null;
}

function validYear(year) {
  return typeof year === "number" && year >= MIN_YEAR && year <= MAX_YEAR;
}

/**
 * Find every date range ("Jan 2020 - Present", "2016-2020") in the text.
 * @returns {Array<{start:object,end:object,index:number,length:number,raw:string}>}
 */
export function findDateRanges(text) {
  const out = [];
  if (!text) return out;
  RANGE_RE.lastIndex = 0;
  let m;
  while ((m = RANGE_RE.exec(text)) !== null) {
    const start = parseDateToken(m[1]);
    const end = parseDateToken(m[2]);
    if (!start || !end) continue;
    // Reject reversed ranges such as "2020 - 2015" that are more likely to be numbers.
    if (!end.present && compareParts(start, end) > 0) continue;
    out.push({ start, end, index: m.index, length: m[0].length, raw: m[0] });
  }
  return out;
}

/** Find every single date token (used when no range is present). */
export function findDates(text) {
  const out = [];
  if (!text) return out;
  SINGLE_RE.lastIndex = 0;
  let m;
  while ((m = SINGLE_RE.exec(text)) !== null) {
    const parsed = parseDateToken(m[1]);
    if (!parsed) continue;
    out.push({ date: parsed, index: m.index, length: m[0].length, raw: m[0] });
  }
  return out;
}

/** Does the text contain a date range or a stand-alone date? */
export function containsDate(text) {
  return findDateRanges(text).length > 0 || findDates(text).length > 0;
}

/** Remove all date ranges and stand-alone dates from a string. */
const DATE_QUALIFIER_RE = /\b(?:expected|anticipated|estimated|est\.?|graduating|graduation|class of|since|from)\b\s*:?\s*(?=(?:19|20)\d{2}|[A-Za-z]{3,9}\.?\s*,?\s*['’]?\d{2,4}|\d{1,2}\s*[/.-]\s*(?:19|20)\d{2})/gi;

export function stripDates(text) {
  if (!text) return "";
  let out = text.replace(DATE_QUALIFIER_RE, "").replace(RANGE_RE, " ");
  out = out.replace(SINGLE_RE, " ");
  return out
    .replace(/\(\s*\)/g, " ")
    .replace(/\[\s*\]/g, " ")
    .replace(/ +/g, " ")
    .replace(/ *\t[ \t]*/g, "\t")
    .replace(/^[\s,|•·\-–—]+|[\s,|•·\-–—]+$/g, "")
    .trim();
}

export function compareParts(a, b) {
  if (a.year !== b.year) return a.year - b.year;
  return (a.month || 0) - (b.month || 0);
}

/** Format a date part as an ISO 8601 partial date: "2020-06" or "2020". */
export function toISO(part) {
  if (!part || part.present) return "";
  if (part.month) return `${part.year}-${String(part.month).padStart(2, "0")}`;
  return String(part.year);
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Human friendly rendering of an ISO partial date ("2020-06" -> "Jun 2020").
 * Accepts legacy strings ("June 2020", "Present") and passes them through
 * unchanged when they cannot be parsed, so nothing ever renders as
 * "Invalid Date".
 */
export function formatDate(value) {
  if (!value) return "";
  const str = String(value).trim();
  if (PRESENT_RE.test(str)) return "Present";
  const part = parseDateToken(str);
  if (!part) return str;
  if (part.present) return "Present";
  if (part.month) return `${MONTH_LABELS[part.month - 1]} ${part.year}`;
  return String(part.year);
}

/** "Jun 2020 – Present", "2016 – 2020", or a single date when only one is known. */
export function formatDateRange(start, end, { current = false, separator = " – " } = {}) {
  const s = formatDate(start);
  const e = end ? formatDate(end) : current && s ? "Present" : "";
  if (s && e) return `${s}${separator}${e}`;
  return s || e;
}
