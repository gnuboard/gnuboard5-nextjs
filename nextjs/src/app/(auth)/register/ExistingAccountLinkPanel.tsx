"use client";

import type { ChangeEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SocialSignupProfile } from "@/services/socialAuth";

interface ExistingLinkData {
  mb_id: string;
  mb_password: string;
}

interface ExistingAccountLinkPanelProps {
  data: ExistingLinkData;
  disabled: boolean;
  error: string;
  loading: boolean;
  open: boolean;
  socialSignup: SocialSignupProfile;
  onCancel: () => void;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void | Promise<void>;
  onTrigger: () => void;
}

export function ExistingAccountLinkPanel({
  data,
  disabled,
  error,
  loading,
  open,
  socialSignup,
  onCancel,
  onChange,
  onOpenChange,
  onSubmit,
  onTrigger,
}: ExistingAccountLinkPanelProps) {
  return (
    <div className="space-y-3 rounded-[4px] border border-[#e0e3e7] bg-[#f6f7f8] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-bold text-[#202124]">혹시 기존 회원이신가요?</p>
          <p className="text-xs text-muted-foreground">
            기존 그누보드5 계정에 이 {socialSignup.provider_label} 계정을 연결할 수 있습니다.
          </p>
        </div>
        <Button type="button" variant="default" onClick={onTrigger} disabled={disabled || loading}>
          기존 계정에 연결하기
        </Button>
      </div>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[420px] gap-5 p-5 sm:p-6">
          <DialogHeader className="text-center">
            <DialogTitle className="text-xl font-black text-[#202124]">
              기존 계정에 연결하기
            </DialogTitle>
            <DialogDescription>
              기존 그누보드5 아이디와 비밀번호를 입력하면 이 {socialSignup.provider_label} 계정을 연결합니다.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void onSubmit();
            }}
          >
            <div className="rounded-[4px] border border-[#d4efe1] bg-[#f3fbf7] p-3 text-sm leading-6 text-[#202124]">
              {socialSignup.provider_label} 계정 확인이 끝났습니다. 기존 계정으로 로그인하면
              다음부터 이 소셜 계정으로 바로 로그인할 수 있습니다.
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="existing_mb_id">아이디</Label>
              <Input
                id="existing_mb_id"
                name="mb_id"
                type="text"
                value={data.mb_id}
                onChange={onChange}
                disabled={loading}
                autoComplete="username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="existing_mb_password">비밀번호</Label>
              <Input
                id="existing_mb_password"
                name="mb_password"
                type="password"
                value={data.mb_password}
                onChange={onChange}
                disabled={loading}
                autoComplete="current-password"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
                취소
              </Button>
              <Button type="submit" disabled={loading || disabled}>
                {loading ? "연결 중..." : "로그인하고 연결하기"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
