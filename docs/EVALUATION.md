# Evaluation

The parser is evaluated against a fixture corpus with a reproducible scorer.
CI fails when any fixture's score drops below the committed baseline, so
every heuristic change is measured rather than eyeballed.

```
npm test              # unit tests (node:test)
npm run eval          # score every fixture, write eval/results.json
npm run eval -- --verbose --only <fixture>   # print field-level mismatches
npm run eval:check    # exit 1 on regression against eval/baseline.json
npm run eval -- --update                     # accept the current scores as baseline
npm run fixtures:pdf  # regenerate the synthetic PDF fixtures with pdfkit
```

## Corpus

`eval/fixtures/<name>/` holds either `input.txt` (text-only path) or
`input.pdf` (layout-aware path) plus `expected.json`, a JSON Resume document
containing only the fields the fixture asserts.

| fixture              | path | what it exercises                                                                 |
| -------------------- | ---- | --------------------------------------------------------------------------------- |
| chronological-tech   | text | `Title \| Company <tab> dates`, bullets, GPA, `Name \| techs` projects, certs      |
| academic-cv          | text | education first, research/teaching experience, publications, awards, seasons      |
| europe-mm-yyyy       | text | `MM/YYYY` date-first entries, `Role, Company GmbH, City`, languages, interests    |
| career-changer       | text | `Role at Company (dates)`, objective, volunteer, `Degree, University, Year`       |
| student-minimal      | text | no experience, `Expected May 2026`, coursework, `Technologies:` under projects    |
| inline-headings      | text | `Skills: …` / `Certifications: …` inline sections, `Jan '21`, MBA vs MA           |
| pdf-classic-bold     | pdf  | bold headings, flush-right dates, vector-drawn bullets                            |
| pdf-caps-nobullet    | pdf  | same-size caps headings, indented paragraphs with no bullet glyphs                |
| pdf-two-column       | pdf  | sidebar + main column sharing baselines                                           |

All fixtures are fictional. The PDF fixtures are generated from specs in
`eval/make-pdf-fixtures.js`, so the expectation and the document cannot drift
apart. To add a real-world case, drop a PDF and an `expected.json` into a new
directory; the runner picks it up automatically. Please do not commit
resumes of real people.

## Metrics

Text comparisons are case-insensitive, punctuation-insensitive and
whitespace-normalised. Long free-text fields (summary, description) match at
token-F1 ≥ 0.85; everything else must match exactly after normalisation.

**basics** – precision/recall/F1 over the scalar contact fields (name, label,
email, phone, url, summary, city, region, postal code) and profile networks.
A predicted field that the fixture does not expect counts as a false positive
(except summary and url).

**entity sections** (work, volunteer, education, projects, certificates,
awards, publications, languages, interests) – expected and predicted entries
are aligned greedily on a key string (e.g. `position + organisation`) at
token-F1 ≥ 0.5. The section score blends

```
0.5 × entry-level F1  +  0.3 × field accuracy within matched entries  +  0.2 × list F1
```

where lists are highlights, courses or keywords, matched order-insensitively.

**skills** – keyword-level F1 over the flattened keyword sets (0.7) plus the
fraction of expected groups whose name exists and holds ≥ 80 % of its
keywords (0.3).

**overall** – the unweighted mean of the section scores present in the
expectation. `macroF1` in `results.json` is the mean over fixtures.

## Current baseline

See `eval/baseline.json` for the per-fixture numbers CI enforces. The
tolerance is 0.005 absolute.

## Interpreting a regression

Run the failing fixture with `--verbose`; each line names the section, the
entry key and the expected vs. predicted value. Most regressions come from
one of three places:

1. a heading score crossing the threshold (`scoreHeading` in
   `src/segment/sections.js`) – check `meta.sections` in the output;
2. a `continues` decision merging or splitting paragraphs
   (`guessContinues` in `src/extract/layout.js`);
3. a role/organisation lexicon gap (`src/parse/experience.js`).

## Limitations of the harness

The corpus is small and hand-written, so scores near 1.0 measure that the
rules cover these formats, not that they generalise. Treat the harness as a
regression net and a place to add every real-world failure you encounter as a
new fixture. Field-level errors inside matched entries are weighted lower than
missing entries, so a systematic date-format bug shows up as a modest drop
rather than a collapse; use `--verbose` to see it.
