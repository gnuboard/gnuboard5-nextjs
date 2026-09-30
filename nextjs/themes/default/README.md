# Solune 테마 원본

그누보드 PHP 테마 Solune 을 Next.js 로 옮긴 디자인 원본.
`nextjs/themes/default` (디자인 원본) → `theme/nextjs_default` (그누보드가 읽는 테마 + `theme/nextjs_default/app` 정적 산출물).

설치·색 바꾸기·포장 순서는 핸드북 17장("solune 테마를 설치하고, 내 색과 내 모양으로 바꾸는 법")에
초보자용으로 풀어 두었다. 이 파일은 파일마다 무엇이 들었는지와 설계 결정을 적는 자리다.

## 파일 — 커뮤니티 쪽

| 파일 | 내용 |
|------|------|
| `theme.config.ts` | 이름·로고 글자·사이트 설명·고객센터 줄·`features` 스위치 |
| `theme.css` | 진입점. 아래 층들을 순서대로 `@import` 하고, 끝에 움직임 줄이기(`prefers-reduced-motion`) 한 블록 |
| `theme.tokens.css` | 팔레트: `--solune-*` 원값 + shadcn HSL + daisyUI `--color-*`. 밝은 값과 `[data-solune-theme="dark"]` 어두운 값 |
| `theme.shell.css` | 서비스 전환 띠, 고정 헤더, 메가 메뉴, 드로어, 푸터 |
| `theme.home.css` | 커뮤니티 홈 레일: 게시판 패널, 최신글 목록, 사이드바 |
| `theme.widgets.css` | 최근 댓글, 인기검색어, 접속자집계, 설문, 로그인 카드, FAQ, 갤러리 |
| `theme.internal.css` | 안쪽 페이지(게시판 목록·글보기)의 앱 마크업에 입히는 옷 + `BoardListRow` 슬롯 모양 |
| `theme.internal.pages.css` | 안쪽 페이지 둘째 장 — 게시판 목록 틀·글쓰기·로그인/회원가입·마이페이지·FAQ·통합 검색·주문 카드 |
| `layout-shell.tsx` | 커뮤니티 껍데기(`LayoutShell` 슬롯; `/shop` 에서는 비켜선다) |
| `rail.tsx` | 안쪽 페이지 오른쪽 레일 |
| `home.tsx` · `home-client.tsx` · `home-panels.tsx` | 커뮤니티 홈(`HomePage` / `CommunityPage` 슬롯) |
| `home-loading.tsx` · `home-skeletons.tsx` | 홈 로딩 대체 화면(`HomePageLoading` 슬롯)과 공용 스켈레톤 |
| `home-data.ts` | 테마 슬롯 데이터에 없는 위젯을 서버에서 읽는 로더 |
| `home-widgets.tsx` | 댓글 · 인기검색어 · 접속자 · FAQ · 갤러리 위젯 |
| `poll-widget.tsx` | 투표 되는 사이드바 설문(`/v1/polls`) |
| `login-card.tsx` | 사이드바 로그인 폼 ↔ 회원 카드 |
| `notify-link.tsx` | 헤더의 알림 링크(읽지 않은 수 폴링) |
| `theme-swap.tsx` | 밝게/어둡게 전환(`data-solune-theme`) |
| `board-view-header.tsx` | 글보기 머리(`BoardViewHeader` 슬롯) |
| `board-list-row.tsx` | 게시판 목록의 글 한 줄(`BoardListRow` 슬롯) |
| `components.tsx` | 슬롯 등록 |

## 파일 — 상점 쪽

`theme.shop.css` 는 색인이고, 상점은 우선순위 순서대로 일곱 파일에 나뉘어 있다:

