"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LoginForm } from "@/components/auth/LoginForm";

interface LoginModalProps {
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  trigger?: ReactNode;
}

function safeRedirectPath(pathname: string | null) {
  if (!pathname || pathname === "/login" || pathname.startsWith("/login/")) {
    return "/";
  }
  return pathname.startsWith("/") && !pathname.startsWith("//") ? pathname : "/";
}

export function LoginModal({ onOpenChange, open, trigger }: LoginModalProps) {
  const pathname = usePathname();
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const redirectAfterLogin = safeRedirectPath(pathname);
  const setModalOpen = (nextOpen: boolean) => {
    setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setModalOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-[420px] gap-5 p-5 sm:p-6">
        <DialogHeader className="text-center">
          <DialogTitle className="text-2xl font-black text-[#202124]">로그인</DialogTitle>
          <DialogDescription>현재 화면을 유지한 채로 로그인합니다.</DialogDescription>
        </DialogHeader>
        <LoginForm
          redirectAfterLogin={redirectAfterLogin}
          onNavigate={() => setModalOpen(false)}
          onSuccess={() => setModalOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

export default LoginModal;
