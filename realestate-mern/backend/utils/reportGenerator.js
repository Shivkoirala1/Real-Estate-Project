/**
 * Report generator (Spec v2 - Feature 4)
 *
 * Dependency-light, deterministic report builders shared by the analytics
 * export endpoint. No DB access, no filesystem writes - sections come in,
 * bytes/String go out.
 *
 *   generateCsv({ title, generatedAt, sections }) -> String
 *   generatePdf({ title, generatedAt, sections }) -> Promise<Buffer>
 *
 * Section shape (identical metadata drives both formats):
 *   {
 *     title: 'Section heading',
 *     columns: [{ key, label, width?, align? }], // width = relative weight
 *     rows: [{ <key>: <cellValue>, ... }, ...],
 *   }
 */

const PDFDocument = require('pdfkit');

// ---------- shared helpers ----------

const formatDateTime = (value) => {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return String(value || '');
  // Deterministic, locale-independent stamp
  return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
};

const stringifyCell = (value) => {
  if (value === null || value === undefined) return '';
  return String(value);
};

// Numeric-looking cells are right-aligned in the PDF table
const isNumericLike = (text) =>
  /^-?[\d,]+(\.\d+)?$/.test(text) || /^-?\d+(\.\d+)?%$/.test(text);

// ---------- CSV ----------

// Wrap in quotes when the value contains a comma, quote or newline;
// double quotes inside get doubled ("say ""hi""" style).
const escapeCsv = (value) => {
  let s = stringifyCell(value);
  if (/[\n\r",]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

const generateCsv = ({ title, generatedAt, sections = [] }) => {
  const lines = [];
  lines.push(escapeCsv(title));
  lines.push(escapeCsv(`Generated at ${formatDateTime(generatedAt)}`));

  (sections || []).forEach((section) => {
    lines.push('');
    lines.push(escapeCsv(section.title));
    lines.push((section.columns || []).map((col) => escapeCsv(col.label || col.key)).join(','));
    (section.rows || []).forEach((row) => {
      lines.push((section.columns || []).map((col) => escapeCsv(row[col.key])).join(','));
    });
  });

  return `${lines.join('\n')}\n`;
};

// ---------- PDF ----------

const PAGE_MARGIN = 40;
const NAVY = '#1b2a4a';
const BRASS = '#b8860b';
const HEADER_BAND = '#f1f0ea';
const GRID_LINE = '#d9d6cd';
const BODY_TEXT = '#2a2a2a';
const MUTED_TEXT = '#6b7280';

const generatePdf = ({ title, generatedAt, sections = [] }) =>
  new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, info: { Title: stringifyCell(title) } });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const left = doc.page.margins.left;
      const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      // Spec: paginate when the cursor passes (pageHeight - 80)
      const bottomLimit = () => doc.page.height - 80;

      const drawBrassRule = (y) => {
        doc.save();
        doc.lineWidth(1).strokeColor(BRASS);
        doc.moveTo(left, y).lineTo(left + contentWidth, y).stroke();
        doc.restore();
      };

      // Full header on the first page; compact band on continuation pages
      const drawReportHeader = (compact = false) => {
        let y = doc.page.margins.top;
        if (compact) {
          doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text(stringifyCell(title), left, y);
          y = doc.y + 4;
        } else {
          doc.font('Helvetica-Bold').fontSize(18).fillColor(NAVY).text(stringifyCell(title), left, y);
          doc
            .font('Helvetica')
            .fontSize(9)
            .fillColor(MUTED_TEXT)
            .text(`Generated at ${formatDateTime(generatedAt)}`, left, doc.y + 4);
          y = doc.y + 8;
        }
        drawBrassRule(y);
        doc.y = y + 14;
        return doc.y;
      };

      const drawTable = (section, startY) => {
        const columns = section.columns || [];
        const rows = section.rows || [];

        const PADDING_X = 5;
        const HEADER_HEIGHT = 20;
        const ROW_HEIGHT = 17;
        const TEXT_OFFSET_Y = 6;

        // Column widths: explicit `width` acts as a relative weight, else equal
        const weights = columns.map((c) => (Number(c.width) > 0 ? Number(c.width) : 1));
        const weightSum = weights.reduce((sum, w) => sum + w, 0) || 1;
        const colWidths = weights.map((w) => (w / weightSum) * contentWidth);
        const colXs = [left];
        colWidths.forEach((w) => colXs.push(colXs[colXs.length - 1] + w));

        let y = startY;

        const drawCell = (text, x, width, align, bold, color) => {
          doc
            .font(bold ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(9)
            .fillColor(color)
            .text(text, x + PADDING_X, y + TEXT_OFFSET_Y, {
              width: width - PADDING_X * 2,
              align,
              ellipsis: true,
              lineBreak: false,
            });
        };

        const strokeHorizontal = (atY) => {
          doc.save();
          doc.lineWidth(1).strokeColor(GRID_LINE);
          doc.moveTo(left, atY).lineTo(left + contentWidth, atY).stroke();
          doc.restore();
        };

        const strokeVerticals = (top, bottom) => {
          doc.save();
          doc.lineWidth(1).strokeColor(GRID_LINE);
          colXs.forEach((x) => doc.moveTo(x, top).lineTo(x, bottom).stroke());
          doc.restore();
        };

        const drawHeaderRow = () => {
          const headerTop = y;
          doc.rect(left, y, contentWidth, HEADER_HEIGHT).fill(HEADER_BAND);
          columns.forEach((col, i) => {
            const align = col.align || 'left';
            drawCell(stringifyCell(col.label || col.key), colXs[i], colWidths[i], align, true, NAVY);
          });
          y += HEADER_HEIGHT;
          strokeHorizontal(y);
          strokeVerticals(headerTop, y);
        };

        drawHeaderRow();

        rows.forEach((row) => {
          if (y + ROW_HEIGHT > bottomLimit()) {
            doc.addPage();
            y = drawReportHeader(true);
            drawHeaderRow();
          }

          const rowTop = y;
          columns.forEach((col, i) => {
            const text = stringifyCell(row[col.key]);
            const align = col.align || (isNumericLike(text) ? 'right' : 'left');
            drawCell(text, colXs[i], colWidths[i], align, false, BODY_TEXT);
          });
          y += ROW_HEIGHT;
          strokeHorizontal(y);
          strokeVerticals(rowTop, y);
        });

        return y;
      };

      let y = drawReportHeader(false);

      (sections || []).forEach((section) => {
        const columns = (section && section.columns) || [];
        if (!columns.length) return;

        // Keep heading + header row + at least one data row on the same page
        if (y + 70 > bottomLimit()) {
          doc.addPage();
          y = drawReportHeader(true);
        }

        doc.font('Helvetica-Bold').fontSize(14).fillColor(NAVY).text(stringifyCell(section.title), left, y);
        y = doc.y + 6;

        y = drawTable(section, y);
        y += 12; // breathing room between sections
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });

module.exports = { generateCsv, generatePdf };