| 파일 | 내용 |
|------|------|
| `theme.shop.tokens.css` | 상점 팔레트(밝은 값 + 어두운 값) |
| `theme.shop.shell.css` | 레일, 고정·축소 헤더, 본문 뼈대 |
| `theme.shop.home.css` | 배너, 분류 타일, 상품 구역 머리·카드, 후기 카드, 공지·고객센터 |
| `theme.shop.carousel.css` | 상점 홈 Swiper 줄(분류 칩 · 진열 · 후기)의 단추 · 진행 막대 · 쪽 점 · 걸친 칸 |
| `theme.shop.footer.css` | 푸터와 껍데기·홈의 반응형 규칙 |
| `theme.shop.list.css` | 상품 목록(`ShopListHeader` 슬롯 + 격자·줄 모양) |
| `theme.shop.detail.css` | 상품 상세(`product-*` 손잡이 + `ProductDetailTabs` 슬롯) |
| `theme.shop.cart.css` | 장바구니(`cart-*` 손잡이) |
| `shop-shell.tsx` | 상점 껍데기(`ShopLayoutShell` 슬롯): 서비스 전환, 분류 패널·유형 메뉴·검색 독이 붙은 고정 헤더, 푸터 |
| `shop-home.tsx` · `shop-home-client.tsx` · `shop-home-sections.ts` | 상점 홈(`ShopHomePage` 슬롯): 배너, 분류 줄, 상품 줄 다섯, 후기, 공지 + 고객센터 |
| `shop-home-loading.tsx` · `shop-home-skeletons.tsx` | 상점 홈 로딩 대체 화면과 스켈레톤 |
| `shop-banner.tsx` | Swiper 배너 — fade · 6.5초 자동 넘김(움직임 줄이기 설정이면 멈춤) |
| `shop-row.tsx` · `shop-home-swipers.tsx` · `shop-swiper.tsx` | Swiper 상품 줄 · 분류 칩 줄 · 후기 줄과 공통 도우미 — 레퍼런스와 같은 설정 |
| `product-card.tsx` | 온담 상품 카드(`ProductCard` 슬롯) — 상점 홈 줄과 앱의 목록 페이지가 같이 쓴다 |
| `shop-list-header.tsx` | 상품 목록 머리(`ShopListHeader` 슬롯) |
| `product-detail-tabs.tsx` | 상품 상세 탭 띠 + 따라다니는 구매 상자(`ProductDetailTabs` 슬롯) |

## 중단점

양쪽 다 Tailwind 것만 쓴다 — **639 / 767 / 1023 / 1279**(max) 와 **640 / 768 / 1024 / 1280**(min).
예전엔 780·860·900·1080·1199·30rem·47.99rem 이 섞여 있어 한 화면의 조각들이 서로 다른 폭에서 접혔다.
분류 타일은 10 → 8 → 6 → 5 → 3.4 장, 상품 줄은 5 → 4 → 3 → 2 장, 상세의 구매 상자는 1024 이상에서만.

## 팔레트

레퍼런스는 `css/default.css`(초록)를 읽은 뒤 `css/community.css` 의 `html[data-theme="light"]` 블록이
**파랑**으로 덮어쓴다. 화면에 실제로 보이는 것이 파랑이므로 `theme.tokens.css` 도 그 값을 갖는다:

- 바탕 `#f5f7fa`, 표면 `#ffffff`, 글자 `#101828`, 테두리 `#d9e0ea`
- 주색 `#3159b7` (hover `#254a9f`, 옅은 `#edf4ff`)
- 옅은 글자 `--solune-muted #626b7f` — 흰 바탕 5.35:1, 옅은 바탕(`#eef2f6`) 4.75:1
- Pretendard Variable, 본문 자간 `-0.01em`, 제목 `-0.025em`
- 레일 `min(100%, 80rem)`, 본문 격자 `1fr / 18rem`, 패널 모서리 `0.75rem`

**대비 규칙**: 글자는 바탕과 4.5:1 이상. 테마는 axe(WCAG 2.1 AA) 를 밝은·어두운 모드, 폰·데스크톱
폭에서 위반 0 으로 통과한 상태로 나간다. 옅은 회색을 더 옅게 바꾸면 바로 깨지니 색을 만질 땐
개발자도구의 대비 숫자를 같이 본다.

## 상점 팔레트("온담")

레퍼런스 상점은 커뮤니티 파랑을 쓰지 않는다. `css/shop-ondam.css` 가 `.solune-shop-page` 안에서
전부 다시 정한다: 바탕 `#ffffff`, 옅은 표면 `#f2f2f0`, 글자 `#1b1a17`, 주색 숲 초록 `#2f5347`,
세일 테라코타 `#b6543a`, 별 `#c9a227`, 그리고 **모서리 전부 0**(칩과 둥근 아이콘 단추만 예외).
`theme.shop.tokens.css` 가 같은 블록을 같은 범위에 두므로 `/shop` 만 팔레트가 바뀌고 커뮤니티는
제 것을 지킨다 — 레퍼런스가 나눈 그대로. 옅은 글자는 `#6f6f69` / `#75756f`(5.1 / 4.6:1);
원래 값 `#8a8a85` / `#a5a5a1` 은 3.5 / 2.5:1 이라 올렸다. 별점은 ★ 글자만 금색(`::first-letter`)이고
숫자는 글자색으로 읽힌다.

