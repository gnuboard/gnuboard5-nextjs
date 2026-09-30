"use client";

import { useState, useEffect } from "react";
import { Share2, Link2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toastSuccess } from "@/lib/toast";

interface ShareButtonsProps {
  title: string;
  url?: string;
}

export function ShareButtons({ title, url }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);
  // navigator는 서버에 없어 SSR/CSR이 갈리면 hydration mismatch가 난다.
  // mount 전에는 false로 통일해서 첫 렌더는 SSR과 일치시키고,
  // mount 후 useEffect에서 실제 능력 감지를 한다.
  const [hasNativeShare, setHasNativeShare] = useState(false);
  const [shareUrl, setShareUrl] = useState(url ?? "");

  useEffect(() => {
    setHasNativeShare(typeof navigator !== "undefined" && "share" in navigator);
    if (!url && typeof window !== "undefined") {
      setShareUrl(window.location.href);
    }
  }, [url]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toastSuccess("링크가 복사되었습니다.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const input = document.createElement("input");
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      toastSuccess("링크가 복사되었습니다.");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url: shareUrl });
      } catch {
        // user cancelled
      }
    }
  };

  const shareToTwitter = () => {
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(shareUrl)}`,
      "_blank",
      "width=600,height=400,noopener,noreferrer"
    );
  };

  const shareToFacebook = () => {
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
      "_blank",
      "width=600,height=400,noopener,noreferrer"
    );
  };

  const shareToKakao = () => {
    // Kakao Story share (no SDK required)
    window.open(
      `https://story.kakao.com/share?url=${encodeURIComponent(shareUrl)}`,
      "_blank",
      "width=600,height=400,noopener,noreferrer"
    );
  };

  return (
    <div className="flex items-center gap-1">
      {/* Native share (mobile) — 첫 렌더는 항상 false라 SSR과 동일 */}
      {hasNativeShare && (
        <Button
          variant="ghost"
          size="icon"
          onClick={handleNativeShare}
          title="공유하기"
          className="h-8 w-8"
        >
          <Share2 className="h-4 w-4" />
        </Button>
      )}

      {/* Copy link */}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleCopyLink}
        title="링크 복사"
        className="h-8 w-8"
      >
        {copied ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : (
          <Link2 className="h-4 w-4" />
        )}
      </Button>

      {/* Twitter/X */}
      <Button
        variant="ghost"
        size="icon"
        onClick={shareToTwitter}
        title="X(Twitter)에 공유"
        className="h-8 w-8"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </Button>

      {/* Facebook */}
      <Button
        variant="ghost"
        size="icon"
        onClick={shareToFacebook}
        title="Facebook에 공유"
        className="h-8 w-8"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
          <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 7.834 7.834 0 0 0-.733-.009c-.707 0-1.259.096-1.675.345a1.642 1.642 0 0 0-.745.98c-.09.345-.133.772-.133 1.29v1.365h3.312l-.477 3.667H13.63v7.98C18.87 23.088 23 18.576 23 13.086c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.49 4.13 10.002 9.101 10.605z" />
        </svg>
      </Button>

      {/* Kakao Story */}
      <Button
        variant="ghost"
        size="icon"
        onClick={shareToKakao}
        title="카카오스토리에 공유"
        className="h-8 w-8"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
          <path d="M12 3c-4.97 0-9 3.185-9 7.115 0 2.557 1.707 4.8 4.27 6.054l-1.086 3.966a.318.318 0 0 0 .478.346l4.467-2.94c.283.024.57.036.861.036 4.97 0 9-3.186 9-7.115C21 6.185 16.97 3 12 3z" />
        </svg>
      </Button>
    </div>
  );
}
