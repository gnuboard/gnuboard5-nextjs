export const KOREAN_PHONE_PATTERN = "0\\d{1,2}-?\\d{3,4}-?\\d{4}";
export const KOREAN_ZIP_PATTERN = "\\d{5}";

const KOREAN_PHONE_RE = /^0\d{1,2}-?\d{3,4}-?\d{4}$/;
const KOREAN_ZIP_RE = /^\d{5}$/;

export function isValidKoreanPhone(value: string): boolean {
  return KOREAN_PHONE_RE.test(value.trim());
}

export function isValidKoreanZip(value: string): boolean {
  return KOREAN_ZIP_RE.test(value.trim());
}

export function normalizeKoreanZipInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, 5);
}
