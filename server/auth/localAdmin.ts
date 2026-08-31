/** Normalize a pasted VPS-local administrator passphrase before secure comparison. */
export function normalizeLocalAdminToken(value: string) {
  return value.trim();
}

export function isPlausibleLocalAdminToken(value: string) {
  return value.length >= 16 && value.length <= 4096;
}
