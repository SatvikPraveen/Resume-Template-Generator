/**
 * Projects parsing. Entry headers commonly look like
 *   "Project Name | Python, Flask"        (name + technologies)
 *   "Project Name (Jan 2023 – Mar 2023)"  (name + dates)
 *   "Project Name – short tagline"
 * followed by bullet highlights and sometimes a "Technologies:" line.
 */

import { findDateRanges, findDates, stripDates, toISO } from "./dates.js";
import { segmentEntries, bodyToHighlights } from "./entries.js";
import { splitSkillList } from "./skills.js";
import { normalizeWhitespace, stripBullet, wordCount } from "./text.js";
import { extractUrls } from "./contact.js";

const TECH_LABEL_RE = /^(?:technologies|tech(?:nology)? stack|tools|stack|built with|skills|tech|languages|keywords)\s*(?:used)?\s*[:\-–]\s*/i;

function parseHeader(headerParas) {
  const joined = headerParas.map((p) => p.text).join(" ");
  const ranges = findDateRanges(joined);
  let startDate = "";
  let endDate = "";
  if (ranges.length) {
    startDate = toISO(ranges[0].start);
    endDate = ranges[0].end.present ? "" : toISO(ranges[0].end);
  } else {
    const singles = findDates(joined);
    if (singles.length) startDate = toISO(singles[0].date);
  }
  const urls = extractUrls(joined);
  let text = normalizeWhitespace(stripDates(stripBullet(joined)).replace(/\(\s*\)/g, ""));
  for (const u of urls) text = text.replace(u, " ");
  text = normalizeWhitespace(text).replace(/[\s|•·\-–—,]+$/g, "").replace(/^[\s|•·\-–—,]+/g, "");

  let name = text;
  let keywords = [];
  let description = "";
  const pipe = text.split(/\s*[|•·]\s*/);
  if (pipe.length >= 2) {
    name = pipe[0];
    keywords = splitSkillList(pipe.slice(1).join(", "));
  } else {
    const dash = text.match(/^(.+?)\s+[-–—:]\s+(.+)$/);
    if (dash && wordCount(dash[1]) <= 8) {
      name = dash[1];
      const rest = dash[2];
      if (/,/.test(rest) && wordCount(rest) <= 12 && !/\b(?:a|an|the|to|for|with|that|which)\b/i.test(rest)) {
        keywords = splitSkillList(rest);
      } else {
        description = rest;
      }
    }
  }
  return { name: name.trim(), keywords, description, startDate, endDate, url: urls[0] || "" };
}

/**
 * @param {Array} lines annotated lines of the projects section
 */
export function parseProjects(lines) {
  const entries = segmentEntries(lines, { maxHeaderLines: 2 });
  const projects = [];
  for (const e of entries) {
    if (e.header.length === 0) {
      if (projects.length) {
        const { highlights } = bodyToHighlights(e.body);
        projects[projects.length - 1].highlights.push(...highlights);
      }
      continue;
    }
    // A "Technologies: ..." line may have been absorbed into the header block.
    const techFromHeader = [];
    const headerParas = e.header.filter((p) => {
      const m = stripBullet(p.text).match(TECH_LABEL_RE);
      if (m) techFromHeader.push(...splitSkillList(stripBullet(p.text).slice(m[0].length)));
      return !m;
    });
    if (headerParas.length === 0) continue;
    const header = parseHeader(headerParas);
    header.keywords.push(...techFromHeader);
    const bodyParas = [];
    for (const p of e.body) {
      const text = stripBullet(p.text);
      const tech = text.match(TECH_LABEL_RE);
      if (tech) {
        header.keywords.push(...splitSkillList(text.slice(tech[0].length)));
      } else {
        bodyParas.push(p);
      }
    }
    const { highlights, summary } = bodyToHighlights(bodyParas);
    if (!header.name) continue;
    projects.push({
      name: header.name,
      description: header.description || summary,
      highlights,
      keywords: [...new Set(header.keywords)],
      startDate: header.startDate,
      endDate: header.endDate,
      url: header.url,
    });
  }
  return projects;
}
