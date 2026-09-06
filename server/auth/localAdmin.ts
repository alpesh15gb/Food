/** Normalize a pasted VPS-local administrator passphrase before secure comparison. */
export function normalizeLocalAdminToken(value: string) {
  return value.trim();
}

export function isPlausibleLocalAdminToken(value: string) {
  // 10-char floor: the 5-per-15min IP rate limit makes online brute force
  // infeasible, so memorability may trade against length here. Key material
  // (encryption/OTP secrets) keeps its own stricter floors in env.ts.
  return value.length >= 10 && value.length <= 4096;
}
