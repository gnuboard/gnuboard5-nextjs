"use client";

import { useState } from "react";
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
import { updateMyPassword } from "@/services/member";

export default function PasswordPage() {
  const [form, setForm] = useState({
    mb_password_current: "",
    mb_password: "",
    mb_password_re: "",
  });
  const [msg, setMsg] = useState({ type: "", text: "" });
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setMsg({ type: "", text: "" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.mb_password_current) {
      setMsg({ type: "error", text: "현재 비밀번호를 입력해주세요." });
      return;
    }
    if (form.mb_password.length < 8) {
      setMsg({ type: "error", text: "새 비밀번호는 8자 이상이어야 합니다." });
      return;
    }
    if (!/[A-Za-z]/.test(form.mb_password) || !/\d/.test(form.mb_password)) {
      setMsg({ type: "error", text: "새 비밀번호는 영문과 숫자를 모두 포함해야 합니다." });
      return;
    }
    if (form.mb_password !== form.mb_password_re) {
      setMsg({ type: "error", text: "새 비밀번호가 일치하지 않습니다." });
      return;
    }

    setLoading(true);
    try {
      await updateMyPassword({
        mb_password_current: form.mb_password_current,
        mb_password: form.mb_password,
        mb_password_re: form.mb_password_re,
      });
      setForm({ mb_password_current: "", mb_password: "", mb_password_re: "" });
      setMsg({ type: "success", text: "비밀번호가 변경되었습니다." });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "비밀번호 변경에 실패했습니다.";
      setMsg({ type: "error", text: message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>비밀번호 변경</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {msg.text && (
            <Alert variant={msg.type === "error" ? "destructive" : "default"}>
              <AlertDescription>{msg.text}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="mb_password_current">현재 비밀번호</Label>
            <Input
              id="mb_password_current"
              name="mb_password_current"
              type="password"
              value={form.mb_password_current}
              onChange={handleChange}
              autoComplete="current-password"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mb_password">새 비밀번호</Label>
            <Input
              id="mb_password"
              name="mb_password"
              type="password"
              value={form.mb_password}
              onChange={handleChange}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mb_password_re">새 비밀번호 확인</Label>
            <Input
              id="mb_password_re"
              name="mb_password_re"
              type="password"
              value={form.mb_password_re}
              onChange={handleChange}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={loading}>
              {loading ? "변경 중..." : "비밀번호 변경"}
            </Button>
          </div>
        </CardContent>
      </form>
    </Card>
  );
}
