/**
 * 공개 배포판의 테마 목록 규칙.
 *
 * 원본 저장소(gnuboard5_3)의 nextjs/theme-manifest.json 에서 `publicPackage: true` 인 테마만
 * 공개판에 싣는다(허용 목록). 나머지는 "비공개 테마"로, 소스 · 설치 폴더 · 스크립트 · 문서는 물론
 * 이름조차 공개판에 남지 않는다 — 누출 검사(public-leak-check.mjs)가 그 이름을 찾으면 동기화가 실패한다.
 * 비공개 테마를 공개하려면 원본 매니페스트에서 publicPackage 를 true 로 바꾸고 다시 동기화한다.
 */

function manifestEntries(themeManifest) {
  return Array.isArray(themeManifest?.themes) ? themeManifest.themes : [];
}

export function isPublicThemeEntry(entry) {
  return entry.publicPackage === true;
}

/** 원본 매니페스트를 공개 · 비공개로 나누고, 공개판에 남으면 안 되는 이름 목록을 만든다. */
export function splitThemeManifest(themeManifest) {
  const entries = manifestEntries(themeManifest);
  const publicEntries = entries.filter(isPublicThemeEntry);
  const privateEntries = entries.filter((entry) => !isPublicThemeEntry(entry));
  const publicNames = new Set(publicEntries.flatMap((entry) => [entry.source, entry.theme]));
  const privateTokens = [
    ...new Set(
      privateEntries
        .flatMap((entry) => [entry.source, entry.theme])
        .filter((name) => name && !publicNames.has(name))
    ),
  ];
  return { publicEntries, privateEntries, privateTokens };
}

/** 공개판 매니페스트 — 비공개 항목은 아예 싣지 않는다(Vercel 미리보기로도 이름을 남기지 않는다). */
export function publicThemeManifestFromSource(themeManifest) {
  const { publicEntries } = splitThemeManifest(themeManifest);
  return {
    themes: publicEntries.map((entry) => ({
      source: entry.source,
      theme: entry.theme,
      installable: entry.installable !== false,
      publicPackage: true,
      ...(entry.uiSmoke === undefined ? {} : { uiSmoke: entry.uiSmoke }),
      vercel:
        entry.vercel === false || !entry.vercel
          ? false
          : {
              devPort: entry.vercel.devPort,
              appUrl: entry.vercel.appUrl,
            },
    })),
  };
}

export function publicInstallThemeMap(publicManifest) {
  return Object.fromEntries(
    manifestEntries(publicManifest)
      .filter((entry) => entry.installable)
      .map((entry) => [entry.theme, { source: entry.source }])
  );
}

/** vercel-theme-map.json 과 같은 모양(원본 generate-theme-maps.mjs 결과)으로 공개 항목만. */
export function publicVercelThemeMap(publicManifest) {
  return {
    generatedFrom: 'theme-manifest.json',
    edit: 'Do not edit this generated file directly. Update theme-manifest.json and run npm run generate:theme-maps.',
    themes: manifestEntries(publicManifest)
      .filter((entry) => entry.vercel)
      .map((entry) => ({
        source: entry.source,
        theme: entry.theme,
        devPort: entry.vercel.devPort,
        appUrl: entry.vercel.appUrl,
        uiSmoke: entry.uiSmoke !== false,
      })),
  };
}

/**
 * 설치 zip 에 들어가는 테마 이름들(theme/<이름>) — 매니페스트 순서 그대로. zip 하나에 공개 테마가 모두 들고,
 * 사이트 운영자가 관리자 › 테마설정에서 하나를 고른다. 하나도 없으면 설치판이 아니다.
 */
export function publicInstallThemeNames(themeManifest) {
  const installable = manifestEntries(themeManifest).filter(
    (entry) => entry.publicPackage !== false && entry.installable !== false
  );
  if (installable.length === 0) {
    throw new Error('public package must install at least one theme; found none');
  }
  return installable.map((entry) => entry.theme);
}

/**
 * 기본 테마 — 설치 안내가 먼저 권하는 테마이자, 한 테마의 파일을 예로 보는 개발 검사(파일 크기 · 브리지 경로)가
 * 쓰는 테마. 매니페스트의 첫 공개 테마다.
 */
export function publicPrimaryThemeName(themeManifest) {
  return publicInstallThemeNames(themeManifest)[0];
}

export function assertPublicPackageThemeMaps(themeManifest, themeMap) {
  const themeNames = publicInstallThemeNames(themeManifest);
  for (const themeName of themeNames) {
    const entry = manifestEntries(themeManifest).find((item) => item.theme === themeName);
    if (themeMap.themes?.[themeName]?.source !== entry.source) {
      throw new Error(`nextjs/theme-map.json must package ${themeName} from the ${entry.source} theme source`);
    }
  }
  const extra = Object.keys(themeMap.themes || {}).filter((name) => !themeNames.includes(name));
  if (extra.length > 0) {
    throw new Error(
      `nextjs/theme-map.json must not claim installable themes that are not in the public package: ${extra.join(', ')}`
    );
  }
}
