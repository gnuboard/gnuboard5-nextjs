"use client";

import type { ChangeEvent } from "react";
import { RefreshCw, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RegisterCaptchaFieldProps {
  audioLoading: boolean;
  disabled: boolean;
  error?: string;
  imageUrl: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onPlayAudio: () => void;
  onReload: () => void;
}

export function RegisterCaptchaField({
  audioLoading,
  disabled,
  error,
  imageUrl,
  value,
  onChange,
  onPlayAudio,
  onReload,
}: RegisterCaptchaFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="captcha_key">자동등록방지</Label>
      <div className="flex items-center gap-2">
        <img
          src={imageUrl}
          alt="자동등록방지 문자"
          width={160}
          height={60}
          crossOrigin="use-credentials"
          className="rounded border bg-white"
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
          aria-label="새로고침"
          title="새로고침"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <Input
        id="captcha_key"
        name="captcha_key"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        placeholder="위 그림의 숫자를 순서대로 입력"
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
