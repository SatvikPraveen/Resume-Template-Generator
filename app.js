/**
 * Application entry point (ES module).
 *
 * Flow: PDF -> layout lines (src/extract) -> JSON Resume (src/pipeline)
 *       -> template model (src/render/model.js) -> template HTML (templates.js)
 */

import * as pdfjsLib from "./vendor/pdf.mjs";
import { extractDocument } from "./src/extract/pdf.js";
import { parseLines, parseText, PARSER_VERSION } from "./src/pipeline.js";
import { renderTemplate } from "./templates.js";
import { toTemplateModel } from "./src/render/model.js";
import { escapeHtml } from "./src/parse/text.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.mjs", import.meta.url).href;

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const STATE = {
  pdfFile: null,
  pdfArrayBuffer: null,
  rawText: "",
  resume: null,
  currentTemplate: "classic",
  busy: false,
};

let stillWorkingTimer = null;

// Demo document rendered before a resume is loaded (JSON Resume shape).
const SAMPLE_RESUME = {
  basics: {
    name: "Jane Doe",
    label: "Product Designer",
    email: "jane.doe@example.com",
    phone: "+1 555-123-4567",
    url: "https://janedoe.design",
    location: { city: "San Francisco", region: "CA" },
    summary:
      "Creative product designer with 8+ years building delightful user experiences across web and mobile platforms.",
  },
  work: [
    {
      name: "Acme Corp",
      position: "Senior Product Designer",
      startDate: "2020-01",
      highlights: [
        "Lead design for core web products used by 2M monthly users.",
        "Built an accessible design system adopted by six product teams.",
      ],
    },
  ],
  education: [
    { institution: "University of Design", studyType: "Bachelor's", area: "Interaction Design", startDate: "2010", endDate: "2014", location: "Boston, MA" },
  ],
  skills: [
    { name: "Design", keywords: ["Figma", "Sketch", "Prototyping"] },
    { name: "Front-end", keywords: ["HTML", "CSS", "JavaScript"] },
  ],
  projects: [
    { name: "Design System Revamp", keywords: ["Design System", "Accessibility"], description: "Led a cross-functional initiative to standardize components and tokens." },
  ],
};

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  initializeEventListeners();
  renderSamplePreview();
  const v = $("parserVersion");
  if (v) v.textContent = `parser v${PARSER_VERSION}`;
});

function initializeEventListeners() {
  $("pdfInput").addEventListener("change", handleFileSelect);
  $("parseBtn").addEventListener("click", handleParsePDF);
  $("removeFile").addEventListener("click", handleRemoveFile);

  const uploadBox = $("uploadBox");
  uploadBox.addEventListener("dragover", handleDragOver);
  uploadBox.addEventListener("dragleave", handleDragLeave);
  uploadBox.addEventListener("drop", handleDrop);

  const parseTextBtn = $("parseTextBtn");
  if (parseTextBtn) parseTextBtn.addEventListener("click", handleParseText);

  document.querySelectorAll(".tab-btn").forEach((btn) => btn.addEventListener("click", handleTabSwitch));
  document.querySelectorAll(".template-card").forEach((card) => card.addEventListener("click", handleTemplateSelect));
  document.querySelectorAll(".btn-copy[data-copy]").forEach((btn) =>
    btn.addEventListener("click", () => copyToClipboard(btn.dataset.copy, btn)),
  );

  $("exportBtn").addEventListener("click", handleExport);
  $("downloadJsonBtn").addEventListener("click", handleDownloadJSON);
  $("printBtn").addEventListener("click", handlePrint);
}

function renderSamplePreview() {
  const card = document.querySelector(`.template-card[data-template="${STATE.currentTemplate}"]`);
  if (card) card.classList.add("active");
  renderCurrentTemplate();
}

// ==================== FILE HANDLING ====================
function isPdfFile(file) {
  return (file.type && file.type.includes("pdf")) || /\.pdf$/i.test(file.name || "");
}

function handleFileSelect(e) {
  hideUploadError();
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  acceptFile(file);
}

function acceptFile(file) {
  if (!isPdfFile(file)) {
    showUploadError("Please upload a PDF file.");
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    showUploadError("File size exceeds 10MB. Please upload a smaller file.");
    return;
  }
  STATE.pdfFile = file;
  const reader = new FileReader();
  reader.onload = (event) => {
    STATE.pdfArrayBuffer = event.target.result;
    showFileInfo(file.name);
    updateParseButtonState();
  };
  reader.onerror = () => showUploadError("Failed to read the file. Please try again.");
  reader.readAsArrayBuffer(file);
}

function handleRemoveFile() {
  STATE.pdfFile = null;
  STATE.pdfArrayBuffer = null;
  STATE.rawText = "";
  STATE.resume = null;
  $("pdfInput").value = "";
  $("fileInfo").classList.add("is-hidden");
  updateParseButtonState();
  hideUploadError();
  resetDataSection();
  setExportEnabled(false);
  renderCurrentTemplate();
}

function showFileInfo(fileName) {
  $("fileName").textContent = fileName;
  $("fileInfo").classList.remove("is-hidden");
}

function handleDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add("drag-over");
}

