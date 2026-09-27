/**
 * Contact block ("basics") extraction: name, headline, email, phone,
 * profiles, location and an unlabelled summary paragraph.
 *
 * Operates on the header lines (everything above the first section heading)
 * and falls back to the whole document for email/phone/URL when needed.
 */

import { normalizeWhitespace, wordCount, endsSentence, splitOutsideParens } from "./text.js";
import { containsDate } from "./dates.js";

export const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// International and North American phone shapes, tolerant of spaces around separators.
export const PHONE_RE =
  /(?:\+\s?\d{1,3}[\s.-]?)?(?:\(\s?\d{2,5}\s?\)|\d{2,5})(?:[\s.-]?\d{2,5}){2,4}/g;
export const URL_RE = /(?:https?:\/\/|www\.)[^\s|,;)]+|(?:linkedin\.com|github\.com|gitlab\.com|behance\.net|dribbble\.com|medium\.com|twitter\.com|x\.com|stackoverflow\.com|kaggle\.com|scholar\.google\.com|orcid\.org)\/[^\s|,;)]+/gi;

const US_STATES = new Set(
  "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR".split(" "),
);
const REGIONS = new Set(
  [
    "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware", "florida",
    "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine",
    "maryland", "massachusetts", "michigan", "minnesota", "mississippi", "missouri", "montana", "nebraska",
    "nevada", "new hampshire", "new jersey", "new mexico", "new york", "north carolina", "north dakota", "ohio",
    "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina", "south dakota", "tennessee", "texas",
    "utah", "vermont", "virginia", "washington", "west virginia", "wisconsin", "wyoming",
    "usa", "us", "u.s.", "u.s.a.", "united states", "united states of america", "uk", "u.k.", "united kingdom",
    "england", "scotland", "wales", "ireland", "canada", "ontario", "quebec", "british columbia", "alberta",
    "india", "china", "japan", "germany", "france", "spain", "italy", "netherlands", "belgium", "sweden", "norway",
    "denmark", "finland", "poland", "portugal", "switzerland", "austria", "australia", "new zealand", "singapore",
    "malaysia", "indonesia", "philippines", "vietnam", "thailand", "south korea", "korea", "taiwan", "hong kong",
    "brazil", "mexico", "argentina", "chile", "colombia", "peru", "south africa", "nigeria", "kenya", "egypt",
    "israel", "turkey", "uae", "united arab emirates", "saudi arabia", "qatar", "pakistan", "bangladesh",
    "sri lanka", "nepal", "russia", "ukraine", "czech republic", "greece", "hungary", "romania", "remote",
    "tamil nadu", "karnataka", "maharashtra", "telangana", "kerala", "gujarat", "delhi", "west bengal",
    "andhra pradesh", "punjab", "haryana", "uttar pradesh", "rajasthan", "madhya pradesh", "bavaria",
    // Countries (ISO short names, common forms)
    "afghanistan", "albania", "algeria", "angola", "armenia", "azerbaijan", "bahrain", "belarus", "bolivia",
    "bosnia", "botswana", "bulgaria", "cambodia", "cameroon", "costa rica", "croatia", "cuba", "cyprus",
    "czechia", "dominican republic", "ecuador", "el salvador", "estonia", "ethiopia", "georgia", "ghana",
    "guatemala", "honduras", "iceland", "iran", "iraq", "jamaica", "jordan", "kazakhstan", "kuwait",
    "kyrgyzstan", "laos", "latvia", "lebanon", "libya", "lithuania", "luxembourg", "macedonia", "madagascar",
    "malta", "mauritius", "moldova", "mongolia", "montenegro", "morocco", "mozambique", "myanmar", "namibia",
    "nicaragua", "oman", "panama", "paraguay", "rwanda", "senegal", "serbia", "slovakia", "slovenia",
    "somalia", "sudan", "syria", "tanzania", "tunisia", "uganda", "uruguay", "uzbekistan", "venezuela",
    "yemen", "zambia", "zimbabwe", "scotland", "northern ireland", "luxemburg", "holland", "the netherlands",
    "south sudan", "north macedonia", "ivory coast", "cote d'ivoire", "trinidad", "bahamas", "barbados",
    "fiji", "papua new guinea", "brunei", "bhutan", "maldives", "mauritania", "mali", "niger", "chad",
    "gabon", "congo", "liberia", "sierra leone", "togo", "benin", "burkina faso", "eritrea", "djibouti",
    "malawi", "lesotho", "eswatini", "swaziland", "burundi", "guinea", "gambia", "seychelles", "comoros",
  ].map((s) => s.toLowerCase()),
);

