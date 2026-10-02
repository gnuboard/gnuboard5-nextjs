"use client";

import { useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Coins, ExternalLink, ShieldCheck, UserRound } from "lucide-react";
import { SafeHtml } from "@/components/SafeHtml";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useRuntimeRouteParam } from "@/hooks/use-runtime-route-param";
import { ApiError } from "@/lib/api";
import { runtimeRouterPush, runtimeRouterReplace } from "@/lib/runtime-router";
import { getMemberKey, getMemberProfile } from "@/services/member";
import { isMemberKey } from "@/lib/member-key";
import { useAuthStore } from "@/store/auth";
import type { MemberProfile } from "@/lib/types";
import { memberAvatarUrl, memberInitial } from "@/lib/member-avatar";

export default function ClientPage({ mbId: fallbackMbId }: { mbId: string }) {
  const router = useRouter();
  const mbId = useRuntimeRouteParam("mb_id", "/members/:mb_id", fallbackMbId);
  const { user, isInitialized } = useAuthStore();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // 프로필을 물을 값 — 회원 공개 키. 예전 주소(/members/아이디)는 키 주소로 바꾼 뒤에 정해진다.
  const [profileRef, setProfileRef] = useState("");

  useEffect(() => {
    if (!mbId) return;
    if (isMemberKey(mbId)) {
      setProfileRef(mbId);
      return;
    }

    // 예전 주소는 키 주소로 바꾼다 — 주소창 · 로그인 뒤 돌아올 주소에 아이디가 남지 않게.
    // 키를 만들 수 없는 설치본("")은 예전 주소 그대로 연다.
    let ignore = false;
    setProfileRef("");
    getMemberKey(mbId)
      .then((key) => {
        if (ignore) return;
        if (key) {
          runtimeRouterReplace(router, `/members/${encodeURIComponent(key)}`);
        } else if (key === "") {
          setProfileRef(mbId);
        } else {
          setLoading(false);
          setError("회원을 찾을 수 없습니다.");
        }
      })
      .catch(() => {
        if (ignore) return;
        setLoading(false);
        setError("회원 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      });
    return () => {
      ignore = true;
    };
  }, [mbId, router]);

  useEffect(() => {
    if (!isInitialized) return;
    if (!mbId) {
      setLoading(false);
      setError("회원 ID가 지정되지 않았습니다.");
      return;
    }
    if (!profileRef) return;

    if (!user) {
      runtimeRouterPush(router, `/login?redirect=${encodeURIComponent(`/members/${profileRef}`)}`);
      return;
    }

    let ignore = false;
    setLoading(true);
    setError("");

    getMemberProfile(profileRef)
      .then((item) => {
        if (!ignore) setProfile(item);
      })
      .catch((err: unknown) => {
        if (ignore) return;

        if (err instanceof ApiError && err.status === 401) {
          runtimeRouterPush(router, `/login?redirect=${encodeURIComponent(`/members/${profileRef}`)}`);
          return;
        }

        setProfile(null);
        setError(profileErrorMessage(err));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [isInitialized, mbId, profileRef, router, user]);

  const profileHtml = useMemo(() => {
    const raw = profile?.mb_profile?.trim();
    if (!raw) return "소개 내용이 없습니다.";

    return raw.replace(/\n/g, "<br />");
  }, [profile]);

  const homepage = safeHomepageUrl(profile?.mb_homepage || "");

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <Breadcrumb
        items={[
          { label: "홈", href: "/" },
          { label: "회원 프로필" },
        ]}
      />

      {loading || !isInitialized ? (
        <ProfileSkeleton />
      ) : error ? (
        <Card className="mt-4">
          <CardContent className="p-6">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      ) : profile ? (
        <div className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                  <Avatar className="size-16 border">
                    {memberAvatarUrl(profile) ? (
                      <AvatarImage src={memberAvatarUrl(profile)} alt={profile.mb_nick} />
                    ) : null}
                    <AvatarFallback className="text-lg">
                      {memberInitial(profile.mb_nick || profile.mb_id)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <h1 className="break-words text-2xl font-bold">
                      {profile.mb_nick}
                      {/* 아이디는 본인 · 최고관리자에게만 온다(API 가 다른 회원에게는 비워 보낸다). */}
                      {profile.mb_id ? (
                        <span className="ml-2 text-sm font-normal text-muted-foreground">
                          ({profile.mb_id})
                        </span>
                      ) : null}
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                      가입 후 {profile.reg_days.toLocaleString()}일째
                    </p>
                  </div>
                </div>

                {homepage ? (
                  <Button variant="outline" asChild>
                    <a href={homepage} target="_blank" rel="noopener nofollow">
                      <ExternalLink className="mr-2 size-4" />
                      홈페이지
                    </a>
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3">
            <ProfileMetric icon={ShieldCheck} label="레벨" value={profile.mb_level.toLocaleString()} />
            <ProfileMetric icon={Coins} label="포인트" value={`${profile.mb_point.toLocaleString()}점`} />
            <ProfileMetric icon={CalendarDays} label="가입일" value={formatDate(profile.mb_datetime)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserRound className="size-5" />
                자기소개
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SafeHtml
                className="prose prose-sm max-w-none break-words dark:prose-invert"
                html={profileHtml}
                policy="user"
              />
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function ProfileMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex min-h-[86px] items-center gap-3 p-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-[6px] bg-muted">
          <Icon className="size-5 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="break-words text-sm font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ProfileSkeleton() {
  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardContent className="flex items-center gap-4 p-5">
          <div className="skeleton size-16 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="skeleton h-6 w-40 rounded" />
            <div className="skeleton h-4 w-28 rounded" />
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <Card key={item}>
            <CardContent className="h-[86px] p-4">
              <div className="skeleton h-full rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function profileErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) {
      return "정보공개 설정 때문에 이 회원의 자기소개를 볼 수 없습니다.";
    }
    if (err.status === 404) {
      return "회원정보가 존재하지 않습니다. 탈퇴했거나 차단된 회원일 수 있습니다.";
    }
    return err.message || "회원 프로필을 불러오지 못했습니다.";
  }

  return err instanceof Error ? err.message : "회원 프로필을 불러오지 못했습니다.";
}

function safeHomepageUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function formatDate(value: string): string {
  if (!value) return "-";
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value.slice(0, 10) || "-";

  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}
