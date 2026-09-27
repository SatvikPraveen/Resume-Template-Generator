# Architecture

This document describes how a PDF becomes a JSON Resume document and why the
pipeline is structured the way it is. The design goal is a parser whose
behaviour can be *measured* (see `EVALUATION.md`) and *explained*: every
decision is a scored rule over explicit features, and each stage is a pure
function that runs identically in the browser and in Node.

```
PDF bytes
  │  pdf.js getTextContent()  +  font names via getOperatorList()
  ▼
[1] extract/layout.js      positioned runs ─▶ lines with typographic features
  ▼
[2] segment/sections.js    lines ─▶ labelled sections (experience, education, …)
  ▼
[3] parse/*.js             sections ─▶ entries ─▶ fields (dates, orgs, degrees, …)
  ▼
[4] schema/json-resume.js  ─▶ JSON Resume v1 document + validation + diagnostics
  ▼
[5] render/model.js        ─▶ escaped template model ─▶ templates.js (12 designs)
```

## 1. Layout reconstruction (`src/extract/layout.js`)

pdf.js returns a bag of *text runs* per page: a string, an affine transform
(giving x, y and font size), a width and an opaque font id. Three things are
recovered from this before any text is interpreted:

**Typography.** After `page.getOperatorList()` the embedded font objects are
resolved and their PostScript names (`Cambria,Bold`, `Helvetica-Oblique`)
give per-run bold/italic flags. When names are unavailable, a run set in a
*minority* font at body size on a short line is treated as emphasised.

**Lines and tab stops.** Runs are clustered by baseline with a tolerance of
0.4 em, then joined left to right. A horizontal gap wider than 2.2 em, or a
single space glyph stretched across such a gap (how Word exports tab stops),
becomes a `\t` in the line text. This is what lets
`DePaul University<TAB>Sep 2023 – Jun 2025` be split into an institution and
a date range without regular expressions guessing where the title ends.
Small-caps headings that pdf.js emits as `E DUCATION` are stitched back.

**Columns.** A vertical band that fewer than 3 % of runs cross, with at
least 20 % of runs on each side and an aligned left edge on the right, is a
gutter. Column detection runs on raw runs, before lines are formed, because a
sidebar and the main column share baselines. Each column is then read
top-to-bottom; full-width lines (the name header) flush pending column text.

Each line is annotated with relative features used downstream:

| feature      | meaning                                                                 |
| ------------ | ----------------------------------------------------------------------- |
| `emph`       | bold, or set in a minority font                                         |
| `larger`     | font size ≥ 1.12 × body size                                            |
| `gapAbove`   | vertical distance to the previous line in body-line units              |
| `indent`     | x offset from the dominant left margin                                  |
| `bullet`     | starts with a bullet glyph                                              |
| `tabGap`     | contains a tab stop                                                     |
| `continues`  | best guess that the line is a soft wrap of the previous one            |

`continues` is the most consequential flag. Bullets in many PDFs are drawn as
vector shapes and are absent from the text layer, so a wrapped line and a new
bullet look identical as text. The rule uses geometry first: a hanging indent
of up to 0.75 em continues; a larger indent starts a nested block; an outdent
starts a new item; at equal indent, the line continues only if the first word
would not have fit on the previous line *and* the previous line did not end a
sentence. Lines containing a tab stop or ending in a date are complete by
construction.

## 2. Section segmentation (`src/segment/sections.js`)

Every line is scored as a heading candidate. Evidence is additive:

| evidence                                              | score |
| ----------------------------------------------------- | ----: |
| exact lexicon phrase (≈ 200 phrases → 14 section ids) | +3.0  |
| lexicon keyword suffix ("Hackathon *Experience*")     | +2.0  |
| emphasised / larger                                    | +1.2 each |
| all caps and ≤ 5 words                                 | +1.0  |
| ≤ 3 words / ≤ 5 words                                  | +0.6 / +0.3 |
| preceded by vertical whitespace                        | +0.6  |
| flush with the margin (PDF input)                      | +0.4  |
| bullet, contains a date / e-mail / URL                 | −3.0 each |
| more than 6 words                                      | −2.0  |
| unknown phrase without typographic evidence            | −1.5  |

