"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, IdCard, KeyRound, Mail } from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiUrl } from "@/lib/config";
import { runtimeRouterPush } from "@/lib/runtime-router";
import { toastSuccess } from "@/lib/toast";
import {
  requestPasswordReset,
  requestPasswordResetByCert,
  resetPassword,
} from "@/services/auth";
import {
  IdentityVerificationButton,
  type IdentityVerificationMethod,
  type IdentityVerificationResult,
} from "@/components/auth/IdentityVerificationButton";
import { fetchCertConfig, type CertConfig } from "@/services/socialAuth";
import { FindCaptchaField } from "./FindCaptchaField";

type Step = "verify" | "reset" | "sent" | "done";

/** 그누보드 비밀번호 찾기 화면의 카드 — 머리(표 · 제목 · 설명)와 본문. */
function FindCard({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="find-info-card rounded-xl border bg-card text-card-foreground">
      <div className="find-info-card-head space-y-2 border-b px-5 py-5">
        <h2 className="flex items-center gap-2.5 text-base font-bold">
          <span
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
            aria-hidden="true"
          >
            {icon}
          </span>
          {title}
        </h2>
        {description && <p className="text-sm leading-6 text-muted-foreground">{description}</p>}
      </div>
      <div className="find-info-card-body px-5 py-5">{children}</div>
    </section>
  );
}

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("verify");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const [certConfig, setCertConfig] = useState<CertConfig | null>(null);

  const [email, setEmail] = useState("");
  const [captchaKey, setCaptchaKey] = useState("");
  const [captchaError, setCaptchaError] = useState("");
  const [captchaVersion, setCaptchaVersion] = useState(0);
  const [captchaAudioLoading, setCaptchaAudioLoading] = useState(false);
  const captchaAudioRef = useRef<HTMLAudioElement | null>(null);

  const [resetData, setResetData] = useState({
    mb_password: "",
    mb_password_re: "",
  });

  useEffect(() => {
    void fetchCertConfig().then(setCertConfig);
    // 처음에 새 그림을 받아 세션(PHPSESSID)을 만들어 둔다 — 보내기 전에 쿠키가 있어야 자동등록방지가 맞는다.
    setCaptchaVersion(Date.now());
    const token = new URLSearchParams(window.location.search).get("reset_token");
    if (token) {
      setResetToken(token);
      setStep("reset");
    }
  }, []);

  const certSimpleEnabled =
    !!certConfig?.enabled && !!certConfig?.find_enabled && certConfig?.simple === "inicis";
  const certHpMethod: IdentityVerificationMethod | null =
    certConfig?.hp === "kcp_v2" ? "hp_v2" : certConfig?.hp === "kcp" ? "hp" : null;
  const certHpEnabled =
    !!certConfig?.enabled && !!certConfig?.find_enabled && !!certHpMethod;
  const certFindEnabled = certSimpleEnabled || certHpEnabled;

  const reloadCaptcha = () => {
    setCaptchaVersion(Date.now());
    setCaptchaKey("");
    setCaptchaError("");
  };

  const playCaptchaAudio = async () => {
    setCaptchaAudioLoading(true);
    setCaptchaError("");
    try {
      captchaAudioRef.current?.pause();
      const audio = new Audio();
      audio.crossOrigin = "use-credentials";
      audio.preload = "auto";
      audio.src = apiUrl(`/captcha/audio?t=${captchaVersion}`);
      captchaAudioRef.current = audio;
      await audio.play();
    } catch {
      setCaptchaError("자동등록방지 음성을 재생하지 못했습니다. 새로고침 후 다시 시도해주세요.");
    } finally {
      setCaptchaAudioLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setCaptchaError("");

    if (!email.trim()) {
      setError("E-mail 주소를 입력해주세요.");
      return;
    }
    if (!captchaKey.trim()) {
      setCaptchaError("자동등록방지 숫자를 입력해주세요.");
      return;
    }

    setLoading(true);
    try {
      await requestPasswordReset({ mb_email: email.trim(), captcha_key: captchaKey.trim() });
      reloadCaptcha(); // 한 번 쓴 숫자는 서버가 지운다
      setStep("sent");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "요청을 처리하지 못했습니다. 다시 시도해주세요.";
      if (/자동등록방지|captcha/i.test(message)) {
        reloadCaptcha();
        setCaptchaError(message);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCertVerified = (result: IdentityVerificationResult) => {
    setError("");
    setLoading(true);

    void requestPasswordResetByCert({
      cert_type: result.cert_type,
      cert_no: result.cert_no,
    })
      .then((token) => {
        setResetToken(token);
        setStep("reset");
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error
            ? err.message
            : "본인확인으로 가입된 회원정보를 찾을 수 없습니다.";
        setError(message);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!resetData.mb_password || !resetData.mb_password_re) {
      setError("새 비밀번호를 입력해주세요.");
      return;
    }
    if (resetData.mb_password !== resetData.mb_password_re) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (
      resetData.mb_password.length < 8 ||
      !/[A-Za-z]/.test(resetData.mb_password) ||
      !/\d/.test(resetData.mb_password)
    ) {
      setError("비밀번호는 8자 이상이며 영문과 숫자를 포함해야 합니다.");
      return;
    }

    setLoading(true);
    try {
      await resetPassword({
        reset_token: resetToken,
        ...resetData,
      });
      setStep("done");
      toastSuccess("비밀번호가 변경되었습니다.");
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "비밀번호 변경에 실패했습니다.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const errorAlert = error ? (
    <Alert variant="destructive" className="mb-4">
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  ) : null;

  let content: ReactNode;
  if (step === "done") {
    content = (
      <FindCard
        icon={<CheckCircle2 className="h-4 w-4" />}
        title="비밀번호 변경 완료"
        description="비밀번호가 바뀌었습니다. 새 비밀번호로 로그인하세요."
      >
        <Button className="w-full" onClick={() => runtimeRouterPush(router, "/login")}>
          로그인하기
        </Button>
      </FindCard>
    );
  } else if (step === "sent") {
    content = (
      <FindCard
        icon={<Mail className="h-4 w-4" />}
        title="메일을 확인해 주세요"
        description="입력한 E-mail 주소로 가입한 계정이 있다면 비밀번호를 다시 정하는 링크를 보냈습니다. 링크는 10분 동안만 쓸 수 있습니다."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="outline" onClick={() => setStep("verify")}>
            다시 입력하기
          </Button>
          <Button onClick={() => runtimeRouterPush(router, "/login")}>로그인으로 이동</Button>
        </div>
      </FindCard>
    );
  } else if (step === "reset") {
    content = (
      <FindCard
        icon={<KeyRound className="h-4 w-4" />}
        title="새 비밀번호 설정"
        description="새로 쓸 비밀번호를 입력해 주세요."
      >
        <form onSubmit={handleReset} className="space-y-4">
          {errorAlert}
          <div className="space-y-2">
            <Label htmlFor="mb_password">새 비밀번호</Label>
            <Input
              id="mb_password"
              name="mb_password"
              type="password"
              placeholder="8자 이상, 영문과 숫자"
              value={resetData.mb_password}
              onChange={(e) => setResetData((prev) => ({ ...prev, mb_password: e.target.value }))}
              autoComplete="new-password"
              disabled={loading}
              minLength={8}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mb_password_re">새 비밀번호 확인</Label>
            <Input
              id="mb_password_re"
              name="mb_password_re"
              type="password"
              placeholder="비밀번호를 다시 입력하세요"
              value={resetData.mb_password_re}
              onChange={(e) => setResetData((prev) => ({ ...prev, mb_password_re: e.target.value }))}
              autoComplete="new-password"
              disabled={loading}
              minLength={8}
              required
            />
          </div>
          <Button type="submit" className="h-11 w-full" disabled={loading}>
            {loading ? "변경 중..." : "비밀번호 변경"}
          </Button>
          <button
            type="button"
            className="block w-full text-center text-sm text-muted-foreground hover:text-primary"
            onClick={() => {
              setStep("verify");
              setError("");
            }}
          >
            처음으로 돌아가기
          </button>
        </form>
      </FindCard>
    );
  } else {
    content = (
      <>
        <FindCard
          icon={<Mail className="h-4 w-4" />}
          title="이메일로 찾기"
          description={
            <>
              회원가입 시 등록하신 이메일 주소를 입력해 주세요.
              <br />
              해당 이메일로 비밀번호를 다시 정하는 링크를 보내드립니다.
            </>
          }
        >
          <form onSubmit={handleVerify} className="space-y-5" noValidate>
            {errorAlert}
            <div className="space-y-2">
              <Label htmlFor="mb_email">
                E-mail 주소 <strong className="text-xs font-semibold text-destructive">필수</strong>
              </Label>
              <Input
                id="mb_email"
                name="mb_email"
                type="email"
                placeholder="example@domain.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError("");
                }}
                autoComplete="email"
                disabled={loading}
                required
              />
            </div>
            <FindCaptchaField
              audioLoading={captchaAudioLoading}
              disabled={loading}
              error={captchaError}
              // 화면이 붙은 뒤(첫 번호를 받은 뒤)에만 그림 주소를 준다 — 서버 그림과 어긋나지 않고 t=0 그림을 헛받지 않게.
              imageUrl={captchaVersion > 0 ? apiUrl(`/captcha?t=${captchaVersion}`) : ""}
              value={captchaKey}
              onChange={(e) => {
                setCaptchaKey(e.target.value);
                setCaptchaError("");
              }}
              onPlayAudio={() => void playCaptchaAudio()}
              onReload={reloadCaptcha}
            />
            <Button type="submit" className="h-11 w-full" disabled={loading}>
              {loading ? "보내는 중..." : "인증메일 보내기"}
            </Button>
          </form>
        </FindCard>

        {certFindEnabled && (
          <FindCard icon={<IdCard className="h-4 w-4" />} title="본인인증으로 찾기">
            <div className="grid gap-2 sm:grid-cols-2">
              {certSimpleEnabled && (
                <IdentityVerificationButton
                  method="simple"
                  pageType="find"
                  onVerified={handleCertVerified}
                  disabled={loading}
                />
              )}
              {certHpEnabled && certHpMethod && (
                <IdentityVerificationButton
                  method={certHpMethod}
                  pageType="find"
                  onVerified={handleCertVerified}
                  disabled={loading}
                />
              )}
            </div>
          </FindCard>
        )}
      </>
    );
  }

  return (
    <div className="find-info-page container mx-auto max-w-4xl px-4 py-8">
      <Breadcrumb items={[{ label: "회원정보 찾기" }]} />
      <div className="find-info-head mb-6 border-b pb-4">
        <h1 className="text-2xl font-bold">회원정보 찾기</h1>
      </div>
      <div className="find-info-cards grid max-w-xl gap-4">{content}</div>
    </div>
  );
}
