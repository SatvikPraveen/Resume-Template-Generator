/**
 * Work / volunteer experience parsing.
 *
 * Each entry's header block (1-3 lines) is decomposed into position,
 * organisation, location and a date range. Pieces are classified using role
 * and organisation lexicons; typography (bold vs italic runs) and the
 * conventional line order break ties.
 */

import { findDateRanges, findDates, stripDates, toISO } from "./dates.js";
import { extractLocation } from "./contact.js";
import { segmentEntries, bodyToHighlights } from "./entries.js";
import { normalizeWhitespace, wordCount, splitOutsideParens } from "./text.js";

export const ROLE_WORDS = [
  "engineer", "developer", "manager", "analyst", "designer", "consultant", "director", "specialist",
  "coordinator", "lead", "leader", "senior", "junior", "associate", "principal", "staff", "supervisor",
  "intern", "internship", "officer", "architect", "scientist", "researcher", "assistant", "administrator",
  "technician", "head", "chief", "president", "vice president", "vp", "founder", "co-founder", "owner",
  "partner", "fellow", "instructor", "teacher", "professor", "lecturer", "tutor", "trainee", "apprentice",
  "student", "volunteer", "mentor", "advisor", "strategist", "executive", "representative", "recruiter",
  "accountant", "auditor", "nurse", "clerk", "operator", "programmer", "sde", "swe", "cto", "ceo", "coo",
  "cfo", "editor", "writer", "producer", "marketer", "planner", "agent", "secretary", "treasurer",
  "member", "chair", "captain", "ambassador", "freelance", "freelancer", "contractor", "graduate",
];

export const ORG_WORDS = [
  "inc", "inc.", "llc", "ltd", "ltd.", "limited", "corp", "corp.", "corporation", "company", "co.",
  "group", "technologies", "technology", "solutions", "systems", "services", "consulting", "partners",
  "software", "labs", "lab", "laboratory", "laboratories", "university", "college", "institute", "school",
  "academy", "foundation", "bank", "hospital", "clinic", "agency", "studio", "studios", "ventures",
  "capital", "holdings", "gmbh", "ag", "pvt", "pvt.", "plc", "sa", "s.a.", "bv", "b.v.", "llp", "networks",
  "media", "entertainment", "industries", "enterprises", "international", "global", "digital",
  "analytics", "research", "center", "centre", "association", "society", "council", "ministry",
  "department", "organization", "organisation", "ngo", "trust", "healthcare", "financial", "insurance",
  "airlines", "motors", "electric", "energy", "pharma", "pharmaceuticals", "biotech", "logistics",
  "retail", "stores", "market", "supermarket", "restaurant", "cafe", "hotel", "resort", "club",
];

const ROLE_RE = new RegExp(`\\b(?:${ROLE_WORDS.map(escapeRe).join("|")})\\b`, "i");
const ORG_RE = new RegExp(`(?:^|[\\s,])(?:${ORG_WORDS.map(escapeRe).join("|")})(?=$|[\\s,.)])`, "i");

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function looksLikeRole(text) {
  return ROLE_RE.test(text || "");
}

export function looksLikeOrg(text) {
  return ORG_RE.test(text || "");
}

/** Split a header line into semantic pieces on strong separators. */
export function splitHeaderPieces(text) {
  const t = normalizeWhitespace(text);
  // Strong separators: pipes, bullets, tabs, em dashes, spaced hyphens.
  let parts = t.split(/\s*(?:\||•|·|\t|—|–|\s-\s|\s@\s)\s*/).map((p) => p.trim()).filter(Boolean);
  // " at " links a role to an organisation: "Engineer at Acme".
  const out = [];
  for (const p of parts) {
    const at = p.match(/^(.+?)\s+(?:at|@|with|for)\s+(.+)$/i);
    if (at && looksLikeRole(at[1]) && !looksLikeRole(at[2])) out.push(at[1].trim(), at[2].trim());
    else out.push(p);
  }
  return out;
}

/**
 * Pull position / organisation / location / dates out of the header
 * paragraphs of an entry.
 */
