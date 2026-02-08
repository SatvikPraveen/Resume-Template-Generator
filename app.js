// ==================== TEXT NORMALIZATION ====================
// Clean and normalize PDF text with malformed spacing
function cleanAndNormalizeText(text) {
  if (!text) return "";

  let cleaned = text
    // Replace multiple spaces/tabs with single space
    .replace(/[ \t]+/g, " ")
    // Normalize common dash characters
    .replace(/[-–—]/g, "-")
    // Clean up EXCESSIVE newlines (3+ becomes 2) but preserve structure-defining blank lines
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    // Remove spaces before common punctuation
    .replace(/\s+([.,;:])/g, "$1")
    .trim();

  return cleaned;
}

// ==================== PARSER CONFIGURATION ====================
// Toggle to use robust parser when current parser fails
const USE_ROBUST_PARSER = true;
let robustParser = null;

// Initialize robust parser if available
if (typeof RobustResumeParser !== 'undefined' && USE_ROBUST_PARSER) {
  robustParser = new RobustResumeParser();
  console.log('[Parser] Robust parser initialized and ready as fallback');
}

// ==================== STATE MANAGEMENT ====================
let STATE = {
  pdfFile: null,
  pdfArrayBuffer: null,
  rawText: "",
  resumeData: null,
  currentTemplate: null,
};

// Demo sample data used to render template previews when no resume is loaded
const SAMPLE_DATA = {
  basics: {
    name: "Jane Doe",
    label: "Product Designer",
    email: "jane.doe@example.com",
    phone: "+1 555-123-4567",
    url: "https://janedoe.design",
    location: "San Francisco, CA",
    summary:
      "Creative product designer with 8+ years building delightful user experiences across web and mobile platforms.",
  },
  work: [
    {
      position: "Senior Product Designer",
      company: "Acme Corp",
      startDate: "Jan 2020",
      endDate: "Present",
      summary:
        "Leading design for core web products. Focused on usability, accessibility, and scalable design systems.",
    },
  ],
  education: [
    {
      institution: "University of Design",
      studyType: "Bachelor's",
      area: "Interaction Design",
      startDate: "2010",
      endDate: "2014",
      location: "Boston, MA",
    },
  ],
  skills: [
    { name: "Design", keywords: ["Figma", "Sketch", "Prototyping"] },
    { name: "Front-end", keywords: ["HTML", "CSS", "JavaScript"] },
  ],
  projects: [
    {
      name: "Design System Revamp",
      keywords: ["Design System", "Accessibility"],
      summary:
        "Led a cross-functional initiative to standardize components and tokens.",
    },
  ],
};

// ==================== INITIALIZATION ====================
document.addEventListener("DOMContentLoaded", function () {
  console.log("[Init] DOMContentLoaded fired");
  initializeEventListeners();
  renderSamplePreview();
  console.log("[Init] ✅ Initialization complete");
});

function initializeEventListeners() {
  console.log("[Init] Starting event listener setup...");

  // File upload
  const pdfInput = document.getElementById("pdfInput");
  const uploadBox = document.getElementById("uploadBox");
  const parseBtn = document.getElementById("parseBtn");
  const removeFile = document.getElementById("removeFile");

  if (!pdfInput) console.error("[Init] pdfInput not found!");
  if (!uploadBox) console.error("[Init] uploadBox not found!");
  if (!parseBtn) console.error("[Init] parseBtn not found!");
  if (!removeFile) console.error("[Init] removeFile not found!");

  pdfInput.addEventListener("change", handleFileSelect);
  console.log("[Init] ✅ File input change listener attached");

  parseBtn.addEventListener("click", handleParsePDF);
  console.log("[Init] ✅ Parse button click listener attached");

  removeFile.addEventListener("click", handleRemoveFile);

  // Drag and drop
  uploadBox.addEventListener("dragover", handleDragOver);
  uploadBox.addEventListener("dragleave", handleDragLeave);
  uploadBox.addEventListener("drop", handleDrop);
  console.log("[Init] ✅ Drag and drop listeners attached");

  // Tabs
  const tabBtns = document.querySelectorAll(".tab-btn");
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", handleTabSwitch);
  });
  console.log("[Init] ✅ Tab listeners attached");

  // Template cards
  const templateCards = document.querySelectorAll(".template-card");
  templateCards.forEach((card) => {
    card.addEventListener("click", handleTemplateSelect);
  });
  console.log("[Init] ✅ Template card listeners attached");

  // Export buttons
  document.getElementById("exportBtn").addEventListener("click", handleExport);
  document
    .getElementById("downloadJsonBtn")
    .addEventListener("click", handleDownloadJSON);
  document.getElementById("printBtn").addEventListener("click", handlePrint);
}

// Show a sample preview on page load so the resume container isn't blank
function renderSamplePreview() {
  const defaultTemplate = "classic";
  STATE.currentTemplate = defaultTemplate;

  // mark the default card active
  const defaultCard = document.querySelector(
    `.template-card[data-template="${defaultTemplate}"]`
  );
  if (defaultCard) defaultCard.classList.add("active");

  // Render sample data into the preview area
  renderCurrentTemplate();
}

// ==================== FILE HANDLING ====================
function handleFileSelect(e) {
  console.log("[File Upload] File select triggered");
  console.log("[File Upload] event.target.files:", e.target.files);

  const file = e.target.files[0];
  if (!file) {
    console.warn("[File Upload] No file selected");
    return;
  }

  console.log(
    "[File Upload] File selected:",
    file.name,
    "Size:",
    file.size,
    "Type:",
    file.type
  );

  if (!file.type.includes("pdf")) {
    console.error("[File Upload] Not a PDF file, type is:", file.type);
    alert("Please upload a PDF file.");
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    console.error("[File Upload] File too large:", file.size);
    alert("File size exceeds 10MB. Please upload a smaller file.");
    return;
  }

  STATE.pdfFile = file;
  console.log("[File Upload] File saved to STATE");

  // Read file as ArrayBuffer
  const reader = new FileReader();

  reader.onload = function (event) {
    console.log(
      "[File Upload] FileReader onload - buffer size:",
      event.target.result.byteLength
    );
    STATE.pdfArrayBuffer = event.target.result;
    showFileInfo(file.name);
    document.getElementById("parseBtn").disabled = false;
    console.log("[File Upload] ✅ File ready to parse");
  };

  reader.onerror = function (error) {
    console.error("[File Upload] FileReader error:", error);
    alert("Failed to read file: " + error);
  };

  reader.readAsArrayBuffer(file);
  console.log("[File Upload] Started reading file as ArrayBuffer");
}

