import type { ButtonHTMLAttributes, ComponentType, HTMLAttributes, ReactNode } from "react";
import type { MenuItem } from "@/components/layout/menu";
import type { ShopCategory, ShopProduct, ShopReview } from "@/lib/api";
import type { Board, WritePost } from "@/lib/types";

export const G5_THEME_API_VERSION = 1;

export type G5ThemeApiVersion = typeof G5_THEME_API_VERSION;

export type G5ThemeConfig = {
  apiVersion: G5ThemeApiVersion;
  name: string;
  label: string;
  routes?: {
    communityHome: string;
    shopHome: string;
    communityAliases?: string[];
    shopAliases?: string[];
  };
  designSource?: {
    sourceRootEnv?: string;
    community: {
      route: string;
      sourcePath: string;
    };
    shop: {
      route: string;
      sourcePath: string;
    };
  };
  /** 테마가 켜고 끄는 앱 동작. 없으면 전부 꺼진 것. */
  features?: {
    /** 글보기 아래에 그 게시판의 목록(분류 칩 · 글 줄 · 쪽 · 검색)을 붙인다 — 그누보드 기본 화면. */
    listUnderPostView?: boolean;
    /**
     * 정적 배포본에서 게시판·글·상품·분류·안내·기획전으로 가는 링크를 문서 새로고침 대신 Next 라우터
     * (클라이언트 이동)로 보낸다. 속 데이터(주소.txt)는 브리지가 대표 껍데기의 것으로 내주고, 브리지가
     * 없는 호스트에서는 Next 가 스스로 문서 이동으로 물러난다. 끄면 예전처럼 전부 문서 이동.
     */
    clientNavigation?: boolean;
  };
  site: {
    name: string;
    description: string;
    logoText: string;
    logoMark: string;
    themeColor?: string;
    /** 첫 화면의 제목·설명. 커뮤니티가 아닌 테마(문서 사이트 등)가 덮어쓴다. */
    homeTitle?: string;
    homeDescription?: string;
    footerDescription: string;
    customerCenterTitle: string;
    customerCenterLines: string[];
    copyrightName: string;
  };
};

export type G5ThemeHomePost = WritePost & {
  boardHref: string;
  boardSubject: string;
  href: string;
};

export type G5ThemeBoardPreview = {
  board: Board;
  posts: WritePost[];
};

export type G5ThemeCommunityHomeData = {
  boardPosts: G5ThemeBoardPreview[];
  latestPosts: G5ThemeHomePost[];
  popularPosts: G5ThemeHomePost[];
  bbsRewriteMode?: number | string | null;
};

export type G5ThemeShopHomeData = {
  featuredProducts: ShopProduct[];
  bestProducts: ShopProduct[];
  recommendedProducts: ShopProduct[];
  latestProducts: ShopProduct[];
  saleProducts: ShopProduct[];
  popularProducts: ShopProduct[];
  reviews: ShopReview[];
};

export type G5ThemeComponentProps = {
  config: G5ThemeConfig;
  menus?: MenuItem[];
  shopCategories?: ShopCategory[];
  shopProducts?: ShopProduct[];
  communityHome?: G5ThemeCommunityHomeData;
  shopHome?: G5ThemeShopHomeData;
};

export type G5ThemeLayoutShellProps = G5ThemeComponentProps & {
  children: ReactNode;
};

/** 상품 카드 슬롯. 목록·홈의 격자가 카드 한 장을 그릴 때 부른다. href 는 앱이 계산한다. */
export type G5ThemeProductCardProps = {
  product: ShopProduct;
  href: string;
  priority?: boolean;
};

/** 글보기 헤더 슬롯. 데이터와 동작(작성자 사이드뷰·글 동작·공유)은 앱이 넘기고
 *  테마는 배치만 맡는다. */
export type G5ThemeBoardViewHeaderProps = {
  post: WritePost;
  boTable: string;
  boardName: string;
  /** 게시판 목록 주소. 테마가 머리에 "목록" 단추를 그릴 때 쓴다. */
  listHref?: string;
  author: ReactNode;
  actions: ReactNode;
  share: ReactNode;
};

/** 클라이언트 컴포넌트가 ThemeSlotsProvider 를 통해 받는 프레젠테이션 슬롯.
 *  구현체는 반드시 "use client" 모듈이어야 한다 (서버 레이아웃이 참조를 넘긴다). */
