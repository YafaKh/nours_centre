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
