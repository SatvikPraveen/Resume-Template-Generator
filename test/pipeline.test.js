import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseText } from "../src/pipeline.js";
import { validateJsonResume } from "../src/schema/json-resume.js";
import { parseSkills } from "../src/parse/skills.js";
import { linesFromText } from "../src/extract/layout.js";
import { toTemplateModel } from "../src/render/model.js";
import { renderTemplate, TEMPLATE_NAMES } from "../templates.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => fs.readFileSync(path.join(here, "..", "eval", "fixtures", name, "input.txt"), "utf8");

test("parseText produces a valid JSON Resume for a chronological resume", () => {
  const resume = parseText(fixture("chronological-tech"));
  assert.deepEqual(validateJsonResume(resume), []);
  assert.equal(resume.basics.name, "Maya Chen");
  assert.equal(resume.work.length, 3);
  assert.equal(resume.work[0].name, "Northwind Cloud");
  assert.equal(resume.work[0].position, "Senior Software Engineer");
  assert.equal(resume.work[0].startDate, "2021-03");
  assert.equal(resume.work[0].endDate, undefined, "current role has no end date");
  assert.equal(resume.work[0].highlights.length, 3);
  assert.equal(resume.education[0].studyType, "Bachelor's");
  assert.equal(resume.education[0].area, "Computer Science");
  assert.equal(resume.education[0].score, "3.8/4.0");
  assert.equal(resume.projects.length, 2);
  assert.equal(resume.certificates[1].issuer, "CNCF");
  assert.ok(resume.meta.confidence.work >= 0.9);
});

test("empty or noisy input degrades gracefully", () => {
  const resume = parseText("");
  assert.deepEqual(validateJsonResume(resume), []);
  assert.ok(resume.meta.warnings.length > 0);
  const noisy = parseText("lorem ipsum dolor sit amet\n1234 5678\n!!! ???");
  assert.deepEqual(validateJsonResume(noisy), []);
});

test("skills keep parenthesised groups and compound tokens intact", () => {
  const groups = parseSkills(linesFromText("Tools: Git, Docker, AWS (EMR, S3, Athena), GCP\nLanguages: C/C++, Java, and SQL"));
  assert.deepEqual(groups[0].keywords, ["Git", "Docker", "AWS (EMR, S3, Athena)", "GCP"]);
  assert.deepEqual(groups[1].keywords, ["C/C++", "Java", "SQL"]);
});

test("every template renders parsed output without Invalid Date and with escaping", () => {
  const resume = parseText(fixture("chronological-tech"));
  resume.basics.name = 'Maya <script>alert("x")</script> Chen';
  const model = toTemplateModel(resume);
  for (const name of TEMPLATE_NAMES) {
    const { html, css } = renderTemplate(name, model);
    assert.ok(html.length > 500, `${name} renders`);
    assert.ok(!html.includes("Invalid Date"), `${name} has no Invalid Date`);
    assert.ok(!html.includes("<script>alert"), `${name} escapes HTML`);
    assert.ok(html.includes("&lt;script&gt;"), `${name} shows the escaped text`);
    assert.ok(html.includes("Present"), `${name} shows current roles as Present`);
    assert.ok(css.includes("rtg-highlights"), `${name} includes shared CSS`);
  }
});