function handleDragLeave(e) {
  e.preventDefault();
  e.currentTarget.classList.remove("drag-over");
}

function handleDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove("drag-over");
  hideUploadError();
  const files = e.dataTransfer.files;
  if (files && files.length > 0) {
    try {
      $("pdfInput").files = files;
    } catch {
      // Some browsers do not allow assigning FileList; state is enough.
    }
    acceptFile(files[0]);
  }
}

// ==================== ERROR & STATUS UI ====================
function showUploadError(message, type = "error") {
  const box = $("uploadError");
  const text = $("uploadErrorText");
  if (!box || !text) return;
  text.textContent = message;
  box.classList.toggle("warning", type === "warning");
  box.classList.remove("is-hidden");
}

function hideUploadError() {
  const box = $("uploadError");
  if (box) box.classList.add("is-hidden");
}

function updateParseButtonState() {
  $("parseBtn").disabled = STATE.busy || !STATE.pdfArrayBuffer;
}

function setBusy(busy, statusText = "Parsing resume…") {
  STATE.busy = busy;
  const loading = $("loadingIndicator");
  const status = $("loadingStatusText");
  if (busy) {
    if (status) status.textContent = statusText;
    loading.classList.remove("is-hidden");
    stillWorkingTimer = setTimeout(() => {
      if (status) status.textContent = "Still working — large files may take a moment…";
    }, 8000);
  } else {
    loading.classList.add("is-hidden");
    if (stillWorkingTimer) clearTimeout(stillWorkingTimer);
    stillWorkingTimer = null;
  }
  updateParseButtonState();
}

function friendlyError(error) {
  const msg = (error && error.message) || "";
  if (/scanned image|No selectable text/i.test(msg)) {
    return "No selectable text was found. This PDF appears to be a scanned image; run OCR first or export the resume from its source document.";
  }
  if (/password|encrypted/i.test(msg)) return "This PDF is password protected. Remove the password and try again.";
  if (/Invalid PDF|corrupt|XRef|missing PDF/i.test(msg)) return "The file does not look like a valid PDF.";
  if (/worker|pdf\.js|pdfjs/i.test(msg)) return "The PDF engine failed to load. Refresh the page and try again.";
  return "Could not parse this PDF. Make sure it is text-based (not a scanned image). Open the JSON tab to see what was captured.";
}

// ==================== PARSING ====================
async function handleParsePDF() {
  if (!STATE.pdfArrayBuffer || STATE.busy) return;
  hideUploadError();
  setBusy(true);
  try {
    const doc = await extractDocument(pdfjsLib, STATE.pdfArrayBuffer.slice(0));
    STATE.rawText = doc.text;
    STATE.resume = parseLines(doc.lines, doc.stats, {
      meta: { source: STATE.pdfFile ? STATE.pdfFile.name : "upload", pages: doc.pages.length },
    });
    afterParse();
  } catch (error) {
    console.error("[parse]", error);
    showUploadError(friendlyError(error));
  } finally {
    setBusy(false);
  }
}

function handleParseText() {
  const input = $("textInput");
  const text = input ? input.value : "";
  if (!text.trim()) {
    showUploadError("Paste some resume text first.");
    return;
  }
  hideUploadError();
  try {
    STATE.rawText = text;
    STATE.resume = parseText(text, { meta: { source: "pasted-text" } });
    afterParse();
  } catch (error) {
    console.error("[parse-text]", error);
    showUploadError("Could not parse the pasted text.");
  }
}

function afterParse() {
  updateDataSection();
  setExportEnabled(true);
  const r = STATE.resume;
  const empty = !(r.work && r.work.length) && !(r.education && r.education.length) && !(r.skills && r.skills.length);
  if (empty) {
    showUploadError(
      "Resume parsed but little structured data was found. The layout may be unusual; check the JSON tab and the diagnostics below.",
      "warning",
    );
  }
  renderCurrentTemplate();
}

// ==================== DATA SECTION ====================
function updateDataSection() {
  $("rawOutput").value = STATE.rawText;
  $("jsonOutput").value = JSON.stringify(STATE.resume, null, 2);
  updateDataPreview();
}

function confidenceBar(label, value) {
  const pct = Math.round((value || 0) * 100);
  const level = pct >= 75 ? "high" : pct >= 45 ? "medium" : "low";
  return `<div class="conf-row"><span class="conf-label">${escapeHtml(label)}</span><span class="conf-track"><span class="conf-fill ${level}" style="width:${pct}%"></span></span><span class="conf-pct">${pct}%</span></div>`;
}

