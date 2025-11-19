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
  initializeEventListeners();
  renderSamplePreview();
});

function initializeEventListeners() {
  // File upload
  const pdfInput = document.getElementById("pdfInput");
  const uploadBox = document.getElementById("uploadBox");
  const parseBtn = document.getElementById("parseBtn");
  const removeFile = document.getElementById("removeFile");

  pdfInput.addEventListener("change", handleFileSelect);
  parseBtn.addEventListener("click", handleParsePDF);
  removeFile.addEventListener("click", handleRemoveFile);

  // Drag and drop
  uploadBox.addEventListener("dragover", handleDragOver);
  uploadBox.addEventListener("dragleave", handleDragLeave);
  uploadBox.addEventListener("drop", handleDrop);

  // Tabs
  const tabBtns = document.querySelectorAll(".tab-btn");
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", handleTabSwitch);
  });

  // Template cards
  const templateCards = document.querySelectorAll(".template-card");
  templateCards.forEach((card) => {
    card.addEventListener("click", handleTemplateSelect);
  });

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
  const file = e.target.files[0];
  if (!file) return;

  if (!file.type.includes("pdf")) {
    alert("Please upload a PDF file.");
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    alert("File size exceeds 10MB. Please upload a smaller file.");
    return;
  }

  STATE.pdfFile = file;

  // Read file as ArrayBuffer
  const reader = new FileReader();
  reader.onload = function (event) {
    STATE.pdfArrayBuffer = event.target.result;
    showFileInfo(file.name);
    document.getElementById("parseBtn").disabled = false;
  };
  reader.readAsArrayBuffer(file);
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
  if (!STATE.pdfArrayBuffer) {
    alert("Please select a PDF file first.");
    return;
  }

  showLoading(true);

  try {
    // Use the PDFTextExtractor module (wrapper around pdf.js)
    if (!window.PDFTextExtractor || !PDFTextExtractor.extractText) {
      throw new Error("PDFTextExtractor module not available");
    }

    const extracted = await PDFTextExtractor.extractText(STATE.pdfArrayBuffer);
    STATE.rawText = extracted || "";

    // Parse text into structured data
    STATE.resumeData = parseResumeText(STATE.rawText);

    // Update UI
    updateDataSection();
    enableTemplates();

    showLoading(false);

    // Auto-select first template
    document.querySelector('.template-card[data-template="classic"]').click();
  } catch (error) {
    console.error("Error parsing PDF:", error);
    alert("Failed to parse PDF. Please try another file.");
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

  // Extract sections
  const sections = identifySections(cleanedText);
  console.log(
    "parseResumeText - Sections found:",
    Object.keys(sections),
    sections
  );

  // Build resume data object
  const resumeData = {
    basics: {
      name: name,
      label: lines[1] || "",
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

  return resumeData;
}

function extractEmail(text) {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const match = text.match(emailRegex);
  return match ? match[0] : "";
}

function extractPhone(text) {
  const phoneRegex =
    /(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/;
  const match = text.match(phoneRegex);
  return match ? match[0] : "";
}

function extractURL(text) {
  const urlRegex = /(https?:\/\/[^\s]+)|(linkedin\.com\/[^\s]+)/i;
  const match = text.match(urlRegex);
  return match ? match[0] : "";
}

function extractLocation(text) {
  // Look for city, state patterns
  const locationRegex = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})/;
  const match = text.match(locationRegex);
  return match ? match[0] : "";
}

function identifySections(text) {
  const sections = {};

  const sectionKeywords = {
    education: ["EDUCATION", "ACADEMIC"],
    experience: ["EXPERIENCE", "PROFESSIONAL EXPERIENCE", "WORK EXPERIENCE"],
    projects: ["PROJECTS", "PORTFOLIO"],
    skills: ["TECHNICAL SKILLS", "SKILLS"],
    summary: ["PROFESSIONAL SUMMARY", "SUMMARY"],
    certifications: ["CERTIFICATIONS", "LICENSES"],
    languages: ["LANGUAGES"],
  };

  const headerMatches = [];

  // Case-INSENSITIVE matching to handle all variations
  for (const [sectionName, keywords] of Object.entries(sectionKeywords)) {
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, "gi");
      let match;
      while ((match = regex.exec(text)) !== null) {
        headerMatches.push({
          sectionName: sectionName,
          keyword: keyword,
          index: match.index,
        });
      }
    }
  }

  headerMatches.sort((a, b) => a.index - b.index);
  console.log(
    "Headers found:",
    headerMatches.map((h) => `${h.sectionName}@${h.index}`)
  );

  // Remove duplicates - keep first occurrence of each section
  const uniqueMatches = [];
  const seenSections = new Set();

  for (const match of headerMatches) {
    if (!seenSections.has(match.sectionName)) {
      uniqueMatches.push(match);
      seenSections.add(match.sectionName);
    }
  }

  // Extract content between section headers
  for (let i = 0; i < uniqueMatches.length; i++) {
    const current = uniqueMatches[i];
    const next = uniqueMatches[i + 1];

    const startIndex = current.index + current.keyword.length;
    const endIndex = next ? next.index : text.length;
    const content = text.substring(startIndex, endIndex).trim();

    if (content.length > 0) {
      sections[current.sectionName] = content;
      console.log(`✓ ${current.sectionName}: ${content.substring(0, 80)}...`);
    }
  }

  console.log("Sections extracted:", Object.keys(sections));
  return sections;
}