A line becomes a heading at 3.4 (4.2 for phrases outside the lexicon), so an
unknown bold-caps line still splits the document (into an `other` section
that is reported as a warning), while "Experience with Kubernetes" inside a
bullet never does. Inline headings (`Skills: Go, SQL`) keep their content as
the first line of the section. Two guards handle the common false positives:
`Programming Languages: C, Java` (suffix match with a list after the colon)
and `Technologies: React, Firebase` under a project (generic phrase with
inline content) are demoted; `Languages:` is a human-language section only
when the content contains no programming language names.

## 3. Entity parsing (`src/parse/`)

**Entries.** Within a section, lines collapse into paragraphs using
`continues`; paragraphs group into entries consisting of a header block (up
to three short, non-bullet lines) and body paragraphs. A paragraph starts a
new entry when it is emphasised, carries a date range, or is short and
title-like after body text or a vertical gap. Two consecutive header lines
that both carry dates are two entries (`Certificate …, 2023` / `B.S. …, 2015`).

**Dates** (`dates.js`) recognise month names with abbreviations and periods,
seasons, `MM/YYYY`, ISO partials, bare years, two-digit years (`Apr 21`,
`Jan '21`) and present markers, with a plausibility window on years. Output
is ISO 8601 partial dates as required by JSON Resume.

**Experience** splits each header line on strong separators (tab, `|`, `•`,
em dash, spaced hyphen, " at ") and classifies pieces with a role lexicon
(engineer, analyst, intern, …) and an organisation lexicon (Inc, GmbH,
University, Labs, …). Ties are broken by typography and by the conventional
line order; `Role, Organisation, City` lists are split on commas outside
parentheses.

**Education** finds the institution by keyword (university, college,
institute, école, …) or by emphasis, the degree by an ordered pattern list
(so `MBA` is not read as `MA`), the field after `in/of`, GPA/honours, and
`Relevant Coursework` lists.

**Skills** treat `Category: a, b, c` lines as named groups, attach wrapped
continuation lines to the previous group, split outside parentheses so
`AWS (EMR, S3)` stays whole, and keep `C/C++` and `HTML/CSS` intact.

**Projects, certifications, awards, publications, languages** follow the same
entry model with lighter field extraction.

**Contact** extracts the name as the most prominent name-like header line,
validates locations against state and country lists, and treats an
unlabelled header paragraph of ≥ 8 words as the summary.

## 4. Schema and diagnostics (`src/schema/json-resume.js`, `src/pipeline.js`)

The output follows [JSON Resume v1.0.0](https://jsonresume.org/schema/) with
two additions used by themes in practice: `education[].location` and
`meta.confidence`. Empty fields are omitted. A structural validator checks
date formats and array shapes; problems are appended to `meta.warnings`
rather than thrown so a user always gets a document.

`meta` carries the parser version, the detected headings with their canonical
ids, per-section confidence in [0, 1] (heading found, dates present,
organisation and position both present, …) and human-readable warnings such
as "Unrecognised section 'Hackathons' was skipped". The UI renders these so a
user knows which sections to double-check.

## 5. Rendering (`src/render/model.js`, `templates.js`)

Templates consume a flat view model. The adapter HTML-escapes every string,
pre-formats dates (`2020-06` → `Jun 2020`, current roles → `Present`) and maps
JSON Resume names (`work[].name`, `certificates`) onto the template fields
(`company`, `certifications`). Work and project bodies render as a prose
paragraph plus a highlight list.

## Running outside the browser

Everything under `src/` is plain ES modules with no DOM access. In Node the
extraction step uses `pdfjs-dist/legacy/build/pdf.mjs`:

```js
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractDocument } from "./src/extract/pdf.js";
import { parseLines, parseText } from "./src/pipeline.js";

const doc = await extractDocument(pdfjs, new Uint8Array(await fs.readFile("resume.pdf")));
const resume = parseLines(doc.lines, doc.stats);     // layout-aware
const fromText = parseText("Jane Doe\nEXPERIENCE\n..."); // text-only
```

## Known limitations

- Scanned PDFs have no text layer; the app reports this instead of guessing.
  OCR is out of scope.
- Three or more columns and tables are read column-pair by column-pair and
  may interleave.
- Header/footer repetition across pages is not removed.
- Organisation vs. position classification relies on lexicons and layout
  conventions; a bold organisation followed by an italic title without any
  role keyword can be swapped.
- Non-English headings are not in the lexicon.
