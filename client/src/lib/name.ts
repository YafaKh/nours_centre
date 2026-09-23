// FR-067: everywhere except teacher/admin two-column tables, a person is shown by a single name —
// name_en if set, else name_ar.
export function displayName(nameEn: string | null | undefined, nameAr: string | null | undefined, fallback: string): string {
  return nameEn || nameAr || fallback;
}