function parseWorkExperience(text) {
  if (!text) return [];

  const jobs = [];

  // Find jobs by looking for date patterns: "Month Year - Month Year" or "Month Year - Present"
  const datePattern =
    /([A-Z][a-z]+\.?\s+\d{4})\s*[-–—]\s*((?:[A-Z][a-z]+\.?\s+\d{4})|Present)/g;

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

  if (dateMatches.length === 0) return [];

  // Extract job info for each date
  for (let i = 0; i < dateMatches.length; i++) {
    const dateInfo = dateMatches[i];
    const nextDateInfo = dateMatches[i + 1];

    // Find the header by working BACKWARDS from the date
    // The header consists of the 1-2 lines immediately before the date
    const linesBefore = text.substring(0, dateInfo.index);
    const headerLines = linesBefore
      .split("\n")
      .reverse() // Reverse to find the last lines before date
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    // Take first 2 non-empty lines (they may be position and company, or position (company))
    let position = "";
    let company = "";

    if (headerLines.length >= 2) {
      position = headerLines[1]; // Second-to-last non-empty line
      company = headerLines[0]; // Last non-empty line before date
    } else if (headerLines.length === 1) {
      position = headerLines[0]; // Only one line
    }

    // Get text AFTER the date (description)
    const descStart = dateInfo.endIndex;
    const descEnd = nextDateInfo ? nextDateInfo.index : text.length;
    const description = text.substring(descStart, descEnd).trim();

    jobs.push({
      position: position,
      company: company,
      startDate: dateInfo.startDate,
      endDate: dateInfo.endDate,
      summary: description,
    });
  }

  return jobs;
}