상점 헤더는 `position: fixed` 에 자리 채움 요소를 두고 70px 넘게 구르면 줄어든다(레퍼런스 `theme.js`);
커뮤니티 헤더는 sticky. 배너·분류 줄·상품 줄·후기 줄은 레퍼런스와 같은 Swiper 11 을 같은 설정
(slidesPerView · 중단점 · loop · 진행 막대)으로 쓴다. Swiper 기본 CSS 는 `theme.shop.css` 가 싣는다.

## 어두운 모드

`src/app/layout.tsx` 가 next-themes 를 `forcedTheme="light"` 로 고정하므로 `.dark` 클래스는 절대
안 생긴다. 그래서 헤더 전환은 루트에 `data-solune-theme` 를 붙이고(레퍼런스와 같은 `solune-theme`
localStorage 키; 저장값이 없으면 `prefers-color-scheme`), `theme.tokens.css` 의 어두운 블록은
`:root.dark` 와 `:root[data-solune-theme="dark"]` **둘 다**에 걸린다. shadcn·daisyUI 가 읽는 변수를
덮어쓰므로 클래스 없이도 컴포넌트가 따라온다.

앱의 공용 컨트롤(`input`/`textarea`/`select`/드롭다운, outline 배지, 로그인 상자, 폼 제목)은 밝은 값을
유틸리티로 못박아 둔다(`bg-white`, `text-[#333]`, `text-[#202124]`). 앱은 스스로 다크를 열지 않으니
거기선 문제가 없지만 이 테마의 다크에서는 흰 칸에 흰 글자가 된다 — `theme.tokens.css` 끝의 다크
블록이 앱 컴포넌트를 건드리지 않고 되돌린다.

## daisyUI / shadcn 변수 충돌

다른 테마 소스와 같이 `<body>` 에서 `--color-secondary`, `--color-accent`, `--border` 를 덮어쓰지 않는다:
`globals.css` 가 앞 둘을 shadcn 의 `bg-secondary` / `hover:bg-accent` 에 매핑하고, shadcn 은 `--border`
를 HSL 세 값으로 읽는데 daisyUI 는 테두리 *굵기*로 쓴다. daisyUI 의 `1px` 은 `theme.tokens.css` 끝에서
daisyUI 컴포넌트에만 준다.

## 위젯 데이터

테마 슬롯 데이터에는 게시판 미리보기·최신글·인기글만 오므로 나머지 위젯은 API 를 직접 읽는다:

| 위젯 | 출처 |
|------|------|
| 최근 댓글 | `getRecentItems({ view: "c" })` |
| 자주 묻는 질문 | `getFaqs()` |
| 설문조사 | `getCurrentPoll()` + `votePoll()` |
| 갤러리 | `GALLERY_BOARDS`(기본 `gallery`) → `getBoardPosts()` |
| 인기검색어 | `getPopularKeywords()` → **`GET /v1/search/popular`** |
| 접속자집계 | `getPublicSettings().visit` → **`GET /v1/settings` 의 `cf_visit`** |

굵은 둘은 이 테마를 위해 더한 읽기 전용 엔드포인트다: `api/v1/search.php` 의 `popular?limit&days`
(`lib/popular.lib.php` 의 `popular()` 와 같은 집계), `api/v1/settings.php` 의 `cf_visit`
("오늘:…,어제:…,최대:…,전체:…") → `visit: { today, yesterday, max, total }`.

## 안쪽 페이지 — 세 단계

테마가 화면에 손대는 방법은 무게 순으로 셋이다.

1. **CSS 손잡이.** 앱 마크업에 붙은 이름(`.page-hero`, `.surface-panel`, `.filter-chip`, `.board-*`,
   `.product-*`, `.cart-*`)에 `theme.internal.css` 와 `theme.shop.*.css` 가 옷만 입힌다.
   `layout-shell.tsx` 는 그 옆에 레퍼런스의 오른쪽 레일을 세운다(홈·`/shop`·`/mypage`·인증 화면은
   제 배치가 있어 뺀다 — `RAIL_EXCLUDED_PREFIXES`).
