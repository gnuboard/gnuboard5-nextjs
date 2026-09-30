import { expect, test } from "@playwright/test";
import { koreanApiErrorMessage, koreanApiFieldErrors } from "../src/lib/api-error-messages";
import { isPaymentCancelMessage } from "../src/app/shop/order/orderSubmitFeedback";

test.describe("api error messages in Korean", () => {
  test("translates known API sentences", () => {
    expect(koreanApiErrorMessage("Unauthorized. Please provide a valid access token.", 401)).toBe(
      "로그인이 필요합니다. 로그인 후 다시 시도해 주세요."
    );
    expect(koreanApiErrorMessage("You have already recommended or not recommended this post.", 409)).toBe(
      "이미 추천 또는 비추천한 글입니다."
    );
    expect(koreanApiErrorMessage("Post not found.", 404)).toBe("게시글을 찾을 수 없습니다.");
  });

  test("keeps messages that are already Korean", () => {
    expect(koreanApiErrorMessage("이미 사용 중인 아이디입니다.", 409)).toBe("이미 사용 중인 아이디입니다.");
  });

  test("fills in values from sentences that carry them", () => {
    expect(koreanApiErrorMessage("Minimum purchase quantity for this product is 3.", 422)).toBe(
      "이 상품은 3개 이상 구매해야 합니다."
    );
    expect(koreanApiErrorMessage("wr_subject is required.", 422)).toBe("제목을(를) 입력해 주세요.");
    expect(koreanApiErrorMessage("Requested quantity exceeds available stock (2).", 422)).toBe(
      "재고가 부족합니다. 수량을 줄여 주세요."
    );
  });

  test("never lets an unknown English sentence through", () => {
    expect(koreanApiErrorMessage("Some brand new server message.", 403)).toBe("권한이 없습니다.");
    expect(koreanApiErrorMessage("Handler not implemented yet: x", 501)).toBe(
      "서버에 문제가 생겼습니다. 잠시 후 다시 시도해 주세요."
    );
    expect(koreanApiErrorMessage("", 400)).toBe("요청을 처리하지 못했습니다. 다시 시도해 주세요.");
  });

  test("translates PG payment messages and keeps cancel detection working", () => {
    const cancelled = koreanApiErrorMessage("KCP payment cancelled", 0);
    expect(cancelled).toBe("결제가 취소되었습니다.");
    expect(isPaymentCancelMessage(cancelled)).toBe(true);
    expect(koreanApiErrorMessage("Nicepay payment response timeout", 0)).toContain("결제 응답이 늦어");
    expect(koreanApiErrorMessage("Inicis authentication failed", 0)).toBe("결제 인증에 실패했습니다. 다시 시도해 주세요.");
  });

  test("translates field validation errors", () => {
    expect(koreanApiFieldErrors({ wr_content: "wr_content is required.", mb_email: ["mb_email must be a valid email address."] }, 422)).toEqual({
      wr_content: "내용을(를) 입력해 주세요.",
      mb_email: "이메일 형식이 올바르지 않습니다.",
    });
  });
});
