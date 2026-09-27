#!/usr/bin/env node
/**
 * Generate synthetic PDF fixtures with pdfkit.
 *
 * Each spec below describes a fictional resume and a *layout style*. The
 * script renders the PDF and writes the matching expected.json, so the
 * layout-aware extraction path (fonts, tab stops, bullets drawn as vector
 * shapes, two-column pages) is exercised in CI without shipping anyone's
 * real resume.
 *
 *   npm run fixtures:pdf
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "fixtures");

const SPECS = [
  {
    name: "pdf-classic-bold",
    style: "classic",
    basics: {
      name: "Elena Vasquez",
      label: "Data Engineer",
      email: "elena.vasquez@example.com",
      phone: "(303) 555-0188",
      location: { city: "Denver", region: "CO" },
      profiles: [{ network: "GitHub", url: "https://github.com/elenav" }],
      summary: "Data engineer specialising in streaming pipelines and lakehouse architectures for retail analytics.",
    },
    work: [
      {
        name: "Summit Retail Group",
        position: "Senior Data Engineer",
        location: "Denver, CO",
        startDate: "2021-04",
        highlights: [
          "Migrated 30 batch jobs to a Spark Structured Streaming platform, cutting data latency from 6 hours to 5 minutes.",
          "Designed the medallion lakehouse on Delta Lake used by 40 analysts.",
        ],
      },
      {
        name: "Boulder Insights LLC",
        position: "Data Engineer",
        location: "Boulder, CO",
        startDate: "2018-07",
        endDate: "2021-03",
        highlights: ["Built dbt models and Airflow DAGs powering the executive KPI dashboard."],
      },
    ],
    education: [
      { institution: "Colorado State University", studyType: "Bachelor's", area: "Computer Science", startDate: "2014-08", endDate: "2018-05", location: "Fort Collins, CO" },
    ],
    skills: [
      { name: "Languages", keywords: ["Python", "SQL", "Scala"] },
      { name: "Platforms", keywords: ["Spark", "Airflow", "dbt", "Snowflake", "AWS (S3, Glue, EMR)"] },
    ],
    projects: [
      { name: "Open Lakehouse Benchmark", keywords: ["Spark", "Delta Lake"], highlights: ["Reproducible benchmark comparing table formats on 1 TB of synthetic retail data."] },
    ],
    certificates: [{ name: "Databricks Certified Data Engineer Professional", date: "2023" }],
  },
  {
    name: "pdf-two-column",
    style: "twocol",
    basics: {
      name: "Rahul Menon",
      label: "UX Designer",
      email: "rahul.menon@example.in",
      phone: "+91 98765 43210",
      location: { city: "Bengaluru", region: "India" },
      summary: "Designer with six years shaping mobile banking experiences used by millions of customers.",
    },
    work: [
      {
        name: "Nimbus Fintech",
        position: "Lead UX Designer",
        startDate: "2020-02",
        highlights: ["Led the redesign of the payments flow, lifting completion rate by 22%.", "Built and maintained the design system across iOS, Android and web."],
      },
      {
        name: "Pixelworks Studio",
        position: "UX Designer",
        startDate: "2017-06",
        endDate: "2020-01",
        highlights: ["Ran usability studies with 150+ participants for retail clients."],
      },
    ],
    education: [{ institution: "National Institute of Design", studyType: "Master's", area: "Interaction Design", startDate: "2015", endDate: "2017" }],
    skills: [{ name: "Skills", keywords: ["Figma", "Prototyping", "User Research", "Design Systems", "Accessibility"] }],
    languages: [
      { language: "English", fluency: "fluent" },
      { language: "Hindi", fluency: "native" },
      { language: "Malayalam", fluency: "native" },
    ],
  },
  {
    name: "pdf-caps-nobullet",
    style: "caps",
    basics: {
      name: "Grace Whitfield",
      email: "grace.w@example.co.uk",
      phone: "+44 20 7946 0958",
      location: { city: "London", region: "United Kingdom" },
      summary: "Chartered accountant moving into financial data analysis, with a record of automating month-end reporting.",
    },
    work: [
      {
        name: "Thames & Co",
        position: "Senior Accountant",
        startDate: "2019-09",
        endDate: "2024-06",
        highlights: ["Automated consolidation workbooks with Python, saving three days each month.", "Supervised a team of four during two statutory audits."],
      },
      {
        name: "Riverside Audit LLP",
        position: "Audit Associate",
        startDate: "2016-09",
        endDate: "2019-08",
        highlights: ["Performed substantive testing for FTSE 250 clients."],
      },
    ],
    education: [
      { institution: "University of Manchester", studyType: "Bachelor's", area: "Accounting and Finance", startDate: "2013", endDate: "2016" },
    ],
    skills: [
      { name: "Finance", keywords: ["IFRS", "Consolidation", "Forecasting"] },
      { name: "Tools", keywords: ["Excel", "Python", "Power BI", "SAP"] },
    ],
    certificates: [{ name: "ACA", issuer: "ICAEW", date: "2019" }],
  },
];

const FONT = "Helvetica";
const BOLD = "Helvetica-Bold";
const ITALIC = "Helvetica-Oblique";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmt(iso) {
  if (!iso) return "";
  const [y, m] = iso.split("-");
  return m ? `${MONTHS[parseInt(m, 10) - 1]} ${y}` : y;
}

function range(e) {
  return `${fmt(e.startDate)} – ${e.endDate ? fmt(e.endDate) : "Present"}`;
}

function twoSided(doc, left, right, opts = {}) {
  const y = doc.y;
  const x = opts.x ?? doc.page.margins.left;
  const width = opts.width ?? doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.font(opts.leftFont || BOLD).fontSize(opts.size || 11).text(left, x, y, { width, continued: false, lineBreak: false });
  doc.font(opts.rightFont || ITALIC).fontSize(opts.size || 11).text(right, x, y, { width, align: "right", lineBreak: false });
  doc.moveDown(0.4);
}

function heading(doc, text, style, x, width) {
  doc.moveDown(0.6);
  if (style === "caps") {
    doc.font(BOLD).fontSize(11).text(text.toUpperCase(), x, doc.y, { width });
    doc.moveTo(x, doc.y + 1).lineTo(x + width, doc.y + 1).lineWidth(0.5).stroke();
  } else {
    doc.font(BOLD).fontSize(14).text(text, x, doc.y, { width });
  }
  doc.moveDown(0.3);
}

function bullets(doc, items, style, x, width) {
  if (style === "caps") {
    // No bullet glyphs: an indented paragraph per item (like many Word exports).
    for (const it of items) {
      doc.font(FONT).fontSize(11).text(it, x + 18, doc.y, { width: width - 18, indent: 0 });
      doc.moveDown(0.15);
    }
    return;
  }
  // pdfkit draws list bullets as vector circles, so they are absent from the text layer.
  doc.font(FONT).fontSize(11).list(items, x + 12, doc.y, { width: width - 12, bulletRadius: 1.8, textIndent: 12, bulletIndent: 4 });
  doc.moveDown(0.2);
}

function renderSingleColumn(doc, spec, x, width) {
  const b = spec.basics;
  doc.font(BOLD).fontSize(20).text(b.name, x, doc.y, { width, align: "center" });
  if (b.label) doc.font(FONT).fontSize(12).text(b.label, { width, align: "center" });
  const contact = [b.email, b.phone, `${b.location.city}, ${b.location.region}`, ...(b.profiles || []).map((p) => p.url.replace(/^https?:\/\//, ""))];
  doc.font(FONT).fontSize(10).text(contact.join("  |  "), { width, align: "center" });

  heading(doc, "Summary", spec.style, x, width);
  doc.font(FONT).fontSize(11).text(b.summary, x, doc.y, { width });

  heading(doc, spec.style === "caps" ? "Professional Experience" : "Experience", spec.style, x, width);
  for (const w of spec.work) {
    if (spec.style === "caps") {
      twoSided(doc, `${w.name}`, range(w), { x, width, leftFont: BOLD, rightFont: FONT });
      doc.font(ITALIC).fontSize(11).text(w.position, x, doc.y, { width });
    } else {
      twoSided(doc, w.position, range(w), { x, width });
      twoSided(doc, w.name, w.location || "", { x, width, leftFont: ITALIC, rightFont: FONT });
    }
    bullets(doc, w.highlights, spec.style, x, width);
  }

  heading(doc, "Education", spec.style, x, width);
  for (const e of spec.education) {
    twoSided(doc, e.institution, range(e), { x, width });
    const degree = `${e.studyType === "Bachelor's" ? "Bachelor of Science" : e.studyType === "Master's" ? "Master of Design" : e.studyType} in ${e.area}`;
    twoSided(doc, degree, e.location || "", { x, width, leftFont: FONT, rightFont: FONT });
  }

  heading(doc, spec.style === "caps" ? "Skills" : "Technical Skills", spec.style, x, width);
  for (const g of spec.skills) {
    doc.font(BOLD).fontSize(11).text(`${g.name}: `, x, doc.y, { width, continued: true });
    doc.font(FONT).text(g.keywords.join(", "));
  }

  if (spec.projects) {
    heading(doc, "Projects", spec.style, x, width);
    for (const p of spec.projects) {
      doc.font(BOLD).fontSize(11).text(p.name, x, doc.y, { width, continued: true });
      doc.font(FONT).text(` | ${p.keywords.join(", ")}`);
      bullets(doc, p.highlights, spec.style, x, width);
    }
  }
  if (spec.certificates) {
    heading(doc, "Certifications", spec.style, x, width);
    for (const c of spec.certificates) {
      doc.font(FONT).fontSize(11).text(`${c.name}${c.issuer ? ` (${c.issuer})` : ""}, ${c.date}`, x, doc.y, { width });
    }
  }
}

function renderTwoColumn(doc, spec) {
  const b = spec.basics;
  const left = doc.page.margins.left;
  const full = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.font(BOLD).fontSize(22).text(b.name, left, doc.y, { width: full });
  doc.font(FONT).fontSize(12).text(b.label, { width: full });
  doc.moveDown(0.5);
  const top = doc.y;
  const sideW = 170;
  const gap = 30;
  const mainX = left + sideW + gap;
  const mainW = full - sideW - gap;

  // Sidebar
  doc.y = top;
  heading(doc, "Contact", "classic", left, sideW);
  doc.font(FONT).fontSize(10).text(b.email, left, doc.y, { width: sideW });
  doc.text(b.phone, { width: sideW });
  doc.text(`${b.location.city}, ${b.location.region}`, { width: sideW });
  heading(doc, "Skills", "classic", left, sideW);
  for (const k of spec.skills[0].keywords) doc.font(FONT).fontSize(10).text(k, left, doc.y, { width: sideW });
  heading(doc, "Languages", "classic", left, sideW);
  for (const l of spec.languages) doc.font(FONT).fontSize(10).text(`${l.language} (${l.fluency})`, left, doc.y, { width: sideW });
  heading(doc, "Education", "classic", left, sideW);
  for (const e of spec.education) {
    doc.font(BOLD).fontSize(10).text(e.institution, left, doc.y, { width: sideW });
    doc.font(FONT).text(`Master of Design in ${e.area}`, { width: sideW });
    doc.font(ITALIC).text(range(e), { width: sideW });
  }

  // Main column
  doc.y = top;
  heading(doc, "Profile", "classic", mainX, mainW);
  doc.font(FONT).fontSize(11).text(b.summary, mainX, doc.y, { width: mainW });
  heading(doc, "Experience", "classic", mainX, mainW);
  for (const w of spec.work) {
    twoSided(doc, w.position, range(w), { x: mainX, width: mainW });
    doc.font(ITALIC).fontSize(11).text(w.name, mainX, doc.y, { width: mainW });
    bullets(doc, w.highlights, "classic", mainX, mainW);
  }
}

function expectedFor(spec) {
  const out = { basics: spec.basics, work: spec.work, education: spec.education, skills: spec.skills };
  if (spec.projects) out.projects = spec.projects;
  if (spec.certificates) out.certificates = spec.certificates;
  if (spec.languages) out.languages = spec.languages;
  return out;
}

async function render(spec) {
  const dir = path.join(OUT, spec.name);
  fs.mkdirSync(dir, { recursive: true });
  const doc = new PDFDocument({ size: "LETTER", margins: { top: 50, bottom: 50, left: 50, right: 50 }, info: { Title: spec.name } });
  const stream = fs.createWriteStream(path.join(dir, "input.pdf"));
  doc.pipe(stream);
  if (spec.style === "twocol") renderTwoColumn(doc, spec);
  else renderSingleColumn(doc, spec, doc.page.margins.left, doc.page.width - doc.page.margins.left - doc.page.margins.right);
  doc.end();
  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
  fs.writeFileSync(path.join(dir, "expected.json"), JSON.stringify(expectedFor(spec), null, 2) + "\n");
  console.log(`wrote ${path.relative(process.cwd(), dir)}`);
}

for (const spec of SPECS) await render(spec);
