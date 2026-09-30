import { apiClient } from "@/lib/api";
import type { ApiMeta } from "@/lib/api-response";
import { validateApiData } from "@/lib/api-response";
import { qaConfigSchema, qaItemListSchema, qaItemSchema } from "@/lib/schemas";
import type { QaConfig, QaItem } from "@/lib/types";

export interface QaListParams {
  page?: number;
  perPage?: number;
  scope?: "admin" | "mine";
  status?: 0 | 1 | "all";
  sca?: string;
  sfl?: "qa_subject" | "qa_content" | "qa_name" | "mb_id";
  stx?: string;
}

export interface QaListResult {
  items: QaItem[];
  meta?: ApiMeta;
}

export interface QaQuestionPayload {
  qa_category: string;
  qa_email?: string;
  qa_hp?: string;
  qa_subject: string;
  qa_content: string;
  qa_email_recv?: boolean;
  qa_sms_recv?: boolean;
  qa_html?: number;
  qa_reply_to?: number;
}

export interface QaAnswerPayload {
  qa_subject: string;
  qa_content: string;
  qa_html?: number;
}

export interface QaAttachmentOptions {
  files?: Array<File | null | undefined>;
  deleteFiles?: number[];
}

function parseQaItem(data: unknown): QaItem {
  const parsed = qaItemSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("1:1 문의 응답 형식이 올바르지 않습니다.");
  }
  return parsed.data;
}

export async function getQaConfig(): Promise<QaConfig> {
  const response = await apiClient.get<unknown>("/qas/config");
  const parsed = qaConfigSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new Error("1:1 문의 설정 응답 형식이 올바르지 않습니다.");
  }
  return parsed.data;
}

export async function getQas(params: QaListParams = {}): Promise<QaListResult> {
  const response = await apiClient.get<unknown>("/qas", {
    params: {
      page: params.page,
      per_page: params.perPage,
      scope: params.scope === "admin" ? "admin" : undefined,
      status: params.status === "all" ? undefined : params.status,
      sca: params.sca,
      sfl: params.sfl,
      stx: params.stx,
    },
  });

  return {
    items: validateApiData(response.data, qaItemListSchema, []),
    meta: response.meta,
  };
}

export async function getQa(qaId: number): Promise<QaItem> {
  const response = await apiClient.get<unknown>(`/qas/${qaId}`);
  return parseQaItem(response.data);
}

export async function createQa(payload: QaQuestionPayload): Promise<QaItem> {
  const response = await apiClient.post<unknown>("/qas", payload);
  return parseQaItem(response.data);
}

function qaQuestionFormData(payload: QaQuestionPayload, options: QaAttachmentOptions = {}) {
  const formData = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    formData.append(key, typeof value === "boolean" ? (value ? "1" : "") : String(value));
  });

  (options.files || []).slice(0, 2).forEach((file, index) => {
    if (file) {
      formData.append(`bf_file[${index + 1}]`, file);
    }
  });

  (options.deleteFiles || []).forEach((slot) => {
    if (slot === 1 || slot === 2) {
      formData.append(`bf_file_del[${slot}]`, "1");
    }
  });

  return formData;
}

function qaAnswerFormData(payload: QaAnswerPayload, options: QaAttachmentOptions = {}) {
  const formData = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    formData.append(key, String(value));
  });

  (options.files || []).slice(0, 2).forEach((file, index) => {
    if (file) {
      formData.append(`bf_file[${index + 1}]`, file);
    }
  });

  (options.deleteFiles || []).forEach((slot) => {
    if (slot === 1 || slot === 2) {
      formData.append(`bf_file_del[${slot}]`, "1");
    }
  });

  return formData;
}

export async function createQaWithFiles(
  payload: QaQuestionPayload,
  options: QaAttachmentOptions = {}
): Promise<QaItem> {
  const response = await apiClient.upload<unknown>("/qas", qaQuestionFormData(payload, options));
  return parseQaItem(response.data);
}

export async function updateQa(
  qaId: number,
  payload: QaQuestionPayload | QaAnswerPayload
): Promise<QaItem> {
  const response = await apiClient.patch<unknown>(`/qas/${qaId}`, payload);
  return parseQaItem(response.data);
}

export async function updateQaWithFiles(
  qaId: number,
  payload: QaQuestionPayload,
  options: QaAttachmentOptions = {}
): Promise<QaItem> {
  const formData = qaQuestionFormData(payload, options);
  formData.append("_method", "PATCH");
  const response = await apiClient.upload<unknown>(`/qas/${qaId}`, formData);
  return parseQaItem(response.data);
}

export async function answerQa(
  qaId: number,
  payload: QaAnswerPayload
): Promise<QaItem> {
  const response = await apiClient.post<unknown>(`/qas/${qaId}/answer`, payload);
  return parseQaItem(response.data);
}

export async function answerQaWithFiles(
  qaId: number,
  payload: QaAnswerPayload,
  options: QaAttachmentOptions = {}
): Promise<QaItem> {
  const response = await apiClient.upload<unknown>(
    `/qas/${qaId}/answer`,
    qaAnswerFormData(payload, options)
  );
  return parseQaItem(response.data);
}

export function deleteQa(qaId: number) {
  return apiClient.delete(`/qas/${qaId}`);
}