2. **프레젠테이션 슬롯.** CSS 로 못 닿는 곳은 앱이 슬롯을 연다. 앱이 데이터와 동작(링크·클릭·키보드·aria)을
   넘기고 테마는 그리기만 한다. 클라이언트 컴포넌트라 React 컨텍스트(`ThemeSlotsProvider` / `useThemeSlot`,
   `src/components/providers`)로 오간다 — 서버 쪽 `themeComponents` 맵은 비동기 서버 컴포넌트를 담고
   있어 클라이언트에 넘길 수 없다. 슬롯을 안 낸 테마는 앱 기본 마크업을 받는다.
3. **테마 페이지.** 홈과 상점 홈처럼 통째로 테마가 그리는 화면.

### 채운 슬롯

| 슬롯 | props | 어디에 |
|------|-------|--------|
| `ProductCard` | `product`, `href`, `priority?` | `ProductGridSection` → 상품 목록·검색·분류 페이지 전부 |
| `BoardViewHeader` | `post`, `boTable`, `boardName`, `listHref?`, `author`, `actions`, `share` | 글보기의 카드 머리 자리 |
| `ShopListHeader` | `title`, `category?`, `subcategories`, `subcategoryHref`, `total`, `sort`, `onSortChange`, `filters?`, `toolbar?`, `view?`, `onViewChange?` | 분류 목록과 전체 상품/검색 목록의 머리 + 도구줄 자리 |
| `ProductDetailTabs` | `tabs`(id, label, count?, selected, `buttonProps`), `panel`, `purchaseControls?` | 상품 상세의 탭 띠 + 본문 자리 |
| `BoardListRow` | `post`, `href`, `number?`, `isNotice`, `isNew`, `isHot`, `isVisited`, `isCurrent`, `replyDepth`, `categoryHref?`, `author`, `leading?`, `rowProps?` | 게시판 목록의 모든 줄(무한 목록·일괄선택 목록 둘 다) |

- `product-card.tsx` — 레퍼런스 `sct_li`: 정사각 사진, NEW / SOLD OUT, 브랜드, 이름, 할인율 · 판매가 · 정가,
  ★ 평점 · 리뷰 N · 담기. 목록 API 가 `it_brand`·`ca_name`·`review_count`·`review_avg` 를 내주므로 목록에서도
  상세와 같은 값이 나온다.
- `board-view-header.tsx` — 레퍼런스 `#bo_v` 머리: 분류 칩과 `게시판 · #번호` 키커, 큰 제목, 이니셜 아바타 ·
  이름 · 시각 · 조회/댓글 수, 앱이 넘긴 공유·글 동작 노드.
- `shop-list-header.tsx` — 레퍼런스 `list.php` 머리: `Solune store` 눈썹 아래 `<분류> 상품리스트`,
  `#sct_ct_1` 하위 분류 상자(직계만, 건수는 `/v1/shop/categories/:id` 의 `item_count`), `#ssch_sort`
  글자 정렬 줄(API 의 정렬 별칭 그대로). 앱의 추가 필터·도구는 노드로 받아 제목 아래·정렬 옆에 둔다.
- `product-detail-tabs.tsx` — 레퍼런스 `#sit_info`: 왼쪽 정렬 탭 띠(건수는 옅은 span) 아래 720px 로 좁힌
  본문, 오른쪽 320px 에 따라다니는 구매 상자(`#sit_buy`). 상자 알맹이는 앱의 `ProductPurchaseControls` 를
  한 번 더 그린 것 — 상태는 `ProductDetailClient` 에 하나라 두 상자가 같이 움직인다. 탭 단추는 앱의
  `buttonProps`(role · aria-selected · roving tabindex · 화살표 키)를 그대로 받으므로 접근성을 다시 짜지
  않는다. 상자는 1024 이상에서만.
