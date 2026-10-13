import { expect, test } from '@playwright/test';
import type { WritePost } from '../../../src/lib/types';
import { booksFromBoards, collectAllPages, docsBookFromPosts, docsIndexPath, groupDocsChapters, parseCategoryList, type DocsBook } from '../../../themes/handbook/docs-nav';
import type { Board } from '../../../src/lib/types';
import {
  bookGroupsFromMenu,
  canonicalDocPath,
  chapterNumberLabel,
  bookForPath,
  chapterPositionById,
  chapterPositionByPath,
  chapterForPath,
  isMenuPathActive,
  menuGroupForPath,
  searchChapters,
} from '../../../themes/handbook/book-nav';
import type { SiteMenuItem } from '../../../themes/handbook/main-nav';
import { BOOKS_CACHE_TTL_MS, parseCachedBooks } from '../../../themes/handbook/use-docs-chapters';

// handbook 테마 전용 — 매뉴얼 목차 · 선택기 · 장 위치를 만드는 순수 함수(themes/handbook/book-nav.ts · docs-nav.ts).

function post(wrId: number, subject: string, category: string): WritePost {
  return { wr_id: wrId, wr_subject: subject, ca_name: category } as unknown as WritePost;
}

function book(table: string, label: string, groups: DocsBook['groups']): DocsBook {
  const count = groups.reduce((sum, group) => sum + group.items.length, 0);
  return { table, label, hint: '', groups, count };
}

function menu(label: string, href: string, children: SiteMenuItem[] = []): SiteMenuItem {
  return { label, href, children };
}

const devManual = book('dev_manual', '개발자 안내서', [
  {
    label: '개발 준비',
    items: [
      { id: 1, label: '첫 오리엔테이션', href: '/dev_manual/1' },
      { id: 2, label: '코드 지도', href: '/dev_manual/2' },
    ],
  },
  { label: '화면 만들기', items: [{ id: 5, label: '서버 컴포넌트', href: '/dev_manual/5' }] },
]);

