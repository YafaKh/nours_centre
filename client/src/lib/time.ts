// FR-012: all dates/times in this app are Amman time (Asia/Amman, fixed UTC+3 since Jordan
// dropped seasonal DST in 2022). Storage/API stay in plain UTC ISO strings — only these two
// helpers translate to/from the "YYYY-MM-DDTHH:mm" shape <input type="datetime-local"> uses.
const AMMAN_OFFSET_MS = 3 * 60 * 60 * 1000;

export function isoToAmmanLocalInput(iso: string): string {
  const d = new Date(new Date(iso).getTime() + AMMAN_OFFSET_MS);
  return d.toISOString().slice(0, 16);
}

export function ammanLocalInputToIso(value: string): string {
  const utcMillis = new Date(`${value}:00Z`).getTime() - AMMAN_OFFSET_MS;
  return new Date(utcMillis).toISOString();
}
