/**
 * Section segmentation.
 *
 * A resume is a sequence of labelled blocks. This stage decides which lines
 * are section headings and assigns every other line to the heading above it.
 * Decisions combine two evidence sources:
 *
 *   1. A lexicon of heading phrases mapped to canonical section ids
 *      ("Professional Experience" -> experience, "Core Competencies" -> skills).
 *   2. Typography and shape from the layout stage: bold / larger / all caps,
 *      short, own line, preceded by vertical whitespace, flush with the margin.
 *
 * Each candidate gets a score; a line becomes a heading when the score
 * clears a threshold. A lexicon hit is the strongest single feature but is
 * not sufficient on its own – "Experience with Kubernetes" inside a bullet
 * must not split the document. Conversely, an unknown phrase set in bold
 * caps on its own line ("HACKATHONS") still becomes a heading (id "other").
 */

import { canonical, wordCount, isAllCaps, isTitleCase, endsSentence } from "../parse/text.js";
import { containsDate } from "../parse/dates.js";

/** Canonical section ids and the heading phrases that map to them. */
export const SECTION_LEXICON = {
  summary: [
    "summary", "professional summary", "executive summary", "career summary", "profile",
    "professional profile", "personal profile", "objective", "career objective", "about",
    "about me", "overview", "personal statement", "introduction", "summary of qualifications",
    "qualifications summary", "career profile", "professional overview", "bio",
  ],
  experience: [
    "experience", "work experience", "professional experience", "employment", "employment history",
    "work history", "career history", "relevant experience", "professional background",
    "internships", "internship experience", "industry experience", "research experience",
    "teaching experience", "professional employment", "career", "positions held", "positions",
    "experience and internships", "work and experience", "experiences", "professional experiences",
  ],
  education: [
    "education", "academic background", "academics", "academic qualifications", "educational background",
    "qualifications", "education and training", "education & training", "academic history",
    "education & qualifications", "education and qualifications", "degrees", "academic record",
  ],
  skills: [
    "skills", "technical skills", "core competencies", "competencies", "technologies",
    "technical proficiencies", "expertise", "areas of expertise", "tools", "tools and technologies",
    "tools & technologies", "technical expertise", "key skills", "core skills", "skills and tools",
    "skills & tools", "skills & interests", "skills and interests", "skill set", "skillset",
    "languages and technologies", "technical summary", "technology stack", "tech stack",
    "professional skills", "computer skills", "technical", "technologies and tools",
    "skills summary", "skills & expertise", "skills and expertise", "areas of expertise",
    "technical competencies", "strengths", "proficiencies", "skills & abilities",
  ],
  projects: [
    "projects", "personal projects", "academic projects", "key projects", "selected projects",
    "notable projects", "project experience", "portfolio", "research projects", "side projects",
    "technical projects", "projects and research", "relevant projects", "open source",
    "open source contributions", "project work", "project", "capstone project", "capstone projects",
  ],
  certifications: [
    "certifications", "certificates", "licenses", "licenses and certifications",
    "licenses & certifications", "certifications and licenses", "certifications & licenses",
    "credentials", "professional certifications", "training", "training and certifications",
    "certifications and training", "professional development", "courses and certifications",
    "certification", "licences", "licences and certifications",
  ],
  awards: [
    "awards", "honors", "honours", "honors and awards", "honors & awards", "awards and honors",
    "awards & honors", "achievements", "accomplishments", "recognition", "awards and achievements",
    "awards & achievements", "honors and achievements", "scholarships", "achievements and awards",
    "key achievements",
  ],
  publications: [
    "publications", "papers", "research publications", "selected publications", "research",
    "publications and presentations", "presentations", "conference presentations", "patents",
    "publications & patents",
  ],
  languages: ["languages", "language skills", "spoken languages", "language proficiency"],
  interests: [
    "interests", "hobbies", "activities", "extracurricular activities", "interests and hobbies",
    "hobbies and interests", "hobbies & interests", "extracurriculars", "personal interests",
    "extra-curricular activities", "co-curricular activities",
  ],
  volunteer: [
    "volunteer", "volunteering", "volunteer experience", "volunteer work", "community service",
    "community involvement", "leadership", "leadership experience", "leadership and activities",
    "activities and leadership", "leadership & activities", "volunteering experience",
    "leadership and involvement", "campus involvement", "community engagement",
  ],
  references: ["references", "referees", "references available upon request"],
  coursework: ["coursework", "relevant coursework", "courses", "relevant courses", "selected coursework"],
};

const PHRASE_TO_ID = new Map();
for (const [id, phrases] of Object.entries(SECTION_LEXICON)) {
  for (const p of phrases) PHRASE_TO_ID.set(canonical(p), id);
}

/** Heading phrases end with a generic keyword: "Awesome Experience" is still an experience heading. */
const KEYWORD_SUFFIX = [
  [/\bexperiences?$/i, "experience"],
  [/\bemployment$/i, "experience"],
  [/\binternships?$/i, "experience"],
  [/\beducation$/i, "education"],
  [/\bskills?$/i, "skills"],
  [/\bcompetenc(?:y|ies)$/i, "skills"],
  [/\bprojects?$/i, "projects"],
  [/\bcertifications?$/i, "certifications"],
  [/\bcertificates?$/i, "certifications"],
  [/\bawards?$/i, "awards"],
  [/\bhon(?:o|ou)rs$/i, "awards"],
  [/\bpublications?$/i, "publications"],
  [/\bvolunteer(?:ing)?$/i, "volunteer"],
  [/\bleadership$/i, "volunteer"],
  [/\bsummary$/i, "summary"],
  [/\bobjective$/i, "summary"],
  [/\bprofile$/i, "summary"],
  [/\blanguages$/i, "languages"],
  [/\binterests$/i, "interests"],
  [/\bactivities$/i, "interests"],
  [/\bcoursework$/i, "coursework"],
];

