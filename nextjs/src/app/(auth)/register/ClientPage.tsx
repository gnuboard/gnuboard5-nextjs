"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { G5Link as Link } from "@/components/ui/g5-link";
import { api } from "@/lib/api";
import { apiUrl } from "@/lib/config";
import { runtimeRouterPush } from "@/lib/runtime-router";
import { useAuthStore } from "@/store/auth";
import {
  readStoredSocialSignupTicket,
  storeSocialSignupTicket,
  clearStoredSocialSignupTicket,
} from "./socialSignupTicket";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2 } from "lucide-react";
import { checkMemberEmail, checkMemberId, registerMember } from "@/services/auth";
import {
  IdentityVerificationButton,
  type IdentityVerificationMethod,
  type IdentityVerificationResult,
} from "@/components/auth/IdentityVerificationButton";
import { SocialSignupButtons } from "@/components/auth/SocialSignupButtons";
import {
  fetchCertConfig,
  fetchSocialSignupProfile,
  linkExistingSocialAccount,
  type CertConfig,
  type SocialSignupProfile,
} from "@/services/socialAuth";
import { ExistingAccountLinkPanel } from "./ExistingAccountLinkPanel";
import { RegisterAgreements } from "./RegisterAgreements";
import { RegisterCaptchaField } from "./RegisterCaptchaField";
import {
  type FormErrors,
  type IdCheckStatus,
  initialRegisterFormData,
  safeRelativePath,
  validateRegisterForm,
} from "./registerHelpers";

