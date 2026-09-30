import { apiClient } from "@/lib/api";
import type { ApiMeta } from "@/lib/api-response";
import { validateApiData } from "@/lib/api-response";
import { scrapListSchema, scrapSchema } from "@/lib/schemas";
import type { Scrap } from "@/lib/types";

export interface ScrapListResult {
  items: Scrap[];
  meta?: ApiMeta;
}

export interface AddScrapPayload {
  bo_table: string;
  wr_id: number | string;
}

export async function getScraps(
  page = 1,
  perPage = 20
): Promise<ScrapListResult> {
  const response = await apiClient.get<unknown>("/scraps", {
    params: { page, per_page: perPage },
  });

  return {
    items: validateApiData(response.data, scrapListSchema, []),
    meta: response.meta,
  };
}

export async function getScrapStatus(boTable: string, wrId: number | string) {
  const response = await apiClient.get<{
    scrapped?: boolean;
    scrap?: unknown;
  }>(`/scraps/${encodeURIComponent(boTable)}/${encodeURIComponent(String(wrId))}`);

  const parsed = scrapSchema.safeParse(response.data?.scrap);
  return {
    scrapped: !!response.data?.scrapped,
    scrap: parsed.success ? parsed.data : null,
  };
}

export function addScrap(payload: AddScrapPayload) {
  return apiClient.post("/scraps", payload);
}

export function deleteScrap(scrapId: number) {
  return apiClient.delete(`/scraps/${scrapId}`);
}

export function deleteScrapByPost(boTable: string, wrId: number | string) {
  return apiClient.delete(
    `/scraps/${encodeURIComponent(boTable)}/${encodeURIComponent(String(wrId))}`
  );
}
