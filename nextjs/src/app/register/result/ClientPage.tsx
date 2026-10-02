"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Home, LogIn, MailCheck } from "lucide-react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getRegisterResult, type RegisterResult } from "@/services/auth";

type RegisterResultPageProps = {
  homeHref?: string;
  homeLabel?: string;
  loginHref?: string;
  title?: string;
};

export default function RegisterResultPage({
  homeHref = "/",
  homeLabel = "메인으로",
  loginHref = "/login",
  title = "회원가입 완료",
}: RegisterResultPageProps = {}) {
  const [result, setResult] = useState<RegisterResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    void getRegisterResult()
      .then((nextResult) => {
        if (cancelled) return;
        setResult(nextResult);
        setError("");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setResult(null);
        setError(err instanceof Error ? err.message : "회원가입 완료 정보를 찾을 수 없습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-12">
      <Card className="w-full max-w-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            {result?.requires_email_verification ? (
              <MailCheck className="size-7" />
            ) : (
              <CheckCircle2 className="size-7" />
            )}
          </div>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription>
            {loading
              ? "가입 완료 정보를 확인하고 있습니다."
              : result
                ? `${result.mb_name || result.mb_nick}님의 회원가입을 축하합니다.`
                : "회원가입 완료 정보를 확인할 수 없습니다."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {loading ? (
            <div className="space-y-3">
              <div className="skeleton h-14 rounded-md" />
              <div className="skeleton h-28 rounded-md" />
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : result ? (
            <>
              {result.requires_email_verification && (
                <Alert variant={result.verification_mail_sent === false ? "destructive" : "default"}>
                  <AlertDescription className="space-y-1">
                    {result.verification_mail_sent === false ? (
                      <p>
                        인증 메일을 보내지 못했습니다. 잠시 뒤 로그인 화면에서 아이디와 비밀번호로 로그인을
                        시도하면 인증 메일을 다시 받을 수 있습니다. 계속 받지 못하면 관리자에게 문의해주세요.
                      </p>
                    ) : (
                      <>
                        <p>
                          입력하신 이메일 주소로 인증 메일을 보냈습니다.{" "}
                          {result.email_certify_minutes && result.email_certify_minutes > 0
                            ? `${result.email_certify_minutes}분 안에 `
                            : ""}
                          메일의 인증 링크를 눌러야 로그인할 수 있습니다.
                        </p>
                        <p>
                          메일이 오지 않으면 스팸함을 확인하거나, 로그인 화면에서 로그인을 시도해 인증 메일을 다시
                          받으세요.
                        </p>
                      </>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              <dl className="divide-y rounded-md border text-sm">
                <div className="grid grid-cols-[7rem_1fr] gap-3 px-4 py-3">
                  <dt className="text-muted-foreground">아이디</dt>
                  <dd className="font-medium">{result.mb_id}</dd>
                </div>
                <div className="grid grid-cols-[7rem_1fr] gap-3 px-4 py-3">
                  <dt className="text-muted-foreground">이름</dt>
                  <dd className="font-medium">{result.mb_name || result.mb_nick}</dd>
                </div>
                <div className="grid grid-cols-[7rem_1fr] gap-3 px-4 py-3">
                  <dt className="text-muted-foreground">이메일</dt>
                  <dd className="break-words font-medium">{result.mb_email}</dd>
                </div>
              </dl>

              <p className="text-sm leading-6 text-muted-foreground">
                비밀번호는 암호화되어 저장됩니다. 아이디나 비밀번호를 잊은 경우 가입할 때
                입력한 이메일 주소로 찾을 수 있습니다.
              </p>
            </>
          ) : null}
        </CardContent>

        <CardFooter className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild className="w-full sm:w-auto">
            <Link href={homeHref}>
              <Home className="size-4" />
              {homeLabel}
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href={loginHref}>
              <LogIn className="size-4" />
              로그인
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