export default function RegisterPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { login, fetchUser } = useAuthStore();
  const [formData, setFormData] = useState(() => ({ ...initialRegisterFormData }));
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [captchaVersion, setCaptchaVersion] = useState(0);
  const [captchaAudioLoading, setCaptchaAudioLoading] = useState(false);
  const captchaAudioRef = useRef<HTMLAudioElement | null>(null);
  const [idCheck, setIdCheck] = useState<{ status: IdCheckStatus; message: string }>({
    status: "idle",
    message: "",
  });
  const [emailCheck, setEmailCheck] = useState<{ status: IdCheckStatus; message: string }>({
    status: "idle",
    message: "",
  });
  const [certConfig, setCertConfig] = useState<CertConfig | null>(null);
  const [cert, setCert] = useState<IdentityVerificationResult | null>(null);
  const [socialSignup, setSocialSignup] = useState<SocialSignupProfile | null>(null);
  const [socialSignupChecked, setSocialSignupChecked] = useState(false);
  const [socialSignupLoading, setSocialSignupLoading] = useState(false);
  const [showExistingLink, setShowExistingLink] = useState(false);
  const [existingLinkLoading, setExistingLinkLoading] = useState(false);
  const [existingLinkError, setExistingLinkError] = useState("");
  const [existingLinkData, setExistingLinkData] = useState({
    mb_id: "",
    mb_password: "",
  });

  // Load a fresh captcha on mount so PHPSESSID gets set before the user submits.
  useEffect(() => {
    setCaptchaVersion(Date.now());
  }, []);

  // 본인인증 활성 여부 확인 — gnuboard5 admin cf_cert_use / cf_cert_simple 반영.
  useEffect(() => {
    void fetchCertConfig().then(setCertConfig);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const urlTicket = params.get("social_signup_ticket") || "";
    const ticket = urlTicket || readStoredSocialSignupTicket();
    const socialError = params.get("error");

    if (socialError) {
      clearStoredSocialSignupTicket();
      setSocialSignupChecked(true);
      const messages: Record<string, string> = {
        already_linked: "이미 가입된 소셜 계정입니다. 로그인으로 이용해주세요.",
        missing_social_profile: "소셜 가입 정보를 찾지 못했습니다. 다시 시도해주세요.",
        social_disabled: "소셜 로그인이 비활성화되어 있습니다.",
      };
      setErrors((prev) => ({
        ...prev,
        general: messages[socialError] ?? `소셜 가입을 시작하지 못했습니다. (${socialError})`,
      }));
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }

    if (!ticket) {
      setSocialSignupChecked(true);
      return;
    }
    if (urlTicket) {
      storeSocialSignupTicket(urlTicket);
    }

    setSocialSignupLoading(true);
    void fetchSocialSignupProfile(ticket)
      .then((profile) => {
        if (cancelled) return;
        storeSocialSignupTicket(profile.ticket);
        setSocialSignup(profile);
        setFormData((prev) => ({
          ...prev,
          mb_id: prev.mb_id || profile.suggested_mb_id,
          mb_nick: prev.mb_nick || profile.suggested_nick,
          mb_name: prev.mb_name || profile.name || profile.suggested_nick,
          mb_email: prev.mb_email || profile.email,
          mb_hp: prev.mb_hp || profile.phone,
        }));
        setErrors((prev) => ({ ...prev, general: undefined }));
        if (urlTicket) {
          window.history.replaceState(null, "", window.location.pathname);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        clearStoredSocialSignupTicket();
        setSocialSignup(null);
        setErrors((prev) => ({
          ...prev,
          general:
            err instanceof Error
              ? err.message
              : "소셜 가입 정보를 불러오지 못했습니다. 다시 시도해주세요.",
        }));
        if (urlTicket) {
          window.history.replaceState(null, "", window.location.pathname);
        }
      })
      .finally(() => {
        if (cancelled) return;
        setSocialSignupLoading(false);
        setSocialSignupChecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // 본인인증 결과를 받으면 mb_name / mb_hp 를 채우고 잠금.
  const handleCertVerified = (result: IdentityVerificationResult) => {
    setCert(result);
    setFormData((prev) => ({
      ...prev,
      mb_name: result.mb_name || prev.mb_name,
      mb_hp:   result.mb_hp,
    }));
  };

  const certSimpleEnabled = !!certConfig?.enabled && certConfig?.simple === "inicis";
  const certHpMethod: IdentityVerificationMethod | null =
    certConfig?.hp === "kcp_v2" ? "hp_v2" : certConfig?.hp === "kcp" ? "hp" : null;
  const certHpEnabled     = !!certConfig?.enabled && !!certHpMethod;
  const certEnabled = certSimpleEnabled || certHpEnabled;
  const certRequired = certEnabled && !!certConfig?.required;
  const isVerified = !!cert;
  const isShopRegister = pathname?.startsWith("/shop/register") ?? false;

  // Debounced availability check for mb_id. Each keystroke resets the timer so
  // we only hit the API once the user pauses. Aborted on unmount / next keystroke
  // via the cleanup function.
  useEffect(() => {
    if (socialSignup) {
      setIdCheck({ status: "idle", message: "" });
      return;
    }

    const value = formData.mb_id.trim();
    if (!value) {
      setIdCheck({ status: "idle", message: "" });
      return;
    }

    setIdCheck({ status: "checking", message: "확인 중..." });
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const result = await checkMemberId(value);
        if (controller.signal.aborted) return;
        setIdCheck({
          status: result.available ? "available" : "unavailable",
          message: result.message,
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        setIdCheck({
          status: "idle",
          message: err instanceof Error ? err.message : "",
        });
      }
    }, 400);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [formData.mb_id, socialSignup]);

  // Debounced availability check for mb_email.
  useEffect(() => {
    const value = formData.mb_email.trim();
    if (!value) {
      setEmailCheck({ status: "idle", message: "" });
      return;
    }

    setEmailCheck({ status: "checking", message: "확인 중..." });
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const result = await checkMemberEmail(value);
        if (controller.signal.aborted) return;
        setEmailCheck({
          status: result.available ? "available" : "unavailable",
          message: result.message,
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        setEmailCheck({
          status: "idle",
          message: err instanceof Error ? err.message : "",
        });
      }
    }, 400);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [formData.mb_email]);

  const reloadCaptcha = () => {
    setCaptchaVersion(Date.now());
    setFormData((prev) => ({ ...prev, captcha_key: "" }));
    setErrors((prev) => ({ ...prev, captcha_key: undefined }));
  };
  const captchaImageUrl = apiUrl(`/captcha?t=${captchaVersion}`);
  const captchaAudioUrl = apiUrl(`/captcha/audio?t=${captchaVersion}`);

  const playCaptchaAudio = async () => {
    setCaptchaAudioLoading(true);
    setErrors((prev) => ({ ...prev, captcha_key: undefined }));

    try {
      captchaAudioRef.current?.pause();

      const audio = new Audio();
      audio.crossOrigin = "use-credentials";
      audio.preload = "auto";
      audio.src = captchaAudioUrl;
      captchaAudioRef.current = audio;

      await audio.play();
    } catch {
      setErrors((prev) => ({
        ...prev,
        captcha_key: "자동등록방지 음성을 재생하지 못했습니다. 새로고침 후 다시 시도해주세요.",
      }));
    } finally {
      setCaptchaAudioLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, type, value, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    setErrors((prev) => ({ ...prev, [name]: undefined, general: undefined }));
  };

  const handleExistingLinkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setExistingLinkData((prev) => ({ ...prev, [name]: value }));
    setExistingLinkError("");
  };

  const handleExistingLink = async () => {
    if (!socialSignup) return;

    const mbId = existingLinkData.mb_id.trim();
    if (!mbId || !existingLinkData.mb_password) {
      setExistingLinkError("아이디와 비밀번호를 입력해주세요.");
      return;
    }

    setExistingLinkLoading(true);
    setExistingLinkError("");
    try {
      const result = await linkExistingSocialAccount({
        social_signup_ticket: socialSignup.ticket,
        mb_id: mbId,
        mb_password: existingLinkData.mb_password,
      });

      clearStoredSocialSignupTicket();
      api.setToken(result.token);
      if (result.refresh_token) {
        api.setRefreshToken(result.refresh_token);
      }
      await fetchUser();
      runtimeRouterPush(router, isShopRegister ? "/shop" : "/");
    } catch (err: unknown) {
      setExistingLinkError(
        err instanceof Error ? err.message : "기존 계정 연결에 실패했습니다."
      );
    } finally {
      setExistingLinkLoading(false);
    }
  };

  const validate = (): boolean => {
    const newErrors = validateRegisterForm({
      formData,
      isSocialSignup: !!socialSignup,
      certRequired,
      isVerified,
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const response = await registerMember({
        mb_nick: formData.mb_nick,
        mb_name: formData.mb_name,
        mb_email: formData.mb_email,
        agree_terms: formData.agree_terms,
        agree_privacy: formData.agree_privacy,
        ...(!socialSignup
          ? {
              mb_id: formData.mb_id,
              mb_password: formData.mb_password,
              mb_password_re: formData.mb_password_re,
              captcha_key: formData.captcha_key,
            }
          : {}),
        // 빈 문자열이면 백엔드에서 mb_recommend 무시. 없는 mb_id 도 조용히 무시.
        ...(formData.mb_recommend.trim() ? { mb_recommend: formData.mb_recommend.trim() } : {}),
        ...(socialSignup ? { social_signup_ticket: socialSignup.ticket } : {}),
        // 본인인증 결과 — 백엔드에서 cert_no 를 통해 PHP 세션의 ss_cert_* 와 일치 검증.
        ...(cert
          ? {
              cert_type: cert.cert_type,
              cert_no:   cert.cert_no,
              mb_hp:     cert.mb_hp,
              mb_birth:  cert.mb_birth,
              mb_adult:  cert.adult,
            }
          : {}),
      });
      const communityResultHref = safeRelativePath(
        response.data?.registration_result_url,
        "/register/result"
      );
      const nextResultHref = isShopRegister ? "/shop/register/result" : communityResultHref;

      if (response.data?.requires_email_verification) {
        clearStoredSocialSignupTicket();
        runtimeRouterPush(router, nextResultHref);
        setErrors({
          general:
            response.data.message ??
            "가입이 접수되었습니다. 이메일 인증 후 로그인할 수 있습니다.",
        });
        return;
      }

      if (response.data?.token) {
        clearStoredSocialSignupTicket();
        api.setToken(response.data.token);
        if (response.data.refresh_token) {
          api.setRefreshToken(response.data.refresh_token);
        }
        await fetchUser();
      } else if (!socialSignup) {
        // Auto login after password registration when the server did not issue a token.
        await login(formData.mb_id, formData.mb_password);
      }
      if (socialSignup) {
        clearStoredSocialSignupTicket();
      }
      runtimeRouterPush(router, nextResultHref);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "회원가입에 실패했습니다. 다시 시도해주세요.";
      // Captcha mismatch / expired → reload the image so user gets a fresh one
      if (/자동등록방지|captcha/i.test(message)) {
        setErrors({ captcha_key: message });
        reloadCaptcha();
      } else {
        setErrors({ general: message });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="auth-card auth-card--register">
      <CardHeader className="auth-card-head text-center">
        <CardTitle className="auth-card-title text-2xl">회원가입</CardTitle>
        <CardDescription className="auth-card-desc">새 계정을 만들어주세요</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {!socialSignup && socialSignupChecked && <SocialSignupButtons />}

          {socialSignupLoading && (
            <Alert>
              <AlertDescription>
                <span className="sr-only">소셜 가입 정보를 불러오는 중입니다</span>
                <span aria-hidden="true" className="flex gap-2 py-1">
                  <span className="skeleton h-9 flex-1 rounded-md" />
                  <span className="skeleton h-9 flex-1 rounded-md" />
                </span>
              </AlertDescription>
            </Alert>
          )}

          {socialSignup && (
            <div className="flex items-start gap-3 rounded-[4px] border border-[#d4efe1] bg-[#f3fbf7] p-3">
              {socialSignup.photo_url ? (
                <img
                  src={socialSignup.photo_url}
                  alt=""
                  className="size-10 rounded-full border border-[#d4efe1] object-cover"
                />
              ) : (
                <div className="flex size-10 items-center justify-center rounded-full bg-[#0c8040] text-sm font-bold text-white">
                  {socialSignup.provider_label.slice(0, 1)}
                </div>
              )}
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-bold text-[#202124]">
                  {socialSignup.provider_label} 계정으로 가입을 시작했습니다.
                </p>
                <p className="text-xs leading-5 text-muted-foreground">
                  소셜 계정은 가입 완료 후 자동으로 연결됩니다. 필요한 정보를 확인하고 약관에 동의해주세요.
                </p>
              </div>
            </div>
          )}

          {errors.general && (
            <Alert variant="destructive">
              <AlertDescription>{errors.general}</AlertDescription>
            </Alert>
          )}

          {!socialSignup && socialSignupChecked && (
            <>
              <div className="space-y-2">
                <Label htmlFor="mb_id">아이디</Label>
                <Input
                  id="mb_id"
                  name="mb_id"
                  type="text"
                  placeholder="3자 이상 영문/숫자"
                  value={formData.mb_id}
                  onChange={handleChange}
                  disabled={loading}
                  autoComplete="username"
                  minLength={3} required
                />
                {errors.mb_id ? (
                  <p className="text-sm text-destructive">{errors.mb_id}</p>
                ) : idCheck.status === "available" ? (
                  <p className="text-sm text-green-700">{idCheck.message}</p>
                ) : idCheck.status === "unavailable" ? (
                  <p className="text-sm text-destructive">{idCheck.message}</p>
                ) : idCheck.status === "checking" ? (
                  <p className="text-sm text-muted-foreground">{idCheck.message}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="mb_password">비밀번호</Label>
                <Input
                  id="mb_password"
                  name="mb_password"
                  type="password"
                  placeholder="8자 이상, 영문/숫자 포함"
                  value={formData.mb_password}
                  onChange={handleChange}
                  disabled={loading}
                  minLength={8} required
                />
                {errors.mb_password && (
                  <p className="text-sm text-destructive">{errors.mb_password}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="mb_password_re">비밀번호 확인</Label>
                <Input
                  id="mb_password_re"
                  name="mb_password_re"
                  type="password"
                  placeholder="비밀번호를 다시 입력하세요"
                  value={formData.mb_password_re}
                  onChange={handleChange}
                  disabled={loading}
                  minLength={8} required
                />
                {errors.mb_password_re && (
                  <p className="text-sm text-destructive">{errors.mb_password_re}</p>
                )}
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="mb_nick">닉네임</Label>
            <Input
              id="mb_nick"
              name="mb_nick"
              type="text"
              placeholder="2자 이상"
              value={formData.mb_nick}
              onChange={handleChange}
              disabled={loading}
              minLength={2} required
            />
            {errors.mb_nick && <p className="text-sm text-destructive">{errors.mb_nick}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="mb_name">이름</Label>
            <Input
              id="mb_name"
              name="mb_name"
              type="text"
              placeholder="이름을 입력하세요"
              value={formData.mb_name}
              onChange={handleChange}
              disabled={loading}
              readOnly={isVerified}
              aria-readonly={isVerified} required
            />
            {errors.mb_name && <p className="text-sm text-destructive">{errors.mb_name}</p>}
          </div>

          {certEnabled && isVerified && (
            <div className="space-y-2">
              <Label htmlFor="mb_hp">휴대폰</Label>
              <Input
                id="mb_hp"
                name="mb_hp"
                type="text"
                value={formData.mb_hp}
                onChange={handleChange}
                disabled={loading}
                readOnly
                aria-readonly
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="mb_email">이메일</Label>
            <Input
              id="mb_email"
              name="mb_email"
              type="email"
              placeholder="example@email.com"
              value={formData.mb_email}
              onChange={handleChange}
              disabled={loading}
              autoComplete="email"
              required
            />
            {errors.mb_email ? (
              <p className="text-sm text-destructive">{errors.mb_email}</p>
            ) : emailCheck.status === "available" ? (
              <p className="text-sm text-green-700">{emailCheck.message}</p>
            ) : emailCheck.status === "unavailable" ? (
              <p className="text-sm text-destructive">{emailCheck.message}</p>
            ) : emailCheck.status === "checking" ? (
              <p className="text-sm text-muted-foreground">{emailCheck.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="mb_recommend">
              추천인 아이디 <span className="text-xs text-muted-foreground">(선택)</span>
            </Label>
            <Input
              id="mb_recommend"
              name="mb_recommend"
              type="text"
              placeholder="추천인이 있는 경우 아이디 입력"
              value={formData.mb_recommend}
              onChange={handleChange}
              disabled={loading}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              유효한 추천인이면 추천인에게 회원가입 적립 포인트가 지급됩니다.
            </p>
          </div>

          {certEnabled && (
            <div className="space-y-2 rounded-[4px] border border-dashed bg-muted/20 p-3">
              <Label>본인확인</Label>
              {isVerified ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-sm text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>
                      인증 완료 — {cert!.mb_name} ({cert!.mb_hp})
                      {cert!.provider ? (
                        <span className="ml-1 text-xs text-muted-foreground">
                          [{cert!.cert_type === "hp" ? "휴대폰" : "간편인증"}]
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {certSimpleEnabled && (
                      <IdentityVerificationButton
                        method="simple"
                        pageType="register"
                        onVerified={handleCertVerified}
                        label="간편인증 재인증"
                      />
                    )}
                    {certHpEnabled && certHpMethod && (
                      <IdentityVerificationButton
                        method={certHpMethod}
                        pageType="register"
                        onVerified={handleCertVerified}
                        label="휴대폰 재인증"
                      />
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {certRequired
                      ? "회원가입을 위해 본인확인이 필요합니다."
                      : "본인확인을 하면 이름과 휴대폰 번호를 인증 정보로 채울 수 있습니다."}
                    {certSimpleEnabled && certHpEnabled
                      ? " 간편인증 (카카오/네이버/PASS) 또는 휴대폰 인증 중 한 가지를 선택하세요."
                      : certSimpleEnabled
                      ? " KG 이니시스 간편인증 (카카오/네이버/PASS/통신사)."
                      : " KCP 휴대폰 인증."}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {certSimpleEnabled && (
                      <IdentityVerificationButton
                        method="simple"
                        pageType="register"
                        onVerified={handleCertVerified}
                      />
                    )}
                    {certHpEnabled && certHpMethod && (
                      <IdentityVerificationButton
                        method={certHpMethod}
                        pageType="register"
                        onVerified={handleCertVerified}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <RegisterAgreements
            values={{ agree_terms: formData.agree_terms, agree_privacy: formData.agree_privacy }}
            errors={{ agree_terms: errors.agree_terms, agree_privacy: errors.agree_privacy }}
            disabled={loading}
            onChange={handleChange}
            onAgree={(field) => {
              setFormData((prev) => ({ ...prev, [field]: true }));
              setErrors((prev) => ({ ...prev, [field]: undefined, general: undefined }));
            }}
          />

          {socialSignup && (
            <ExistingAccountLinkPanel
              data={existingLinkData}
              disabled={loading}
              error={existingLinkError}
              loading={existingLinkLoading}
              open={showExistingLink}
              socialSignup={socialSignup}
              onCancel={() => {
                setShowExistingLink(false);
                setExistingLinkError("");
              }}
              onChange={handleExistingLinkChange}
              onOpenChange={(open) => {
                if (existingLinkLoading) return;
                setShowExistingLink(open);
                if (!open) {
                  setExistingLinkError("");
                }
              }}
              onSubmit={handleExistingLink}
              onTrigger={() => {
                setShowExistingLink(true);
                setExistingLinkError("");
              }}
            />
          )}

          {!socialSignup && socialSignupChecked && (
            <RegisterCaptchaField
              audioLoading={captchaAudioLoading}
              disabled={loading}
              error={errors.captcha_key}
              imageUrl={captchaImageUrl}
              value={formData.captcha_key}
              onChange={handleChange}
              onPlayAudio={playCaptchaAudio}
              onReload={reloadCaptcha}
            />
          )}
        </CardContent>
        {/* 위 칸(자동등록방지 입력)과 단추 사이를 띄운다 — CardFooter 기본은 pt-0 이라 붙어 보였다. */}
        <CardFooter className="flex flex-col gap-4 pt-6">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "가입 중..." : socialSignup ? "회원가입하고 소셜 계정 연결" : "회원가입"}
          </Button>
          <p className="text-sm text-muted-foreground text-center">
            이미 계정이 있으신가요?{" "}
            <Link href="/login" className="text-primary hover:underline font-medium">
              로그인
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