function handleRemoveFile() {
  STATE = {
    pdfFile: null,
    pdfArrayBuffer: null,
    rawText: "",
    resumeData: null,
    currentTemplate: null,
  };

  document.getElementById("pdfInput").value = "";
  document.getElementById("fileInfo").classList.add("is-hidden");
  document.getElementById("parseBtn").disabled = true;

  // Reset UI
  resetDataSection();
  disableTemplates();
  resetPreview();
}

function showFileInfo(fileName) {
  document.getElementById("fileName").textContent = fileName;
  document.getElementById("fileInfo").classList.remove("is-hidden");
}

function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.style.borderColor = "var(--primary)";
  e.currentTarget.style.background = "rgba(59, 130, 246, 0.05)";
}

function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.style.borderColor = "var(--border-light)";
  e.currentTarget.style.background = "var(--bg-elevated)";
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();

  const uploadBox = e.currentTarget;
  uploadBox.style.borderColor = "var(--border-light)";
  uploadBox.style.background = "var(--bg-elevated)";

  const files = e.dataTransfer.files;
  if (files.length > 0) {
    document.getElementById("pdfInput").files = files;
    handleFileSelect({ target: { files: files } });
  }
}

// ==================== PDF PARSING ====================
async function handleParsePDF() {
  console.log("[PDF Parsing] Starting...");

  if (!STATE.pdfArrayBuffer) {
    console.error("[PDF Parsing] No PDF buffer available");
    alert("Please select a PDF file first.");
    return;
  }

  showLoading(true);

  try {
    // Check if PDFTextExtractor is available
    console.log("[PDF Parsing] Checking PDFTextExtractor...");
    console.log(
      "[PDF Parsing] window.PDFTextExtractor =",
      typeof window.PDFTextExtractor
    );
    console.log("[PDF Parsing] window.pdfjsLib =", typeof window.pdfjsLib);

    if (!window.PDFTextExtractor || !PDFTextExtractor.extractText) {
      throw new Error(
        "PDFTextExtractor module not available. window.PDFTextExtractor=" +
          typeof window.PDFTextExtractor
      );
    }

    console.log("[PDF Parsing] Extracting text from PDF...");
    const extracted = await PDFTextExtractor.extractText(STATE.pdfArrayBuffer);
    STATE.rawText = extracted || "";
    console.log("[PDF Parsing] Text extracted. Length:", STATE.rawText.length);

    // Parse text into structured data
    console.log("[PDF Parsing] Parsing resume text...");
    STATE.resumeData = parseResumeText(STATE.rawText);
    console.log("[PDF Parsing] Resume data parsed:");
    console.log(
      "[PDF Parsing]   - Work entries:",
      STATE.resumeData.work.length
    );
    console.log(
      "[PDF Parsing]   - Education entries:",
      STATE.resumeData.education.length
    );
    console.log("[PDF Parsing]   - Skills:", STATE.resumeData.skills.length);

    // Update UI
    console.log("[PDF Parsing] Updating UI...");
    updateDataSection();
    enableTemplates();

    showLoading(false);
    console.log("[PDF Parsing] ✅ Complete!");

    // Auto-select first template
    console.log("[PDF Parsing] Clicking classic template...");
    const classicBtn = document.querySelector(
      '.template-card[data-template="classic"]'
    );
    if (classicBtn) {
      classicBtn.click();
    } else {
      console.warn("[PDF Parsing] Classic template button not found");
    }
  } catch (error) {
    console.error("[PDF Parsing] ❌ ERROR:", error);
    console.error("[PDF Parsing] Stack:", error.stack);
    alert("Failed to parse PDF:\n\n" + error.message);
    showLoading(false);
  }
}

function showLoading(show) {
  const loading = document.getElementById("loadingIndicator");
  const parseBtn = document.getElementById("parseBtn");

  if (show) {
    loading.classList.remove("is-hidden");
    parseBtn.disabled = true;
  } else {
    loading.classList.add("is-hidden");
    parseBtn.disabled = false;
  }
}

// ==================== TEXT PARSING ====================
function parseResumeText(text) {
  // CRITICAL: Clean text FIRST to handle malformed PDF spacing
  const cleanedText = cleanAndNormalizeText(text);

  console.log("parseResumeText - Raw text length:", text.length);
  console.log("parseResumeText - Cleaned text length:", cleanedText.length);
  console.log(
    "parseResumeText - First 500 chars:",
    cleanedText.substring(0, 500)
  );

  // CRITICAL DEBUG: Show full cleaned text in console for inspection
  console.log("=== FULL CLEANED TEXT ===");
  console.log(cleanedText);
  console.log("=== END CLEANED TEXT ===");

  // Try current parsing method
  let resumeData = parseResumeTextCurrent(cleanedText);
  
  // Check if parsing was successful (at least some data extracted)
  const hasData = (
    (resumeData.work && resumeData.work.length > 0) ||
    (resumeData.education && resumeData.education.length > 0) ||
    (resumeData.skills && resumeData.skills.length > 0) ||
    (resumeData.projects && resumeData.projects.length > 0)
  );

  // If current parser failed and robust parser is available, use it
  if (!hasData && robustParser && USE_ROBUST_PARSER) {
    console.warn('[Parser] Current parser returned empty data. Trying robust parser...');
    try {
      resumeData = robustParser.parseResume(cleanedText);
      console.log('[Parser] ✅ Robust parser extracted data successfully');
      console.log('[Parser] Robust results:', resumeData);
    } catch (error) {
      console.error('[Parser] ❌ Robust parser also failed:', error);
      // Fall back to current parser results (even if empty)
    }
  }

  console.log("parseResumeText - Final resumeData:", resumeData);
  return resumeData;
}

