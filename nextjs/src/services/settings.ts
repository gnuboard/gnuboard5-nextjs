import { apiClient } from "@/lib/api";
import { apiUrl } from "@/lib/config";
import { fetchApiData, validateApiData } from "@/lib/api-response";
import { requestShare } from "@/lib/request-share";
import { publicSettingsSchema, type PublicSettings } from "@/lib/schemas";

export const DEFAULT_PUBLIC_SETTINGS: PublicSettings = {
  cf_bbs_rewrite: 0,
  infinite_scroll: false,
  comment_editor: false,
  pwa_enabled: false,
};

export function getPublicSettings(revalidate = 60): Promise<PublicSettings> {
  return fetchApiData(apiUrl("/settings"), publicSettingsSchema, DEFAULT_PUBLIC_SETTINGS, {
    next: { revalidate },
  });
}

const CLIENT_SETTINGS_TTL_MS = 60_000;

async function fetchClientPublicSettings(): Promise<PublicSettings> {
  const response = await apiClient.get<unknown>("/settings");
  return validateApiData(response.data, publicSettingsSchema, DEFAULT_PUBLIC_SETTINGS);
}

/**
 * 공개 설정. 한 화면의 여러 컴포넌트가 거의 동시에 부르므로(상품 상세 한 번에 3번이었다) 브라우저에서는
 * 같은 요청 하나를 60초 동안 나눠 쓴다. 실패한 요청은 캐시에서 빼서 다음 호출이 다시 받게 한다.
 * 서버(빌드·SSR)에서는 나눠 쓰지 않는다.
 */
export function getClientPublicSettings(): Promise<PublicSettings> {
  return requestShare.get("settings", CLIENT_SETTINGS_TTL_MS, fetchClientPublicSettings);
}
