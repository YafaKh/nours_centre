// FR-054/A4: imported students (and admin-created teachers) get a generated initial password
// that the admin can see once and hand out; password resets (FR-054/A4's "reset password"
// action) reuse the same generator.

import { randomInt } from 'node:crypto';

// Unambiguous characters only (no 0/O, 1/I/l) so a password read aloud or handwritten doesn't
// get misread by a student copying it down.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

export function generateTempPassword(length = 10): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}
