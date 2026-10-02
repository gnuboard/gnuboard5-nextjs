import { expect, test } from "@playwright/test";
import {
  LEGACY_NOTIFICATION_PREF_OPTIONS,
  parseNotificationPrefs,
} from "../src/services/notification-prefs";

test.describe("notification preference switches", () => {
  test("draws exactly the switches the server lists", () => {
    const state = parseNotificationPrefs({
      locale: "ko",
      notify_comment: true,
      notify_system: false,
      notify_options: [
        { key: "notify_comment", label: "내 글의 댓글", hint: "댓글" },
        { key: "notify_system", label: "공지", hint: "" },
      ],
    });
    expect(state.options.map((option) => option.key)).toEqual(["notify_comment", "notify_system"]);
    expect(state.values).toEqual({ notify_comment: true, notify_system: false });
  });

  test("a site without the D-day product shows no D-day switch", () => {
    const state = parseNotificationPrefs({
      notify_options: [{ key: "notify_comment", label: "내 글의 댓글", hint: "" }],
    });
    expect(state.options.some((option) => option.key === "notify_dday")).toBe(false);
  });

  test("a missing value reads as on, like the server", () => {
    const state = parseNotificationPrefs({
      notify_options: [{ key: "notify_dday", label: "디데이 알림", hint: "" }],
    });
    expect(state.values.notify_dday).toBe(true);
  });

  test("an older server without notify_options keeps the old six switches", () => {
    const state = parseNotificationPrefs({ notify_comment: "0", notify_dday: 1 });
    expect(state.options).toEqual(LEGACY_NOTIFICATION_PREF_OPTIONS);
    expect(state.values.notify_comment).toBe(false);
    expect(state.values.notify_dday).toBe(true);
  });

  test("a malformed option list falls back instead of drawing junk keys", () => {
    const state = parseNotificationPrefs({ notify_options: [{ key: "bad key", label: "x" }] });
    expect(state.options).toEqual(LEGACY_NOTIFICATION_PREF_OPTIONS);
  });
});
