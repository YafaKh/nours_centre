import * as XLSX from 'xlsx';
import { toCsv } from '../../src/quiz/csv.js';

export function buildCsvBuffer(rows: string[][]): Buffer {
  return Buffer.from(toCsv(rows), 'utf8');
}

export function buildXlsxBuffer(rows: string[][]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/** superagent (supertest) has no built-in parser for the xlsx MIME type, so it otherwise
 * discards the response body — pass this to `.parse()` (with `.buffer(true)`) to get the raw
 * bytes back as a Buffer in `res.body`. superagent's `.parse()` typings claim the callback's
 * `res` is its own Response wrapper, but at runtime it's the raw readable stream — untyped
 * here rather than fighting that mismatch. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function bufferParser(res: any, callback: (err: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

/** Reads an xlsx buffer's first sheet back into a plain string[][] (header row included) for
 * assertions — the inverse of buildXlsxBuffer. */
export function xlsxRows(buffer: Buffer): string[][] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '', raw: false });
}
