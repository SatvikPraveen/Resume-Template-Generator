/**
 * Template view model.
 *
 * Templates consume a flat, presentation-oriented shape (company, summary,
 * certifications, location string, display dates). This adapter maps a JSON
 * Resume document onto that shape, HTML-escapes every string and pre-formats
 * dates so no template ever prints "Invalid Date".
 */

import { escapeHtml } from "../parse/text.js";
import { formatDate } from "../parse/dates.js";

function esc(v) {
  return escapeHtml(v == null ? "" : String(v));
}

function escList(arr) {
  return (arr || []).map((s) => esc(s)).filter(Boolean);
}

function displayEnd(entry) {
  if (entry.endDate) return formatDate(entry.endDate);
  if (entry.startDate) return "Present";
  return "";
}

/** Combined text used by templates that only render a single summary string. */
function combined(summary, highlights) {
  const parts = [];
  if (summary) parts.push(summary);
  for (const h of highlights || []) parts.push(/[.!?]$/.test(h) ? h : `${h}.`);
  return parts.join(" ");
}

/**
 * @param {object} resume JSON Resume document (unescaped)
 * @returns {object} template model (escaped)
 */
export function toTemplateModel(resume) {
  const r = resume || {};
  const b = r.basics || {};
  const loc = b.location && typeof b.location === "object"
    ? [b.location.city, b.location.region].filter(Boolean).join(", ")
    : b.location || "";
  const profiles = (b.profiles || []).map((p) => ({ network: esc(p.network), username: esc(p.username), url: esc(p.url) }));
  const url = b.url || (b.profiles && b.profiles[0] && b.profiles[0].url) || "";

  const work = (r.work || []).map((w) => ({
    position: esc(w.position),
    company: esc(w.name || w.company),
    location: esc(w.location),
    startDate: esc(formatDate(w.startDate)),
    endDate: esc(displayEnd(w)),
    summaryProse: esc(w.summary),
    highlights: escList(w.highlights),
    summary: esc(combined(w.summary, w.highlights)),
  }));

  const education = (r.education || []).map((e) => ({
    institution: esc(e.institution),
    studyType: esc(e.studyType),
    area: esc(e.area),
    startDate: esc(formatDate(e.startDate)),
    endDate: esc(e.endDate ? formatDate(e.endDate) : ""),
    location: esc(e.location),
    score: esc(e.score),
    courses: escList(e.courses),
  }));

  const skills = (r.skills || []).map((s) => ({ name: esc(s.name), keywords: escList(s.keywords) }));

  const projects = (r.projects || []).map((p) => ({
    name: esc(p.name),
    keywords: escList(p.keywords),
    summaryProse: esc(p.description),
    highlights: escList(p.highlights),
    summary: esc(combined(p.description, p.highlights)),
    url: esc(p.url),
    startDate: esc(formatDate(p.startDate)),
    endDate: esc(formatDate(p.endDate)),
  }));

  const certifications = (r.certificates || r.certifications || []).map((c) => ({
    name: esc(c.name),
    issuer: esc(c.issuer),
    date: esc(formatDate(c.date)),
    url: esc(c.url),
  }));

  return {
    basics: {
      name: esc(b.name),
      label: esc(b.label),
      email: esc(b.email),
      phone: esc(b.phone),
      url: esc(url),
      location: esc(loc),
      summary: esc(b.summary),
      profiles,
    },
    work,
    volunteer: (r.volunteer || []).map((v) => ({
      position: esc(v.position),
      organization: esc(v.organization),
      startDate: esc(formatDate(v.startDate)),
      endDate: esc(displayEnd(v)),
      summary: esc(combined(v.summary, v.highlights)),
      highlights: escList(v.highlights),
    })),
    education,
    skills,
    projects,
    certifications,
    awards: (r.awards || []).map((a) => ({ title: esc(a.title), awarder: esc(a.awarder), date: esc(formatDate(a.date)) })),
    publications: (r.publications || []).map((p) => ({ name: esc(p.name), publisher: esc(p.publisher), date: esc(formatDate(p.releaseDate)) })),
    languages: (r.languages || []).map((l) => ({ language: esc(l.language), fluency: esc(l.fluency) })),
    interests: (r.interests || []).map((i) => ({ name: esc(i.name) })),
  };
}

/**
 * Render the body of a work/project entry: an optional prose paragraph
 * followed by a bulleted list of highlights. `attrs` is the attribute string
 * the template used on its <p> so per-template classes are preserved.
 */
export function renderEntryBody(entry, attrs = "") {
  if (!entry) return "";
  const prose = entry.summaryProse ?? "";
  const highlights = entry.highlights || [];
  let html = "";
  if (prose) html += `<p${attrs}>${prose}</p>`;
  if (highlights.length) {
    html += `<ul class="rtg-highlights">${highlights.map((h) => `<li>${h}</li>`).join("")}</ul>`;
  } else if (!prose && entry.summary) {
    html += `<p${attrs}>${entry.summary}</p>`;
  }
  return html;
}

/** CSS shared by all templates. */
export const SHARED_CSS = `
.rtg-highlights { margin: 0.35em 0 0 1.1em; padding: 0; }
.rtg-highlights li { margin: 0.15em 0; line-height: 1.45; }
`;
