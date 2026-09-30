"use client";

import { useCallback, useEffect, useState } from "react";
import { MonitorSmartphone, RefreshCw, Trash2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  getLoginSessions,
  revokeLoginSession,
  type LoginSession,
} from "@/services/member";

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function sessionName(session: LoginSession) {
  if (session.device_label) return session.device_label;
  if (session.user_agent) {
    if (/iPhone|iPad|Android|Mobile/i.test(session.user_agent)) return "모바일 브라우저";
    if (/Windows/i.test(session.user_agent)) return "Windows 브라우저";
    if (/Macintosh|Mac OS/i.test(session.user_agent)) return "Mac 브라우저";
  }
  return "브라우저 세션";
}

export default function LoginSessionsPage() {
  const [sessions, setSessions] = useState<LoginSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      setSessions(await getLoginSessions());
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : "로그인 기기 목록을 불러오지 못했습니다.";
      setMessage({ type: "error", text });
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const handleRevoke = async (tokenId: number) => {
    setBusyId(tokenId);
    setMessage(null);
    try {
      await revokeLoginSession(tokenId);
      setSessions((prev) => prev.filter((session) => session.token_id !== tokenId));
      setMessage({ type: "success", text: "선택한 로그인 세션을 로그아웃했습니다." });
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : "로그아웃 처리에 실패했습니다.";
      setMessage({ type: "error", text });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>로그인 기기</CardTitle>
        <Button type="button" variant="outline" size="sm" onClick={() => void loadSessions()} disabled={loading}>
          <RefreshCw className={loading ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
          새로고침
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {message && (
          <Alert variant={message.type === "error" ? "destructive" : "default"}>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="skeleton h-24 rounded-md border" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            활성 로그인 세션이 없습니다.
          </div>
        ) : (
          <div className="divide-y rounded-md border">
            {sessions.map((session) => (
              <div key={session.token_id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <MonitorSmartphone className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium">{sessionName(session)}</p>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {session.user_agent || "User-Agent 없음"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>IP {session.ip || "-"}</span>
                      <span>생성 {formatDate(session.created_at)}</span>
                      <span>최근 사용 {formatDate(session.last_used_at || session.created_at)}</span>
                      <span>만료 {formatDate(session.expires_at)}</span>
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => void handleRevoke(session.token_id)}
                  disabled={busyId === session.token_id}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  로그아웃
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
