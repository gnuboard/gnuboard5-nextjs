import { expect, test } from '@playwright/test';
import { documentSiteTexts, themeSiteTextsFrom } from '../src/lib/theme-site-texts';

// 관리자 › 테마 화면 설정의 사이트 문구를 문서 머리(첫 화면 제목 · 설명, 사이트 설명)에 쓰는 규칙(src/lib/theme-site-texts.ts).

const saved = (overrides: Record<string, unknown> = {}) => ({
  theme: 'handbook',
  revision: 2,
  site: { name: ' 우리 매뉴얼 ', description: '사이트 소개', homeTitle: '', homeDescription: '', logoText: '로고' },
  ...overrides,
});

const base = { homeTitle: '매뉴얼', homeDescription: '기본 첫 화면 소개', description: '기본 사이트 소개' };

test.describe('theme site texts for document metadata', () => {
  test('uses only this theme\'s saved, non-empty texts', () => {
    expect(themeSiteTextsFrom(saved(), 'handbook')).toEqual({ name: '우리 매뉴얼', description: '사이트 소개' });
    expect(themeSiteTextsFrom(saved(), 'nextjs_default')).toEqual({});
    expect(themeSiteTextsFrom(saved({ revision: 0 }), 'handbook')).toEqual({});
    expect(themeSiteTextsFrom(saved({ theme: undefined }), 'handbook')).toEqual({});
    expect(themeSiteTextsFrom(undefined, 'handbook')).toEqual({});
    expect(themeSiteTextsFrom(saved({ site: [] }), 'handbook')).toEqual({});
  });

  test('home title and description follow the on-screen home hero rule, then the theme defaults', () => {
    expect(documentSiteTexts(base, {})).toEqual(base);
    expect(documentSiteTexts(base, { name: '우리 매뉴얼', description: '사이트 소개' })).toEqual({
      homeTitle: '우리 매뉴얼',
      homeDescription: '사이트 소개',
      description: '사이트 소개',
    });
    expect(documentSiteTexts(base, { name: '이름', homeTitle: '첫 화면', homeDescription: '첫 소개' })).toEqual({
      homeTitle: '첫 화면',
      homeDescription: '첫 소개',
      description: '기본 사이트 소개',
    });
  });
});
