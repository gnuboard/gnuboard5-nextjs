import { expect, test } from '@playwright/test';
import type { Board } from '../../../src/lib/types';
import type { G5ThemeConfig } from '../../../src/lib/theme-types';
import { booksFromBoards, DOCS_GROUP, docsSourceFrom } from '../../../themes/handbook/docs-nav';
import {
  handbookHomeTexts,
  hintForTable,
  sidebarState,
  parseHandbookThemeSettings,
  sidebarScreen,
  withSiteTexts,
  type HandbookThemeSettings,
} from '../../../themes/handbook/theme-settings';
import { booksCacheKey } from '../../../themes/handbook/use-docs-chapters';

// handbook 테마 — 관리자 › 테마 화면 설정(plugin/webapp/theme-settings)을 화면에 쓰는 순수 함수.

/** /v1/settings 의 theme_settings 와 같은 모양(PHP webapp_theme_settings_public). */
function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    theme: 'handbook',
    revision: 3,
    docs: { group: 'manual', hints: { start: '1권', guide: '' } },
    sidebar: { home: 'hidden', docs: 'auto', board: 'hidden', other: 'auto' },
    site: {
      name: '  우리 매뉴얼 ',
      logoText: '',
      description: '소개',
      homeTitle: '',
      homeDescription: '',
      footerDescription: '',
      customerCenterTitle: '',
      customerCenterLines: [' 전화 1 ', '', '메일 2'],
      copyrightName: '',
    },
    ...overrides,
  };
}

function parsed(overrides: Record<string, unknown> = {}): HandbookThemeSettings {
  const value = parseHandbookThemeSettings(payload(overrides));
  if (!value) throw new Error('expected settings');
  return value;
}

const config = {
  apiVersion: 1,
  name: 'handbook',
  label: 'Handbook',
  site: {
    name: '매뉴얼',
    description: '기본 소개',
    logoText: '매뉴얼',
    logoMark: 'G',
    homeTitle: '매뉴얼',
    homeDescription: '기본 첫 화면 소개',
    footerDescription: '기본 바닥글',
    customerCenterTitle: '도움',
    customerCenterLines: ['기본 줄'],
    copyrightName: '그누보드5',
  },
} as G5ThemeConfig;

