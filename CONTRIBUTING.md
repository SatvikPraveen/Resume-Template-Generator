# Contributing to Resume Template Generator

Thank you for your interest in contributing to the Resume Template Generator! We welcome contributions from the community and appreciate your help in making this project better.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Contribute](#how-to-contribute)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Submitting Changes](#submitting-changes)
- [Style Guidelines](#style-guidelines)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Enhancements](#suggesting-enhancements)

---

## 💼 Code of Conduct

This project adheres to the Contributor Covenant. By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

**Be respectful, inclusive, and constructive in all interactions.**

---

## 🤝 How to Contribute

### Types of Contributions

We welcome all kinds of contributions:

- 🎨 **New Templates** - Design and implement new resume templates
- 🐛 **Bug Fixes** - Fix issues and improve existing functionality
- ✨ **Features** - Add new features or enhance existing ones
- 📖 **Documentation** - Improve README, comments, and guides
- 🧪 **Testing** - Report bugs and test new features
- 💡 **Ideas** - Suggest improvements and new ideas

---

## 🚀 Getting Started

### 1. Fork the Repository

```bash
# Click the "Fork" button on GitHub
# Then clone your fork locally
git clone https://github.com/YOUR-USERNAME/resume-template-generator.git
cd resume-template-generator
```

### 2. Create a Branch

```bash
# Create a new branch for your feature or fix
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

**Branch naming conventions:**
- `feature/` for new features
- `fix/` for bug fixes
- `docs/` for documentation updates
- `template/` for new templates

### 3. Make Your Changes

See [Making Changes](#making-changes) section below.

### 4. Commit Your Changes

```bash
git add .
git commit -m "Type: Description of changes

- Detailed explanation of what changed
- Why this change was needed
- Any relevant issue numbers (e.g., #123)"
```

**Commit message format:**
- `Feature:` for new features
- `Fix:` for bug fixes
- `Docs:` for documentation
- `Style:` for formatting/styling
- `Template:` for new or updated templates

### 5. Push to Your Fork

```bash
git push origin feature/your-feature-name
```

### 6. Open a Pull Request

1. Go to your fork on GitHub
2. Click "Compare & pull request"
3. Fill in the PR description with:
   - What you changed
   - Why you changed it
   - How to test the changes
4. Submit the pull request

---

## 💻 Development Setup

The app is static (no build step). Node 20+ is needed only for tests and the evaluation harness.

```bash
npm install          # dev dependencies: pdfjs-dist (Node build) and pdfkit (fixture generation)
npm run serve        # serve the app at http://localhost:8000
npm test             # unit tests (node --test)
npm run eval         # score every fixture in eval/fixtures/, write eval/results.json
npm run eval:check   # fail if any fixture regresses against eval/baseline.json (runs in CI)
npm run fixtures:pdf # regenerate the synthetic PDF fixtures
```

### Parser changes

1. Reproduce the problem as a fixture: create `eval/fixtures/<name>/` with `input.txt` (or `input.pdf`) and an `expected.json` containing only the fields you assert. Fixtures must be fictional; never commit a real person's résumé.
2. Run `npm run eval -- --verbose --only <name>` and read the field-level mismatches.
3. Fix the rule (see `docs/ARCHITECTURE.md` for where each decision lives) and add a unit test in `test/` when the fix is a reusable primitive (a date shape, a heading phrase, a geometry rule).
4. Run `npm test && npm run eval`. If scores improved, refresh the baseline with `npm run eval -- --update` and commit `eval/baseline.json` with your change.

### Template changes

Templates receive the escaped view model from `src/render/model.js`; never interpolate raw résumé text. Use `formatDateRange` and `renderEntryBody` rather than `new Date()` or hand-rolled lists, and run `npm test` — the pipeline test renders every template and checks for unescaped HTML and "Invalid Date".

---

## ✏️ Making Changes

### Adding a New Template

**Steps:**

1. **Open `templates.js`**
   - Find the `TEMPLATES` object
   - Add your new template following this structure:

```javascript
  yourTemplateName: {
    name: "Your Template Name",
    render: (data) => {
      const formatDate = (start, end) => {
        // Date formatting logic
      };

      const html = `
        <!-- Your HTML structure -->
        <div class="resume-content your-class">
          <!-- Use data.basics, data.work, data.education, data.skills, data.projects -->
        </div>
      `;

      const css = `
        /* Your CSS styles */
        .resume-content.your-class {
          /* styles */
        }
      `;

      return { html, css };
    },
  },
```

2. **Include all sections:**
   - Basics (name, title, contact info, summary)
   - Work Experience
   - Education
   - Skills
   - Projects

3. **Test your template:**
   - Upload a PDF resume
   - Select your new template
   - Verify it renders correctly
   - Check print output

4. **Commit your changes:**
   ```bash
   git commit -m "Template: Add Your Template Name template
   
   - Implemented unique design with [key features]
   - Supports all resume sections
   - Print-friendly styling included"
   ```

### Fixing a Bug

1. **Identify the issue** - Understand what's broken
2. **Locate the code** - Find where the bug exists
3. **Fix the bug** - Make minimal, targeted changes
4. **Test thoroughly** - Verify the fix works
5. **Commit the fix:**
   ```bash
   git commit -m "Fix: Brief description of fix
   
   - Explain what was wrong
   - Explain how it's fixed
   - Reference any related issues"
   ```

### Improving Documentation

1. Update relevant `.md` files
2. Add helpful comments to code
3. Keep examples clear and current
4. Commit:
   ```bash
   git commit -m "Docs: Update documentation
   
   - Updated [section] with [improvements]
   - Added examples for [topic]"
   ```

---

## 📤 Submitting Changes

### Pull Request Checklist

Before submitting a PR, ensure:

- [ ] Code follows style guidelines (see below)
- [ ] Changes are well-documented
- [ ] No unnecessary code or comments removed
- [ ] Feature/fix has been tested
- [ ] Commit messages are clear and descriptive
- [ ] No merge conflicts with main branch
- [ ] Related issues are referenced

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] New feature
- [ ] Bug fix
- [ ] Documentation update
- [ ] New template
- [ ] Style/formatting

## Related Issues
Closes #123

## Testing
How to test these changes:
1. Step one
2. Step two
3. Step three

## Screenshots (if applicable)
[Add screenshots showing the changes]

## Notes
Any additional context or considerations
```

---

## 🎨 Style Guidelines

### JavaScript

- Use clear, descriptive variable names
- Add comments for complex logic
- Follow existing code patterns
- Use template literals for strings with variables
- Keep functions focused and single-purpose

**Example:**
```javascript
// Good
const formatDate = (start, end) => {
  if (!end) return formatSingleDate(start);
  return formatDateRange(start, end);
};

// Avoid
const fd = (s, e) => e ? `${s}-${e}` : s;
```

### CSS

- Use meaningful class names
- Group related styles
- Include comments for sections
- Use CSS Grid/Flexbox for layout
- Ensure responsive design

**Example:**
```css
/* Good */
.resume-content {
  font-family: 'Segoe UI', sans-serif;
  padding: 40px;
}

.section-header {
  font-size: 14px;
  font-weight: 700;
  margin: 20px 0 10px 0;
}

/* Avoid */
.rc { padding: 40px; } /* unclear abbreviation */
.sh { font-size: 14px; } /* too vague */
```

### HTML

- Use semantic HTML elements
- Add data attributes where helpful
- Include alt text for images
- Keep structure clean and logical

---

## 🐛 Reporting Bugs

### Before Reporting

1. Check existing issues - your bug might already be reported
2. Try clearing browser cache
3. Test in a different browser
4. Check browser console for errors (F12)

### How to Report

Use the GitHub Issues section and include:

1. **Title** - Brief, descriptive title
2. **Description** - What you were doing when the bug occurred
3. **Steps to Reproduce** - Exact steps to reproduce the issue
4. **Expected Behavior** - What should have happened
5. **Actual Behavior** - What actually happened
6. **Screenshots** - If applicable
7. **Environment** - Browser, OS, resume file type (if relevant)

**Example:**
```
Title: Contact info being cut off in Corporate template sidebar

Steps to Reproduce:
1. Upload any PDF resume
2. Select Corporate template
3. View in Firefox on macOS

Expected: All contact info (email, phone, LinkedIn) visible in sidebar
Actual: Email and LinkedIn URL are cut off by vertical border

Browser: Firefox 121.0
OS: macOS 14.1
```

---

## 💡 Suggesting Enhancements

### Before Suggesting

1. Check existing discussions and issues
2. Ensure your suggestion aligns with project goals
3. Think about implementation complexity

### How to Suggest

Create a GitHub Discussion or Issue with:

1. **Title** - Clear, concise title
2. **Description** - What you want and why
3. **Use Cases** - How would this help users?
4. **Implementation Ideas** - How might this be built?
5. **Benefits** - What problems does this solve?

**Example:**
```
Title: Add custom color theme support

Description:
Allow users to customize template colors to match personal branding or company colors.

Use Cases:
- Job seekers wanting to add personality
- Corporate HR departments maintaining brand consistency

Benefits:
- Increased personalization
- Better corporate integration
- Competitive advantage

Possible Implementation:
- Color picker UI for main colors
- CSS variable system for easy customization
```

---

## 🎯 Good First Issues

New contributors should look for issues labeled:
- `good first issue`
- `beginner-friendly`
- `help wanted`
- `documentation`

These are specially marked as great starting points for new contributors.

---

## 📚 Additional Resources

- [GitHub Help](https://help.github.com)
- [Git Documentation](https://git-scm.com/doc)
- [Markdown Guide](https://www.markdownguide.org)
- [PDF.js Documentation](https://mozilla.github.io/pdf.js/)

---

## 🎓 Questions?

- 📖 Check the README and existing discussions
- 💬 Ask in GitHub Discussions
- 🐛 Open an issue if you need help

---

## 📝 License

By contributing to this project, you agree that your contributions will be licensed under its MIT License.

---

**Thank you for contributing! You're helping make Resume Template Generator better for everyone. 🎉**
