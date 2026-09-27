import { test } from "node:test";
import assert from "node:assert/strict";
import { extractEmail, extractPhone, extractUrls, classifyUrls, extractLocation, extractBasics } from "../src/parse/contact.js";
import { linesFromText } from "../src/extract/layout.js";

test("email, phone and URL extraction", () => {
  const text = "Jane Doe | jane.doe@example.com | +41 44 555 12 34 | linkedin.com/in/janedoe | https://jane.dev";
  assert.equal(extractEmail(text), "jane.doe@example.com");
  assert.equal(extractPhone(text), "+41 44 555 12 34");
  assert.equal(extractPhone("(415) 555-0142"), "(415) 555-0142");
  assert.equal(extractPhone("Worked 2016 - 2020 on 12345 records"), "", "date ranges are not phone numbers");
  const { profiles, url } = classifyUrls(extractUrls(text));
  assert.equal(profiles[0].network, "LinkedIn");
  assert.equal(profiles[0].username, "janedoe");
  assert.equal(url, "https://jane.dev");
});

test("location extraction validates the region and skips prose", () => {
  assert.deepEqual(extractLocation("Austin, TX 78701"), { city: "Austin", region: "TX", postalCode: "78701" });
  assert.equal(extractLocation("Skilled in Java, Python, cloud platforms"), null);
  assert.deepEqual(extractLocation("Massachusetts Institute of Technology, Cambridge, MA"), { city: "Cambridge", region: "MA", postalCode: "" });
  assert.equal(extractLocation("Postdoctoral Researcher, MIT CSAIL", { strict: false }), null);
  assert.equal(extractLocation("Zurich, Switzerland").region, "Switzerland");
});

test("basics: name, label, summary from a header block", () => {
  const lines = linesFromText(`Maya Chen
Senior Software Engineer
maya.chen@example.com | (415) 555-0142 | San Francisco, CA
Backend engineer with 7 years of experience building distributed systems and developer platforms for growing companies.`);
  const b = extractBasics(lines, lines.map((l) => l.text).join("\n"));
  assert.equal(b.name, "Maya Chen");
  assert.equal(b.label, "Senior Software Engineer");
  assert.equal(b.email, "maya.chen@example.com");
  assert.equal(b.location.city, "San Francisco");
  assert.match(b.summary, /^Backend engineer/);
});

test("basics: CURRICULUM VITAE is not a headline", () => {
  const lines = linesFromText("CURRICULUM VITAE\n\nLukas Meier\nData Analyst\nlukas@example.ch");
  const b = extractBasics(lines, "");
  assert.equal(b.name, "Lukas Meier");
  assert.equal(b.label, "Data Analyst");
});