/** 상품 목록 페이지의 머리: 제목, 하위 분류, 정렬. 목록 자체와 페이지 넘김은 앱이 그린다. */
export type G5ThemeShopListHeaderProps = {
  title: string;
  category?: ShopCategory | null;
  subcategories: ShopCategory[];
  subcategoryHref: (category: ShopCategory) => string;
  total: number;
  /** 현재 sort 값. API 의 정렬 별칭(sales, price_asc, price_desc, rating, reviews, latest …)을 그대로 쓴다. */
  sort: string;
  onSortChange: (sort: string) => void;
  /** 앱이 갖는 추가 필터(상품 유형 칩 등) */
  filters?: ReactNode;
  /** 앱이 갖는 도구(검색 폼 등) — 정렬 줄 곁에 놓는다 */
  toolbar?: ReactNode;
  /** 목록 모양. 앱이 상품 격자에 data-view 로 같은 값을 붙이므로 테마 CSS 가 줄 모양을 정한다. */
  view?: ShopListView;
  /** 있으면 테마가 격자/목록 전환 단추를 그린다. */
  onViewChange?: (view: ShopListView) => void;
};

export type ShopListView = "grid" | "list";

/** 상품 상세 탭 하나. 접근성(role·aria·키보드)은 앱이 buttonProps 로 넘기고,
 *  테마는 그것을 자기 <button> 에 펼치기만 한다. */
export type G5ThemeProductDetailTab = {
  id: string;
  label: string;
  /** 후기·문의 건수처럼 라벨 곁에 작게 붙는 숫자 */
  count?: number;
  selected: boolean;
  buttonProps: ButtonHTMLAttributes<HTMLButtonElement>;
};

/** 상품 상세의 탭 띠와 그 아래 본문 배치. 탭 내용(상품설명·후기·문의·배송)은
 *  앱이 panel 로 그려 넘기고, 테마는 띠 모양과 본문 옆에 무엇을 둘지를 정한다. */
export type G5ThemeProductDetailTabsProps = {
  tabs: G5ThemeProductDetailTab[];
  /** 활성 탭의 내용. 이미 role="tabpanel" 이 붙어 있다. */
  panel: ReactNode;
  /** 옵션·수량·장바구니 단추 묶음. 테마가 본문 옆에 따라다니는 구매 상자를 그릴 때 쓴다. */
  purchaseControls?: ReactNode;
};

/** 게시판 목록의 글 한 줄. 목록 자체(<table>, 머리글, 페이지 넘김)는 앱이 그리고,
 *  테마는 <tr> 하나를 돌려준다 — 칸 수는 머리글과 같아야 한다(leading 이 있으면 +1). */
export type G5ThemeBoardListRowProps = {
  post: WritePost;
  boTable: string;
  href: string;
  /** 번호 칸. 공지는 undefined. */
  number?: number;
  isNotice: boolean;
  /** 게시판 설정(bo_new 시간, bo_hot 조회)으로 앱이 판정한 값 */
  isNew: boolean;
  isHot: boolean;
  /** 이미 읽은 글(방문 기록) */
  isVisited: boolean;
  /** 글보기 아래 목록에서 지금 보고 있는 그 글 */
  isCurrent: boolean;
  /** 답글 깊이(wr_reply 글자 수). 0 이면 원글. */
  replyDepth: number;
  /** 분류 칩이 갈 곳(?sca=). ca_name 이 있을 때만. */
  categoryHref?: string;
  /** 글쓴이 — 회원 사이드뷰 팝오버까지 든 앱의 노드 */
  author: ReactNode;
  /** 관리자 일괄 선택 칸의 내용(체크박스). 있으면 첫 칸으로 그린다. */
  leading?: ReactNode;
  /** 앱이 <tr> 에 붙이는 것(키보드 이동 표식 등). 테마는 자기 <tr> 에 펼친다. */
  rowProps?: HTMLAttributes<HTMLTableRowElement> & Record<`data-${string}`, string | undefined>;
};

export type G5ThemeClientSlots = {
  BoardListRow?: ComponentType<G5ThemeBoardListRowProps>;
  ProductCard?: ComponentType<G5ThemeProductCardProps>;
  BoardViewHeader?: ComponentType<G5ThemeBoardViewHeaderProps>;
  ShopListHeader?: ComponentType<G5ThemeShopListHeaderProps>;
  ProductDetailTabs?: ComponentType<G5ThemeProductDetailTabsProps>;
};

export type G5ThemeComponentSlots = G5ThemeClientSlots & {
  LayoutShell?: ComponentType<G5ThemeLayoutShellProps>;
  ShopLayoutShell?: ComponentType<G5ThemeLayoutShellProps>;
  HeaderBrand?: ComponentType<G5ThemeComponentProps>;
  FooterBrand?: ComponentType<G5ThemeComponentProps>;
  FooterContact?: ComponentType<G5ThemeComponentProps>;
  HomePage?: ComponentType<G5ThemeComponentProps>;
  HomePageLoading?: ComponentType;
  ShopHomePage?: ComponentType<G5ThemeComponentProps>;
  ShopHomePageLoading?: ComponentType;
  CommunityPage?: ComponentType<G5ThemeComponentProps>;
  OrganicPage?: ComponentType<G5ThemeComponentProps>;
};
