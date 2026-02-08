/**
 * Robust Resume Parser
 * 
 * Enhanced parsing with multiple fallback strategies
 * Handles diverse resume formats universally
 */

class RobustResumeParser {
  constructor() {
    // Multiple date format patterns
    this.datePatterns = [
      // Standard: "January 2020", "Jan 2020", "Jan. 2020"
      /([A-Z][a-z]+\.?\s+\d{4})/,
      // Year only: "2020"
      /(\d{4})/,
      // Month-Year: "01/2020", "01-2020"
      /(\d{1,2}[-/]\d{4})/,
      // Year range: "2020-2023"
      /(\d{4})\s*[-–—]\s*(\d{4})/,
      // Short year: "'20", "2020"
      /(['']?\d{2,4})/,
      // Season year: "Summer 2020", "Fall 2022"
      /(Spring|Summer|Fall|Winter)\s+\d{4}/i,
    ];

    // Section header variations
    this.sectionKeywords = {
      experience: [
        'experience', 'work', 'employment', 'professional experience',
        'work experience', 'work history', 'career', 'career history',
        'professional history', 'relevant experience', 'positions',
        // Add flexible patterns to match any word + "experience"
        'volunteering experience', 'volunteer experience', 'internship experience',
        'leadership experience', 'teaching experience', 'research experience'
      ],
      education: [
        'education', 'academic', 'qualifications', 'degrees',
        'academic background', 'educational background', 'academic qualifications',
        'certifications and education', 'schooling'
      ],
      skills: [
        'skills', 'competencies', 'technical skills', 'core competencies',
        'expertise', 'capabilities', 'proficiencies', 'technologies',
        'technical competencies', 'key skills', 'core skills'
      ],
      projects: [
        'projects', 'portfolio', 'key projects', 'personal projects',
        'notable projects', 'project experience', 'work samples'
      ],
      summary: [
        'summary', 'professional summary', 'profile', 'objective',
        'career objective', 'about', 'overview', 'personal statement',
        'professional profile', 'career summary'
      ],
      certifications: [
        'certifications', 'licenses', 'credentials', 'certificates',
        'professional certifications', 'awards', 'achievements'
      ]
    };

    // Education keywords for better detection
    this.educationKeywords = [
      'university', 'college', 'institute', 'school', 'academy',
      'polytechnic', 'bachelor', 'master', 'phd', 'doctorate',
      'diploma', 'degree', 'associate', 'certification', 'b.s.', 'm.s.',
      'b.a.', 'm.a.', 'b.tech', 'm.tech', 'mba', 'engineering'
    ];

    // Company indicators
    this.companyIndicators = [
      'inc', 'llc', 'ltd', 'corp', 'corporation', 'company',
      'co', 'group', 'technologies', 'solutions', 'systems',
      'services', 'consulting', 'partners', 'software', 'labs'
    ];
  }

  /**
   * Main parsing entry point with fallback strategies
   */
  parseResume(text) {
    if (!text || text.trim().length === 0) {
      return this.getEmptyResume();
    }

    const cleaned = this.cleanText(text);
    
    // Try multiple parsing strategies
    const sections = this.identifySectionsFlexible(cleaned);
    
    return {
      basics: this.extractBasics(cleaned, sections),
      work: this.extractWorkExperience(sections.experience || '', cleaned),
      education: this.extractEducation(sections.education || '', cleaned),
      skills: this.extractSkills(sections.skills || '', cleaned),
      projects: this.extractProjects(sections.projects || '', cleaned),
      summary: sections.summary || sections.profile || '',
      certifications: this.extractCertifications(sections.certifications || '', cleaned)
    };
  }

  /**
   * Enhanced text cleaning
   */
  cleanText(text) {
    return text
      // Normalize whitespace
      .replace(/[ \t]+/g, ' ')
      // Normalize dashes
      .replace(/[–—―]/g, '-')
      // Normalize quotes
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      // Clean excessive newlines but preserve structure
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      // Remove zero-width spaces and special characters
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .trim();
  }