function parseResumeTextCurrent(cleanedText) {
  // Original parsing logic (now as a separate function)
  // Fallback: local/robust parsing (primary method)
  const lines = cleanedText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  console.log("parseResumeText - Total lines after split:", lines.length);

  // Extract basic info - handle pipe-separated contact info
  let name = lines[0] || "Resume";
  // Extract name from first line before pipe
  if (name.includes("|")) {
    let namePart = name.split("|")[0].trim();
    // Remove phone/numbers: "Shanmuga Priya Kannan 872 - 330 - 3203" → "Shanmuga Priya Kannan"
    namePart = namePart
      .replace(/\s+\d+\s*[-–—]\s*\d+\s*[-–—]\s*\d+\s*$/, "")
      .trim();
    name = namePart;
  }

  const email = extractEmail(cleanedText);
  const phone = extractPhone(cleanedText);
  const url = extractURL(cleanedText);
  const location = extractLocation(cleanedText);

  // Extract job title/label - skip lines that contain contact info
  let label = "";
  for (let i = 1; i < Math.min(5, lines.length); i++) {
    const line = lines[i];
    // Skip if line contains contact info (phone, email, or location patterns)
    const hasContactInfo = 
      line.includes('@') || 
      /\+?\d{1,3}[-\s]?\d{3}[-\s]?\d{3}[-\s]?\d{4}/.test(line) ||
      /\d{3}[-\s]?\d{3}[-\s]?\d{4}/.test(line) ||
      line.includes('linkedin.com') ||
      line.includes('github.com') ||
      /[A-Z][a-z]+,\s*[A-Z]{2}/.test(line); // City, ST pattern
    
    if (!hasContactInfo && line.length > 0 && line.length < 100) {
      label = line;
      break;
    }
  }

  // Extract sections
  const sections = identifySections(cleanedText);
  console.log(
    "parseResumeText - Sections found:",
    Object.keys(sections),
    sections
  );
  
  // DEBUG: Log section content lengths
  console.log("=== SECTION EXTRACTION DEBUG ===");
  for (const [sectionName, content] of Object.entries(sections)) {
    console.log(`${sectionName}: ${content.length} chars`);
    console.log(`First 200 chars: ${content.substring(0, 200)}`);
  }
  console.log("=== END SECTION DEBUG ===");

  // Build resume data object
  const resumeData = {
    basics: {
      name: name,
      label: label,
      email: email,
      phone: phone,
      url: url,
      location: location,
      summary: sections.summary || sections.about || "",
    },
    work: parseWorkExperience(sections.experience || sections.work || ""),
    education: parseEducation(sections.education || ""),
    skills: parseSkills(sections.skills || sections["technical skills"] || ""),
    projects: parseProjects(sections.projects || ""),
  };

  console.log("parseResumeText - Final resumeData:", resumeData);

  // Clean up common formatting issues
  const cleanedData = cleanupResumeData(resumeData);

  return cleanedData;
}

function extractEmail(text) {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const match = text.match(emailRegex);
  return match ? match[0] : "";
}