export function parseHeaderBlock(headerParas) {
  const linesText = headerParas.map((p) => p.text);
  const joined = linesText.join("\n");

  // Dates: prefer a full range; fall back to a single date as start.
  const ranges = findDateRanges(joined);
  let startDate = "";
  let endDate = "";
  let current = false;
  if (ranges.length) {
    const r = ranges[0];
    startDate = toISO(r.start);
    if (r.end.present) current = true;
    else endDate = toISO(r.end);
  } else {
    const singles = findDates(joined);
    if (singles.length) startDate = toISO(singles[0].date);
  }

  // Location: a "City, ST" / "City, Country" fragment.
  let loc = extractLocation(joined, { strict: true }) || extractLocation(stripDates(joined), { strict: false });
  let locationText = loc ? `${loc.city}, ${loc.region}` : "";

  // Strip dates/location from each line and split into pieces.
  const pieces = [];
  headerParas.forEach((p, lineIdx) => {
    let text = stripDates(p.text);
    if (loc) {
      text = text.replace(new RegExp(`${escapeRe(loc.city)},\\s*${escapeRe(loc.region)}(?:\\s+\\d{5})?`), " ");
    }
    text = normalizeWhitespace(text).replace(/^[\s,|•·\-–—]+|[\s,|•·\-–—]+$/g, "");
    if (!text) return;
    const emphSpans = (p.first?.runs || []).filter((r) => r.bold);
    for (const piece of splitHeaderPieces(text)) {
      if (!piece || /^\(.*\)$/.test(piece) && wordCount(piece) <= 2) continue;
      const bold = emphSpans.some((s) => s.text && piece.includes(s.text.trim()) && s.text.trim().length >= Math.min(4, piece.length));
      pieces.push({ text: piece, lineIdx, bold, role: looksLikeRole(piece), org: looksLikeOrg(piece) });
    }
  });

  let position = "";
  let organisation = "";
  const leftovers = [];

  // Pass 1: unambiguous lexicon hits.
  for (const pc of pieces) {
    if (pc.role && !pc.org && !position) position = pc.text;
    else if (pc.org && !pc.role && !organisation) organisation = pc.text;
    else leftovers.push(pc);
  }
  // Pass 2: pieces that hit both or neither lexicon, by convention.
  for (const pc of leftovers) {
    if (!position && pc.role) position = pc.text;
    else if (!organisation && pc.org) organisation = pc.text;
    else if (!position && !organisation) {
      // First unknown piece: bold conventionally means the company in
      // "Company (bold) / Title (italic)" layouts, but only when a later
      // piece exists to be the title. Default to position.
      const later = leftovers.filter((o) => o !== pc && !o.role && !o.org);
      if (pc.bold && later.length) organisation = pc.text;
      else position = pc.text;
    } else if (!position) position = pc.text;
    else if (!organisation) organisation = pc.text;
    else if (pc.lineIdx === 0 && wordCount(pc.text) <= 6 && !/\d/.test(pc.text)) {
      // Extra qualifier on the title line, e.g. "(Contract)".
      position = `${position} ${pc.text}`.trim();
    }
  }

  // "Role, Organisation[, Course][, City]" residue: split a comma list.
  if (position && !organisation && position.includes(",")) {
    const segments = splitOutsideParens(position, ",");
    if (segments.length >= 2) {
      const rest = segments.slice(1);
      const orgIdx = rest.findIndex((seg) => looksLikeOrg(seg));
      const pick = orgIdx >= 0 ? orgIdx : rest.length - 1;
      const cand = rest[pick];
      if (cand && !looksLikeRole(cand) && wordCount(cand) <= 6) {
        position = segments[0];
        organisation = cand;
        const trailing = rest.slice(pick + 1).filter((seg) => wordCount(seg) <= 2 && !/\d/.test(seg));
        if (!locationText && trailing.length) locationText = trailing.join(", ");
      }
    }
  }

  return {
    position: normalizeWhitespace(position),
    organisation: normalizeWhitespace(organisation),
    location: locationText,
    startDate,
    endDate,
    current,
  };
}

/**
 * Parse an experience section into JSON Resume `work` entries.
 * @param {Array} lines annotated lines belonging to the section
 */
export function parseExperience(lines) {
  const entries = segmentEntries(lines);
  const work = [];
  for (const e of entries) {
    if (e.header.length === 0) continue;
    const header = parseHeaderBlock(e.header);
    const { highlights, summary } = bodyToHighlights(e.body);
    if (!header.position && !header.organisation && !header.startDate) {
      // A header-less block is almost always body text belonging to the
      // previous entry (e.g. a wrapped bullet the layout stage split).
      if (work.length) work[work.length - 1].highlights.push(...highlights, ...(summary ? [summary] : []));
      continue;
    }
    work.push({
      name: header.organisation,
      position: header.position,
      location: header.location,
      startDate: header.startDate,
      endDate: header.endDate,
      current: header.current,
      summary,
      highlights,
    });
  }
  return work;
}