// City words may not cross a tab stop (layout gap) – see extract/layout.js.
const LOCATION_RE = /([A-Z][A-Za-z.'-]+(?: [A-Z][A-Za-z.'-]+){0,2}), ?([A-Z]{2}|[A-Z][A-Za-z.]+(?: [A-Z][A-Za-z.]+)?)(?: +(\d{5}(?:-\d{4})?))?\b/g;

/** Validate a "City, Region" candidate against known states/countries. */
function isKnownRegion(region) {
  if (!region) return false;
  const r = region.trim();
  if (/^[A-Z]{2}$/.test(r)) return US_STATES.has(r);
  return REGIONS.has(r.toLowerCase());
}

/**
 * Find a plausible location in the given text (usually the header lines).
 *
 * strict: the region must be a known state/country (or US state code).
 * loose : additionally accept an unknown region when the whole tab- or
 *         pipe-delimited segment is exactly "City, Region" (e.g. "Zurich,
 *         Switzerland" printed on its own, or "Bern" style trailing tokens
 *         are ignored).
 */
export function extractLocation(text, { strict = true } = {}) {
  if (!text) return null;
  const candidates = [];
  for (const line of text.split("\n")) {
    const contactLine = /@|https?:|www\.|\|/.test(line) || /\d{3}[\s.-]\d{3,4}[\s.-]\d{4}/.test(line);
    for (const segment of line.split(/\t|\s\|\s|\s•\s/)) {
      LOCATION_RE.lastIndex = 0;
      let m;
      while ((m = LOCATION_RE.exec(segment)) !== null) {
        const known = isKnownRegion(m[2]);
        const whole = m[0].trim() === segment.trim();
        const cityOk = wordCount(m[1]) <= 3 && !/\d/.test(m[1]);
        if (cityOk && (known || (!strict && whole && /^[A-Z]{2}$/.test(m[2])) || (!strict && whole && contactLine))) {
          candidates.push({ city: m[1], region: m[2], postalCode: m[3] || "", known, contactLine, whole });
        }
        // Retry from the next character so "Technology, Cambridge, MA" can still yield "Cambridge, MA".
        LOCATION_RE.lastIndex = m.index + 1;
      }
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => (b.known - a.known) || (b.whole - a.whole) || (b.contactLine - a.contactLine));
  const best = candidates[0];
  return { city: best.city, region: best.region, postalCode: best.postalCode };
}

export function extractEmail(text) {
  EMAIL_RE.lastIndex = 0;
  const m = (text || "").match(EMAIL_RE);
  return m ? m[0].replace(/[.,;]+$/, "") : "";
}

export function extractPhone(text) {
  if (!text) return "";
  PHONE_RE.lastIndex = 0;
  const found = [];
  let m;
  while ((m = PHONE_RE.exec(text)) !== null) {
    const raw = m[0];
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 15) continue;
    if (!/^\+/.test(raw.trim()) && digits.length < 10) continue;
    // Reject things that are really date ranges or zip codes ("2016 - 2020 12345").
    if (/(?:19|20)\d{2}\s*[-–]\s*(?:19|20)\d{2}/.test(raw)) continue;
    found.push(raw.trim());
  }
  if (!found.length) return "";
  return normalizeWhitespace(found[0]).replace(/\s*([-.])\s*/g, "$1");
}

export function extractUrls(text) {
  if (!text) return [];
  URL_RE.lastIndex = 0;
  const urls = new Set();
  let m;
  while ((m = URL_RE.exec(text)) !== null) urls.add(m[0].replace(/[.,;:]+$/, ""));
  return [...urls];
}

const NETWORKS = [
  ["linkedin.com", "LinkedIn"],
  ["github.com", "GitHub"],
  ["gitlab.com", "GitLab"],
  ["twitter.com", "Twitter"],
  ["x.com", "X"],
  ["medium.com", "Medium"],
  ["behance.net", "Behance"],
  ["dribbble.com", "Dribbble"],
  ["stackoverflow.com", "Stack Overflow"],
  ["kaggle.com", "Kaggle"],
  ["scholar.google.com", "Google Scholar"],
  ["orcid.org", "ORCID"],
];

/** Split URLs into JSON Resume `profiles` and a personal `url`. */
export function classifyUrls(urls) {
  const profiles = [];
  let website = "";
  for (const raw of urls) {
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const net = NETWORKS.find(([host]) => url.toLowerCase().includes(host));
    if (net) {
      const username = url.replace(/\/+$/, "").split("/").pop() || "";
      profiles.push({ network: net[1], username, url });
    } else if (!website) {
      website = url;
    }
  }
  return { profiles, url: website };
}