function updateDataPreview() {
  const r = STATE.resume;
  const b = r.basics || {};
  const meta = r.meta || {};
  const conf = meta.confidence || {};
  const loc = b.location ? [b.location.city, b.location.region].filter(Boolean).join(", ") : "";
  const rows = [
    ["Name", b.name],
    ["Title", b.label],
    ["Email", b.email],
    ["Phone", b.phone],
    ["Location", loc],
    ["Profiles", (b.profiles || []).map((p) => p.network).join(", ")],
  ].filter(([, v]) => v);

  const counts = [
    ["Experience", (r.work || []).length, "position(s)"],
    ["Education", (r.education || []).length, "degree(s)"],
    ["Skills", (r.skills || []).reduce((n, g) => n + (g.keywords || []).length, 0), "keyword(s)"],
    ["Projects", (r.projects || []).length, "project(s)"],
    ["Certifications", (r.certificates || []).length, "item(s)"],
  ].filter(([, n]) => n > 0);

  let html = '<div class="info-group"><h3>Basic Information</h3>';
  html += rows.map(([k, v]) => `<p><strong>${k}:</strong> ${escapeHtml(v)}</p>`).join("");
  html += "</div>";
  if (b.summary) html += `<div class="info-group"><h3>Summary</h3><p>${escapeHtml(b.summary)}</p></div>`;
  if (counts.length) {
    html += '<div class="info-group"><h3>Sections found</h3>';
    html += counts.map(([k, n, unit]) => `<p><strong>${k}:</strong> ${n} ${unit}</p>`).join("");
    html += "</div>";
  }
  html += '<div class="info-group"><h3>Parser confidence</h3>';
  html += ["basics", "work", "education", "skills", "projects"].map((k) => confidenceBar(k, conf[k])).join("");
  html += "</div>";
  if (meta.sections && meta.sections.length) {
    html += '<div class="info-group"><h3>Detected headings</h3><p class="muted">';
    html += meta.sections.map((s) => `${escapeHtml(s.title || s.id)} → <code>${escapeHtml(s.id)}</code>`).join(" · ");
    html += "</p></div>";
  }
  if (meta.warnings && meta.warnings.length) {
    html += '<div class="info-group warnings"><h3>Diagnostics</h3><ul>';
    html += meta.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("");
    html += "</ul></div>";
  }
  $("dataPreview").innerHTML = html;
}

function resetDataSection() {
  $("rawOutput").value = "";
  $("jsonOutput").value = "";
  $("dataPreview").innerHTML = '<div class="empty-state"><p>📋 Upload and parse a PDF to see structured data</p></div>';
}

function setExportEnabled(enabled) {
  $("exportBtn").disabled = !enabled;
  $("downloadJsonBtn").disabled = !enabled;
  $("printBtn").disabled = !enabled;
}

// ==================== TABS ====================
function handleTabSwitch(e) {
  const target = e.currentTarget.dataset.tab;
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    const active = btn === e.currentTarget;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
  const map = { preview: "previewTab", json: "jsonTab", raw: "rawTab" };
  $(map[target]).classList.add("active");
}

// ==================== TEMPLATES ====================
function handleTemplateSelect(e) {
  const card = e.currentTarget;
  document.querySelectorAll(".template-card").forEach((c) => {
    c.classList.remove("active");
    c.setAttribute("aria-pressed", "false");
  });
  card.classList.add("active");
  card.setAttribute("aria-pressed", "true");
  STATE.currentTemplate = card.dataset.template;
  renderCurrentTemplate();
  setExportEnabled(!!STATE.resume);
}

function currentRender() {
  const model = toTemplateModel(STATE.resume || SAMPLE_RESUME);
  return renderTemplate(STATE.currentTemplate, model);
}

function renderCurrentTemplate() {
  const container = $("resumeContainer");
  const result = currentRender();
  container.innerHTML = result.html;
  let styleTag = $("template-styles");
  if (!styleTag) {
    styleTag = document.createElement("style");
    styleTag.id = "template-styles";
    document.head.appendChild(styleTag);
  }
  styleTag.textContent = result.css;
}

// ==================== EXPORT ====================
function safeFileStem() {
  const name = (STATE.resume && STATE.resume.basics && STATE.resume.basics.name) || "resume";
  return name.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "resume";
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function handleExport() {
  if (!STATE.resume) return;
  const { html, css } = currentRender();
  const title = escapeHtml(((STATE.resume.basics || {}).name || "Resume") + " - Resume");
  const fullHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
    @media print { body { padding: 0; } }
    ${css}
  </style>
</head>
<body>
${html}
</body>
</html>
`;
  download(new Blob([fullHTML], { type: "text/html" }), `${safeFileStem()}_${STATE.currentTemplate}_resume.html`);
}

function handleDownloadJSON() {
  if (!STATE.resume) return;
  download(new Blob([JSON.stringify(STATE.resume, null, 2)], { type: "application/json" }), `${safeFileStem()}_resume.json`);
}

function handlePrint() {
  if (!STATE.resume) return;
  window.print();
}

// ==================== UTILITIES ====================
async function copyToClipboard(elementId, btn) {
  const element = $(elementId);
  if (!element) return;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(element.value);
    } else {
      element.select();
      document.execCommand("copy");
    }
  } catch {
    element.select();
    document.execCommand("copy");
  }
  if (btn) {
    const original = btn.innerHTML;
    btn.innerHTML = "<span>✓</span> Copied!";
    btn.classList.add("copied");
    setTimeout(() => {
      btn.innerHTML = original;
      btn.classList.remove("copied");
    }, 2000);
  }
}

// Debug handle for the browser console.
window.__resumeParser = { state: STATE, parseText, version: PARSER_VERSION };
