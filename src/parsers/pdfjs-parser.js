/*
  PDFTextExtractor
  Lightweight wrapper around pdf.js to extract text from ArrayBuffer
  Exposes window.PDFTextExtractor.extractText(arrayBuffer) -> Promise<string>
  
  Waits for pdfjs-ready event if pdfjsLib not yet available.
*/
(function () {
  // Show a visible, user-facing error when the PDF engine itself fails to
  // load (as opposed to an error extracting a specific PDF file).
  function showEngineLoadError(message) {
    try {
      const errorBox = document.getElementById("uploadError");
      const errorText = document.getElementById("uploadErrorText");
      if (errorBox && errorText) {
        errorText.textContent = message;
        errorBox.classList.remove("is-hidden");
      }
    } catch (domError) {
      // DOM not available yet - fall through to console logging below
    }
    console.error("[PDFTextExtractor]", message);
  }

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
      await ensurePdfjsReady().catch((err) => {
        showEngineLoadError(
          "The PDF engine failed to load. Please refresh the page."
        );
        throw err;
      });

      window.PDFTextExtractor = {
        extractText: async function (arrayBuffer) {
          // Re-ensure pdfjsLib is ready when called
          await ensurePdfjsReady().catch((err) => {
            showEngineLoadError(
              "The PDF engine failed to load. Please refresh the page."
            );
            throw err;
          });

          if (!window.pdfjsLib) {
            throw new Error(
              "pdfjsLib is not loaded. Ensure pdf.mjs module was loaded."
            );
          }

          const loadingTask = window.pdfjsLib.getDocument({
            data: arrayBuffer,
          });
          const pdf = await loadingTask.promise;

          if (!pdf || !pdf.numPages || pdf.numPages < 1) {
            throw new Error("This PDF has no pages to extract text from.");
          }

          // Safely read a transform coordinate, defaulting to 0 when the
          // transform array is missing or shorter than expected.
          function getTransformCoord(item, index) {
            const t = item && item.transform;
            return Array.isArray(t) && t.length >= 6 ? t[index] || 0 : 0;
          }

          let fullText = "";
          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            try {
              const page = await pdf.getPage(pageNum);
              const textContent = await page.getTextContent();

              // Use natural PDF text order and group by Y-coordinate (rows)
              const items = textContent.items;

              // Group items by Y position (row)
              const rows = {};
              for (const item of items) {
                const y = Math.round(getTransformCoord(item, 5));
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
                  const ax = getTransformCoord(a, 4);
                  const bx = getTransformCoord(b, 4);
                  return ax - bx;
                });

                // Join text items in this row with smart spacing
                const lineText = rows[y].map((item, idx) => {
                  const str = item.str;
                  // Add space before if not first item and previous item doesn't end with space
                  if (idx > 0 && !rows[y][idx - 1].str.endsWith(' ') && !str.startsWith(' ')) {
                    const prevX = getTransformCoord(rows[y][idx - 1], 4) + (rows[y][idx - 1].width || 0);
                    const currX = getTransformCoord(item, 4);
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
            } catch (pageError) {
              console.warn(
                `[PDFTextExtractor] Skipping page ${pageNum} due to extraction error:`,
                pageError.message
              );
            }
          }

          return fullText.trim();
        },
      };
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
