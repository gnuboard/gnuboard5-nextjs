import { apiUrl } from "@/lib/config";
import { fetchApiResult } from "@/lib/api-response";
import { faqPageDataSchema } from "@/lib/schemas";
import type { FaqPageData } from "@/lib/types";

export interface GetFaqsParams {
  fmId?: number;
  stx?: string;
  page?: number;
  perPage?: number;
  revalidate?: number;
}

export async function getFaqs({
  fmId,
  stx,
  page = 1,
  perPage,
  revalidate = 60,
}: GetFaqsParams = {}) {
  const params = new URLSearchParams();
  if (fmId && fmId > 0) params.set("fm_id", String(fmId));
  if (stx) params.set("stx", stx);
  if (page > 1) params.set("page", String(page));
  if (perPage) params.set("per_page", String(perPage));

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return fetchApiResult<FaqPageData>(apiUrl(`/faqs${suffix}`), faqPageDataSchema, {
    next: { revalidate },
  });
}
