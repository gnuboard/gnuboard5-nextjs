export interface RegisterFormData {
  mb_id: string;
  mb_password: string;
  mb_password_re: string;
  mb_nick: string;
  mb_name: string;
  mb_email: string;
  mb_hp: string;
  mb_recommend: string;
  captcha_key: string;
  agree_terms: boolean;
  agree_privacy: boolean;
}

export interface FormErrors {
  mb_id?: string;
  mb_password?: string;
  mb_password_re?: string;
  mb_nick?: string;
  mb_name?: string;
  mb_email?: string;
  captcha_key?: string;
  agree_terms?: string;
  agree_privacy?: string;
  general?: string;
}

export type IdCheckStatus = "idle" | "checking" | "available" | "unavailable";

export const initialRegisterFormData: RegisterFormData = {
  mb_id: "",
  mb_password: "",
  mb_password_re: "",
  mb_nick: "",
  mb_name: "",
  mb_email: "",
  mb_hp: "",
  mb_recommend: "",
  captcha_key: "",
  agree_terms: false,
  agree_privacy: false,
};

export function safeRelativePath(value: string | undefined, fallback: string): string {
  if (!value) return fallback;

  try {
    const url = new URL(value, "http://g5.local");
    if (url.origin !== "http://g5.local" || !url.pathname.startsWith("/")) {
      return fallback;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value.startsWith("/") && !value.startsWith("//") ? value : fallback;
  }
}

export function validateRegisterForm({
  formData,
  isSocialSignup,
  certRequired,
  isVerified,
}: {
  formData: RegisterFormData;
  isSocialSignup: boolean;
  certRequired: boolean;
  isVerified: boolean;
}): FormErrors {
  const newErrors: FormErrors = {};

  if (!isSocialSignup && (!formData.mb_id || formData.mb_id.length < 3)) {
    newErrors.mb_id = "아이디는 3자 이상 입력해주세요.";
  }
  if (!isSocialSignup) {
    if (!formData.mb_password || formData.mb_password.length < 8) {
      newErrors.mb_password = "비밀번호는 8자 이상 입력해주세요.";
    } else if (!/[A-Za-z]/.test(formData.mb_password) || !/\d/.test(formData.mb_password)) {
      newErrors.mb_password = "비밀번호에는 영문과 숫자가 모두 포함되어야 합니다.";
    } else if (
      formData.mb_id &&
      formData.mb_password.toLowerCase().includes(formData.mb_id.toLowerCase())
    ) {
      newErrors.mb_password = "비밀번호에는 아이디를 포함할 수 없습니다.";
    }
    if (formData.mb_password !== formData.mb_password_re) {
      newErrors.mb_password_re = "비밀번호가 일치하지 않습니다.";
    }
  }
  if (!formData.mb_nick || formData.mb_nick.length < 2) {
    newErrors.mb_nick = "닉네임은 2자 이상 입력해주세요.";
  }
  if (!formData.mb_name) {
    newErrors.mb_name = "이름을 입력해주세요.";
  }
  if (!formData.mb_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.mb_email)) {
    newErrors.mb_email = "올바른 이메일 주소를 입력해주세요.";
  }
  if (!isSocialSignup && !formData.captcha_key) {
    newErrors.captcha_key = "자동등록방지 문자를 입력해주세요.";
  }
  if (!formData.agree_terms) {
    newErrors.agree_terms = "이용약관에 동의해주세요.";
  }
  if (!formData.agree_privacy) {
    newErrors.agree_privacy = "개인정보처리방침에 동의해주세요.";
  }
  if (certRequired && !isVerified) {
    newErrors.general = "본인확인을 완료해주세요.";
  }

  return newErrors;
}
