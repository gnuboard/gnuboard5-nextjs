"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useAuthStore } from "@/store/auth";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Camera, Loader2 } from "lucide-react";
import { toastSuccess, toastError } from "@/lib/toast";
import { shouldBypassImageOptimization } from "@/lib/image";
import { updateMyProfile, uploadMyIcon } from "@/services/member";

export default function ProfilePage() {
  const { user, fetchUser } = useAuthStore();
  const [form, setForm] = useState({
    mb_nick: "",
    mb_name: "",
    mb_email: "",
  });
  const [currentPassword, setCurrentPassword] = useState("");
  const [msg, setMsg] = useState({ type: "", text: "" });
  const [loading, setLoading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setForm({
        mb_nick: user.mb_nick || "",
        mb_name: user.mb_name || "",
        mb_email: user.mb_email || "",
      });
      setCurrentPassword("");
      setAvatarUrl(user.mb_icon_path || null);
    }
  }, [user]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toastError("이미지 파일만 업로드 가능합니다.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toastError("파일 크기는 5MB 이하여야 합니다.");
      return;
    }
    setUploadingAvatar(true);
    try {
      await uploadMyIcon(file);
      await fetchUser();
      // Force refresh avatar with cache buster
      setAvatarUrl((user?.mb_icon_path || "") + "?t=" + Date.now());
      toastSuccess("프로필 이미지가 변경되었습니다.");
    } catch {
      toastError("프로필 이미지 업로드에 실패했습니다.");
    } finally {
      setUploadingAvatar(false);
      e.target.value = "";
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setMsg({ type: "", text: "" });
  };

  const emailChanged = Boolean(
    user &&
      form.mb_email.trim().toLowerCase() !== (user.mb_email || "").trim().toLowerCase()
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.mb_nick || !form.mb_name || !form.mb_email) {
      setMsg({ type: "error", text: "모든 필드를 입력해주세요." });
      return;
    }
    if (emailChanged && !currentPassword) {
      setMsg({ type: "error", text: "이메일을 변경하려면 현재 비밀번호를 입력해주세요." });
      return;
    }
    setLoading(true);
    try {
      await updateMyProfile({
        ...form,
        ...(emailChanged ? { mb_password_current: currentPassword } : {}),
      });
      await fetchUser();
      setCurrentPassword("");
      setMsg({ type: "success", text: "프로필이 수정되었습니다." });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "프로필 수정에 실패했습니다.";
      setMsg({ type: "error", text: message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>프로필 수정</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {msg.text && (
            <Alert variant={msg.type === "error" ? "destructive" : "default"}>
              <AlertDescription>{msg.text}</AlertDescription>
            </Alert>
          )}

          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="h-20 w-20 rounded-full bg-muted overflow-hidden border-2 border-border">
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt="프로필"
                    width={80}
                    height={80}
                    className="h-full w-full object-cover"
                    unoptimized={shouldBypassImageOptimization(avatarUrl)}
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-2xl font-bold text-muted-foreground">
                    {(user?.mb_nick || "?")[0].toUpperCase()}
                  </div>
                )}
              </div>
              <button
                type="button"
                aria-label="프로필 사진 변경"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow hover:bg-[#08783a] transition-colors"
              >
                {uploadingAvatar ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Camera className="h-3.5 w-3.5" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{user?.mb_id}</p>
              <p>프로필 이미지를 변경하려면 카메라 아이콘을 클릭하세요.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mb_nick">닉네임</Label>
            <Input
              id="mb_nick"
              name="mb_nick"
              value={form.mb_nick}
              onChange={handleChange}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mb_name">이름</Label>
            <Input
              id="mb_name"
              name="mb_name"
              value={form.mb_name}
              onChange={handleChange}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mb_email">이메일</Label>
            <Input
              id="mb_email"
              name="mb_email"
              type="email"
              value={form.mb_email}
              onChange={handleChange}
              required
            />
          </div>
          {emailChanged && (
            <div className="space-y-2">
              <Label htmlFor="mb_password_current">현재 비밀번호</Label>
              <Input
                id="mb_password_current"
                name="mb_password_current"
                type="password"
                value={currentPassword}
                onChange={(event) => {
                  setCurrentPassword(event.target.value);
                  setMsg({ type: "", text: "" });
                }}
                autoComplete="current-password"
                required
              />
            </div>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={loading}>
              {loading ? "저장 중..." : "프로필 저장"}
            </Button>
          </div>
        </CardContent>
      </form>
    </Card>
  );
}
