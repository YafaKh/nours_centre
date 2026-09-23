// PLAN.md: SheetJS (`xlsx`) parses both CSV and XLSX into one shape, so the row-validation
// logic downstream is format-agnostic — it never needs to know which file type it got.

import * as XLSX from 'xlsx';

export type ParsedRow = Record<string, string>;

export class EmptyFileError extends Error {
  constructor() {
    super('The file has no data rows');
  }
}

/** Parses the first sheet of a CSV/XLSX buffer into row objects keyed by lowercased, trimmed
 * header. Cell values are read as display strings (raw: false) so numbers and dates come back
 * exactly as a spreadsheet would show them, not as JS numbers/Date objects. */
/** Strips a leading UTF-8 BOM (EF BB BF), if present. SheetJS mishandles a BOM'd CSV buffer
 * when `codepage: 65001` is forced (see parseSpreadsheet) — it double-counts the BOM and
 * clips the first couple of header characters — so it's stripped by hand first instead of
 * relying on SheetJS's own BOM detection. */
function stripBom(buffer: Buffer): Buffer {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3);
  }
  return buffer;
}

export function parseSpreadsheet(buffer: Buffer): ParsedRow[] {
  // codepage 65001 = UTF-8. Without it, SheetJS's plain-text CSV reader falls back to
  // guessing the system codepage and mangles non-ASCII (Arabic) content — XLSX files ignore
  // this option (their zip/XML body is always UTF-8), so it's safe to force unconditionally.
  const workbook = XLSX.read(stripBom(buffer), { type: 'buffer', codepage: 65001 });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new EmptyFileError();
  const sheet = workbook.Sheets[sheetName];

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
  if (raw.length === 0) throw new EmptyFileError();

  return raw.map((row) => {
    const out: ParsedRow = {};
    for (const [key, value] of Object.entries(row)) {
      out[key.trim().toLowerCase()] = String(value ?? '').trim();
    }
    return out;
  });
}
