/**
 * 메일 인증 링크(GET /api/v1/auth/verify-email)를 브라우저로 열면 API 가 로그인 화면
 * (/login?email_verify=<결과>)으로 보낸다. 그 결과를 사람에게 보일 문구로 바꾼다.
 */
export interface EmailVerifyNotice {
  /** 로그인 전(로그인 화면)에 보일 문구. */
  text: string;
  /** 이미 로그인한 채로 링크를 연 경우(이메일을 바꾼 회원)에 보일 문구. */
  signedInText: string;
  ok: boolean;
}

const NOTICES: Record<string, EmailVerifyNotice> = {
  ok: {
    text: "이메일 인증이 완료되었습니다. 로그인해주세요.",
    signedInText: "이메일 인증이 완료되었습니다.",
    ok: true,
  },
  already: {
    text: "이미 인증된 이메일입니다. 로그인해주세요.",
    signedInText: "이미 인증된 이메일입니다.",
    ok: true,
  },
  expired: {
    text: "인증 링크의 유효시간이 지났습니다. 아이디와 비밀번호로 로그인을 시도하면 인증 메일을 다시 받을 수 있습니다.",
    signedInText:
      "인증 링크의 유효시간이 지났습니다. 로그아웃한 뒤 로그인을 시도하면 인증 메일을 다시 받을 수 있습니다.",
    ok: false,
  },
  invalid: {
    text: "인증 링크가 올바르지 않거나 이미 사용되었습니다.",
    signedInText: "인증 링크가 올바르지 않거나 이미 사용되었습니다.",
    ok: false,
  },
};

/** ?email_verify= 값의 안내. 모르는 값이면 null — constructor 같은 Object 기본 속성 이름도 거른다. */
export function emailVerifyNoticeFor(status: string | null | undefined): EmailVerifyNotice | null {
  const key = status ?? "";
  return Object.prototype.hasOwnProperty.call(NOTICES, key) ? NOTICES[key] : null;
}
