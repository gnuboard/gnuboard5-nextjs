"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { G5Link as Link } from "@/components/ui/g5-link";
import { runtimeRouterPush } from "@/lib/runtime-router";
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

type Step = "verify" | "reset" | "sent" | "done";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("verify");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const [certConfig, setCertConfig] = useState<CertConfig | null>(null);

  const [verifyData, setVerifyData] = useState({
    mb_id: "",
    mb_email: "",
  });

  const [resetData, setResetData] = useState({
    mb_password: "",
    mb_password_re: "",
  });

  useEffect(() => {
    void fetchCertConfig().then(setCertConfig);
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

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!verifyData.mb_id || !verifyData.mb_email) {
      setError("아이디와 이메일을 모두 입력해주세요.");
      return;
    }

    setLoading(true);
    try {
      await requestPasswordReset(verifyData);
      setStep("sent");
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "일치하는 회원 정보를 찾을 수 없습니다.";
      setError(message);
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

  if (step === "done") {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">비밀번호 변경 완료</CardTitle>
          <CardDescription>
            비밀번호가 성공적으로 변경되었습니다.
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-col gap-3">
          <Button className="w-full" onClick={() => runtimeRouterPush(router, "/login")}>
            로그인하기
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (step === "sent") {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">메일을 확인해 주세요</CardTitle>
          <CardDescription>
            입력한 정보와 일치하는 계정이 있다면 비밀번호 재설정 링크를 발송했습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              보안을 위해 재설정 링크는 이메일로만 전달됩니다. 링크는 짧은 시간 동안만 사용할 수 있습니다.
            </AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button className="w-full" onClick={() => setStep("verify")}>
            다시 입력하기
          </Button>
          <Button variant="outline" className="w-full" onClick={() => runtimeRouterPush(router, "/login")}>
            로그인으로 이동
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">
          {step === "verify" ? "비밀번호 찾기" : "새 비밀번호 설정"}
        </CardTitle>
        <CardDescription>
          {step === "verify"
            ? "가입 시 등록한 아이디와 이메일을 입력해주세요."
            : "새로운 비밀번호를 입력해주세요."}
        </CardDescription>
      </CardHeader>

      {step === "verify" ? (
        <form onSubmit={handleVerify}>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="mb_id">아이디</Label>
              <Input
                id="mb_id"
                name="mb_id"
                type="text"
                placeholder="아이디를 입력하세요"
                value={verifyData.mb_id}
                onChange={(e) =>
                  setVerifyData((prev) => ({ ...prev, mb_id: e.target.value }))
                }
                autoComplete="username"
                disabled={loading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mb_email">이메일</Label>
              <Input
                id="mb_email"
                name="mb_email"
                type="email"
                placeholder="가입 시 등록한 이메일"
                value={verifyData.mb_email}
                onChange={(e) =>
                  setVerifyData((prev) => ({
                    ...prev,
                    mb_email: e.target.value,
                  }))
                }
                autoComplete="email"
                disabled={loading}
                required
              />
            </div>
            {certFindEnabled && (
              <div className="space-y-3 rounded-[4px] border border-dashed bg-muted/20 p-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">본인확인으로 찾기</p>
                  <p className="text-xs text-muted-foreground">
                    가입할 때 본인확인을 완료한 회원은 인증 후 바로 새 비밀번호를 설정할 수 있습니다.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
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
              </div>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "확인 중..." : "본인 확인"}
            </Button>
            <p className="text-sm text-muted-foreground text-center">
              <Link
                href="/login"
                className="text-primary hover:underline font-medium"
              >
                로그인으로 돌아가기
              </Link>
            </p>
          </CardFooter>
        </form>
      ) : (
        <form onSubmit={handleReset}>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="mb_password">새 비밀번호</Label>
              <Input
                id="mb_password"
                name="mb_password"
                type="password"
                placeholder="새 비밀번호 (8자 이상, 영문+숫자)"
                value={resetData.mb_password}
                onChange={(e) =>
                  setResetData((prev) => ({
                    ...prev,
                    mb_password: e.target.value,
                  }))
                }
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
                onChange={(e) =>
                  setResetData((prev) => ({
                    ...prev,
                    mb_password_re: e.target.value,
                  }))
                }
                autoComplete="new-password"
                disabled={loading}
                minLength={8}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "변경 중..." : "비밀번호 변경"}
            </Button>
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-primary"
              onClick={() => {
                setStep("verify");
                setError("");
              }}
            >
              처음으로 돌아가기
            </button>
          </CardFooter>
        </form>
      )}
    </Card>
  );
}
