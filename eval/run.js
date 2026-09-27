#!/usr/bin/env node
/**
 * Evaluation harness.
 *
 * For every directory under eval/fixtures/ containing an `expected.json`
 * and an `input.txt` (plain text) or `input.pdf` (layout-aware path), run the
 * parser and score the output against the expectation:
 *
 *   basics     precision / recall / F1 over the scalar contact fields
 *   entities   entry-level P/R/F1 after greedy alignment on a key string,
 *              then field accuracy and highlight P/R inside matched entries
 *   skills     keyword-level P/R/F1 (order-insensitive)
 *
 * Usage:
 *   node eval/run.js                 print a report, write eval/results.json
 *   node eval/run.js --check         exit 1 if any fixture regresses vs baseline
 *   node eval/run.js --update        rewrite eval/baseline.json from this run
 *   node eval/run.js --only <name>   run a single fixture
 *   node eval/run.js --verbose       print field-level mismatches
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseText, parseLines } from "../src/pipeline.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "fixtures");
const RESULTS = path.join(__dirname, "results.json");
const BASELINE = path.join(__dirname, "baseline.json");
const TOLERANCE = 0.005;

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

// ---------- text similarity ----------
export function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/(?<!\d)\.(?!\d)/g, " ")
    .replace(/[^a-z0-9+#./&-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s) {
  return norm(s).split(" ").filter(Boolean);
}

export function tokenF1(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length && !tb.length) return 1;
  if (!ta.length || !tb.length) return 0;
  const counts = new Map();
  for (const t of ta) counts.set(t, (counts.get(t) || 0) + 1);
  let overlap = 0;
  for (const t of tb) {
    const c = counts.get(t) || 0;
    if (c > 0) {
      overlap++;
      counts.set(t, c - 1);
    }
  }
  if (!overlap) return 0;
  const p = overlap / tb.length;
  const r = overlap / ta.length;
  return (2 * p * r) / (p + r);
}

function fieldEqual(expected, predicted, fuzzy = false) {
  if (Array.isArray(expected)) return listMatch(expected, predicted || []).f1 >= 0.999;
  if (typeof expected === "object" && expected) {
    return Object.keys(expected).every((k) => fieldEqual(expected[k], predicted?.[k], fuzzy));
  }
  if (fuzzy) return tokenF1(expected, predicted) >= 0.85;
  return norm(expected) === norm(predicted);
}

function prf(tp, fp, fn) {
  const p = tp + fp ? tp / (tp + fp) : tp === 0 && fn === 0 ? 1 : 0;
  const r = tp + fn ? tp / (tp + fn) : tp === 0 && fp === 0 ? 1 : 0;
  const f1 = p + r ? (2 * p * r) / (p + r) : 0;
  return { p: round(p), r: round(r), f1: round(f1), tp, fp, fn };
}

function round(x) {
  return Math.round(x * 1000) / 1000;
}

/** Match two string lists (order-insensitive, fuzzy). */
function listMatch(expected, predicted, threshold = 0.85) {
  const used = new Set();
  let tp = 0;
  for (const e of expected) {
    let best = -1;
    let bestScore = 0;
    predicted.forEach((p, i) => {
      if (used.has(i)) return;
      const s = tokenF1(e, p);
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    });
    if (best >= 0 && bestScore >= threshold) {
      used.add(best);
      tp++;
    }
  }
  return prf(tp, predicted.length - tp, expected.length - tp);
}

// ---------- section scoring ----------
const BASIC_FIELDS = ["name", "label", "email", "phone", "url", "summary", "location.city", "location.region", "location.postalCode"];
const FUZZY_FIELDS = new Set(["summary", "description"]);

function get(obj, dotted) {
  return dotted.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function scoreBasics(expected = {}, predicted = {}, log) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const f of BASIC_FIELDS) {
    const e = get(expected, f);
    const p = get(predicted, f);
    if (e && p) {
      if (fieldEqual(e, p, FUZZY_FIELDS.has(f))) tp++;
      else {
        fn++;
        fp++;
        log(`basics.${f}: expected ${JSON.stringify(e)} got ${JSON.stringify(p)}`);
      }
    } else if (e && !p) {
      fn++;
      log(`basics.${f}: missing (expected ${JSON.stringify(e)})`);
    } else if (!e && p && f !== "summary" && f !== "url") {
      fp++;
      log(`basics.${f}: unexpected ${JSON.stringify(p)}`);
    }
  }
  const profiles = listMatch(
    (expected.profiles || []).map((p) => p.network),
    (predicted.profiles || []).map((p) => p.network),
    0.99,
  );
  tp += profiles.tp;
  fp += profiles.fp;
  fn += profiles.fn;
  return prf(tp, fp, fn);
}

