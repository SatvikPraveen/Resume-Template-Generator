# Resume Template Generator

**A layout-aware resume parser that turns a PDF into a [JSON Resume](https://jsonresume.org/schema/) document and renders it in 12 templates. Runs entirely in the browser. Measured against a fixture corpus in CI.**

[![CI](https://github.com/SatvikPraveen/Resume-Template-Generator/actions/workflows/ci.yml/badge.svg)](https://github.com/SatvikPraveen/Resume-Template-Generator/actions/workflows/ci.yml)

> 🚀 **[Live demo](https://satvikpraveen.github.io/Resume-Template-Generator/)** — nothing you upload leaves your device.

---

## Why this exists

Most résumé parsers throw away the one thing a PDF reliably preserves: layout.
Bold headings, flush-right dates, indented bullets and a sidebar column are
signals a human uses instantly, yet a text-only parser sees a flat stream of
lines and guesses with regular expressions. This project keeps those signals.

The extraction stage reconstructs lines with typography (bold/italic from the
embedded fonts, font size), tab stops, indentation and column structure from
the raw pdf.js text runs. Section headings are scored from a lexicon *and*
their typography. Entries are segmented using soft-wrap detection that works
even when bullets are drawn as vector shapes and never appear in the text
layer. The result is validated against the JSON Resume schema and shipped
with per-section confidence and diagnostics.

Every heuristic is covered by an evaluation harness with fictional fixtures
in nine layout styles; CI fails when a score regresses.

## Features

- **PDF → JSON Resume v1.0.0** with ISO 8601 dates, profiles, highlights, GPA, coursework, certificates, awards, publications, languages and interests
- **Layout-aware extraction**: font weight/style, tab stops (`Title <tab> Jun 2020 – Present`), small-caps headings, two-column pages, bullet-less indented lists
- **Section segmentation** from ~200 heading phrases plus emphasis, size, caps, spacing and shape features; inline headings (`Skills: Go, SQL`) supported
- **Parser diagnostics**: confidence per section, detected headings with their canonical ids, human-readable warnings
- **Plain-text input** as an alternative to PDF (paste a résumé)
- **12 templates**: Classic, Modern, Creative, Tech, Executive, Compact, Minimal, Colorful, Dark, ATS-Friendly, Academic, Corporate; all HTML-escaped, all print-ready
- **Export** as standalone HTML, JSON Resume, or print/PDF
- **Reproducible evaluation**: `npm run eval` scores every fixture; `npm run eval:check` guards the baseline in CI
- **Zero runtime dependencies** beyond a vendored pdf.js; no build step, no backend, no tracking

## Quick start

```bash
git clone https://github.com/SatvikPraveen/Resume-Template-Generator.git
cd Resume-Template-Generator
npm run serve            # python3 -m http.server 8000
# open http://localhost:8000
```

Upload a text-based PDF (or paste text), click **Parse Resume**, inspect the
JSON and diagnostics, pick a template, export.

For development:

```bash
npm install              # dev dependencies only: pdfjs-dist (Node) and pdfkit (fixtures)
npm test                 # unit tests
npm run eval             # evaluation report + eval/results.json
npm run eval:check       # regression check against eval/baseline.json
```

## Evaluation

The corpus in `eval/fixtures/` holds nine fictional résumés: six plain-text
layouts (chronological, academic CV, European `MM/YYYY`, career changer,
student, inline headings) and three PDFs generated with pdfkit (bold headings
with vector bullets, caps headings without bullets, two-column sidebar). The
scorer aligns predicted and expected entries, then measures field accuracy
and highlight/keyword F1. Current baseline (`eval/baseline.json`):

| fixture            | path | overall |
| ------------------ | ---- | ------: |
| chronological-tech | text |    1.00 |
| academic-cv        | text |    1.00 |
| europe-mm-yyyy     | text |    1.00 |
| career-changer     | text |    1.00 |
| student-minimal    | text |    1.00 |
| inline-headings    | text |    1.00 |
| pdf-classic-bold   | pdf  |    1.00 |
| pdf-caps-nobullet  | pdf  |    1.00 |
| pdf-two-column     | pdf  |    1.00 |

A perfect score on a small hand-written corpus means the rules cover these
formats, not that they generalise; the harness is a regression net. Every
real-world failure should become a new fixture. Metrics, fixture design and
how to read a regression are documented in [docs/EVALUATION.md](docs/EVALUATION.md).

## Architecture

```
PDF ─▶ extract/layout.js ─▶ segment/sections.js ─▶ parse/*.js ─▶ schema/json-resume.js ─▶ render/model.js ─▶ templates.js
        runs → lines with      lines → labelled       sections →      JSON Resume +          escaped view     12 designs
        typography, tabs,      sections (lexicon +    entries →       validation +           model, dates
        columns, soft wraps    typography scoring)    fields          diagnostics            formatted
```

Each stage is a pure ES module with no DOM access, so the same code runs in
the browser and in Node:

```js
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractDocument } from "./src/extract/pdf.js";
import { parseLines, parseText } from "./src/pipeline.js";

const doc = await extractDocument(pdfjs, new Uint8Array(await fs.readFile("resume.pdf")));
const resume = parseLines(doc.lines, doc.stats);   // layout-aware
const other = parseText(plainText);                  // text-only
```

The design rationale, feature definitions, scoring tables and known
limitations are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Output

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json",
  "basics": {
    "name": "Maya Chen",
    "label": "Senior Software Engineer",
    "email": "maya.chen@example.com",
    "location": { "city": "San Francisco", "region": "CA" },
    "profiles": [{ "network": "GitHub", "username": "mayachen", "url": "https://github.com/mayachen" }],
    "summary": "Backend engineer with 7 years of experience …"
  },
  "work": [
    {
      "name": "Northwind Cloud",
      "position": "Senior Software Engineer",
      "location": "San Francisco, CA",
      "startDate": "2021-03",
      "highlights": ["Designed a multi-region event pipeline …", "Cut p99 latency …"]
    }
  ],
  "education": [{ "institution": "University of Washington", "studyType": "Bachelor's", "area": "Computer Science", "score": "3.8/4.0", "startDate": "2012-09", "endDate": "2016-06" }],
  "skills": [{ "name": "Languages", "keywords": ["Go", "Python", "TypeScript", "SQL"] }],
  "meta": {
    "parser": "4.0.0",
    "sections": [{ "id": "experience", "title": "EXPERIENCE", "lines": 12 }],
    "confidence": { "basics": 0.9, "work": 1, "education": 1, "skills": 1, "projects": 1 },
    "warnings": []
  }
}
```

## Repository layout

```
index.html, app.js, styles.css   UI (ES module entry point)
templates.js                     12 render templates
src/
  extract/   layout.js (runs → annotated lines), pdf.js (pdf.js wrapper)
  segment/   sections.js (heading scoring, lexicon)
  parse/     dates, contact, entries, experience, education, skills, projects, certifications, text utils
  schema/    json-resume.js (assembly + validator)
  render/    model.js (template view model, escaping, date formatting)
  pipeline.js
eval/        run.js (scorer), fixtures/, baseline.json, make-pdf-fixtures.js
test/        node:test unit tests
docs/        ARCHITECTURE.md, EVALUATION.md, archive/ (historical notes)
vendor/      pdf.js (pdf.mjs, pdf.worker.mjs)
```

`src/parsers/`, `src/core/`, `app-versions/`, `debug-files/` and `tests/`
are the previous generation of the parser and its ad-hoc scripts. They are no
longer loaded by the app and are kept only until the cleanup is agreed; do
not build on them.

## Limitations

- Scanned PDFs have no text layer; the app says so instead of guessing (OCR is out of scope).
- Three or more columns and tabular layouts may interleave.
- Organisation vs. position depends on lexicons and layout conventions; unusual orderings without any role keyword can swap them.
- Headings are English only.

## Privacy

All processing happens in the browser. There is no server, no analytics and
no network access at runtime besides loading the page itself. Please do not
commit real résumés to this repository; the evaluation fixtures are fictional
by design.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The most valuable contribution is a
new fixture for a layout the parser gets wrong: add `input.txt` or
`input.pdf` plus `expected.json` under `eval/fixtures/<name>/`, run
`npm run eval -- --verbose --only <name>`, fix, and update the baseline.

## License

MIT — see [LICENSE](LICENSE).

## Acknowledgments

Built with [PDF.js](https://mozilla.github.io/pdf.js/) by Mozilla. Output
follows the [JSON Resume](https://jsonresume.org/) schema.
