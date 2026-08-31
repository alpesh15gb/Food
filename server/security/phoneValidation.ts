/**
 * Phone number normalization and validation for Indian mobile numbers.
 *
 * Rules:
 * - Strip all non-digit characters
 * - Accept 10-digit Indian mobile (starts with 6-9) or 12-digit with 91 prefix
 * - Normalize to 10-digit local format (strip country code)
 */

/** Strip non-digit characters and normalize to 10-digit Indian mobile format. */
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  // Strip +91 or 91 prefix
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }
  return digits;
}

/** Validate that a normalized phone is a valid 10-digit Indian mobile number. */
export function isValidIndianPhone(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(phone);
}

/** Mask phone for display: 98XXXXXX10 */
export function maskPhone(phone: string): string {
  if (phone.length < 4) return phone;
  return phone.slice(0, 2) + "XXXXXX" + phone.slice(-2);
}
