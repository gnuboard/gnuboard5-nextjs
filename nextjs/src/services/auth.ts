import { apiClient } from "@/lib/api";
import { validateApiData } from "@/lib/api-response";
import * as z from "zod";
import {
  authAvailabilitySchema,
  passwordResetRequestSchema,
  type AuthAvailability,
} from "@/lib/schemas";

const DEFAULT_AVAILABILITY: AuthAvailability = {
  available: false,
  message: "",
};

export interface RegisterPayload {
  mb_id?: string;
  mb_password?: string;
  mb_password_re?: string;
  mb_nick: string;
  mb_name: string;
  mb_email: string;
  captcha_key?: string;
  agree_terms: boolean;
  agree_privacy: boolean;
  mb_recommend?: string;
  cert_type?: string;
  cert_no?: string;
  mb_hp?: string;
  mb_birth?: string;
  mb_adult?: number;
  social_signup_ticket?: string;
}

export interface RegisterResponse {
  token?: string;
  refresh_token?: string;
  expires_in?: number;
  member?: Record<string, string | number | undefined>;
  user?: Record<string, string | number | undefined>;
  requires_email_verification?: boolean;
  mb_id?: string;
  message?: string;
  registration_result_url?: string;
}

export interface PasswordResetRequestPayload {
  mb_id: string;
  mb_email: string;
}

export interface PasswordResetCertRequestPayload {
  cert_type: string;
  cert_no: string;
}

export interface PasswordResetPayload {
  reset_token: string;
  mb_password: string;
  mb_password_re: string;
}

export async function checkMemberId(mbId: string): Promise<AuthAvailability> {
  const response = await apiClient.get<unknown>("/auth/check-id", {
    params: { mb_id: mbId },
  });

  return validateApiData(response.data, authAvailabilitySchema, DEFAULT_AVAILABILITY);
}

export async function checkMemberEmail(
  mbEmail: string
): Promise<AuthAvailability> {
  const response = await apiClient.get<unknown>("/auth/check-email", {
    params: { mb_email: mbEmail },
  });

  return validateApiData(response.data, authAvailabilitySchema, DEFAULT_AVAILABILITY);
}

export function registerMember(payload: RegisterPayload) {
  return apiClient.post<RegisterResponse>("/auth/register", payload);
}

export interface RegisterResult {
  mb_id: string;
  mb_name: string;
  mb_nick: string;
  mb_email: string;
  mb_datetime: string;
  requires_email_verification: boolean;
}

export async function getRegisterResult(): Promise<RegisterResult> {
  const response = await apiClient.get<RegisterResult>("/auth/register-result");
  if (!response.data) {
    throw new Error("Registration result was not found.");
  }
  return response.data;
}

export async function requestPasswordReset(
  payload: PasswordResetRequestPayload
): Promise<void> {
  await apiClient.post<unknown>("/auth/password-reset", {
    step: "request",
    ...payload,
  });
}

export async function requestPasswordResetByCert(
  payload: PasswordResetCertRequestPayload
): Promise<string> {
  const response = await apiClient.post<unknown>("/auth/password-reset", {
    step: "cert_request",
    ...payload,
  });
  const parsed = validateApiData(response.data, passwordResetRequestSchema, {
    reset_token: "",
  });

  if (!parsed.reset_token) {
    throw new Error("Password reset token was not returned.");
  }

  return parsed.reset_token;
}

export function resetPassword(payload: PasswordResetPayload) {
  return apiClient.post("/auth/password-reset", {
    step: "reset",
    ...payload,
  });
}

const registerTermsSchema = z
  .object({
    stipulation: z.coerce.string().default(""),
    privacy: z.coerce.string().default(""),
  })
  .passthrough();

export type RegisterTerms = z.infer<typeof registerTermsSchema>;

/** 회원가입 약관 전문 — 관리자 기본환경설정의 회원가입약관 · 개인정보처리방침(그누보드 회원가입과 같은 값). */
export async function getRegisterTerms(): Promise<RegisterTerms> {
  const response = await apiClient.get<unknown>("/register-terms");
  return validateApiData(response.data, registerTermsSchema, { stipulation: "", privacy: "" });
}
