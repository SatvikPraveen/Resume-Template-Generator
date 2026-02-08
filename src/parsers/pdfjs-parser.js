/*
  PDFTextExtractor
  Lightweight wrapper around pdf.js to extract text from ArrayBuffer
  Exposes window.PDFTextExtractor.extractText(arrayBuffer) -> Promise<string>
  
  Waits for pdfjs-ready event if pdfjsLib not yet available.
*/
(function () {
  // Helper to ensure pdfjsLib is loaded
  async function ensurePdfjsReady() {
    // Check if already loaded
    if (window.pdfjsLib) {
      return;
    }

    // Check if module marked as ready
    if (window._pdfModuleReady) {
      return;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("PDF.js did not load within 10 seconds"));
      }, 10000);

      // Try to listen for event
      const handleReady = function () {
        clearTimeout(timeout);
        window.removeEventListener("pdfjs-ready", handleReady);
        // Give module a moment to fully set window.pdfjsLib
        setTimeout(resolve, 50);
      };

      window.addEventListener("pdfjs-ready", handleReady);

      // Also set a flag that we're waiting
      window._pdfExtractorInitializing = true;
    });
  }

  // Initialize after a brief delay to ensure DOM is ready
  const initPDFExtractor = async function () {
    try {
      await ensurePdfjsReady();

      window.PDFTextExtractor = {
        extractText: async function (arrayBuffer) {
          // Re-ensure pdfjsLib is ready when called
          await ensurePdfjsReady();

          if (!window.pdfjsLib) {
            throw new Error(
              "pdfjsLib is not loaded. Ensure pdf.mjs module was loaded."
            );
          }

          const loadingTask = window.pdfjsLib.getDocument({
            data: arrayBuffer,
          });
          const pdf = await loadingTask.promise;

          let fullText = "";
          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();

            // Use natural PDF text order and group by Y-coordinate (rows)
            const items = textContent.items;
            
            // Group items by Y position (row)
            const rows = {};
            for (const item of items) {
              const y = Math.round((item.transform && item.transform[5]) || 0);
              if (!rows[y]) {
                rows[y] = [];
              }
              rows[y].push(item);
            }

            // Sort rows by Y coordinate (descending - top to bottom)
            const sortedYs = Object.keys(rows).map(Number).sort((a, b) => b - a);
            
            const lines = [];
            for (const y of sortedYs) {
              // Sort items in this row by X coordinate (left to right)
              rows[y].sort((a, b) => {
                const ax = (a.transform && a.transform[4]) || 0;
                const bx = (b.transform && b.transform[4]) || 0;
                return ax - bx;
              });

              // Join text items in this row with smart spacing
              const lineText = rows[y].map((item, idx) => {
                const str = item.str;
                // Add space before if not first item and previous item doesn't end with space
                if (idx > 0 && !rows[y][idx - 1].str.endsWith(' ') && !str.startsWith(' ')) {
                  const prevX = rows[y][idx - 1].transform[4] + (rows[y][idx - 1].width || 0);
                  const currX = item.transform[4];
                  // If significant gap, add space
                  if (currX - prevX > 1) {
                    return ' ' + str;
                  }
                }
                return str;
              }).join('');

              if (lineText.trim()) {
                lines.push(lineText.trim());
              }
            }

            const pageText = lines.join("\n");
            fullText += pageText + "\n\n";
          }

          return fullText.trim();
        },
      };

      console.log("[PDFTextExtractor] ✅ Initialized successfully");
    } catch (error) {
      console.error(
        "[PDFTextExtractor] ❌ Initialization failed:",
        error.message
      );
      window.PDFTextExtractorError = error;
    }
  };

  // Try to initialize immediately if module is ready
  if (window._pdfModuleReady || window.pdfjsLib) {
    initPDFExtractor();
  } else {
    // Otherwise wait for DOM to be ready and then initialize
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initPDFExtractor);
    } else {
      // DOM already ready
      setTimeout(initPDFExtractor, 10);
    }
  }
})();
