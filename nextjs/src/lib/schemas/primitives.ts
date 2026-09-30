import { z } from "zod";
import { normalizeG5ImageSrc } from "@/lib/image";

export const stringValue = z.preprocess(
  (value) => (value === null || value === undefined ? "" : value),
  z.coerce.string()
);

export const optionalString = z.preprocess(
  (value) => (value === null || value === undefined ? undefined : value),
  z.coerce.string().optional()
);

export const imageUrlValue = stringValue.transform((value) => normalizeG5ImageSrc(value));

export const optionalImageUrlValue = optionalString.transform((value) =>
  value ? normalizeG5ImageSrc(value) : value
);

export const numberValue = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? 0 : value),
  z.coerce.number().catch(0)
);

export const booleanValue = z.preprocess((value) => {
  if (value === "1" || value === 1 || value === true) return true;
  if (value === "0" || value === 0 || value === false) return false;
  return value;
}, z.coerce.boolean().catch(false));

export const paginationMetaSchema = z
  .object({
    total: numberValue,
    per_page: numberValue,
    current_page: numberValue,
    last_page: numberValue,
  })
  .passthrough();
