"use client";

import type { FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function RestockAlertDialog({
  open,
  onOpenChange,
  hp,
  onHpChange,
  agree,
  onAgreeChange,
  submitting,
  privacyText,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hp: string;
  onHpChange: (value: string) => void;
  agree: boolean;
  onAgreeChange: (value: boolean) => void;
  submitting: boolean;
  privacyText: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle>재입고 알림 신청</DialogTitle>
          <DialogDescription>
            상품이 다시 입고되면 입력한 휴대폰 번호로 SMS 알림을 보냅니다.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <label htmlFor="restock-hp" className="text-sm font-medium">
              휴대폰 번호
            </label>
            <Input
              id="restock-hp"
              type="tel"
              value={hp}
              onChange={(event) => onHpChange(event.target.value)}
              placeholder="010-1234-5678"
              autoComplete="tel"
              required
            />
          </div>
          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            동일 상품과 휴대폰 번호로 이미 신청한 내역이 있으면 중복 등록하지 않습니다.
          </div>
          {privacyText && (
            <div className="space-y-2">
              <p className="text-sm font-medium">개인정보처리방침 안내</p>
              <Textarea
                value={privacyText}
                readOnly
                rows={5}
                className="resize-none bg-muted/30 text-xs leading-relaxed"
              />
            </div>
          )}
          <label className="flex items-start gap-2 rounded-md border bg-background p-3 text-sm leading-relaxed">
            <input
              id="restock-agree"
              type="checkbox"
              className="mt-1 size-4 shrink-0 accent-primary"
              checked={agree}
              onChange={(event) => onAgreeChange(event.target.checked)}
              required
            />
            <span>
              개인정보처리방침 안내를 확인했으며, 재입고 SMS 알림을 위해 휴대폰 번호를
              수집하는 데 동의합니다.
            </span>
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              취소
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "신청 중..." : "신청하기"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RecommendationDialog({
  open,
  onOpenChange,
  toEmail,
  onToEmailChange,
  subject,
  onSubjectChange,
  content,
  onContentChange,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toEmail: string;
  onToEmailChange: (value: string) => void;
  subject: string;
  onSubjectChange: (value: string) => void;
  content: string;
  onContentChange: (value: string) => void;
  submitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>상품 추천 메일 보내기</DialogTitle>
          <DialogDescription>
            지인에게 이 상품 링크와 추천 메시지를 메일로 보냅니다.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <label htmlFor="recommend-to-email" className="text-sm font-medium">
              받는 사람 이메일
            </label>
            <Input
              id="recommend-to-email"
              type="email"
              value={toEmail}
              onChange={(event) => onToEmailChange(event.target.value)}
              placeholder="friend@example.com"
              autoComplete="email"
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="recommend-subject" className="text-sm font-medium">
              제목
            </label>
            <Input
              id="recommend-subject"
              value={subject}
              onChange={(event) => onSubjectChange(event.target.value)}
              maxLength={120}
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="recommend-content" className="text-sm font-medium">
              추천 내용
            </label>
            <Textarea
              id="recommend-content"
              value={content}
              onChange={(event) => onContentChange(event.target.value)}
              maxLength={1000}
              rows={5}
              placeholder="이 상품을 추천하는 이유를 적어주세요."
              required
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              취소
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "발송 중..." : "메일 보내기"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
