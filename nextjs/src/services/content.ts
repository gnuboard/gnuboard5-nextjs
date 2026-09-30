import { apiClient } from "@/lib/api";
import { apiUrl } from "@/lib/config";
import { fetchApiData, fetchApiResult, validateApiData } from "@/lib/api-response";
import { contentDataSchema, type ContentData } from "@/lib/schemas";
import { z } from "zod";

const contentListItemSchema = z
  .object({
    co_id: z.coerce.string(),
    co_subject: z.coerce.string(),
    co_seo_title: z.coerce.string().optional(),
  })
  .passthrough();

const contentListSchema = z.array(contentListItemSchema);

export type ContentListItem = z.infer<typeof contentListItemSchema>;

export function getContentList(revalidate = 3600): Promise<ContentListItem[]> {
  return fetchApiData(apiUrl("/content"), contentListSchema, [], {
    next: { revalidate },
  });
}

export async function getContent(coId: string, revalidate = 3600): Promise<ContentData | null> {
  const result = await fetchApiResult(apiUrl(`/content/${coId}`), contentDataSchema, {
    next: { revalidate },
  });

  return result.ok ? result.data : null;
}

export async function getContentBySeo(
  slug: string,
  revalidate = 3600
): Promise<ContentData | null> {
  const result = await fetchApiResult(
    apiUrl(`/content/seo/${encodeURIComponent(slug)}`),
    contentDataSchema,
    { next: { revalidate } }
  );

  return result.ok ? result.data : null;
}

export async function getClientContent(coId: string): Promise<ContentData | null> {
  const response = await apiClient.get<unknown>(`/content/${coId}`);
  return validateApiData(response.data, contentDataSchema.nullable(), null);
}

export async function getClientContentBySeo(slug: string): Promise<ContentData | null> {
  const response = await apiClient.get<unknown>(`/content/seo/${encodeURIComponent(slug)}`);
  return validateApiData(response.data, contentDataSchema.nullable(), null);
}
