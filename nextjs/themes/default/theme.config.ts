import type { G5ThemeConfig } from "@/lib/theme-types";

export const themeConfig = {
  apiVersion: 1,
  name: "default",
  label: "Solune",
  features: {
    listUnderPostView: true,
    clientNavigation: true,
  },
  site: {
    name: "그누보드5",
    description:
      "커뮤니티와 쇼핑몰을 한 헤더 아래 두고, 게시판 패널과 사이드바로 정돈해 보여주는 Solune 테마입니다.",
    logoText: "Solune",
    logoMark: "C",
    themeColor: "#3159b7",
    footerDescription: "그누보드5의 커뮤니티 공간입니다.",
    customerCenterTitle: "고객센터",
    customerCenterLines: ["운영시간: 평일 09:00 - 18:00", "이메일: support@example.com"],
    copyrightName: "그누보드5",
  },
} satisfies G5ThemeConfig;
