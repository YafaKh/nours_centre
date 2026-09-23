// Hand-rolled CSV writer (PLAN.md: full control over BOM placement/quoting, since Excel+Arabic
// correctness is a named success criterion — SC-006/FR-043). No library involved.

const BOM = '﻿';

function escapeCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Prefixes a UTF-8 BOM so Excel opens the file as UTF-8 instead of guessing the system codepage. */
export function toCsv(rows: string[][]): string {
  const body = rows.map((row) => row.map(escapeCell).join(',')).join('\r\n');
  return BOM + body + '\r\n';
}