- `board-list-row.tsx` — 레퍼런스 `list.skin` 의 `.cb-row` 를 `<tr>` 로: 10.5px 번호 레일, 14.4px/600 제목,
  댓글 수 파란 알약, NEW / HOT 표식(앱이 `bo_new` / `bo_hot` 로 판정), 제목 아래 분류 칩, 24px 아바타(사진
  또는 이니셜) + 앱의 회원 사이드뷰, 눈 아이콘 + 조회, 날짜. 읽은 글은 옅게, 지금 보는 글은 "열람중".
  768 미만에서는 표를 블록으로 풀고 줄을 격자로 바꿔 글쓴이 · 조회 · 날짜를 제목 아래로 접는다.
  함정 하나: hover 색줄은 `<tr>` 이 아니라 첫 `<td>` 에 건다 — 표 줄의 `::before` 는 칸 하나로 세어져
  열이 밀린다.

### features

`theme.config.ts` 의 `features.listUnderPostView: true` — 글보기 아래에 그 게시판 목록(분류 칩 · 줄 · 쪽 ·
검색)을 그누보드 `view.php` 처럼 붙인다. 기능은 앱 것(`BoardPostListClient` 의 `embedded` 모드)이고
테마는 스위치만 켠다.

아직 슬롯이 아닌 것: 상품 상세의 메타 `dl`. 앱의 `product-shipping` + `product-meta` + `product-stock`
블록을 CSS 로 재배치해 레퍼런스의 적립금 · 배송비 · 제조사 · 원산지 · 모델 목록에 가깝게 맞췄고,
그 정도면 마크업을 더 뚫을 값어치가 없었다.

## 문자열과 언어

테마 tsx 에 한국어 문자열이 100개 남짓 그대로 들어 있다(헤더·상점 껍데기·목록 머리·상점 홈 순으로 많다).
앱의 `src/lib/i18n` 은 아직 아무 컴포넌트도 안 쓰는 예비 저장소라, 테마만 먼저 뽑아 두는 것은 헛일이다 —
앱이 next-intl 을 들일 때 같이 옮긴다. 그때까지 이 테마는 한국어 전용이다.

## Lighthouse

정적 배포본을 모바일로 잰 값: 홈 접근성 100 · SEO 100, 상품 상세 접근성 100. 남는 실패는
로컬 http 라서 생기는 `is-on-https`/`redirects-http`, Lighthouse 가 끼워 넣는 스크립트가 CSP 에 걸리는
`inspector-issues`, `llms.txt` 없음, 그리고 상세의 CLS(셸 → 스켈레톤 → 본문 교체는 정적 배포의 구조).
셸 HTML 은 `noindex` 로 굽히지만, 브리지가 실제 글·상품을 찾아 제목·설명을 채울 때 `index, follow` 로
바꿔 준다(`bridge/metadata.php`) — 없는 id 와 비공개 경로는 그대로 `noindex`.

## 명령

```bash
npm run dev:nextjs_default        # http://127.0.0.1:3001
npm run typecheck:nextjs_default
npm run build:nextjs_default      # 빌드 후 theme/nextjs_default/app 동기화
npm run package:nextjs_default    # 설치 zip
```

(개발 저장소 전용) `compare:solune` 은 레퍼런스 사이트(`--ref`)와 로컬 개발 서버(`--local`)를 1440·375px 에서 홈·게시판 목록·글보기·상점 홈·상품 목록·상품 상세·장바구니로
찍어 `index.html` 에 나란히 놓는다. `--only shop,home`, `--width 1440`, `--ref-ids post=…,item=…`,
`--local-ids …` 로 좁힌다. 일부러 픽셀 비교가 아니다 — 두 사이트의 데이터가 다르다 — 그래도 같은 화면을
나란히 두면 남은 차이가 한눈에 보인다.

테스트는 `vercel-theme-map.json` 에서 프로젝트를 만든다(`playwright.config.ts`). `check:ui` /
`check:a11y` 가 이 테마의 개발 서버에도 돌며, 정적 배포본은 `PLAYWRIGHT_BASE_URL=<그누보드 주소>`
로 직접 겨냥할 수 있다.

주의: Turbopack 개발 서버는 `theme.css` 가 `@import` 하는 파일의 변경을 놓칠 때가 있고, CSS 문법 오류를
한 번 내면 고친 뒤에도 옛 오류를 붙들기도 한다. `G5_NEXT_DIST_DIR=.next-dev-default2` 처럼 새 폴더로
다시 띄우거나 `npm run build:nextjs_default` 로 확인한다.
