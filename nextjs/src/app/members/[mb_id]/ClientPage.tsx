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
import { runtimeRouterPush } from "@/lib/runtime-router";
import { getMemberProfile } from "@/services/member";
import { useAuthStore } from "@/store/auth";
import type { MemberProfile } from "@/lib/types";

export default function ClientPage({ mbId: fallbackMbId }: { mbId: string }) {
  const router = useRouter();
  const mbId = useRuntimeRouteParam("mb_id", "/members/:mb_id", fallbackMbId);
  const { user, isInitialized } = useAuthStore();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isInitialized) return;
    if (!mbId) {
      setLoading(false);
      setError("회원 ID가 지정되지 않았습니다.");
      return;
    }

    if (!user) {
      runtimeRouterPush(router, `/login?redirect=${encodeURIComponent(`/members/${mbId}`)}`);
      return;
    }

    let ignore = false;
    setLoading(true);
    setError("");

    getMemberProfile(mbId)
      .then((item) => {
        if (!ignore) setProfile(item);
      })
      .catch((err: unknown) => {
        if (ignore) return;

        if (err instanceof ApiError && err.status === 401) {
          runtimeRouterPush(router, `/login?redirect=${encodeURIComponent(`/members/${mbId}`)}`);
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
  }, [isInitialized, mbId, router, user]);

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
                    {profile.mb_icon_path ? (
                      <AvatarImage src={profile.mb_icon_path} alt={profile.mb_nick} />
                    ) : null}
                    <AvatarFallback className="text-lg">
                      {(profile.mb_nick || profile.mb_id).charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <h1 className="break-words text-2xl font-bold">
                      {profile.mb_nick}
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        ({profile.mb_id})
                      </span>
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