const ENTITY_SECTIONS = {
  work: { key: (e) => `${e.position} ${e.name}`, fields: ["name", "position", "location", "startDate", "endDate", "summary"], list: "highlights" },
  volunteer: { key: (e) => `${e.position} ${e.organization}`, fields: ["organization", "position", "startDate", "endDate"], list: "highlights" },
  education: { key: (e) => `${e.institution} ${e.studyType} ${e.area}`, fields: ["institution", "studyType", "area", "startDate", "endDate", "score", "location"], list: "courses" },
  projects: { key: (e) => e.name, fields: ["name", "description", "startDate", "endDate", "url"], list: "highlights", list2: "keywords" },
  certificates: { key: (e) => e.name, fields: ["name", "issuer", "date"] },
  awards: { key: (e) => e.title, fields: ["title", "awarder", "date"] },
  publications: { key: (e) => e.name, fields: ["name", "publisher", "releaseDate"] },
  languages: { key: (e) => e.language, fields: ["language", "fluency"] },
  interests: { key: (e) => e.name, fields: ["name"] },
};

function scoreEntities(section, expected = [], predicted = [], log) {
  const spec = ENTITY_SECTIONS[section];
  const used = new Set();
  const pairs = [];
  for (const e of expected) {
    let best = -1;
    let bestScore = 0;
    predicted.forEach((p, i) => {
      if (used.has(i)) return;
      const s = tokenF1(spec.key(e), spec.key(p));
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    });
    if (best >= 0 && bestScore >= 0.5) {
      used.add(best);
      pairs.push([e, predicted[best]]);
    } else {
      log(`${section}: no match for expected entry ${JSON.stringify(spec.key(e))}`);
    }
  }
  predicted.forEach((p, i) => {
    if (!used.has(i)) log(`${section}: unexpected entry ${JSON.stringify(spec.key(p))}`);
  });
  const entries = prf(pairs.length, predicted.length - pairs.length, expected.length - pairs.length);

  let fieldTp = 0;
  let fieldTotal = 0;
  let listTp = 0;
  let listFp = 0;
  let listFn = 0;
  for (const [e, p] of pairs) {
    for (const f of spec.fields) {
      const ev = e[f];
      const pv = p[f];
      if (ev == null || ev === "") {
        if (pv && f !== "summary" && f !== "description") {
          fieldTotal++;
          log(`${section}[${norm(spec.key(e))}].${f}: unexpected ${JSON.stringify(pv)}`);
        }
        continue;
      }
      fieldTotal++;
      if (fieldEqual(ev, pv, FUZZY_FIELDS.has(f))) fieldTp++;
      else log(`${section}[${norm(spec.key(e))}].${f}: expected ${JSON.stringify(ev)} got ${JSON.stringify(pv)}`);
    }
    for (const listName of [spec.list, spec.list2].filter(Boolean)) {
      const el = e[listName];
      if (!el) continue;
      const m = listMatch(el, p[listName] || []);
      listTp += m.tp;
      listFp += m.fp;
      listFn += m.fn;
      if (m.fn || m.fp) log(`${section}[${norm(spec.key(e))}].${listName}: expected ${JSON.stringify(el)} got ${JSON.stringify(p[listName] || [])}`);
    }
  }
  const fields = fieldTotal ? round(fieldTp / fieldTotal) : 1;
  const lists = prf(listTp, listFp, listFn);
  // Section score blends entry alignment, field accuracy and list recall.
  const f1 = round(0.5 * entries.f1 + 0.3 * fields + 0.2 * lists.f1);
  return { entries, fields, lists, f1 };
}

function scoreSkills(expected = [], predicted = [], log) {
  const ek = expected.flatMap((g) => g.keywords || []);
  const pk = predicted.flatMap((g) => g.keywords || []);
  const kw = listMatch(ek, pk, 0.99);
  if (kw.fn || kw.fp) log(`skills.keywords: expected ${JSON.stringify(ek)} got ${JSON.stringify(pk)}`);
  let groupsOk = 0;
  for (const g of expected) {
    const pg = predicted.find((x) => norm(x.name) === norm(g.name));
    if (pg && listMatch(g.keywords, pg.keywords, 0.99).r >= 0.8) groupsOk++;
    else log(`skills.group "${g.name}": ${pg ? "incomplete" : "missing"}`);
  }
  const groups = expected.length ? round(groupsOk / expected.length) : 1;
  return { keywords: kw, groups, f1: round(0.7 * kw.f1 + 0.3 * groups) };
}

