/**
 * JSON Resume (https://jsonresume.org/schema/) assembly and validation.
 *
 * The parsers produce loosely-typed intermediate objects; this module shapes
 * them into a schema-conformant document, strips empty fields, and provides
 * a lightweight structural validator (no external dependency) so the output
 * contract can be asserted in tests and CI.
 */

import { untab } from "../parse/text.js";

export const SCHEMA_URL = "https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json";

const ISO_PARTIAL = /^\d{4}(?:-(?:0[1-9]|1[0-2]))?(?:-(?:0[1-9]|[12]\d|3[01]))?$/;

function clean(obj) {
  if (Array.isArray(obj)) {
    return obj.map(clean).filter((v) => v !== undefined && v !== null && v !== "");
  }
  if (obj && typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      const c = clean(v);
      if (c === undefined || c === null || c === "") continue;
      if (Array.isArray(c) && c.length === 0) continue;
      if (typeof c === "object" && !Array.isArray(c) && Object.keys(c).length === 0) continue;
      out[k] = c;
    }
    return out;
  }
  if (typeof obj === "string") return untab(obj);
  return obj;
}

/**
 * Build a JSON Resume document from parser output.
 * @param {object} parsed intermediate result from the pipeline
 * @param {object} [meta] diagnostics to store under `meta`
 */
export function toJsonResume(parsed, meta = {}) {
  const b = parsed.basics || {};
  const resume = {
    $schema: SCHEMA_URL,
    basics: {
      name: b.name || "",
      label: b.label || "",
      email: b.email || "",
      phone: b.phone || "",
      url: b.url || "",
      summary: b.summary || "",
      location: b.location
        ? { city: b.location.city || "", region: b.location.region || "", postalCode: b.location.postalCode || "" }
        : undefined,
      profiles: (b.profiles || []).map((p) => ({ network: p.network, username: p.username, url: p.url })),
    },
    work: (parsed.work || []).map((w) => ({
      name: w.name || "",
      position: w.position || "",
      location: w.location || "",
      startDate: w.startDate || "",
      endDate: w.endDate || "",
      summary: w.summary || "",
      highlights: w.highlights || [],
    })),
    volunteer: (parsed.volunteer || []).map((w) => ({
      organization: w.name || "",
      position: w.position || "",
      startDate: w.startDate || "",
      endDate: w.endDate || "",
      summary: w.summary || "",
      highlights: w.highlights || [],
    })),
    education: (parsed.education || []).map((e) => ({
      institution: e.institution || "",
      area: e.area || "",
      studyType: e.studyType || "",
      startDate: e.startDate || "",
      endDate: e.endDate || "",
      score: e.score || "",
      courses: e.courses || [],
      // `location` is not part of JSON Resume v1 education but is widely used by themes.
      location: e.location || "",
    })),
    awards: parsed.awards || [],
    certificates: (parsed.certifications || []).map((c) => ({
      name: c.name || "",
      date: c.date || "",
      issuer: c.issuer || "",
      url: c.url || "",
    })),
    publications: parsed.publications || [],
    skills: (parsed.skills || []).map((s) => ({ name: s.name || "Skills", keywords: s.keywords || [] })),
    languages: parsed.languages || [],
    interests: parsed.interests || [],
    projects: (parsed.projects || []).map((p) => ({
      name: p.name || "",
      description: p.description || "",
      highlights: p.highlights || [],
      keywords: p.keywords || [],
      startDate: p.startDate || "",
      endDate: p.endDate || "",
      url: p.url || "",
    })),
    meta: {
      version: "v1.0.0",
      lastModified: new Date().toISOString(),
      ...meta,
    },
  };
  return clean(resume);
}

/**
 * Structural validation against the parts of the JSON Resume schema we
 * produce. Returns an array of human readable problems (empty when valid).
 */
export function validateJsonResume(resume) {
  const problems = [];
  const isStr = (v) => typeof v === "string";
  const checkDate = (path, v) => {
    if (v !== undefined && (!isStr(v) || !ISO_PARTIAL.test(v))) problems.push(`${path}: expected ISO 8601 date, got ${JSON.stringify(v)}`);
  };
  const checkStrArray = (path, v) => {
    if (v !== undefined && (!Array.isArray(v) || !v.every(isStr))) problems.push(`${path}: expected array of strings`);
  };
  if (!resume || typeof resume !== "object") return ["resume: expected object"];
  if (!resume.basics || typeof resume.basics !== "object") problems.push("basics: required object");
  else {
    for (const k of ["name", "label", "email", "phone", "url", "summary"]) {
      if (resume.basics[k] !== undefined && !isStr(resume.basics[k])) problems.push(`basics.${k}: expected string`);
    }
    if (resume.basics.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(resume.basics.email)) problems.push("basics.email: invalid email");
  }
  const sections = ["work", "volunteer", "education", "awards", "certificates", "publications", "skills", "languages", "interests", "projects"];
  for (const s of sections) {
    if (resume[s] !== undefined && !Array.isArray(resume[s])) problems.push(`${s}: expected array`);
  }
  (resume.work || []).forEach((w, i) => {
    checkDate(`work[${i}].startDate`, w.startDate);
    checkDate(`work[${i}].endDate`, w.endDate);
    checkStrArray(`work[${i}].highlights`, w.highlights);
  });
  (resume.education || []).forEach((e, i) => {
    checkDate(`education[${i}].startDate`, e.startDate);
    checkDate(`education[${i}].endDate`, e.endDate);
  });
  (resume.projects || []).forEach((p, i) => {
    checkDate(`projects[${i}].startDate`, p.startDate);
    checkDate(`projects[${i}].endDate`, p.endDate);
    checkStrArray(`projects[${i}].keywords`, p.keywords);
  });
  (resume.certificates || []).forEach((c, i) => checkDate(`certificates[${i}].date`, c.date));
  (resume.skills || []).forEach((s, i) => checkStrArray(`skills[${i}].keywords`, s.keywords));
  return problems;
}
