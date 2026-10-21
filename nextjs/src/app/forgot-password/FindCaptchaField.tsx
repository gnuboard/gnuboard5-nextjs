"use client";

import type { ChangeEvent } from "react";
import { RefreshCw, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FindCaptchaFieldProps {
  audioLoading: boolean;
  disabled: boolean;
  error?: string;
  imageUrl: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onPlayAudio: () => void;
  onReload: () => void;
}

/**
 * 자동등록방지 — 그누보드 captcha_html()(비밀번호 찾기 화면)처럼 그림 · 입력 칸 · 음성 · 새로고침을 한 줄에 둔다.
 * 그림은 GET /api/v1/captcha 가 세션에 값을 두며 내준다(같은 세션 쿠키로 보내야 맞는다).
 */
export function FindCaptchaField({
  audioLoading,
  disabled,
  error,
  imageUrl,
  value,
  onChange,
  onPlayAudio,
  onReload,
}: FindCaptchaFieldProps) {
  return (
    <div className="find-info-captcha space-y-2">
      <Label htmlFor="captcha_key">자동등록방지</Label>
      <div className="flex items-center gap-2">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt="자동등록방지 숫자"
            width={100}
            height={38}
            crossOrigin="use-credentials"
            className="h-10 w-[100px] shrink-0 rounded-md border bg-white object-contain"
          />
        ) : (
          <span className="h-10 w-[100px] shrink-0 rounded-md border bg-muted" aria-hidden="true" />
        )}
        <Input
          id="captcha_key"
          name="captcha_key"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          aria-describedby="captcha_key_help"
          aria-invalid={error ? true : undefined}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className="min-w-0 flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onPlayAudio}
          disabled={disabled || audioLoading}
          aria-label="숫자 음성 듣기"
          title="숫자 음성 듣기"
        >
          <Volume2 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onReload}
          disabled={disabled}
          aria-label="새 숫자 받기"
          title="새 숫자 받기"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <p id="captcha_key_help" className="text-xs text-muted-foreground">
        자동등록방지 숫자를 순서대로 입력하세요.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