export function scoreResume(expected, predicted, verbose = false) {
  const logs = [];
  const log = (m) => logs.push(m);
  const scores = { basics: scoreBasics(expected.basics, predicted.basics, log) };
  for (const section of Object.keys(ENTITY_SECTIONS)) {
    if (expected[section] || (predicted[section] && predicted[section].length)) {
      scores[section] = scoreEntities(section, expected[section] || [], predicted[section] || [], log);
    }
  }
  if (expected.skills || (predicted.skills && predicted.skills.length)) {
    scores.skills = scoreSkills(expected.skills || [], predicted.skills || [], log);
  }
  const f1s = Object.values(scores).map((s) => s.f1);
  const overall = round(f1s.reduce((a, b) => a + b, 0) / f1s.length);
  return { overall, scores, logs: verbose ? logs : logs.slice(0, 0), issueCount: logs.length, allLogs: logs };
}

// ---------- fixture loading ----------
async function loadPdfParser() {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const { extractDocument } = await import("../src/extract/pdf.js");
    return async (file) => {
      const data = new Uint8Array(fs.readFileSync(file));
      const doc = await extractDocument(pdfjs, data);
      return parseLines(doc.lines, doc.stats, { meta: { source: path.basename(file) } });
    };
  } catch {
    return null;
  }
}

async function main() {
  const only = opt("--only");
  const verbose = flag("--verbose");
  const dirs = fs
    .readdirSync(FIXTURES)
    .filter((d) => fs.existsSync(path.join(FIXTURES, d, "expected.json")))
    .filter((d) => !only || d === only)
    .sort();
  const parsePdf = await loadPdfParser();
  const results = {};
  const rows = [];
  for (const d of dirs) {
    const dir = path.join(FIXTURES, d);
    const expected = JSON.parse(fs.readFileSync(path.join(dir, "expected.json"), "utf8"));
    let predicted;
    let mode;
    if (fs.existsSync(path.join(dir, "input.pdf"))) {
      if (!parsePdf) {
        console.warn(`skip ${d}: pdfjs-dist not installed (npm install)`);
        continue;
      }
      predicted = await parsePdf(path.join(dir, "input.pdf"));
      mode = "pdf";
    } else {
      predicted = parseText(fs.readFileSync(path.join(dir, "input.txt"), "utf8"));
      mode = "text";
    }
    const r = scoreResume(expected, predicted, verbose);
    results[d] = { mode, overall: r.overall, sections: Object.fromEntries(Object.entries(r.scores).map(([k, v]) => [k, v.f1])), issues: r.issueCount };
    rows.push([d, mode, r.overall, r.scores]);
    if (verbose && r.allLogs.length) {
      console.log(`\n--- ${d} (${r.allLogs.length} issues)`);
      for (const m of r.allLogs) console.log("  " + m);
    }
    if (flag("--dump")) fs.writeFileSync(path.join(dir, "actual.json"), JSON.stringify(predicted, null, 2));
  }

  // Report
  const sections = ["basics", "work", "education", "skills", "projects", "volunteer", "certificates", "awards", "publications", "languages", "interests"];
  const header = ["fixture".padEnd(22), "mode", "overall", ...sections.map((s) => s.slice(0, 8).padStart(8))].join(" ");
  console.log("\n" + header);
  console.log("-".repeat(header.length));
  for (const [name, mode, overall, scores] of rows) {
    const cells = sections.map((s) => (scores[s] ? scores[s].f1.toFixed(2) : "-").padStart(8));
    console.log([name.padEnd(22), mode.padEnd(4), overall.toFixed(3).padStart(7), ...cells].join(" "));
  }
  const macro = rows.length ? round(rows.reduce((a, r) => a + r[2], 0) / rows.length) : 0;
  const summary = { macroF1: macro, fixtures: results, generatedAt: new Date().toISOString() };
  console.log("-".repeat(header.length));
  console.log(`macro overall: ${macro.toFixed(3)} over ${rows.length} fixtures`);
  fs.writeFileSync(RESULTS, JSON.stringify(summary, null, 2));

  if (flag("--update")) {
    fs.writeFileSync(BASELINE, JSON.stringify({ macroF1: macro, fixtures: Object.fromEntries(rows.map((r) => [r[0], r[2]])) }, null, 2));
    console.log(`baseline written to ${path.relative(process.cwd(), BASELINE)}`);
  }
  if (flag("--check")) {
    if (!fs.existsSync(BASELINE)) {
      console.error("no baseline found; run with --update first");
      process.exit(2);
    }
    const baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
    const regressions = [];
    for (const [name, , overall] of rows) {
      const b = baseline.fixtures[name];
      if (b != null && overall + TOLERANCE < b) regressions.push(`${name}: ${overall.toFixed(3)} < baseline ${b.toFixed(3)}`);
    }
    for (const name of Object.keys(baseline.fixtures)) {
      if (!results[name] && !only) regressions.push(`${name}: fixture missing from run`);
    }
    if (regressions.length) {
      console.error("\nREGRESSIONS:\n  " + regressions.join("\n  "));
      process.exit(1);
    }
    console.log("no regressions against baseline");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
