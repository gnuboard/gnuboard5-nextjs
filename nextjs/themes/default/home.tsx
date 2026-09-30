import type { G5ThemeCommunityHomeData, G5ThemeComponentProps } from "@/lib/theme-types";
import { SoluneHomeClient } from "./home-client";
import { loadSoluneHomeExtras } from "./home-data";

const EMPTY_HOME: G5ThemeCommunityHomeData = {
  boardPosts: [],
  latestPosts: [],
  popularPosts: [],
  bbsRewriteMode: 0,
};

/**
 * 서버(빌드)에서 읽은 값은 첫 화면용 초기값일 뿐이다. 휴대용 정적 빌드는 어느
 * 사이트의 글도 굽지 않으므로, 실제 내용은 클라이언트 본체(home-client.tsx)가
 * 브라우저에서 다시 받아 채운다. 패널 자체는 home-panels.tsx 에 있다.
 */
export async function SoluneHomePage({ config, communityHome }: G5ThemeComponentProps) {
  const extras = await loadSoluneHomeExtras();

  return (
    <SoluneHomeClient
      config={config}
      initialHome={communityHome ?? EMPTY_HOME}
      initialExtras={extras}
    />
  );
}