  /**
   * Flexible section identification with multiple strategies
   */
  identifySectionsFlexible(text) {
    const sections = {};
    
    // Strategy 1: Look for clear section headers (case-insensitive)
    const headerMatches = [];
    
    for (const [sectionName, keywords] of Object.entries(this.sectionKeywords)) {
      for (const keyword of keywords) {
        // Match headers on their own line or followed by colon
        const patterns = [
          new RegExp(`^\\s*${keyword}\\s*:?\\s*$`, 'gim'),
          new RegExp(`\n\\s*${keyword}\\s*:?\\s*\n`, 'gim'),
          new RegExp(`^${keyword}\\s*:`, 'gim'),
        ];

        for (const pattern of patterns) {
          let match;
          pattern.lastIndex = 0;
          while ((match = pattern.exec(text)) !== null) {
            headerMatches.push({
              section: sectionName,
              keyword: keyword,
              index: match.index,
              length: match[0].length
            });
          }
        }
      }
    }

    // Strategy 1.5: Flexible pattern matching for compound headers
    // Matches: "PROFESSIONAL EXPERIENCE", "VOLUNTEERING EXPERIENCE", etc.
    const flexiblePatterns = [
      { section: 'experience', pattern: /(?:^|\n)\s*(?:\w+\s+)*experience\s*:?\s*(?:\n|$)/gi },
      { section: 'skills', pattern: /(?:^|\n)\s*(?:\w+\s+)*skills?\s*:?\s*(?:\n|$)/gi },
      { section: 'education', pattern: /(?:^|\n)\s*(?:\w+\s+)*(?:education|academic)\s*:?\s*(?:\n|$)/gi },
      { section: 'projects', pattern: /(?:^|\n)\s*(?:\w+\s+)*projects?\s*:?\s*(?:\n|$)/gi },
    ];

    for (const { section, pattern } of flexiblePatterns) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(text)) !== null) {
        // Only add if we haven't already matched this section at this position
        const alreadyMatched = headerMatches.some(h => 
          Math.abs(h.index - match.index) < 10 && h.section === section
        );
        
        if (!alreadyMatched) {
          headerMatches.push({
            section: section,
            keyword: match[0].trim(),
            index: match.index,
            length: match[0].length
          });
        }
      }
    }

    // Sort by position and remove duplicates
    headerMatches.sort((a, b) => a.index - b.index);
    const uniqueHeaders = this.deduplicateHeaders(headerMatches);

    // Extract content between headers
    for (let i = 0; i < uniqueHeaders.length; i++) {
      const current = uniqueHeaders[i];
      const next = uniqueHeaders[i + 1];
      
      const startIdx = current.index + current.length;
      const endIdx = next ? next.index : text.length;
      
      const content = text.substring(startIdx, endIdx).trim();
      
      // Store content (keep the first match for each section)
      if (!sections[current.section] && content.length > 0) {
        sections[current.section] = content;
      }
    }

    // Strategy 2: If sections are still empty, try fuzzy matching
    if (Object.keys(sections).length === 0) {
      return this.fuzzyExtractSections(text);
    }

    return sections;
  }

  /**
   * Remove duplicate section headers (keep first of each type)
   */
  deduplicateHeaders(headers) {
    const seen = new Set();
    const unique = [];
    
    for (const header of headers) {
      if (!seen.has(header.section)) {
        seen.add(header.section);
        unique.push(header);
      }
    }
    
    return unique;
  }

  /**
   * Fuzzy section extraction when clear headers aren't found
   */
  fuzzyExtractSections(text) {
    const sections = {};
    const lines = text.split('\n');
    
    // Look for education keywords
    const eduLines = [];
    const expLines = [];
    const skillLines = [];
    
    lines.forEach((line, idx) => {
      const lower = line.toLowerCase();
      
      // Check for education indicators
      if (this.educationKeywords.some(kw => lower.includes(kw))) {
        eduLines.push(idx);
      }
      
      // Check for date patterns (likely experience)
      if (this.containsDatePattern(line)) {
        expLines.push(idx);
      }
      
      // Check for skill-like content (lists, comma-separated)
      if (this.looksLikeSkillList(line)) {
        skillLines.push(idx);
      }
    });

    // Extract regions around detected content
    if (eduLines.length > 0) {
      const start = Math.max(0, eduLines[0] - 1);
      const end = Math.min(lines.length, eduLines[eduLines.length - 1] + 5);
      sections.education = lines.slice(start, end).join('\n');
    }

    if (expLines.length > 0) {
      const start = Math.max(0, expLines[0] - 2);
      const end = Math.min(lines.length, expLines[expLines.length - 1] + 10);
      sections.experience = lines.slice(start, end).join('\n');
    }

    if (skillLines.length > 0) {
      const start = Math.max(0, skillLines[0] - 1);
      const end = Math.min(lines.length, skillLines[skillLines.length - 1] + 3);
      sections.skills = lines.slice(start, end).join('\n');
    }

    return sections;
  }

  /**
   * Check if line contains date pattern
   */
  containsDatePattern(text) {
    return this.datePatterns.some(pattern => pattern.test(text));
  }

  /**
   * Check if line looks like a skill list
   */
  looksLikeSkillList(line) {
    // Lists with commas, bullets, or pipes
    const hasMultipleSeparators = (line.match(/[,•|]/g) || []).length >= 2;
    const hasColon = line.includes(':');
    const notTooLong = line.length < 200;
    
    return hasMultipleSeparators && notTooLong && !this.containsDatePattern(line);
  }

  /**
   * Extract basic contact information
   */
  extractBasics(text, sections) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    
    // Name is likely the first substantial line
    let name = lines[0] || 'Resume';
    
    // Clean name of contact info
    if (name.includes('|')) {
      name = name.split('|')[0].trim();
    }
    // Remove phone numbers from name
    name = name.replace(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g, '').trim();
    name = name.replace(/\+?\d{1,3}\s+\d{3}\s+\d{3}\s+\d{4}/g, '').trim();
    
    // Extract job title/label - skip lines with contact info
    let label = '';
    for (let i = 1; i < Math.min(5, lines.length); i++) {
      const line = lines[i];
      // Skip if line contains contact info or dates
      const hasContactInfo = 
        line.includes('@') || 
        /\+?\d{1,3}[-\s]?\d{3}[-\s]?\d{3}[-\s]?\d{4}/.test(line) ||
        /\d{3}[-\s]?\d{3}[-\s]?\d{4}/.test(line) ||
        line.includes('linkedin.com') ||
        line.includes('github.com') ||
        line.includes('|') ||
        this.containsDatePattern(line) ||
        /[A-Z][a-z]+,\s*[A-Z]{2}/.test(line); // City, ST pattern
      
      if (!hasContactInfo && line.length > 0 && line.length < 100) {
        label = line;
        break;
      }
    }
    
    return {
      name: name,
      email: this.extractEmail(text),
      phone: this.extractPhone(text),
      location: this.extractLocation(text),
      url: this.extractURL(text),
      label: label,
      summary: sections.summary || sections.profile || sections.objective || ''
    };
  }

  /**
   * Extract email with multiple pattern support
   */
  extractEmail(text) {
    const patterns = [
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[0];
    }
    
    return '';
  }

  /**
   * Extract phone with international support
   */
  extractPhone(text) {
    const patterns = [
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
      // Simple digits
      /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        // Clean up multiple spaces but preserve single spaces
        return match[0].replace(/\s+/g, ' ').trim();
      }
    }
    
    return '';
  }

  /**
   * Extract location flexibly
   */
  extractLocation(text) {
    // Look in first 500 chars (header area)
    const header = text.substring(0, 500);
    
    const patterns = [
      // City, State
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})\b/,
      // City, Country
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z][a-z]+)/,
      // Full address patterns
      /([A-Z][a-z\s]+),\s*([A-Z]{2,})\s*\d{5}/
    ];

    for (const pattern of patterns) {
      const match = header.match(pattern);
      if (match) return match[0];
    }
    
    return '';
  }

  /**
   * Extract URL/profiles
   */
  extractURL(text) {
    const patterns = [
      /(https?:\/\/[^\s]+)/,
      /(www\.[^\s]+)/,
      /(linkedin\.com\/in\/[^\s]+)/i,
      /(github\.com\/[^\s]+)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[0];
    }
    
    return '';
  }

  /**
   * Enhanced work experience extraction with fallbacks
   */
  extractWorkExperience(sectionText, fullText) {
    if (!sectionText || sectionText.trim().length === 0) {
      // Fallback: try to find experience in full text
      sectionText = this.findExperienceInText(fullText);
    }

    const jobs = [];
    
    // Strategy 1: Find by date ranges
    const dateRanges = this.findDateRanges(sectionText);
    
    if (dateRanges.length > 0) {
      jobs.push(...this.extractJobsByDates(sectionText, dateRanges));
    }
    
    // Strategy 2: Find by company indicators
    if (jobs.length === 0) {
      jobs.push(...this.extractJobsByCompanyIndicators(sectionText));
    }

    return jobs;
  }

  /**
   * Find all date ranges in text
   */
  findDateRanges(text) {
    const ranges = [];
    
    // Pattern: "Start - End" or "Start - Present"
    const rangePatterns = [
      /([A-Z][a-z]+\.?\s+\d{4})\s*[-–—]\s*((?:[A-Z][a-z]+\.?\s+\d{4})|Present|Current)/gi,
      /(\d{4})\s*[-–—]\s*(\d{4}|Present|Current)/gi,
      /(\d{1,2}\/\d{4})\s*[-–—]\s*(\d{1,2}\/\d{4}|Present|Current)/gi,
    ];

    for (const pattern of rangePatterns) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(text)) !== null) {
        ranges.push({
          full: match[0],
          start: match[1],
          end: match[2],
          index: match.index
        });
      }
    }

    return ranges;
  }

  /**
   * Extract jobs based on date ranges
   */
  extractJobsByDates(text, dateRanges) {
    const jobs = [];
    
    for (let i = 0; i < dateRanges.length; i++) {
      const dateInfo = dateRanges[i];
      const nextDate = dateRanges[i + 1];
      
      // Extract header (position/company) before date
      const beforeDate = text.substring(Math.max(0, dateInfo.index - 200), dateInfo.index);
      const headerLines = beforeDate.split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0)
        .reverse()
        .slice(0, 3); // Take last 3 lines before date

      let position = headerLines[1] || '';
      let company = headerLines[0] || '';

      // If company looks like a position, swap them
      if (this.looksLikeJobTitle(position) && !this.looksLikeJobTitle(company)) {
        [position, company] = [company, position];
      }

      // Extract description after date
      const descStart = dateInfo.index + dateInfo.full.length;
      const descEnd = nextDate ? nextDate.index : text.length;
      let description = text.substring(descStart, descEnd).trim();

      // Remove next job's header from description
      if (nextDate) {
        const lines = description.split('\n');
        // Remove last few non-bullet lines (likely next job's header)
        while (lines.length > 0 && !lines[lines.length - 1].startsWith('•')) {
          lines.pop();
        }
        description = lines.join('\n');
      }

      jobs.push({
        position: position,
        company: company,
        startDate: dateInfo.start,
        endDate: dateInfo.end,
        summary: this.cleanDescription(description)
      });
    }

    return jobs;
  }

  /**
   * Check if text looks like a job title
   */
  looksLikeJobTitle(text) {
    const titleKeywords = [
      'engineer', 'developer', 'manager', 'analyst', 'designer',
      'consultant', 'director', 'specialist', 'coordinator', 'lead',
      'senior', 'junior', 'associate', 'principal', 'staff'
    ];
    
    const lower = text.toLowerCase();
    return titleKeywords.some(kw => lower.includes(kw));
  }

  /**
   * Extract jobs when dates aren't clear
   */
  extractJobsByCompanyIndicators(text) {
    const jobs = [];
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    
    let currentJob = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase();
      
      // Check if line contains company indicator
      const hasCompanyIndicator = this.companyIndicators.some(ind => 
        lower.includes(ind + '.') || lower.includes(ind + ',') || lower.includes(' ' + ind)
      );

      if (hasCompanyIndicator || this.looksLikeJobTitle(line)) {
        // Save previous job
        if (currentJob) {
          jobs.push(currentJob);
        }
        
        // Start new job
        currentJob = {
          position: this.looksLikeJobTitle(line) ? line : lines[i - 1] || '',
          company: hasCompanyIndicator ? line : '',
          startDate: '',
          endDate: '',
          summary: ''
        };
      } else if (currentJob) {
        // Add to description
        currentJob.summary += (currentJob.summary ? '\n' : '') + line;
      }
    }
    
    // Add last job
    if (currentJob) {
      jobs.push(currentJob);
    }

    return jobs;
  }

  /**
   * Clean description text
   */
  cleanDescription(text) {
    return text
      .split('\n')
      .map(l => l.replace(/^[•\-\*]\s*/, '').trim())
      .filter(l => l.length > 0)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Find experience section in full text if not explicitly sectioned
   */
  findExperienceInText(text) {
    // Look for blocks with date patterns
    const paragraphs = text.split('\n\n');
    const expParagraphs = paragraphs.filter(p => this.containsDatePattern(p));
    return expParagraphs.join('\n\n');
  }

  /**
   * Enhanced education extraction
   */
  extractEducation(sectionText, fullText) {
    if (!sectionText || sectionText.trim().length === 0) {
      sectionText = this.findEducationInText(fullText);
    }

    const education = [];
    const dateRanges = this.findDateRanges(sectionText);
    
    for (const dateInfo of dateRanges) {
      // Look backward for institution
      const beforeDate = sectionText.substring(Math.max(0, dateInfo.index - 300), dateInfo.index);
      
      const institution = this.findInstitution(beforeDate);
      const degree = this.findDegree(sectionText, dateInfo.index);
      const location = this.extractLocation(beforeDate);

      if (institution || degree.type) {
        education.push({
          institution: institution,
          studyType: degree.type,
          area: degree.field,
          startDate: dateInfo.start,
          endDate: dateInfo.end,
          location: location
        });
      }
    }

    // Fallback: if no dates found, try pattern matching
    if (education.length === 0) {
      education.push(...this.extractEducationWithoutDates(sectionText));
    }

    return education;
  }

  /**
   * Find institution name
   */
  findInstitution(text) {
    for (const keyword of this.educationKeywords.slice(0, 5)) { // university, college, etc.
      const regex = new RegExp(`([A-Z][\\w\\s&()]+${keyword}[\\w\\s&()]*)`, 'i');
      const match = text.match(regex);
      if (match) {
        return match[1].trim();
      }
    }
    return '';
  }

  /**
   * Find degree information
   */
  findDegree(text, fromIndex) {
    const afterDate = text.substring(fromIndex, fromIndex + 300);
    
    const degreePatterns = [
      { pattern: /\b(bachelor'?s?|b\.?s\.?|b\.?a\.?|b\.?tech)\s+(?:of|in|degree in)?\s*([a-z\s&()]+)/i, type: "Bachelor's" },
      { pattern: /\b(master'?s?|m\.?s\.?|m\.?a\.?|m\.?tech|mba)\s+(?:of|in|degree in)?\s*([a-z\s&()]+)/i, type: "Master's" },
      { pattern: /\b(phd|ph\.?d\.?|doctorate)\s+(?:of|in)?\s*([a-z\s&()]+)/i, type: "PhD" },
      { pattern: /\b(associate)\s+(?:of|in)?\s*([a-z\s&()]+)/i, type: "Associate" },
    ];

    for (const { pattern, type } of degreePatterns) {
      const match = afterDate.match(pattern);
      if (match) {
        return {
          type: type,
          field: (match[2] || '').trim()
        };
      }
    }

    return { type: '', field: '' };
  }

  /**
   * Find education in full text
   */
  findEducationInText(text) {
    const lines = text.split('\n');
    const eduLines = [];
    
    lines.forEach((line, idx) => {
      const lower = line.toLowerCase();
      if (this.educationKeywords.some(kw => lower.includes(kw))) {
        eduLines.push(idx);
      }
    });

    if (eduLines.length > 0) {
      const start = Math.max(0, Math.min(...eduLines) - 1);
      const end = Math.min(lines.length, Math.max(...eduLines) + 5);
      return lines.slice(start, end).join('\n');
    }

    return '';
  }

  /**
   * Extract education without date patterns
   */
  extractEducationWithoutDates(text) {
    const entries = [];
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    
    for (const line of lines) {
      const institution = this.findInstitution(line);
      const degree = this.findDegree(line, 0);
      
      if (institution || degree.type) {
        entries.push({
          institution: institution,
          studyType: degree.type,
          area: degree.field,
          startDate: '',
          endDate: '',
          location: ''
        });
      }
    }

    return entries;
  }

  /**
   * Extract skills flexibly
   */
  extractSkills(sectionText, fullText) {
    if (!sectionText || sectionText.trim().length === 0) {
      return [];
    }

    const skills = [];
    const lines = sectionText.split('\n').map(l => l.trim()).filter(l => l);

    for (const line of lines) {
      // Check for categorized skills "Category: skill1, skill2"
      const colonIdx = line.indexOf(':');
      
      if (colonIdx > 0) {
        const category = line.substring(0, colonIdx).trim();
        const skillsText = line.substring(colonIdx + 1).trim();
        
        const keywords = this.splitSkills(skillsText);
        
        if (keywords.length > 0) {
          skills.push({
            name: category,
            keywords: keywords
          });
        }
      } else {
        // Uncategorized skills
        const keywords = this.splitSkills(line);
        
        if (keywords.length > 0) {
          skills.push({
            name: 'Skills',
            keywords: keywords
          });
        }
      }
    }

    return skills;
  }

  /**
   * Split skill text into individual skills
   */
  splitSkills(text) {
    // Split by common separators
    const separators = /[,;•|\/]/;
    
    return text
      .split(separators)
      .map(s => s.trim())
      .filter(s => s.length > 0 && s.length < 50) // Filter out overly long items
      .map(s => s.replace(/^[-\*]\s*/, '')); // Remove bullets
  }

  /**
   * Extract projects
   */
  extractProjects(sectionText, fullText) {
    if (!sectionText || sectionText.trim().length === 0) {
      return [];
    }

    const projects = [];
    
    // Look for "Project Name | tech1, tech2" or "Project Name" followed by bullets
    const projectPattern = /^([A-Z][^\n|]+?)(?:\s*\|\s*([^\n]+))?$/gm;
    
    let match;
    const matches = [];
    
    while ((match = projectPattern.exec(sectionText)) !== null) {
      matches.push({
        name: match[1].trim(),
        techsLine: match[2] ? match[2].trim() : '',
        index: match.index,
        length: match[0].length
      });
    }

    // Extract description for each project
    for (let i = 0; i < matches.length; i++) {
      const current = matches[i];
      const next = matches[i + 1];
      
      const descStart = current.index + current.length;
      const descEnd = next ? next.index : sectionText.length;
      
      const description = sectionText
        .substring(descStart, descEnd)
        .split('\n')
        .map(l => l.replace(/^[•\-\*]\s*/, '').trim())
        .filter(l => l.length > 0)
        .join(' ');

      const keywords = current.techsLine 
        ? this.splitSkills(current.techsLine)
        : [];

      projects.push({
        name: current.name,
        keywords: keywords,
        summary: description
      });
    }

    return projects;
  }

  /**
   * Extract certifications
   */
  extractCertifications(sectionText, fullText) {
    if (!sectionText || sectionText.trim().length === 0) {
      return [];
    }

    const certs = [];
    const lines = sectionText.split('\n').map(l => l.trim()).filter(l => l);

    for (const line of lines) {
      // Look for date patterns to separate cert name from date
      const dateMatch = line.match(/\d{4}|[A-Z][a-z]+\s+\d{4}/);
      
      if (dateMatch) {
        const name = line.substring(0, dateMatch.index).trim();
        const date = dateMatch[0];
        
        certs.push({
          name: name,
          date: date,
          issuer: ''
        });
      } else {
        certs.push({
          name: line,
          date: '',
          issuer: ''
        });
      }
    }

    return certs;
  }

  /**
   * Get empty resume structure
   */
  getEmptyResume() {
    return {
      basics: {
        name: '',
        email: '',
        phone: '',
        location: '',
        url: '',
        label: '',
        summary: ''
      },
      work: [],
      education: [],
      skills: [],
      projects: [],
      summary: '',
      certifications: []
    };
  }
}

// Export for use in browser
if (typeof window !== 'undefined') {
  window.RobustResumeParser = RobustResumeParser;
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RobustResumeParser;
}