/** Strip email/phone/url/pipes from a line so that what remains is prose. */
function stripContactTokens(text) {
  return normalizeWhitespace(
    (text || "")
      .replace(EMAIL_RE, " ")
      .replace(URL_RE, " ")
      .replace(PHONE_RE, (m) => (m.replace(/\D/g, "").length >= 10 ? " " : m))
      .replace(/\b(?:email|phone|tel|mobile|cell|linkedin|github|portfolio|website)\s*:?\s*/gi, " ")
      .replace(/[|•·]+/g, " | "),
  );
}

const NAME_STOPWORDS = /\b(resume|curriculum vitae|cv|page \d)\b/i;

function looksLikeName(text) {
  const t = text.trim();
  if (!t || NAME_STOPWORDS.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length < 1 || words.length > 5) return false;
  if (/\d|@|https?:/.test(t)) return false;
  const alphaWords = words.filter((w) => /^[A-Za-z][A-Za-z'.-]*,?$/.test(w));
  return alphaWords.length === words.length;
}

/**
 * Extract basics from header lines. `allText` is used as a fallback for
 * email/phone/URL when they do not appear in the header block.
 */
export function extractBasics(headerLines, allText, stats = {}) {
  const headerText = headerLines.map((l) => l.text).join("\n");
  const email = extractEmail(headerText) || extractEmail(allText);
  const phone = extractPhone(headerText) || extractPhone(allText);
  const urls = extractUrls(headerText);
  const { profiles, url } = classifyUrls(urls.length ? urls : extractUrls(allText));
  const location = extractLocation(headerText, { strict: true }) || extractLocation(headerText, { strict: false });

  // Name: the most prominent line among the first few header lines that
  // looks like a personal name after stripping contact tokens.
  let name = "";
  const candidates = headerLines.slice(0, 6).map((l, i) => {
    const cleaned = stripContactTokens(l.text).split("|")[0].trim();
    return { i, cleaned, size: l.size || 1, emph: l.emph, ok: looksLikeName(cleaned) };
  });
  const okCandidates = candidates.filter((c) => c.ok);
  if (okCandidates.length) {
    okCandidates.sort((a, b) => b.size - a.size || (b.emph ? 1 : 0) - (a.emph ? 1 : 0) || a.i - b.i);
    name = okCandidates[0].cleaned;
  } else if (candidates.length) {
    name = candidates[0].cleaned.split(",")[0].trim();
  }
  name = name.replace(/,$/, "").trim();

  // Headline / label: a short non-contact line that is not the name, not a
  // sentence and not the summary paragraph.
  let label = "";
  const summaryLines = [];
  const nameIdx = candidates.find((c) => c.cleaned === name)?.i ?? -1;
  for (let i = 0; i < headerLines.length; i++) {
    if (i === nameIdx) continue;
    const line = headerLines[i];
    const cleaned = stripContactTokens(line.text);
    if (!cleaned || cleaned === "|") continue;
    const hasContact = /@|https?:|www\./i.test(line.text) || extractPhone(line.text) || /\|/.test(line.text);
    const wc = wordCount(cleaned);
    if (NAME_STOPWORDS.test(cleaned) && wc <= 3) continue;
    if (!label && !hasContact && wc <= 8 && !endsSentence(cleaned) && !containsDate(cleaned) && !/[,]/.test(cleaned) && i <= nameIdx + 3) {
      // Skip a lone location line.
      if (location && cleaned.includes(location.city) && wc <= 4) continue;
      label = cleaned;
      continue;
    }
    if (hasContact) {
      // A contact line may also carry a headline: "Software Engineer | email | phone".
      if (!label) {
        const parts = splitOutsideParens(stripContactTokens(line.text), "|").filter(Boolean);
        const cand = parts.find((p) => wordCount(p) <= 6 && !/\d/.test(p) && p !== name && !(location && p.includes(location.city)));
        if (cand && i <= nameIdx + 2) label = cand;
      }
      continue;
    }
    if (wc >= 8 || (summaryLines.length && line.continues)) summaryLines.push(cleaned);
  }
  const summary = summaryLines.join(" ").replace(/\s+/g, " ").trim();

  return {
    name,
    label,
    email,
    phone,
    url,
    profiles,
    location: location
      ? { city: location.city, region: location.region, postalCode: location.postalCode || "" }
      : null,
    summary,
  };
}
