import type { RowError } from './columns.js';

/** Thrown by every importer when validation fails — carries the full row+field error list so
 * the route can return it as-is (FR-052: nothing is saved if any row fails). */
export class ImportValidationError extends Error {
  errors: RowError[];
  constructor(errors: RowError[]) {
    super('Import validation failed');
    this.errors = errors;
  }
}
