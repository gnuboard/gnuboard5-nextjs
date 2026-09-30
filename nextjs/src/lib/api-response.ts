import type { ZodType } from "zod";

export interface ApiMeta {
  total: number;
  current_page: number;
  per_page: number;
  last_page: number;
  from: number | null;
  to: number | null;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string>;
  meta?: ApiMeta;
}

export type ApiResult<T> =
  | {
      ok: true;
      data: T;
      meta?: ApiMeta;
      message?: string;
    }
  | {
      ok: false;
      error: string;
      status?: number;
      meta?: ApiMeta;
      errors?: Record<string, string>;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, String(item)])
  );
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  return toNumber(value);
}

function parseMeta(value: unknown): ApiMeta | undefined {
  if (!isRecord(value)) return undefined;

  return {
    total: toNumber(value.total),
    current_page: toNumber(value.current_page),
    per_page: toNumber(value.per_page),
    last_page: toNumber(value.last_page),
    from: toNullableNumber(value.from),
    to: toNullableNumber(value.to),
  };
}

function schemaErrorMessage(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  return error.issues
    .slice(0, 5)
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "data";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

export function parseApiEnvelope<T>(
  raw: unknown,
  schema?: ZodType<T>
): ApiResponse<T> {
  if (!isRecord(raw)) {
    return {
      success: false,
      message: "API 응답 형식이 올바르지 않습니다.",
    };
  }

  const success = typeof raw.success === "boolean" ? raw.success : true;
  const message = typeof raw.message === "string" ? raw.message : undefined;
  const errors = toStringRecord(raw.errors);
  const meta = parseMeta(raw.meta);
  const sourceData = "data" in raw ? raw.data : undefined;

  if (schema && sourceData !== undefined) {
    const parsed = schema.safeParse(sourceData);

    if (!parsed.success) {
      return {
        success: false,
        message: "API 응답 데이터 형식이 예상과 다릅니다.",
        errors: {
          ...errors,
          _schema: schemaErrorMessage(parsed.error),
        },
        meta,
      };
    }

    return {
      success,
      data: parsed.data,
      message,
      errors,
      meta,
    };
  }

  return {
    success,
    data: sourceData as T | undefined,
    message,
    errors,
    meta,
  };
}

export async function readApiResponse<T>(
  response: Response,
  schema?: ZodType<T>
): Promise<ApiResponse<T>> {
  let raw: unknown;

  try {
    raw = await response.json();
  } catch {
    return {
      success: false,
      message: response.statusText || "API 응답을 읽지 못했습니다.",
    };
  }

  return parseApiEnvelope<T>(raw, schema);
}

export async function fetchApiResult<T>(
  url: string,
  schema: ZodType<T>,
  init?: RequestInit
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, init);
    const parsed = await readApiResponse<T>(response, schema);

    if (!response.ok || !parsed.success || parsed.data === undefined) {
      return {
        ok: false,
        status: response.status,
        error: parsed.message || response.statusText || "API 요청에 실패했습니다.",
        errors: parsed.errors,
        meta: parsed.meta,
      };
    }

    return {
      ok: true,
      data: parsed.data,
      meta: parsed.meta,
      message: parsed.message,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "API 요청 중 오류가 발생했습니다.",
    };
  }
}

export async function fetchApiData<T>(
  url: string,
  schema: ZodType<T>,
  fallback: T,
  init?: RequestInit
): Promise<T> {
  const result = await fetchApiResult(url, schema, init);
  return result.ok ? result.data : fallback;
}

export function validateApiData<T>(
  data: unknown,
  schema: ZodType<T>,
  fallback: T
): T {
  const parsed = schema.safeParse(data);
  return parsed.success ? parsed.data : fallback;
}
