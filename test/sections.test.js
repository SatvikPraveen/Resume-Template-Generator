import { test } from "node:test";
import assert from "node:assert/strict";
import { segmentSections, lookupHeading, scoreHeading } from "../src/segment/sections.js";
import { linesFromText, computeStats } from "../src/extract/layout.js";

function segment(text) {
  const lines = linesFromText(text);
  return segmentSections(lines, computeStats(lines));
}

test("lexicon maps heading variants to canonical ids", () => {
  assert.equal(lookupHeading("PROFESSIONAL EXPERIENCE").id, "experience");
  assert.equal(lookupHeading("Core Competencies").id, "skills");
  assert.equal(lookupHeading("Honors & Awards").id, "awards");
  assert.equal(lookupHeading("Leadership and Activities").id, "volunteer");
  assert.equal(lookupHeading("Hackathon Experience").id, "experience");
  assert.equal(lookupHeading("Hackathon Experience").exact, false);
  assert.equal(lookupHeading("Some random sentence here"), null);
});

test("plain-text headings split the document and inline headings keep their content", () => {
  const { sections, headerLines } = segment(`Sam Ortiz
sam@example.com

Summary: Product manager with a track record.

EXPERIENCE
Product Manager, Lakeshore Software — 2021 – Present
* Own the roadmap.

Skills: SQL, Figma, Jira
Certifications: Certified Scrum Product Owner (Scrum Alliance), 2020`);
  assert.equal(headerLines.length, 2);
  assert.deepEqual(sections.map((s) => s.id), ["summary", "experience", "skills", "certifications"]);
  assert.equal(sections[0].lines[0].text, "Product manager with a track record.");
  assert.equal(sections[2].lines[0].text, "SQL, Figma, Jira");
});

test("skill categories and project tech lists are not headings", () => {
  const stats = { bodySize: 1 };
  const langs = linesFromText("Programming Languages: C/C++, Java, Python")[0];
  assert.ok(scoreHeading(langs, stats).score < 3.4);
  const tech = linesFromText("Technologies: React Native, Firebase")[0];
  assert.ok(scoreHeading(tech, stats).score < 3.4);
  const humanLangs = linesFromText("Languages: English (native), French (B2)")[0];
  assert.ok(scoreHeading(humanLangs, stats).score >= 3.4);
  const bullet = linesFromText("• Experience with Kubernetes and Terraform")[0];
  assert.ok(scoreHeading(bullet, stats).score < 3.4);
});
