/**
 * pdf.js wrapper: PDF bytes -> annotated layout lines.
 *
 * Works with the browser build (window.pdfjsLib) and the Node legacy build
 * (pdfjs-dist/legacy/build/pdf.mjs); the caller passes the library in so this
 * module has no environment-specific imports.
 */

import { buildLines, computeStats, annotateLines, linesToText } from "./layout.js";

/**
 * Resolve embedded font names for a page. Text extraction alone does not load
 * fonts; fetching the operator list does. Failures are non-fatal – we simply
 * lose bold/italic flags and fall back to font-frequency heuristics.
 */
async function resolveFonts(page, items) {
  const fonts = {};
  const names = new Set(items.map((it) => it.fontName).filter(Boolean));
  if (names.size === 0) return fonts;
  try {
    await page.getOperatorList();
  } catch {
    return fonts;
  }
  for (const name of names) {
    try {
      const f = page.commonObjs.get(name);
      if (f && f.name) fonts[name] = { name: f.name };
    } catch {
      // Not resolved – leave unknown.
    }
  }
  return fonts;
}

/**
 * @param {object} pdfjsLib the pdf.js namespace (must expose getDocument)
 * @param {ArrayBuffer|Uint8Array} data
 * @param {object} [options]
 * @param {boolean} [options.resolveFonts=true] load fonts to get bold/italic flags
 * @param {number} [options.maxPages=20]
 * @returns {Promise<{lines:Array, stats:object, text:string, pages:Array, meta:object}>}
 */
export async function extractDocument(pdfjsLib, data, options = {}) {
  const { resolveFonts: wantFonts = true, maxPages = 20 } = options;
  if (!pdfjsLib || typeof pdfjsLib.getDocument !== "function") {
    throw new Error("pdf.js library not available");
  }
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const loadingTask = pdfjsLib.getDocument({ data: bytes, verbosity: 0 });
  const pdf = await loadingTask.promise;
  if (!pdf || !pdf.numPages) throw new Error("This PDF has no pages to extract text from.");

  const pages = [];
  const allLines = [];
  const pageCount = Math.min(pdf.numPages, maxPages);
  for (let p = 1; p <= pageCount; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = content.items.filter((it) => typeof it.str === "string");
    const fonts = wantFonts ? await resolveFonts(page, items) : {};
    const lines = buildLines(items, { page: p, pageWidth: viewport.width, pageHeight: viewport.height, fonts });
    pages.push({ number: p, width: viewport.width, height: viewport.height, lineCount: lines.length });
    allLines.push(...lines);
  }

  let meta = {};
  try {
    const m = await pdf.getMetadata();
    meta = { info: m?.info || {}, pageCount: pdf.numPages };
  } catch {
    meta = { info: {}, pageCount: pdf.numPages };
  }

  const stats = computeStats(allLines);
  annotateLines(allLines, stats);
  const text = linesToText(allLines);
  const textChars = text.replace(/\s/g, "").length;
  if (textChars === 0) {
    throw new Error("No selectable text found. The PDF appears to be a scanned image; OCR is required.");
  }

  try {
    await pdf.cleanup();
    await pdf.destroy();
  } catch {
    // ignore
  }

  return { lines: allLines, stats, text, pages, meta };
}