function extractPhone(text) {
  // Try multiple phone patterns to handle various formats
  const phonePatterns = [
    // International with spaces (e.g., "+ 1 979 721 2039")
    /\+\s*\d{1,3}\s+\d{3}\s+\d{3}\s+\d{4}/,
    // International with dashes/dots
    /\+\d{1,3}[-.\s]?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/,
    // US format with country code
    /\+?1[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/,
    // Standard US format
    /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/,
    // Spaced format
    /\d{3}\s+\d{3}\s+\d{4}/,
  ];
  
  for (const pattern of phonePatterns) {
    const match = text.match(pattern);
    if (match) {
      // Clean up extra spaces but preserve format
      return match[0].replace(/\s+/g, ' ').trim();
    }
  }
  
  return "";
}

function extractURL(text) {
  const urlRegex = /(https?:\/\/[^\s]+)|(linkedin\.com\/[^\s]+)/i;
  const match = text.match(urlRegex);
  return match ? match[0] : "";
}

function extractLocation(text) {
  // Look for location in the FIRST 10 lines only (header section)
  // This avoids matching locations from education/work experience sections
  const lines = text.split("\n").slice(0, 10).join("\n");

  // Look for city, state/country patterns
  // But exclude patterns like "Computer Science Chicago" (degree field with city)
  // We're looking for just "City, State" patterns in contact info
  const locationRegex =
    /(?<![\s\w])([A-Z][a-z]+),\s*([A-Z]{2}|[A-Z][a-z]+)(?![a-z])/;
  const match = lines.match(locationRegex);
  return match ? match[0] : "";
}

function identifySections(text) {
  const sections = {};

  // Flexible section detection - handles variations and compound headers
  // Pattern matches any word(s) followed by section keywords
  const sectionPatterns = [
    {
      sectionName: "education",
      pattern:
        /(?:^|\n)\s*(?:E\s*D\s*U\s*C\s*A\s*T\s*I\s*O\s*N|EDUCATION|ACADEMIC(?:\s+\w+)*)\s*(?:\n|$)/gi,
    },
    {
      sectionName: "experience",
      // Matches: EXPERIENCE, PROFESSIONAL EXPERIENCE, WORK EXPERIENCE, VOLUNTEERING EXPERIENCE, etc.
      // Using \w+ to match all-caps headers like "PROFESSIONAL EXPERIENCE"
      pattern:
        /(?:^|\n)\s*(?:\w+\s+)*?(?:EXPERIENCE|EMPLOYMENT|WORK\s+HISTORY|CAREER|VOLUNTEERING|E\s*X\s*P\s*E\s*R\s*I\s*E\s*N\s*C\s*E)\s*(?:\n|$)/gi,
    },
    {
      sectionName: "projects",
      pattern:
        /(?:^|\n)\s*(?:(?:[A-Z][a-z]+\s+){0,2})?(?:PROJECTS?|PORTFOLIO|P\s*R\s*O\s*J\s*E\s*C\s*T\s*S)\s*(?:\n|$)/gi,
    },
    {
      sectionName: "skills",
      pattern:
        /(?:^|\n)\s*(?:(?:[A-Z][a-z]+\s+){0,2})?(?:SKILLS?|COMPETENCIES|TECHNICAL\s+SKILLS|T\s*E\s*C\s*H\s*N\s*I\s*C\s*A\s*L\s+S\s*K\s*I\s*L\s*L\s*S)\s*(?:\n|$)/gi,
    },
    {
      sectionName: "summary",
      pattern: /(?:^|\n)\s*(?:(?:[A-Z][a-z]+\s+){0,2})?(?:SUMMARY|PROFILE|OBJECTIVE)\s*(?:\n|$)/gi,
    },
    {
      sectionName: "certifications",
      pattern: /(?:^|\n)\s*(?:CERTIFICATIONS|LICENSES|AWARDS)\s*(?:\n|$)/gi,
    },
    { sectionName: "languages", pattern: /(?:^|\n)\s*LANGUAGES\s*(?:\n|$)/gi },
  ];

  const headerMatches = [];

  // Find all section headers
  for (const { sectionName, pattern } of sectionPatterns) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      headerMatches.push({
        sectionName: sectionName,
        headerText: match[0],
        index: match.index,
        length: match[0].length,
      });
    }
  }

  // Sort by position in text
  headerMatches.sort((a, b) => a.index - b.index);

  // Group sections - allow multiple instances of same section type (e.g., multiple experience sections)
  const sectionGroups = {};
  
  for (const match of headerMatches) {
    // Skip LANGUAGES if we already have SKILLS
    if (match.sectionName === "languages" && sectionGroups["skills"]) {
      continue;
    }

    if (!sectionGroups[match.sectionName]) {
      sectionGroups[match.sectionName] = [];
    }
    sectionGroups[match.sectionName].push(match);
  }

  console.log(
    "Section groups:",
    Object.entries(sectionGroups).map(([name, matches]) => `${name}(${matches.length})`)
  );

  // Create flat list preserving order but marking duplicates
  const orderedMatches = [];
  const seenPositions = new Set();
  
  for (const match of headerMatches) {
    if (!seenPositions.has(match.index)) {
      seenPositions.add(match.index);
      orderedMatches.push(match);
    }
  }

  console.log(
    "Headers found:",
    orderedMatches.map((h) => `${h.sectionName}@${h.index}`)
  );

  // Log the index positions to help debug section boundaries
  for (let i = 0; i < orderedMatches.length; i++) {
    const current = orderedMatches[i];
    const next = orderedMatches[i + 1];
    const startIdx = current.index + current.length;
    const endIdx = next ? next.index : text.length;
    const headerText = text
      .substring(current.index, Math.min(current.index + 30, text.length))
      .replace(/\n/g, " ");
    console.log(
      `[Section: ${current.sectionName}] Header: "${headerText}..." at index ${current.index}`
    );
    console.log(
      `  Content from ${startIdx} to ${endIdx} (${endIdx - startIdx} chars)`
    );
  }

  // Extract content between section headers - merge multiple instances of same section
  for (let i = 0; i < orderedMatches.length; i++) {
    const current = orderedMatches[i];
    const next = orderedMatches[i + 1];

    // Start after the header
    let startIndex = current.index + current.length;

    // End at the next header (or end of text)
    const endIndex = next ? next.index : text.length;

    let content = text.substring(startIndex, endIndex).trim();

    // Remove leading newlines/spaces
    content = content.replace(/^\s+/, "");

    if (content.length > 0) {
      // Merge content if section already exists (e.g., multiple experience sections)
      if (sections[current.sectionName]) {
        sections[current.sectionName] += "\n\n" + content;
        console.log(`✓ ${current.sectionName} (merged): ${content.substring(0, 80)}...`);
      } else {
        sections[current.sectionName] = content;
        console.log(`✓ ${current.sectionName}: ${content.substring(0, 80)}...`);
      }
    }
  }

  console.log("Sections extracted:", Object.keys(sections));
  return sections;
}