test.describe('handbook theme settings', () => {
  test('ignores settings that were never saved, are malformed, or belong to another theme', () => {
    expect(parseHandbookThemeSettings(undefined)).toBeNull();
    expect(parseHandbookThemeSettings([])).toBeNull();
    expect(parseHandbookThemeSettings(payload({ revision: 0 }))).toBeNull();
    expect(parseHandbookThemeSettings(payload({ revision: 'x' }))).toBeNull();
    // /v1/settings 는 지금 적용한 테마의 값이다 — 서버 실행 화면이 다른 테마의 설정을 쓰지 않는다.
    expect(parseHandbookThemeSettings(payload({ theme: 'nextjs_default' }))).toBeNull();
    // 브리지가 싣는 값(런타임 설정)에 theme 이 없어도 받는다.
    expect(parseHandbookThemeSettings(payload({ theme: undefined }))?.revision).toBe(3);
  });

  test('keeps only clean values: group, hints, sidebar modes and non-empty site texts', () => {
    const settings = parsed({
      docs: { group: 'bad group!', hints: { start: ' 1권 ', 'no-dash': 'x', guide: '', constructor: '생성' } },
      sidebar: { home: 'hidden', docs: 'weird' },
    });
    expect(settings.docs.group).toBe('');
    expect(settings.docs.hints).toEqual({ start: '1권', constructor: '생성' });
    expect(settings.sidebar).toEqual({ home: 'hidden', docs: 'auto', board: 'auto', other: 'auto' });
    expect(parsed().site).toEqual({ name: '우리 매뉴얼', description: '소개', customerCenterLines: ['전화 1', '메일 2'] });
    // PHP 는 빈 안내 문구 맵을 [] 로 보내기도 한다.
    expect(parsed({ docs: { group: 'manual', hints: [] } }).docs.hints).toEqual({});
    const lines = parsed({ site: { customerCenterLines: ['1', '2', '3', '4', '5', '6'] } }).site.customerCenterLines;
    expect(lines).toEqual(['1', '2', '3', '4', '5']);
    // 글자(코드 포인트) 단위로 자른다 — PHP mb_substr 와 같다(정적 빌드에서 브리지가 HTML 에 미리 넣는 글자와 맞게).
    const long = parsed({ site: { name: '😀'.repeat(310) } }).site.name ?? '';
    expect(Array.from(long)).toHaveLength(300);
  });

  test('reads a hint only from the map itself, not from Object.prototype', () => {
    expect(hintForTable({}, 'constructor')).toBe('');
    expect(hintForTable({}, 'toString')).toBe('');
    expect(hintForTable({ start: '1권' }, 'start')).toBe('1권');
  });

  test('uses the saved group and hints, or the environment group when nothing was saved', () => {
    expect(docsSourceFrom(null)).toEqual({ group: DOCS_GROUP, hints: {}, revision: 0 });
    const settings = parsed();
    expect(docsSourceFrom(settings)).toEqual({ group: 'manual', hints: { start: '1권' }, revision: 3 });
    // 그룹을 고르지 않고 저장했으면(사이드바 · 문구만 고친 저장) 빌드 때 정한 그룹을 그대로 쓴다 — 매뉴얼이 사라지지 않게.
    expect(docsSourceFrom(parsed({ docs: { group: '' } })).group).toBe(DOCS_GROUP);
  });

  test('a saved hint makes the whole board title the manual name', () => {
    const board = (bo_table: string, bo_subject: string, bo_order: number) =>
      ({ bo_table, bo_subject, bo_order, bo_category_list: '' }) as unknown as Board;
    const books = booksFromBoards([board('start', '처음 따라하기', 1), board('guide', '2권 · 운영', 2)], { start: '1권' });
    expect(books.map(({ table, label, hint }) => ({ table, label, hint }))).toEqual([
      { table: 'start', label: '처음 따라하기', hint: '1권' },
      { table: 'guide', label: '운영', hint: '2권' },
    ]);
  });

  test('the books cache key changes when the settings are saved again', () => {
    const before = booksCacheKey(docsSourceFrom(parsed()));
    const after = booksCacheKey(docsSourceFrom(parsed({ revision: 4 })));
    expect(before).not.toBe(after);
    expect(before).toContain(':manual:3');
  });

  test('overlays only the site texts the admin filled in', () => {
    expect(withSiteTexts(config, null)).toBe(config);
    const site = withSiteTexts(config, parsed()).site;
    expect(site.name).toBe('우리 매뉴얼');
    expect(site.logoText).toBe('매뉴얼');
    expect(site.footerDescription).toBe('기본 바닥글');
    expect(site.customerCenterLines).toEqual(['전화 1', '메일 2']);
    expect(config.site.name).toBe('매뉴얼');
  });

  test('home texts prefer the home title, then the site name', () => {
    expect(handbookHomeTexts(config, null)).toBeNull();
    expect(handbookHomeTexts(config, parsed())).toEqual({ title: '우리 매뉴얼', description: '소개' });
    const withHome = parsed({ site: { name: '이름', homeTitle: '첫 화면', homeDescription: '첫 소개' } });
    expect(handbookHomeTexts(config, withHome)).toEqual({ title: '첫 화면', description: '첫 소개' });
  });

  test('sorts screens into home, manual, board and other', () => {
    const none = { inBook: false };
    expect(sidebarScreen('/', none)).toBe('home');
    expect(sidebarScreen('/?x=1', none)).toBe('home');
    expect(sidebarScreen('/community', none)).toBe('home');
    expect(sidebarScreen('/start/3', { inBook: true })).toBe('docs');
    expect(sidebarScreen('/free/3', none)).toBe('board');
    expect(sidebarScreen('/boards/free', none)).toBe('board');
    // 주소로만 정한다 — 관리자 메뉴 묶음에 든 쇼핑몰 · FAQ 도 "그 밖"이다.
    expect(sidebarScreen('/faq', none)).toBe('other');
    expect(sidebarScreen('/shop', none)).toBe('other');
    expect(sidebarScreen('/shop/products/1', none)).toBe('other');
    expect(sidebarScreen('/mypage', none)).toBe('other');
  });

  test('decides the sidebar only when the screen is known', () => {
    const settings = parsed();
    const state = { path: '/', pathReady: true, booksSettled: true, inBook: false };
    // 설정이 없으면 늘 보인다(브리지도 <html> 에 표시하지 않는다).
    expect(sidebarState(null, state)).toBe('shown');
    expect(sidebarState(settings, state)).toBe('hidden');
    // 정적 빌드의 하이드레이션 동안은 정하지 않는다 — 정적 HTML 과 같은 속성으로 붙고 브리지가 정한 값이 쓰인다.
    expect(sidebarState(settings, { ...state, pathReady: false })).toBe('unknown');
    // 정적 빌드 HTML(설정 없음)도 주소를 모르면 unknown — 하이드레이션 때와 같은 속성.
    expect(sidebarState(null, { ...state, pathReady: false })).toBe('unknown');
    // 목차를 다 받기 전에는 게시판 주소가 매뉴얼인지 모른다 — 두 화면의 설정이 다르면 기다린다.
    expect(sidebarState(settings, { ...state, path: '/free/1', booksSettled: false })).toBe('unknown');
    expect(sidebarState(settings, { ...state, path: '/free/1' })).toBe('hidden');
    expect(sidebarState(settings, { ...state, path: '/start/1', inBook: true })).toBe('shown');
    expect(sidebarState(settings, { ...state, path: '/mypage' })).toBe('shown');
  });
});