function parseEducation(text) {
  if (!text) return [];

  const education = [];

  // Education format in PDF:
  // Institution Name
  // City, State
  // Degree Type and Field
  // Month Year
  //
  // (repeat for each entry)

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Group lines into education entries
  // Each entry starts with an institution name (capitalized words)
  // Followed by: City, State; Degree; Year
  let currentEntry = {
    institution: "",
    location: "",
    degree: "",
    year: "",
  };

  const entries = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if this line contains a location (City, State pattern)
    const isLocation = /,/.test(line) && /^[A-Z][\w\s]+,\s*[A-Z]/.test(line);
    // Check if this line is a year
    const isYear = /^\w+\s+\d{4}$/.test(line);
    // Check if this line contains degree keywords
    const isDegree = /bachelor|master|degree|phd|doctorate/i.test(line);

    if (!isLocation && !isYear && !isDegree && currentEntry.institution === "") {
      // This is likely an institution name
      currentEntry.institution = line;
    } else if (isLocation && currentEntry.institution !== "") {
      // This is location
      currentEntry.location = line;
    } else if (isDegree && currentEntry.institution !== "") {
      // This is degree info
      currentEntry.degree = line;
    } else if (isYear && currentEntry.institution !== "") {
      // This is year - end of entry
      currentEntry.year = line;
      entries.push({ ...currentEntry });
      currentEntry = {
        institution: "",
        location: "",
        degree: "",
        year: "",
      };
    }
  }

  // Handle last entry if incomplete
  if (currentEntry.institution !== "") {
    entries.push(currentEntry);
  }

  // Parse entries into education objects
  for (const entry of entries) {
    let studyType = "Degree";
    let area = "";

    if (entry.degree) {
      if (/master/i.test(entry.degree)) {
        studyType = "Master's";
      } else if (/bachelor/i.test(entry.degree)) {
        studyType = "Bachelor's";
      }

      // Extract field: "Bachelor of Science in Computer Science" -> "Computer Science"
      const fieldMatch = entry.degree.match(
        /(?:Bachelor|Master|PhD)(?:\s+of)?\s+(?:Science|Arts|Technology|Engineering)\s+(?:in\s+)?([^,]+)/i
      );
      if (fieldMatch) {
        area = fieldMatch[1].trim();
      } else {
        area = entry.degree;
      }
    }

    education.push({
      institution: entry.institution,
      studyType: studyType,
      area: area || "Education",
      startDate: "",
      endDate: entry.year,
      location: entry.location,
    });
  }

  return education;
}

    if (degree.toLowerCase().includes("master")) {
      studyType = "Master's";
      area = degree.replace(/master'?s?\s*(?:in|of)?\s*/i, "").trim();
    } else if (degree.toLowerCase().includes("bachelor")) {
      studyType = "Bachelor's";
      area = degree.replace(/bachelor'?s?\s*(?:in|of)?\s*/i, "").trim();
    }

    education.push({
      institution: institution,
      studyType: studyType,
      area: area,
      startDate: dateInfo.startDate,
      endDate: dateInfo.endDate,
      location: location,
    });
  }

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
      const keywords = keywordsStr
        .split(/[,;•|]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      skills.push({
        name: name,
        keywords: keywords,
      });
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

  const projects = [];

  // Strategy: Find all patterns like "Project Name | Technology1, Technology2"
  // A project title is followed by description with bullet points
  // This handles malformed PDF text where everything is on one line

  // Regex to find: [Project Title] | [Technologies]
  // The project title is typically capitalized words
  const projectTitleRegex =
    /([A-Z][A-Za-z0-9\s]+(?:[A-Z][A-Za-z0-9\s]+)*)\s*\|\s*([^•]+?)(?=•|(?:[A-Z][A-Za-z0-9\s]+(?:[A-Z][A-Za-z0-9\s]+)*\s*\|)|$)/g;

  let match;
  const matches = [];

  while ((match = projectTitleRegex.exec(text)) !== null) {
    matches.push({
      title: match[1].trim(),
      tech: match[2].trim(),
      index: match.index,
      length: match[0].length,
    });
  }

  // Extract descriptions between consecutive projects
  for (let i = 0; i < matches.length; i++) {
    const currentMatch = matches[i];
    const nextMatch = matches[i + 1];

    // Description starts right after the current match
    let descStart = currentMatch.index + currentMatch.length;
    // Description ends at the start of next project or end of text
    let descEnd = nextMatch ? nextMatch.index : text.length;

    let description = text.substring(descStart, descEnd).trim();

    // Clean up description: remove bullets and collapse spaces
    description = description
      .replace(/^•\s*/gm, "") // Remove bullet points
      .replace(/\s+/g, " ") // Collapse multiple spaces
      .trim();

    projects.push({
      name: currentMatch.title,
      keywords: currentMatch.tech
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
      summary: description,
    });
  }

  return projects;
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
  container.innerHTML = result.html || "";
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