/** Strip decorations that often surround headings ("--- SKILLS ---", "SKILLS:", "» Education"). */
export function cleanHeadingText(text) {
  return (text || "")
    .replace(/^[\s\-–—=_*#|•·:>»]+/, "")
    .replace(/[\s\-–—=_*#|•·:>»]+$/, "")
    .trim();
}

/**
 * Map heading text to a canonical section id, or null when the lexicon does
 * not recognise it. Returns {id, exact} where exact is true for full-phrase
 * matches and false for suffix keyword matches.
 */
export function lookupHeading(text) {
  const cleaned = canonical(cleanHeadingText(text)).replace(/\s*&\s*/g, " and ").replace(/\s+/g, " ");
  if (!cleaned) return null;
  if (PHRASE_TO_ID.has(cleaned)) return { id: PHRASE_TO_ID.get(cleaned), exact: true };
  const noAnd = cleaned.replace(/ and /g, " ");
  if (PHRASE_TO_ID.has(noAnd)) return { id: PHRASE_TO_ID.get(noAnd), exact: true };
  if (wordCount(cleaned) <= 4) {
    for (const [re, id] of KEYWORD_SUFFIX) if (re.test(cleaned)) return { id, exact: false };
  }
  return null;
}

/**
 * Score a line as a heading candidate. Returns {score, id, inlineContent}.
 * inlineContent holds text after a colon ("Skills: Java, Go") that belongs
 * to the section body rather than the heading.
 */
export function scoreHeading(line, stats = {}) {
  const text = line.text || "";
  let heading = text;
  let inlineContent = "";
  const colon = text.indexOf(":");
  if (colon > 0 && colon < 40) {
    heading = text.slice(0, colon);
    inlineContent = text.slice(colon + 1).trim();
  }
  const lookup = lookupHeading(heading);
  const words = wordCount(cleanHeadingText(heading));
  let score = 0;

  if (lookup) score += lookup.exact ? 3 : 2;
  if (line.emph) score += 1.2;
  if (line.larger) score += 1.2;
  if (isAllCaps(heading) && words <= 5) score += 1;
  if (words <= 3) score += 0.6;
  else if (words <= 5) score += 0.3;
  if (line.gapAbove > 1.25) score += 0.6;
  if (typeof line.indent === "number" && line.indent <= 2 && !line.textOnly) score += 0.4;
  if (line.bullet) score -= 3;
  if (words > 6) score -= 2;
  if (containsDate(text)) score -= 3;
  if (/[@]|https?:|www\./i.test(text)) score -= 3;
  if (endsSentence(text) && !text.trim().endsWith(":")) score -= 1;
  if (!lookup && !line.textOnly && !(line.emph || line.larger)) score -= 1.5;
  if (inlineContent && !lookup) score -= 2;
  // "Programming Languages: C, Java, Python" is a skill category, not a heading.
  if (inlineContent && lookup && !lookup.exact) score -= 3;
  if (inlineContent && (inlineContent.match(/,/g) || []).length >= 2 && !(line.emph || line.larger)) score -= 1.5;
  if (!lookup && !isAllCaps(heading) && !isTitleCase(heading)) score -= 1;
  if (line.textOnly && lookup && !inlineContent && (isAllCaps(heading) || text.trim().endsWith(":") || words <= 2)) score += 0.8;

  return { score, id: lookup ? lookup.id : null, exact: !!lookup?.exact, inlineContent, headingText: cleanHeadingText(heading) };
}

/**
 * Split annotated lines into sections.
 * @returns {{sections: Array<{id:string,title:string,lines:Array,start:number,end:number}>, headerLines: Array}}
 */
export function segmentSections(lines, stats = {}, { threshold = 3.4 } = {}) {
  const headings = [];
  lines.forEach((line, idx) => {
    const s = scoreHeading(line, stats);
    // Unknown phrases need stronger typographic evidence than lexicon hits.
    const need = s.id ? threshold : threshold + 0.8;
    if (s.score >= need) headings.push({ idx, ...s });
  });

  const sections = [];
  const firstIdx = headings.length ? headings[0].idx : lines.length;
  const headerLines = lines.slice(0, firstIdx);
  for (let h = 0; h < headings.length; h++) {
    const cur = headings[h];
    const next = headings[h + 1];
    const body = lines.slice(cur.idx + 1, next ? next.idx : lines.length);
    if (cur.inlineContent) {
      body.unshift({ ...lines[cur.idx], text: cur.inlineContent, bullet: false, continues: false, inline: true });
    }
    sections.push({
      id: cur.id || "other",
      title: cur.headingText,
      lines: body,
      start: cur.idx,
      end: next ? next.idx : lines.length,
      score: cur.score,
    });
  }
  return { sections, headerLines };
}

/** Concatenate all sections with a given id (resumes may have several experience blocks). */
export function linesFor(sections, id) {
  const out = [];
  for (const s of sections) {
    if (s.id !== id) continue;
    s.lines.forEach((l, i) => {
      out.push(i === 0 && out.length ? { ...l, gapAbove: 3, continues: false } : l);
    });
  }
  return out;
}