function parseWorkExperience(text) {
  if (!text) return [];

  console.log("=== PARSE WORK EXPERIENCE ===");
  console.log("Input text length:", text.length);
  console.log("First 800 chars:", text.substring(0, 800));

  const jobs = [];

  // Find jobs by looking for date patterns: "Month Year - Month Year" or "Month Year - Present"
  // Support both 2-digit (21) and 4-digit (2021) years
  const datePattern =
    /(\w+\.?\s+\d{2,4})\s*[-–—]\s*((?:\w+\.?\s+\d{2,4})|present|current)/gi;

  const dateMatches = [];
  let match;
  while ((match = datePattern.exec(text)) !== null) {
    dateMatches.push({
      fullDate: match[0],
      startDate: match[1],
      endDate: match[2],
      index: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  console.log("Date matches found:", dateMatches.length);
  dateMatches.forEach((d, i) => console.log(`  ${i+1}. "${d.fullDate}"`));

  if (dateMatches.length === 0) {
    console.log("❌ No work experience dates found");
    return [];
  }

  // Extract job info for each date
  for (let i = 0; i < dateMatches.length; i++) {
    const dateInfo = dateMatches[i];
    const nextDateInfo = dateMatches[i + 1];

    // Get the full line containing the date (might have position on same line)
    const textBeforeDate = text.substring(0, dateInfo.index);
    const lines = textBeforeDate.split('\n');
    const dateLineStart = textBeforeDate.lastIndexOf('\n') + 1;
    const fullDateLine = text.substring(dateLineStart, dateInfo.endIndex + 50).split('\n')[0];

    let position = "";
    let company = "";

    // Check if position is on the same line as date (volunteering format: "● Position text    Date")
    const beforeDateOnSameLine = fullDateLine.substring(0, fullDateLine.indexOf(dateInfo.fullDate)).trim();
    
    if (beforeDateOnSameLine.length > 0) {
      // Position is on same line as date (volunteering format)
      position = beforeDateOnSameLine.replace(/^[●•]\s*/, '').trim();
      company = ""; // No separate company line
    } else {
      // Position/company are on lines BEFORE the date (professional experience format)
      const headerLines = lines
        .slice(-3) // Get last 3 lines before date
        .map(l => l.trim())
        .filter(l => l.length > 0 && !l.startsWith('●') && !l.startsWith('•'));

      if (headerLines.length >= 1) {
        // Last non-empty line before date is usually "Position, Company, Location"
        const lastLine = headerLines[headerLines.length - 1];
        
        // Try to split position and company if comma-separated
        if (lastLine.includes(',')) {
          const parts = lastLine.split(',').map(p => p.trim());
          position = parts[0];
          company = parts.slice(1).join(', ');
        } else {
          position = lastLine;
          company = headerLines.length >= 2 ? headerLines[headerLines.length - 2] : '';
        }
      }
    }

    // Get text AFTER the date (description)
    let descStart = dateInfo.endIndex;
    let descEnd = nextDateInfo ? nextDateInfo.index : text.length;
    let description = text.substring(descStart, descEnd).trim();

    // Remove the next job's header from this job's description
    if (nextDateInfo) {
      const beforeNextDate = text.substring(0, nextDateInfo.index);
      const allLines = beforeNextDate.split('\n');
      
      // Find non-bullet lines at the end (these are next job's header)
      const nextJobHeaderLines = [];
      for (let j = allLines.length - 1; j >= 0; j--) {
        const line = allLines[j].trim();
        if (line.length === 0) {
          if (nextJobHeaderLines.length > 0) break;
        } else if (!line.startsWith('●') && !line.startsWith('•')) {
          nextJobHeaderLines.unshift(line);
          if (nextJobHeaderLines.length >= 2) break;
        } else {
          break; // Hit a bullet point, stop
        }
      }

      // Remove these lines from description
      if (nextJobHeaderLines.length > 0) {
        for (const headerLine of nextJobHeaderLines) {
          description = description.replace(headerLine, '');
        }
        description = description.trim();
      }
    }

    // Convert 2-digit years to 4-digit (21 -> 2021, 23 -> 2023)
    const convertYear = (dateStr) => {
      return dateStr.replace(/(\w+)\s+(\d{2})$/i, (match, month, year) => {
        const numYear = parseInt(year);
        // If year is 00-50, assume 2000-2050, otherwise 1950-1999
        const fullYear = numYear <= 50 ? 2000 + numYear : 1900 + numYear;
        return `${month} ${fullYear}`;
      });
    };

    const startDate = convertYear(dateInfo.startDate);
    const endDate = dateInfo.endDate.toLowerCase() === 'present' || dateInfo.endDate.toLowerCase() === 'current' 
      ? 'Present' 
      : convertYear(dateInfo.endDate);

    jobs.push({
      position: position,
      company: company,
      startDate: startDate,
      endDate: endDate,
      summary: description,
    });
  }

  return jobs;
}

function parseEducation(text) {
  if (!text) return [];

  console.log("=== PARSE EDUCATION ===");
  console.log("Input text length:", text.length);
  console.log("First 500 chars:", text.substring(0, 500));

  const education = [];

  // Debug: log the actual text being parsed
  if (text && text.length > 0) {
    console.log(
      "[parseEducation] Received text:",
      text.substring(0, 150),
      "... (length:",
      text.length,
      ")"
    );
  }

  // Strategy: Find all date ranges first (these are our anchors)
  // Then extract institution/degree/location around each date
  // Format: [Institution] [StartDate - EndDate] [Degree] [Location]

  // Support both 2-digit (21) and 4-digit (2021) years
  const dateRangePattern =
    /(\w+\.?\s+\d{2,4})\s*[-–—]\s*((?:\w+\.?\s+\d{2,4})|present|current)/gi;
  let dateMatch;
  const dateMatches = [];

  while ((dateMatch = dateRangePattern.exec(text)) !== null) {
    dateMatches.push({
      fullMatch: dateMatch[0],
      startDate: dateMatch[1],
      endDate: dateMatch[2],
      index: dateMatch.index,
    });
  }

  console.log(`[parseEducation] Found ${dateMatches.length} date ranges`);
  dateMatches.forEach((dm, i) => {
    console.log(`  Date ${i + 1}: "${dm.fullMatch}" at index ${dm.index}`);
  });

  if (dateMatches.length === 0) {
    console.log("❌ No education dates found");
    return [];
  }

  // Process each date range found
  for (let i = 0; i < dateMatches.length; i++) {
    const current = dateMatches[i];
    const next = dateMatches[i + 1];

    // Extract institution: look backward from date for institution keywords
    // Strategy: Find the line containing institution before the date
    let institution = "";
    const beforeDateText = text.substring(
      Math.max(0, current.index - 300),
      current.index
    );
    
    // Split into lines and find the one with institution keywords
    const linesBeforeDate = beforeDateText.split('\n').reverse();
    
    const institutionKeywords = [
      "University",
      "College",
      "Institute",
      "School",
      "Academy",
    ];
    
    for (const line of linesBeforeDate) {
      const trimmedLine = line.trim();
      // Check if this line contains an institution keyword
      for (const keyword of institutionKeywords) {
        if (trimmedLine.toLowerCase().includes(keyword.toLowerCase())) {
          // Take the full line as institution, removing leading bullets
          institution = trimmedLine.replace(/^[●•]\s*/, '').trim();
          // Extract just the institution part (before comma or location)
          const commaIndex = institution.indexOf(',');
          if (commaIndex > 0) {
            institution = institution.substring(0, commaIndex).trim();
          }
          break;
        }
      }
      if (institution) break;
    }

    // Extract degree and area: look forward from date end for degree keywords
    let studyType = "Degree";
    let area = "";
    const afterDateStart = current.index + current.fullMatch.length;
    let afterDateText;

    // Determine end point for extracting text after date
    // Use next date as boundary if available
    if (next) {
      afterDateText = text.substring(afterDateStart, next.index);
    } else {
      afterDateText = text.substring(afterDateStart, afterDateStart + 200);
    }

    // BRUTE FORCE: Look for degree keywords directly in the text
    console.log(
      `[Entry ${i + 1}] afterDateText (${
        afterDateText.length
      }): "${afterDateText.substring(0, 150).replace(/\n/g, "\\n")}"`
    );

    let degreeFound = false;
    let degreeType = "";
    let fieldOfStudy = "";
    let location = "";

    // Look for each degree keyword
    const degrees = [
      { keyword: "Master's", type: "Master's" },
      { keyword: "Master", type: "Master's" },
      { keyword: "Bachelor's", type: "Bachelor's" },
      { keyword: "Bachelor", type: "Bachelor's" },
      { keyword: "PhD", type: "PhD" },
      { keyword: "Doctorate", type: "PhD" },
    ];

    for (const degreeInfo of degrees) {
      // Case-insensitive search
      const upperText = afterDateText.toUpperCase();
      const upperKeyword = degreeInfo.keyword.toUpperCase();
      const idx = upperText.indexOf(upperKeyword);

      if (idx !== -1) {
        degreeType = degreeInfo.type;
        console.log(
          `[Entry ${i + 1}] Found degree: "${
            degreeInfo.keyword
          }" at position ${idx}`
        );

        // Extract field: Look for "in/of [field]" after the degree keyword
        const afterKeyword = afterDateText.substring(
          idx + degreeInfo.keyword.length
        );

        // Look for "in/of [field]" - stop at location (City, Country) or end of line
        // Location indicators: Capital City, Capital Country/State
        let fieldMatch = afterKeyword.match(
          /\s*(?:in|of)\s+([A-Za-z\s&(),-]+?)(?=\s+[A-Z][a-z]+,\s*[A-Z]|,|\n|$)/i
        );

        if (fieldMatch && fieldMatch[1]) {
          // Clean the field - remove location part if present
          let field = fieldMatch[1].trim();
          // Remove anything after "City," pattern
          field = field.replace(/\s+[A-Z][a-z]+,.*$/, "").trim();
          fieldOfStudy = field;
          console.log(`[Entry ${i + 1}] Found field: "${fieldOfStudy}"`);
        }

        // Extract location (City, Country) - look for comma-separated location pattern
        const locationMatch = afterKeyword.match(
          /\s+([A-Z][a-z]+),\s*([A-Z][A-Za-z]{1,10})/
        );
        if (locationMatch) {
          location = `${locationMatch[1]}, ${locationMatch[2]}`;
          console.log(`[Entry ${i + 1}] Found location: "${location}"`);
        }

        degreeFound = true;
        break;
      }
    }

    if (degreeFound) {
      studyType = degreeType;
      area = fieldOfStudy || degreeType;
      console.log(
        `[Entry ${
          i + 1
        }] ✓ Degree matched: type="${studyType}", field="${area}"`
      );
    } else {
      console.log(`[Entry ${i + 1}] ✗ NO DEGREE FOUND`);
    }

    // Only add if we found at least institution and dates
    // Accept any degree-related keywords, not just Master's/Bachelor's/PhD
    const isDegreeType =
      studyType === "Master's" ||
      studyType === "Bachelor's" ||
      studyType === "PhD" ||
      studyType.toLowerCase().includes('ms') ||
      studyType.toLowerCase().includes('bs') ||
      studyType.toLowerCase().includes('ba') ||
      studyType.toLowerCase().includes('ma') ||
      studyType.toLowerCase().includes('mba') ||
      studyType.toLowerCase().includes('btech') ||
      studyType.toLowerCase().includes('cert') ||
      studyType.toLowerCase().includes('diploma') ||
      studyType.toLowerCase().includes('degree') ||
      degreeFound; // If we found ANY degree keyword, accept it
    
    // Convert 2-digit years to 4-digit (21 -> 2021, 23 -> 2023)
    const convertYear = (dateStr) => {
      if (!dateStr) return dateStr;
      return dateStr.replace(/(\w+)\s+(\d{2})$/i, (match, month, year) => {
        const numYear = parseInt(year);
        const fullYear = numYear <= 50 ? 2000 + numYear : 1900 + numYear;
        return `${month} ${fullYear}`;
      });
    };

    const startDate = convertYear(current.startDate);
    const endDate = current.endDate.toLowerCase() === 'present' || current.endDate.toLowerCase() === 'current'
      ? 'Present'
      : convertYear(current.endDate);

    if (institution && current.startDate && current.endDate && isDegreeType) {
      education.push({
        institution: institution,
        studyType: studyType,
        area: area || institution,
        startDate: startDate,
        endDate: endDate,
        location: location,
      });
      console.log(
        `[parseEducation] Added entry: ${institution} (${studyType})`
      );
    } else {
      console.log(
        `[parseEducation] SKIPPED entry - institution:${!!institution}, startDate:${!!current.startDate}, endDate:${!!current.endDate}, isDegreeType:${isDegreeType}, studyType:${studyType}`
      );
    }
  }

  console.log(
    `[parseEducation] Returning ${education.length} education entries`
  );

  return education;
}

function parseSkills(text) {
  if (!text) return [];

  const skills = [];
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  for (const line of lines) {
    // Check if line has a category (e.g., "Programming Languages: Java, Python")
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const name = line.substring(0, colonIndex).trim();
      const keywordsStr = line.substring(colonIndex + 1).trim();

      // Split keywords while preserving content in parentheses
      const keywords = [];
      let current = "";
      let parenDepth = 0;

      for (let i = 0; i < keywordsStr.length; i++) {
        const char = keywordsStr[i];
        if (char === "(") {
          parenDepth++;
          current += char;
        } else if (char === ")") {
          parenDepth--;
          current += char;
        } else if (
          (char === "," || char === ";" || char === "•" || char === "|") &&
          parenDepth === 0
        ) {
          // This is a separator and we're not inside parentheses
          if (current.trim().length > 0) {
            keywords.push(current.trim());
          }
          current = "";
        } else {
          current += char;
        }
      }

      // Add the last keyword
      if (current.trim().length > 0) {
        keywords.push(current.trim());
      }

      if (keywords.length > 0) {
        skills.push({
          name: name,
          keywords: keywords,
        });
      }
    } else {
      // Just a list of skills
      const keywords = line
        .split(/[,;•|]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (keywords.length > 0) {
        skills.push({
          name: "Skills",
          keywords: keywords,
        });
      }
    }
  }

  return skills;
}

function parseProjects(text) {
  if (!text) return [];

  console.log("=== PARSE PROJECTS ===");
  console.log("Input text length:", text.length);
  console.log("First 500 chars:", text.substring(0, 500));

  const projects = [];

  // Strategy: Split text into sections by finding project headers
  // Project header format: "Project Name | tech1, tech2"
  // The key is to ONLY capture techs on the SAME line as the pipe, not beyond first newline
  // Don't use ^ anchor - projects might not start at beginning of line in PDF text

  const headerPattern = /([A-Z][A-Za-z0-9\s\-&()]+?)\s*\|\s*([^\n]*)(?=\n|$)/g;

  let headerMatch;
  const headers = [];

  while ((headerMatch = headerPattern.exec(text)) !== null) {
    headers.push({
      name: headerMatch[1].trim(),
      techsRaw: headerMatch[2].trim(),
      index: headerMatch.index,
      matchLength: headerMatch[0].length,
    });
  }

  console.log(`[parseProjects] Found ${headers.length} project headers`);

  // For each header, extract techs and description
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];

    // Extract techs from the header line (between | and end of line, or until bullet)
    let techs = header.techsRaw;
    let description = ""; // IMPORTANT: techs might contain bullet on same line OR newline separates techs from description
    // Handle bullet on same line first
    if (techs.includes("•")) {
      const bulletIndex = techs.indexOf("•");
      // Text before bullet = techs, after = description start
      techs = techs.substring(0, bulletIndex).trim();
      // Description starts after the bullet
      let restOfDescription = header.techsRaw.substring(bulletIndex);

      // Get text from end of header line to start of next project or end
      const headerEnd = header.index + header.matchLength;
      const nextHeaderIndex =
        i + 1 < headers.length ? headers[i + 1].index : text.length;
      const fullDescription = text.substring(headerEnd, nextHeaderIndex).trim();

      description =
        restOfDescription + (fullDescription ? "\n" + fullDescription : "");
    } else {
      // No bullet in header line - description is everything after this header until next project
      const headerEnd = header.index + header.matchLength;
      const nextHeaderIndex =
        i + 1 < headers.length ? headers[i + 1].index : text.length;
      description = text.substring(headerEnd, nextHeaderIndex).trim();
    }

    // Parse techs into keywords array - split by comma/semicolon, filter out descriptions
    const keywords = techs
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter((s) => {
        // Filter: non-empty, no bullets, no newlines, not just whitespace
        if (!s || s === "•" || /[\n]/.test(s) || /^[\s]*$/.test(s))
          return false;
        return true;
      });

    // Clean description - remove bullets, collapse whitespace
    description = description
      .split("\n")
      .map((line) => line.replace(/^•\s*/, "").trim())
      .filter((line) => line.length > 0)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    // Add project
    if (header.name && (keywords.length > 0 || description.length > 0)) {
      projects.push({
        name: header.name,
        keywords: keywords,
        summary: description,
      });
    }
  }

  return projects;
}

// ==================== DATA CLEANUP ====================
function cleanupResumeData(resumeData) {
  // Clean common formatting issues from extracted data
  const cleaned = JSON.parse(JSON.stringify(resumeData)); // Deep copy

  // Fix common company name issues
  const companyFixes = {
    "Service - now": "ServiceNow",
    "service - now": "ServiceNow",
    "Service -": "Service",
  };

  // Apply company fixes
  if (cleaned.work && Array.isArray(cleaned.work)) {
    cleaned.work.forEach((job) => {
      // Fix company name
      for (const [bad, good] of Object.entries(companyFixes)) {
        if (job.company && job.company.includes(bad)) {
          job.company = job.company.replace(bad, good);
        }
      }
      // Also fix position field
      for (const [bad, good] of Object.entries(companyFixes)) {
        if (job.position && job.position.includes(bad)) {
          job.position = job.position.replace(bad, good);
        }
      }
      // Remove extra spaces
      if (job.company) job.company = job.company.replace(/\s+/g, " ").trim();
      if (job.position) job.position = job.position.replace(/\s+/g, " ").trim();
    });
  }

  // Clean education data
  if (cleaned.education && Array.isArray(cleaned.education)) {
    cleaned.education.forEach((edu) => {
      if (edu.institution)
        edu.institution = edu.institution.replace(/\s+/g, " ").trim();
      if (edu.area) edu.area = edu.area.replace(/\s+/g, " ").trim();
      if (edu.location) edu.location = edu.location.replace(/\s+/g, " ").trim();
    });
  }

  // Clean projects
  if (cleaned.projects && Array.isArray(cleaned.projects)) {
    cleaned.projects.forEach((project) => {
      if (project.name) project.name = project.name.replace(/\s+/g, " ").trim();
      if (project.summary)
        project.summary = project.summary.replace(/\s+/g, " ").trim();
      if (project.keywords && Array.isArray(project.keywords)) {
        project.keywords = project.keywords.map((k) =>
          k.replace(/\s+/g, " ").trim()
        );
      }
    });
  }

  // Clean skills
  if (cleaned.skills && Array.isArray(cleaned.skills)) {
    cleaned.skills.forEach((skillGroup) => {
      if (skillGroup.name)
        skillGroup.name = skillGroup.name.replace(/\s+/g, " ").trim();
      if (skillGroup.keywords && Array.isArray(skillGroup.keywords)) {
        skillGroup.keywords = skillGroup.keywords.map((k) =>
          k.replace(/\s+/g, " ").trim()
        );
      }
    });
  }

  return cleaned;
}

// ==================== UI UPDATES ====================
function updateDataSection() {
  // Update raw text
  document.getElementById("rawOutput").value = STATE.rawText;

  // Update JSON
  document.getElementById("jsonOutput").value = JSON.stringify(
    STATE.resumeData,
    null,
    2
  );

  // Update preview
  updateDataPreview();
}

function updateDataPreview() {
  const preview = document.getElementById("dataPreview");
  const data = STATE.resumeData;

  let html = "";

  // Basics
  html += '<div class="info-group">';
  html += "<h3>Basic Information</h3>";
  html += `<p><strong>Name:</strong> ${data.basics.name}</p>`;
  if (data.basics.label)
    html += `<p><strong>Title:</strong> ${data.basics.label}</p>`;
  if (data.basics.email)
    html += `<p><strong>Email:</strong> ${data.basics.email}</p>`;
  if (data.basics.phone)
    html += `<p><strong>Phone:</strong> ${data.basics.phone}</p>`;
  if (data.basics.location)
    html += `<p><strong>Location:</strong> ${data.basics.location}</p>`;
  html += "</div>";

  // Summary
  if (data.basics.summary) {
    html += '<div class="info-group">';
    html += "<h3>Summary</h3>";
    html += `<p>${data.basics.summary}</p>`;
    html += "</div>";
  }

  // Work
  if (data.work && data.work.length > 0) {
    html += '<div class="info-group">';
    html += "<h3>Experience</h3>";
    html += `<p>${data.work.length} position(s) found</p>`;
    html += "</div>";
  }

  // Education
  if (data.education && data.education.length > 0) {
    html += '<div class="info-group">';
    html += "<h3>Education</h3>";
    html += `<p>${data.education.length} degree(s) found</p>`;
    html += "</div>";
  }

  // Skills
  if (data.skills && data.skills.length > 0) {
    html += '<div class="info-group">';
    html += "<h3>Skills</h3>";
    html += `<p>${data.skills.length} skill category/ies found</p>`;
    html += "</div>";
  }

  // Projects
  if (data.projects && data.projects.length > 0) {
    html += '<div class="info-group">';
    html += "<h3>Projects</h3>";
    html += `<p>${data.projects.length} project(s) found</p>`;
    html += "</div>";
  }

  preview.innerHTML = html;
}

function resetDataSection() {
  document.getElementById("rawOutput").value = "";
  document.getElementById("jsonOutput").value = "";
  document.getElementById("dataPreview").innerHTML =
    '<div class="empty-state"><p>📋 Upload and parse a PDF to see structured data</p></div>';
}

function enableTemplates() {
  const templateCards = document.querySelectorAll(".template-card");
  templateCards.forEach((card) => {
    card.disabled = false;
  });
}

function disableTemplates() {
  const templateCards = document.querySelectorAll(".template-card");
  templateCards.forEach((card) => {
    card.disabled = true;
    card.classList.remove("active");
  });

  document.getElementById("exportBtn").disabled = true;
  document.getElementById("downloadJsonBtn").disabled = true;
  document.getElementById("printBtn").disabled = true;
}

function resetPreview() {
  const container = document.getElementById("resumeContainer");
  container.innerHTML = `
    <div class="empty-state large">
      <div class="empty-icon">📄</div>
      <h3>No Template Applied</h3>
      <p>Upload your PDF resume and select a template to see the preview</p>
    </div>
  `;
}

// ==================== TAB SWITCHING ====================
function handleTabSwitch(e) {
  const targetTab = e.currentTarget.dataset.tab;

  // Update tab buttons
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  e.currentTarget.classList.add("active");

  // Update tab content
  document.querySelectorAll(".tab-content").forEach((content) => {
    content.classList.remove("active");
  });

  const contentMap = {
    preview: "previewTab",
    json: "jsonTab",
    raw: "rawTab",
  };

  document.getElementById(contentMap[targetTab]).classList.add("active");
}

// ==================== TEMPLATE SELECTION ====================
function handleTemplateSelect(e) {
  const card = e.currentTarget;
  const templateName = card.dataset.template;

  // Allow selecting templates even when no resume is parsed so users can preview styles.

  // Update active state
  document.querySelectorAll(".template-card").forEach((c) => {
    c.classList.remove("active");
  });
  card.classList.add("active");

  // Render template
  STATE.currentTemplate = templateName;
  renderCurrentTemplate();

  // Enable export buttons only if we have parsed resume data
  const hasData = !!STATE.resumeData;
  document.getElementById("exportBtn").disabled = !hasData;
  document.getElementById("downloadJsonBtn").disabled = !hasData;
  document.getElementById("printBtn").disabled = !hasData;
}

function renderCurrentTemplate() {
  const container = document.getElementById("resumeContainer");
  // Use real parsed data when available; otherwise render a friendly sample so the user sees the design
  const dataToRender = STATE.resumeData || SAMPLE_DATA;
  const result = renderTemplate(STATE.currentTemplate, dataToRender);
  // result is { html, css }

  // Inject HTML
  container.innerHTML = result.html || "";

  // Inject CSS by creating a style tag
  let styleTag = document.getElementById("template-styles");
  if (!styleTag) {
    styleTag = document.createElement("style");
    styleTag.id = "template-styles";
    document.head.appendChild(styleTag);
  }
  styleTag.textContent = result.css || "";

  STATE.lastRender = result;
}

// ==================== EXPORT & PRINT ====================
function handleExport() {
  if (!STATE.resumeData || !STATE.currentTemplate) {
    alert("Please select a template first.");
    return;
  }
  const renderResult = renderTemplate(STATE.currentTemplate, STATE.resumeData);
  const resumeHTML = renderResult.html || "";
  const resumeCSS = renderResult.css || "";

  const fullHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${STATE.resumeData.basics.name} - Resume</title>
  <style>
    body {
      margin: 0;
      padding: 20px;
      font-family: Arial, sans-serif;
    }
    @media print { body { padding: 0; } }
    ${resumeCSS}
  </style>
</head>
<body>
  ${resumeHTML}
</body>
</html>
  `;

  // Create download
  const blob = new Blob([fullHTML], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${STATE.resumeData.basics.name.replace(/\s+/g, "_")}_${
    STATE.currentTemplate
  }_resume.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function handlePrint() {
  if (!STATE.resumeData || !STATE.currentTemplate) {
    alert("Please select a template first.");
    return;
  }

  window.print();
}

function handleDownloadJSON() {
  if (!STATE.resumeData) {
    alert("No resume data to download. Please parse a resume first.");
    return;
  }

  const content = JSON.stringify(STATE.resumeData, null, 2);
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${STATE.resumeData.basics.name.replace(
    /\s+/g,
    "_"
  )}_resume.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ==================== UTILITY FUNCTIONS ====================
function copyToClipboard(elementId, btn) {
  const element = document.getElementById(elementId);
  if (!element) return;

  // Select and copy
  element.select();
  document.execCommand("copy");

  // Visual feedback
  const copyBtn = btn || document.activeElement;
  if (copyBtn && copyBtn.classList && copyBtn.classList.contains("btn-copy")) {
    const originalHTML = copyBtn.innerHTML;
    copyBtn.innerHTML = "<span>✓</span> Copied!";
    copyBtn.style.color = "var(--success)";

    setTimeout(() => {
      copyBtn.innerHTML = originalHTML;
      copyBtn.style.color = "";
    }, 2000);
  }
}
