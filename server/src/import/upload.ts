// Shared multer config for every import route: files are small (a few hundred rows at most)
// and are only ever read into a Buffer for SheetJS to parse, never written to disk.

import multer from 'multer';

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});
