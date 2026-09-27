/**
 * Parsing pipeline: annotated lines -> sections -> entities -> JSON Resume.
 *
 *   extract (layout.js / pdf.js)   positioned runs -> lines with typography
 *   segment (sections.js)          lines -> labelled sections
 *   parse   (parse/*.js)           sections -> work / education / skills / ...
 *   schema  (json-resume.js)       -> validated JSON Resume + diagnostics
 *
 * Two entry points:
 *   parseLines(lines, stats)  – for layout-aware input from pdf.js
 *   parseText(text)           – for plain text (tests, pasted resumes)
 */

import { linesFromText, computeStats } from "./extract/layout.js";
import { segmentSections, linesFor } from "./segment/sections.js";
import { extractBasics } from "./parse/contact.js";
import { parseExperience } from "./parse/experience.js";
import { parseEducation } from "./parse/education.js";
import { parseSkills } from "./parse/skills.js";
import { parseProjects } from "./parse/projects.js";
import { parseCertifications, parseAwards, parsePublications, parseLanguages } from "./parse/certifications.js";
import { toJsonResume, validateJsonResume } from "./schema/json-resume.js";
import { findDateRanges } from "./parse/dates.js";
import { normalizeWhitespace, stripBullet } from "./parse/text.js";

export const PARSER_VERSION = "4.0.0";

/**
 * Confidence heuristics per section, in [0, 1]. These are calibrated on the
 * evaluation fixtures (see docs/EVALUATION.md) and surfaced in the UI so a
 * user knows which sections deserve a second look.
 */
function scoreConfidence(parsed, sections) {
  const has = (id) => sections.some((s) => s.id === id);
  const ratio = (arr, pred) => (arr.length ? arr.filter(pred).length / arr.length : 0);
  const conf = {};
  const b = parsed.basics;
  conf.basics = [b.name ? 0.4 : 0, b.email ? 0.25 : 0, b.phone ? 0.15 : 0, b.location ? 0.1 : 0, b.label || b.summary ? 0.1 : 0].reduce((a, c) => a + c, 0);
  conf.work = parsed.work.length
    ? 0.4 * (has("experience") ? 1 : 0.5) + 0.3 * ratio(parsed.work, (w) => w.startDate) + 0.3 * ratio(parsed.work, (w) => w.name && w.position)
    : has("experience") ? 0.1 : 0;
  conf.education = parsed.education.length
    ? 0.4 * (has("education") ? 1 : 0.5) + 0.3 * ratio(parsed.education, (e) => e.institution) + 0.3 * ratio(parsed.education, (e) => e.studyType)
    : has("education") ? 0.1 : 0;
  conf.skills = parsed.skills.length ? 0.6 + 0.4 * Math.min(1, parsed.skills.reduce((n, g) => n + g.keywords.length, 0) / 10) : 0;
  conf.projects = parsed.projects.length ? 0.5 + 0.5 * ratio(parsed.projects, (p) => p.highlights.length || p.description) : has("projects") ? 0.1 : 0;
  for (const k of Object.keys(conf)) conf[k] = Math.round(Math.min(1, conf[k]) * 100) / 100;
  return conf;
}

/** Fallback when no headings were found: locate blocks by their content. */
function fallbackSections(lines) {
  const sections = [];
  const dated = lines.filter((l) => findDateRanges(l.text).length > 0);
  if (dated.length) {
    const first = lines.indexOf(dated[0]);
    const last = lines.indexOf(dated[dated.length - 1]);
    sections.push({ id: "experience", title: "(inferred)", lines: lines.slice(first, Math.min(lines.length, last + 8)), inferred: true });
  }
  return sections;
}

/**
 * Parse annotated lines into a JSON Resume document.
 * @param {Array} lines annotated lines (see extract/layout.js)
 * @param {object} [stats] document statistics (computed when omitted)
 * @param {object} [options]
 * @param {object} [options.meta] extra metadata to include in `meta`
 */
export function parseLines(lines, stats = computeStats(lines), options = {}) {
  const warnings = [];
  let { sections, headerLines } = segmentSections(lines, stats);
  if (sections.length === 0) {
    warnings.push("No section headings were recognised; sections were inferred from content.");
    sections = fallbackSections(lines);
    headerLines = lines.slice(0, Math.min(8, lines.length));
  }
  const allText = lines.map((l) => l.text).join("\n");

  const basics = extractBasics(headerLines, allText, stats);
  const parsed = {
    basics,
    work: parseExperience(linesFor(sections, "experience")),
    volunteer: parseExperience(linesFor(sections, "volunteer")),
    education: parseEducation(linesFor(sections, "education")),
    skills: parseSkills(linesFor(sections, "skills")),
    projects: parseProjects(linesFor(sections, "projects")),
    certifications: parseCertifications(linesFor(sections, "certifications")),
    awards: parseAwards(linesFor(sections, "awards")),
    publications: parsePublications(linesFor(sections, "publications")),
    languages: parseLanguages(linesFor(sections, "languages")),
    interests: linesFor(sections, "interests")
      .flatMap((l) => stripBullet(l.text).split(/\s*[,;•|·]\s*/))
      .map((s) => normalizeWhitespace(s))
      .filter(Boolean)
      .map((name) => ({ name })),
  };

  // Summary section (labelled) wins over an unlabelled header paragraph.
  const summaryLines = linesFor(sections, "summary");
  if (summaryLines.length) {
    parsed.basics.summary = summaryLines.map((l) => stripBullet(l.text)).join(" ").replace(/\s+/g, " ").trim();
  }

  if (!parsed.basics.name) warnings.push("Could not identify a name in the header block.");
  if (!parsed.work.length && !parsed.education.length && !parsed.skills.length) {
    warnings.push("Very little structured data was recognised. The PDF may use an unusual layout.");
  }
  for (const s of sections) {
    if (s.id === "other") warnings.push(`Unrecognised section "${s.title}" was skipped.`);
  }

  const confidence = scoreConfidence(parsed, sections);
  const diagnostics = {
    parser: PARSER_VERSION,
    sections: sections.map((s) => ({ id: s.id, title: s.title, lines: s.lines.length, ...(s.inferred ? { inferred: true } : {}) })),
    confidence,
    warnings,
    ...(options.meta || {}),
  };
  const resume = toJsonResume(parsed, diagnostics);
  const problems = validateJsonResume(resume);
  if (problems.length) resume.meta.warnings = [...(resume.meta.warnings || []), ...problems.map((p) => `schema: ${p}`)];
  return resume;
}

/** Parse plain text (no layout information). */
export function parseText(text, options = {}) {
  const lines = linesFromText(text);
  return parseLines(lines, computeStats(lines), { ...options, meta: { source: "text", ...(options.meta || {}) } });
}
