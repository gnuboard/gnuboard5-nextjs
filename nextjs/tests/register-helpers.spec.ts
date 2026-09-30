import { expect, test } from "@playwright/test";
import {
  initialRegisterFormData,
  safeRelativePath,
  validateRegisterForm,
} from "../src/app/(auth)/register/registerHelpers";

test.describe("register helpers", () => {
  test("keeps safe app-relative paths", () => {
    expect(safeRelativePath("/register/result?ok=1#done", "/fallback")).toBe(
      "/register/result?ok=1#done"
    );
  });

  test("converts same-origin absolute URLs to relative paths", () => {
    expect(
      safeRelativePath("http://g5.local/shop/register/result?ok=1", "/fallback")
    ).toBe("/shop/register/result?ok=1");
  });

  test("rejects external and protocol-relative redirects", () => {
    expect(safeRelativePath("https://example.com/phish", "/fallback")).toBe("/fallback");
    expect(safeRelativePath("//example.com/phish", "/fallback")).toBe("/fallback");
  });

  test("validates required password signup fields", () => {
    const errors = validateRegisterForm({
      formData: { ...initialRegisterFormData },
      isSocialSignup: false,
      certRequired: true,
      isVerified: false,
    });

    expect(Object.keys(errors).sort()).toEqual(
      [
        "agree_privacy",
        "agree_terms",
        "captcha_key",
        "general",
        "mb_email",
        "mb_id",
        "mb_name",
        "mb_nick",
        "mb_password",
      ].sort()
    );
  });

  test("skips local credential requirements for social signup", () => {
    const errors = validateRegisterForm({
      formData: {
        ...initialRegisterFormData,
        mb_nick: "nickname",
        mb_name: "User",
        mb_email: "user@example.com",
        agree_terms: true,
        agree_privacy: true,
      },
      isSocialSignup: true,
      certRequired: false,
      isVerified: false,
    });

    expect(errors).toEqual({});
  });

  test("validates password confirmation independently", () => {
    const errors = validateRegisterForm({
      formData: {
        ...initialRegisterFormData,
        mb_id: "tester",
        mb_password: "password1",
        mb_password_re: "password2",
        mb_nick: "nickname",
        mb_name: "User",
        mb_email: "user@example.com",
        captcha_key: "abcd",
        agree_terms: true,
        agree_privacy: true,
      },
      isSocialSignup: false,
      certRequired: false,
      isVerified: false,
    });

    expect(Object.keys(errors)).toEqual(["mb_password_re"]);
  });
});