test.describe('handbook book navigation', () => {
  test('orders parts by the board category setting and keeps unknown parts after', () => {
    const posts = [
      post(1, 'API 사용법', 'API'),
      post(2, '설치와 첫 실행', '1부 운영'),
      post(3, '프로젝트 소개', '개요'),
      post(4, '분류 없는 글', ''),
      post(5, '빌드와 배포', '1부 운영'),
    ];

    const groups = groupDocsChapters(posts, 'manual', parseCategoryList('개요|1부 운영|API'));

    expect(groups.map((group) => group.label)).toEqual(['개요', '1부 운영', 'API', '문서']);
    expect(groups[1].items.map((item) => item.id)).toEqual([2, 5]);
  });

  test('puts a chapter marked as a notice back in its board order', () => {
    // 목록 API 는 공지를 첫 쪽 맨 앞에 따로 넣어 보낸다 — 순서 값(wr_num · wr_reply)으로 게시판 순서를 되찾는다.
    const ordered = (wrId: number, wrNum: number, reply = '') =>
      ({ ...post(wrId, `장 ${wrId}`, '부'), wr_num: wrNum, wr_reply: reply }) as unknown as WritePost;
    const asSent = [ordered(3, -1), ordered(1, -3), ordered(2, -2), ordered(4, -2, 'A')];

    const [group] = groupDocsChapters(asSent, 'manual');

    expect(group.items.map((item) => item.id)).toEqual([1, 2, 4, 3]);
  });

  test('keeps first-appearance order when the board has no category setting', () => {
    const groups = groupDocsChapters([post(1, '가', '나중'), post(2, '나', '먼저')], 'manual');
    expect(groups.map((group) => group.label)).toEqual(['나중', '먼저']);
  });

  test('normalizes board paths to the short form', () => {
    expect(canonicalDocPath('/boards/dev_manual/23?page=2#top')).toBe('/dev_manual/23');
    expect(canonicalDocPath('/dev_manual/23/')).toBe('/dev_manual/23');
    expect(canonicalDocPath('https://github.com/gnuboard/gnuboard5-nextjs/issues')).toBe(
      'https://github.com/gnuboard/gnuboard5-nextjs/issues'
    );
  });

  test('groups manuals by the admin menu and leaves unlisted manuals for last', () => {
    const books = [
      book('manual2', '처음 따라하기', []),
      book('manual', '빠른 참조', []),
      devManual,
      book('eas_manual', 'EAS 프로젝트', []),
    ];
    const menuItems = [
      menu('시작하기', '/manual2', [menu('처음 따라하기', '/manual2'), menu('빠른 참조', '/boards/manual')]),
      menu('개발 · 배포', '/dev_manual', [menu('개발자 안내서', '/dev_manual')]),
      menu('커뮤니티', '/notice', [menu('공지사항', '/notice')]),
    ];

    const groups = bookGroupsFromMenu(books, menuItems);

    expect(groups.map((group) => [group.label, group.books.map((item) => item.table)])).toEqual([
      ['시작하기', ['manual2', 'manual']],
      ['개발 · 배포', ['dev_manual']],
      ['다른 매뉴얼', ['eas_manual']],
    ]);
  });

  test('puts every manual in one unnamed group when no menu points to a manual', () => {
    const groups = bookGroupsFromMenu([devManual], [menu('커뮤니티', '/notice')]);
    expect(groups).toEqual([{ label: '', books: [devManual] }]);
  });

  test('finds the chapter position across parts by path and by post id', () => {
    const byPath = chapterPositionByPath(devManual, '/boards/dev_manual/2');
    expect(byPath?.number).toBe(2);
    expect(byPath?.total).toBe(3);
    expect(byPath?.part).toBe('개발 준비');
    expect(byPath?.prev?.id).toBe(1);
    expect(byPath?.next?.id).toBe(5);

    const last = chapterPositionById(devManual, 5);
    expect(last?.part).toBe('화면 만들기');
    expect(last?.next).toBeUndefined();

    expect(chapterPositionByPath(devManual, '')).toBeNull();
    expect(chapterPositionById(devManual, 999)).toBeNull();
    expect(chapterNumberLabel(2)).toBe('02');
  });

  test('searches chapter titles first, then part and manual names, requiring every word', () => {
    const deploy = book('deploy_manual', '카페24에 올리기', [
      { label: '빌드', items: [{ id: 7, label: '올릴 꾸러미로 묶기', href: '/deploy_manual/7' }] },
    ]);
    const books = [devManual, deploy];

    expect(searchChapters(books, '코드').map((hit) => hit.chapter.id)).toEqual([2]);
    // "빌드" 는 deploy 의 부 이름에만 있다 — 제목에서 찾은 것이 없으니 부 이름으로 찾은 장이 나온다.
    expect(searchChapters(books, '빌드').map((hit) => [hit.book.table, hit.number])).toEqual([['deploy_manual', 1]]);
    expect(searchChapters(books, '화면 서버').map((hit) => hit.chapter.id)).toEqual([5]);
    expect(searchChapters(books, '없는 낱말')).toEqual([]);
  });

  test('finds the manual only on manual pages, without falling back to the first one', () => {
    const books = [book('manual2', '처음 따라하기', []), book('manual', '빠른 참조', []), devManual];

    expect(bookForPath(books, '/manual')?.table).toBe('manual');
    expect(bookForPath(books, '/manual2/3')?.table).toBe('manual2');
    expect(bookForPath(books, '/boards/dev_manual/2')?.table).toBe('dev_manual');
    expect(bookForPath(books, '/free')).toBeUndefined();
    expect(bookForPath(books, '/')).toBeUndefined();
  });

  test('picks the admin menu group that holds the current page', () => {
    const menus = [
      menu('시작하기', '/manual2', [menu('처음 따라하기', '/manual2')]),
      menu('커뮤니티', '/notice', [menu('공지사항', '/notice'), menu('자유게시판', '/free')]),
      menu('고객센터', '/faq', [menu('자주 묻는 질문', '/faq'), menu('회사소개', '/content/company')]),
    ];

    expect(menuGroupForPath(menus, '/free')?.label).toBe('커뮤니티');
    expect(menuGroupForPath(menus, '/free/12')?.label).toBe('커뮤니티');
    expect(menuGroupForPath(menus, '/content/company')?.label).toBe('고객센터');
    expect(menuGroupForPath(menus, '/')).toBeUndefined();
    expect(menuGroupForPath(menus, '/search')).toBeUndefined();
    expect(menuGroupForPath(menus, '')).toBeUndefined();

    expect(isMenuPathActive('/free', '/free/12')).toBe(true);
    expect(isMenuPathActive('/free', '/freeboard')).toBe(false);
    expect(isMenuPathActive('/', '/free')).toBe(false);
    expect(isMenuPathActive('https://github.com/gnuboard', '/free')).toBe(false);
  });

  test('puts the current manual first when several manuals share a chapter title', () => {
    const play = book('playstore_manual', '구글 플레이에 올리기', [
      { label: '막혔을 때', items: [{ id: 16, label: '마무리 체크리스트', href: '/playstore_manual/16' }] },
    ]);
    const eas = book('eas_manual', 'EAS 프로젝트', [
      { label: '막혔을 때', items: [{ id: 15, label: '마무리 체크리스트', href: '/eas_manual/15' }] },
    ]);

    expect(searchChapters([play, eas], '마무리', eas).map((hit) => hit.book.table)).toEqual(['eas_manual', 'playstore_manual']);
    expect(searchChapters([play, eas], '마무리').map((hit) => hit.book.table)).toEqual(['playstore_manual', 'eas_manual']);
  });

  test('lists the current manual when the search box is empty', () => {
    const deploy = book('deploy_manual', '카페24에 올리기', [
      { label: '빌드', items: [{ id: 7, label: '올릴 꾸러미로 묶기', href: '/deploy_manual/7' }] },
    ]);
    expect(searchChapters([devManual, deploy], '  ', deploy).map((hit) => hit.chapter.id)).toEqual([7]);
    expect(searchChapters([devManual, deploy], '').map((hit) => hit.chapter.id)).toEqual([1, 2, 5]);
  });
  test('reads every page of a long manual instead of stopping at the first page', async () => {
    const asked: number[] = [];
    const items = await collectAllPages(async (page) => {
      asked.push(page);
      return { items: [page * 10 + 1, page * 10 + 2], lastPage: 3 };
    });
    expect(asked.sort()).toEqual([1, 2, 3]);
    expect(items).toEqual([11, 12, 21, 22, 31, 32]);

    // 쪽 수가 비정상이면 첫 쪽만, 지나치게 크면 상한까지만 읽는다.
    expect(await collectAllPages(async () => ({ items: ['a'], lastPage: Number.NaN }))).toEqual(['a']);
    let calls = 0;
    await collectAllPages(async () => ((calls += 1), { items: [], lastPage: 999 }), 4);
    expect(calls).toBe(4);

    // 2쪽부터는 몇 쪽씩 나눠 부른다 — 한꺼번에 몰아 보내지 않는다.
    let inFlight = 0;
    let peak = 0;
    const many = await collectAllPages(async (page) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return { items: [page], lastPage: 10 };
    });
    expect(many).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(peak).toBeLessThanOrEqual(4);
  });

  test('matches a chapter by its SEO title address as well as its number address', () => {
    const titled = { id: 9, label: '설치와 첫 실행', href: '/manual/9', seoPath: '/boards/manual/설치와-첫-실행/' };
    const encoded = `/manual/${encodeURIComponent('설치와-첫-실행')}`;

    expect(canonicalDocPath(encoded)).toBe('/manual/설치와-첫-실행');
    expect(canonicalDocPath('/manual/%E0%A4%A')).toBe('/manual/%E0%A4%A');
    const manual = book('manual', '빠른 참조', [{ label: '시작', items: [{ id: 8, label: '소개', href: '/manual/8' }, titled] }]);
    expect(chapterForPath(manual, encoded)?.id).toBe(9);
    expect(chapterForPath(manual, '/boards/manual/9')?.id).toBe(9);
    expect(chapterForPath(manual, '/manual/10')).toBeUndefined();
    expect(chapterForPath(manual, '')).toBeUndefined();
    expect(chapterPositionByPath(manual, encoded)?.number).toBe(2);

    // 제목 주소가 다른 장의 번호와 같으면("5") 번호 주소의 장 하나만 고른다.
    const clash = book('manual', '빠른 참조', [
      { label: '시작', items: [{ id: 5, label: '다섯째', href: '/manual/5' }, { id: 6, label: '5', href: '/manual/6', seoPath: '/boards/manual/5/' }] },
    ]);
    expect(chapterForPath(clash, '/manual/5')?.id).toBe(5);
  });

  test('counts a post only once even if two pages both returned it', () => {
    const repeated = [post(1, '가', '부'), post(2, '나', '부'), post(2, '나', '부')];
    const manual = docsBookFromPosts({ table: 'manual', label: '빠른 참조', hint: '' }, repeated);

    expect(manual.groups[0].items.map((item) => item.id)).toEqual([1, 2]);
    expect(manual.count).toBe(2);
  });

  test('reads the saved table of contents only when it is whole, and tells whether it is fresh', () => {
    const now = 1_000_000_000;
    const saved = (savedAt: number, books: unknown) => JSON.stringify({ savedAt, books });

    expect(parseCachedBooks(saved(now - 1000, [devManual]), now)).toEqual({ books: [devManual], fresh: true });
    expect(parseCachedBooks(saved(now - BOOKS_CACHE_TTL_MS, [devManual]), now)?.fresh).toBe(false);
    // 시계가 뒤로 간 저장 시각은 믿지 않는다.
    expect(parseCachedBooks(saved(now + 60_000, [devManual]), now)?.fresh).toBe(false);

    expect(parseCachedBooks(null, now)).toBeNull();
    expect(parseCachedBooks('{not json', now)).toBeNull();
    expect(parseCachedBooks(saved(now, []), now)).toBeNull();
    expect(parseCachedBooks(JSON.stringify({ books: [devManual] }), now)).toBeNull();
    // 장 모양이 깨진 목차(빌드가 바뀐 뒤의 옛 저장값 등)는 쓰지 않는다 — 셸이 그리다 멈춘다.
    const broken = { ...devManual, groups: [{ label: '개발 준비', items: [{ id: '1', label: 1 }] }] };
    expect(parseCachedBooks(saved(now, [broken]), now)).toBeNull();
  });

  test('keeps the post date so the home page can list recently added chapters', () => {
    const dated = { ...post(3, '빌드', '운영'), wr_datetime: '2026-10-09 10:00:00' } as unknown as WritePost;
    const [group] = groupDocsChapters([dated, post(4, '배포', '운영')], 'manual');

    expect(group.items[0].date).toBe('2026-10-09 10:00:00');
    expect(group.items[1].date).toBeUndefined();
  });

  test('keeps the SEO title address of posts that have one', () => {
    const titled = { ...post(3, '빌드', '운영'), wr_seo_title: '빌드' } as unknown as WritePost;
    const [group] = groupDocsChapters([titled, post(4, '배포', '운영')], 'manual');

    expect(group.items[0].seoPath).toBe(`/boards/manual/${encodeURIComponent('빌드')}/`);
    expect(group.items[1].seoPath).toBeUndefined();
  });

  test('returns the whole table of contents when asked without a limit', () => {
    const long = book('long_manual', '긴 매뉴얼', [
      { label: '전부', items: Array.from({ length: 60 }, (_, index) => ({ id: index + 1, label: `장 ${index + 1}`, href: `/long_manual/${index + 1}` })) },
    ]);

    expect(searchChapters([long], '', long)).toHaveLength(40);
    expect(searchChapters([long], '', long, Number.POSITIVE_INFINITY)).toHaveLength(60);
    expect(searchChapters([long], '장', long, 51)).toHaveLength(51);
  });

  test('orders manuals by the board output order, then by title', () => {
    const board = (bo_table: string, bo_subject: string, bo_order: number) =>
      ({ bo_table, bo_subject, bo_order, bo_category_list: '' }) as unknown as Board;
    // 관리자 게시판 목록의 "출력 순서"가 곧 매뉴얼 순서다. 모두 0(기본값)이면 예전처럼 제목 순.
    const ordered = booksFromBoards([board('c', '1권 · 시작', 3), board('a', '2권 · 설치', 1), board('b', '3권 · 운영', 2)]);
    expect(ordered.map((book) => book.table)).toEqual(['a', 'b', 'c']);
    const untouched = booksFromBoards([board('y', '2권 · 설치', 0), board('x', '1권 · 시작', 0), board('z', '부록 · 참조', 0)]);
    expect(untouched.map((book) => book.table)).toEqual(['x', 'y', 'z']);
  });

  test('points "all chapters" at the first manual, or the home page when there is none', () => {
    // 코드에 고정한 매뉴얼 목록이 없다 — 설치본에 매뉴얼이 없으면 엉뚱한 게시판이 아니라 첫 화면으로.
    expect(docsIndexPath([])).toBe('/');
    expect(docsIndexPath([devManual])).toBe('/boards/dev_manual');
  });
});
