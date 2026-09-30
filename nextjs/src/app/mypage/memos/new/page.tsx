"use client";

import { useState } from "react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Send } from "lucide-react";
import { runtimeRouterPush } from "@/lib/runtime-router";
import { sendMemo } from "@/services/memos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toastError, toastSuccess } from "@/lib/toast";

export default function NewMemoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [recvId, setRecvId] = useState(searchParams.get("recv") || "");
  const [memo, setMemo] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!recvId.trim()) {
      toastError("받는 회원 아이디를 입력해주세요.");
      return;
    }
    if (!memo.trim()) {
      toastError("쪽지 내용을 입력해주세요.");
      return;
    }

    setSending(true);
    try {
      await sendMemo({
        me_recv_mb_id: recvId.trim(),
        me_memo: memo.trim(),
      });
      toastSuccess("쪽지를 보냈습니다.");
      runtimeRouterPush(router, "/mypage/memos?type=send");
    } catch (error) {
      toastError(error instanceof Error ? error.message : "쪽지 발송에 실패했습니다.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/mypage/memos">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h2 className="text-xl font-bold">쪽지 쓰기</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            회원 아이디로 쪽지를 보냅니다.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border p-5">
        <div className="space-y-2">
          <Label htmlFor="me_recv_mb_id">받는 회원 아이디</Label>
          <Input
            id="me_recv_mb_id"
            value={recvId}
            onChange={(event) => setRecvId(event.target.value)}
            disabled={sending}
            autoComplete="username"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="me_memo">내용</Label>
          <Textarea
            id="me_memo"
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            disabled={sending}
            rows={10}
            maxLength={65536}
          />
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={sending}>
            <Send className="mr-2 h-4 w-4" />
            {sending ? "발송 중..." : "쪽지 보내기"}
          </Button>
        </div>
      </form>
    </div>
  );
}
