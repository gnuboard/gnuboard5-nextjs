import type { G5ThemeConfig } from "@/lib/theme-types";

export const themeConfig = {
  apiVersion: 1,
  name: "handbook",
  label: "Handbook",
  // 설치마다 바꿀 기본 문구 — 특정 사이트의 이름이나 연락처를 두지 않는다(관리자 설정이 생기면 거기서 덮는다).
  site: {
    name: "매뉴얼",
    description: "필요한 매뉴얼을 고르고, 장을 차례로 따라 읽어 보세요.",
    logoText: "매뉴얼",
    logoMark: "G",
    themeColor: "#4f46e5",
    homeTitle: "매뉴얼",
    homeDescription: "게시판에 쓴 글이 장이 되고, 게시판 분류가 부가 되는 매뉴얼 사이트입니다.",
    footerDescription: "그누보드 게시판으로 만든 매뉴얼입니다.",
    customerCenterTitle: "도움이 필요할 때",
    customerCenterLines: ["운영시간: 평일 09:00 - 18:00", "이메일: support@example.com"],
    copyrightName: "그누보드5",
  },
} satisfies G5ThemeConfig;
