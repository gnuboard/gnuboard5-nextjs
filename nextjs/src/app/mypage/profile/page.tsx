"use client";

import { useState, useEffect } from "react";
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
import type { PublicSettings } from "@/lib/schemas";
import {
  deleteMyIcon,
  deleteMyImage,
  updateMyProfile,
  uploadMyIcon,
  uploadMyImage,
} from "@/services/member";
import { getClientPublicSettings } from "@/services/settings";
import { MemberMediaField } from "./MemberMediaField";

type MemberMedia = NonNullable<PublicSettings["member_media"]>;

/** 관리자 설정에서 켜져 있고 레벨이 되면 보인다. 설정을 아직 못 읽었으면 아이콘은 예전처럼 보인다. */
function canUse(rule: MemberMedia["icon"] | undefined, level: number, whenUnknown: boolean): boolean {
  if (!rule) return whenUnknown;
  return rule.enabled !== false && level >= (rule.level ?? 0);
}

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
  const [media, setMedia] = useState<MemberMedia | undefined>(undefined);

  useEffect(() => {
    if (user) {
      setForm({
        mb_nick: user.mb_nick || "",
        mb_name: user.mb_name || "",
        mb_email: user.mb_email || "",
      });
      setCurrentPassword("");
    }
  }, [user]);

  useEffect(() => {
    let alive = true;
    getClientPublicSettings()
      .then((settings) => {
        if (alive) setMedia(settings.member_media);
      })
      .catch(() => {
        // 설정을 못 읽으면 아이콘만 예전처럼 보인다.
      });
    return () => {
      alive = false;
    };
  }, []);

  const level = Number(user?.mb_level ?? 0);
  const showImage = canUse(media?.image, level, false);
  const showIcon = canUse(media?.icon, level, true);
  const initial = (user?.mb_nick || "?")[0].toUpperCase();
  const refreshUser = async () => {
    await fetchUser();
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

          <p className="text-sm font-medium text-foreground">{user?.mb_id}</p>

          {/* 그누보드 회원정보 수정과 같은 두 칸 — 회원이미지(프로필 사진)와 회원아이콘(이름 옆 작은 그림). */}
          {showImage && (
            <MemberMediaField
              label="회원이미지"
              description="프로필 사진입니다. 회원 카드 · 프로필에 보입니다."
              url={user?.mb_image_path}
              fallback={initial}
              rule={media?.image}
              shape="circle"
              previewSize={80}
              accept="image/gif,image/jpeg,image/png"
              onUpload={uploadMyImage}
              onDelete={deleteMyImage}
              onChanged={refreshUser}
            />
          )}
          {showIcon && (
            <MemberMediaField
              label="회원아이콘"
              description="글 · 댓글에서 이름 옆에 보이는 작은 그림입니다."
              url={user?.mb_icon_path}
              fallback={initial}
              // 아이콘 올리기 API 는 크기(바이트)만 설정을 따르고 폭 · 높이는 자르지 않으므로 용량만 안내한다.
              rule={{ size: media?.icon?.size }}
              shape="square"
              previewSize={48}
              accept="image/gif,image/jpeg,image/png,image/webp"
              onUpload={uploadMyIcon}
              onDelete={deleteMyIcon}
              onChanged={refreshUser}
            />
          )}

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
