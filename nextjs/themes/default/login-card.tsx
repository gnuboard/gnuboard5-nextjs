"use client";

import { LogOut, Settings, UserRound } from "lucide-react";
import { LoginForm } from "@/components/auth/LoginForm";
import { G5Link as Link } from "@/components/ui/g5-link";
import { g5BaseUrlForRuntime, g5PathForRuntime } from "@/lib/config";
import { formatNumber } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { useRuntimeLocation } from "./use-runtime-pathname";

/* 소셜 단추 로고 — 그누보드가 skin/social/img 에 두는 30px 그림을 레퍼런스(#sns_login)처럼 쓴다.
   CSS 의 url() 은 그림이 어디 있는지 모르므로 그누보드 주소를 붙여 변수로 넘긴다. 화면이
   그누보드와 다른 주소(Vercel)에서 떠도 그림은 그누보드에서 받아야 한다. */
const SNS_LOGO_FILES = {
  naver: "sns_naver_s.png",
  kakao: "sns_kakao_s.png",
  facebook: "sns_fb_s.png",
  google: "sns_gp_s.png",
  twitter: "sns_twitter_s.png",
  payco: "sns_payco_s.png",
} as const;

function snsLogoVars(): React.CSSProperties {
  const vars: Record<string, string> = {};
  for (const [name, file] of Object.entries(SNS_LOGO_FILES)) {
    vars[`--solune-sns-${name}`] = `url("${g5BaseUrlForRuntime()}/skin/social/img/${file}")`;
  }
  return vars as React.CSSProperties;
}

/**
 * 사이드바 첫 카드. 레퍼런스의 #ol_before 자리로, 비로그인일 때는 로그인 폼을,
 * 로그인 상태에서는 회원 카드(포인트 + 바로가기)를 보여준다.
 */
export function SoluneLoginCard() {
  const { isInitialized, user, logout } = useAuthStore();
  // 사이드바에서 로그인하면 보던 페이지(쿼리 포함)에 그대로 머문다. 전에는 늘 홈("/")으로 보냈다.
  const here = useRuntimeLocation();

  if (!isInitialized || !user) {
    return (
      <section className="solune-sidebar-widget solune-login-card" aria-label="회원 로그인" style={snsLogoVars()}>
        <div className="solune-login-card-body">
          <h2 className="solune-login-title">로그인</h2>
          {/* 레퍼런스 outlogin 스킨: 자리표시자만 있는 칸 둘, 단추, 링크 줄, 세로 소셜 단추. */}
          <LoginForm redirectAfterLogin={here} variant="compact" />
        </div>
      </section>
    );
  }

  const displayName = user.mb_nick || user.mb_name || user.mb_id;

  return (
    <section className="solune-sidebar-widget solune-login-card" aria-label="회원 정보">
      <div className="solune-login-card-body">
        <div className="solune-member-head">
          <span className="solune-member-avatar" aria-hidden>
            <UserRound size={20} />
          </span>
          <div className="min-w-0">
            <strong>{displayName}</strong>
            <span>{user.is_super_admin ? "최고관리자" : `레벨 ${user.mb_level}`}</span>
          </div>
        </div>
        <dl className="solune-member-stats">
          <div>
            <dt>포인트</dt>
            <dd>{formatNumber(Number(user.mb_point) || 0)}</dd>
          </div>
        </dl>
        <div className="solune-member-actions">
          {/* 레퍼런스 outlogin 스킨처럼 최고관리자에게만 관리자 화면(그누보드 /adm/) 단추를 낸다.
              /adm/ 는 PHP 화면이라 앱 라우터가 아닌 일반 링크로 연다. */}
          {user.is_super_admin && (
            <a className="solune-member-admin" href={g5PathForRuntime("/adm/")}>
              <Settings size={14} aria-hidden />
              관리자
            </a>
          )}
          <Link href="/mypage">마이페이지</Link>
          <button type="button" onClick={() => void logout()}>
            <LogOut size={14} aria-hidden />
            로그아웃
          </button>
        </div>
      </div>
    </section>
  );
}
