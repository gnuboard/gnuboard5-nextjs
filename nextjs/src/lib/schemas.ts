import * as z from "zod";
import type {
  Board,
  Comment,
  PostFile,
  RecentGroup,
  RecentItem,
  WritePost,
  MemberProfile,
} from "@/lib/types";
import type { MenuItem } from "@/components/layout/menu";
import {
  booleanValue,
  numberValue,
  optionalString,
  stringValue,
} from "@/lib/schemas/primitives";

export const memberProfileSchema = z
  .object({
    mb_id: stringValue,
    mb_nick: stringValue,
    mb_level: numberValue,
    mb_point: numberValue,
    mb_open: numberValue,
    mb_datetime: stringValue,
    mb_icon_path: optionalString,
    mb_image_path: optionalString,
    mb_homepage: optionalString,
    mb_profile: optionalString,
    reg_days: numberValue,
  })
  .passthrough() as unknown as z.ZodType<MemberProfile>;

export const boardSchema = z
  .object({
    bo_table: stringValue,
    gr_id: stringValue,
    bo_subject: stringValue,
    bo_content: optionalString,
    bo_category_list: stringValue,
    category_counts: z.record(z.string(), numberValue).optional(),
    bo_page_rows: numberValue,
    bo_gallery_cols: numberValue,
    bo_count_write: numberValue,
    bo_count_comment: numberValue,
    bo_use_dhtml_editor: numberValue,
  })
  .passthrough() as unknown as z.ZodType<Board>;

export const boardListSchema = z.array(boardSchema);

const writePostShape = {
  wr_id: numberValue,
  wr_num: numberValue,
  wr_parent: numberValue,
  wr_is_comment: numberValue,
  ca_name: stringValue,
  wr_option: stringValue,
  wr_subject: stringValue,
  wr_content: stringValue,
  wr_content_view: optionalString,
  wr_seo_title: stringValue,
  wr_name: stringValue,
  wr_email: stringValue,
  wr_homepage: stringValue,
  wr_datetime: stringValue,
  wr_last: stringValue,
  wr_ip: stringValue,
  wr_comment: numberValue,
  wr_hit: numberValue,
  wr_good: numberValue,
  wr_nogood: numberValue,
  mb_id: stringValue,
  mb_nick: optionalString,
  mb_icon_path: optionalString,
  thumbnail: optionalString,
  is_notice: booleanValue.optional(),
  is_new: booleanValue.optional(),
  is_hot: booleanValue.optional(),
  is_secret: booleanValue.optional(),
  bo_use_good: numberValue.optional(),
  bo_use_nogood: numberValue.optional(),
  is_scrapped: booleanValue.optional(),
  scrap_id: numberValue.optional(),
};

const writePostObjectSchema = z.object(writePostShape).passthrough();

export const writePostSchema = writePostObjectSchema as unknown as z.ZodType<WritePost>;

export const writePostListSchema = z.array(writePostSchema);

export const postFileSchema = z
  .object({
    bf_no: numberValue,
    bo_table: stringValue,
    wr_id: numberValue,
    bf_source: stringValue,
    bf_file: stringValue,
    bf_download: numberValue,
    bf_content: stringValue,
    // bf_fileurl/bf_thumburl/bf_storage 는 백엔드 API 가 항상 내려보내지 않음.
    // 누락 시 zod parse 실패로 단건 게시글 fetch 가 null 반환 → notFound() 호출되는
    // 사고가 있어 optional 로 처리. UI 는 bf_url 우선 사용 (bf_fileurl 은 DB 원본).
    bf_fileurl: optionalString,
    bf_thumburl: optionalString,
    bf_storage: optionalString,
    bf_filesize: numberValue,
    bf_width: numberValue,
    bf_height: numberValue,
    bf_type: numberValue,
    bf_datetime: stringValue,
    bf_url: optionalString,
    bf_view_url: optionalString,
    bf_download_url: optionalString,
  })
  .passthrough() as unknown as z.ZodType<PostFile>;

export const commentSchema = z
  .object({
    wr_id: numberValue,
    wr_parent: numberValue,
    wr_is_comment: numberValue,
    wr_comment: numberValue,
    wr_comment_reply: stringValue,
    wr_content: stringValue,
    wr_name: stringValue,
    mb_id: stringValue,
    wr_datetime: stringValue,
    wr_last: stringValue,
    wr_ip: stringValue,
    wr_option: stringValue,
    mb_nick: optionalString,
  })
  .passthrough() as unknown as z.ZodType<Comment>;

export const postNavItemSchema = z
  .object({
    wr_id: numberValue,
    wr_subject: stringValue,
    wr_seo_title: stringValue.optional(),
  })
  .passthrough();

export const postDetailSchema = writePostObjectSchema
  .extend({
    files: z.array(postFileSchema).optional(),
    comments: z.array(commentSchema).optional(),
    prev_post: postNavItemSchema.nullable().optional(),
    next_post: postNavItemSchema.nullable().optional(),
  })
  .passthrough();

export const menuItemSchema: z.ZodType<MenuItem> = z.lazy(() =>
  z
    .object({
      me_id: numberValue,
      me_code: stringValue,
      me_name: stringValue,
      me_link: stringValue,
      me_target: stringValue,
      children: z.array(menuItemSchema).optional(),
    })
    .passthrough()
) as z.ZodType<MenuItem>;

export const menuItemListSchema = z.array(menuItemSchema);

export const searchResultItemSchema = z
  .object({
    wr_id: numberValue,
    wr_subject: stringValue,
    wr_seo_title: stringValue.optional(),
    wr_name: stringValue,
    wr_datetime: stringValue,
    mb_nick: optionalString,
    ca_name: optionalString,
    /** 검색어 주변을 잘라 낸 본문. API 가 만들어 준다. */
    wr_content_preview: optionalString,
  })
  .passthrough();

export const searchResultSchema = z
  .object({
    bo_table: stringValue,
    bo_subject: stringValue,
    count: numberValue.optional(),
    list: z.array(searchResultItemSchema).default([]),
  })
  .passthrough();

// Raw board group as returned by PHP /api/v1/search — uses `posts` instead of `list`.
const searchResultGroupSchema = z
  .object({
    bo_table: stringValue,
    bo_subject: stringValue,
    count: numberValue.optional(),
    posts: z.array(searchResultItemSchema).default([]),
  })
  .passthrough();

// PHP wraps the groups: { keyword, total_count, results: [...] } with `posts`.
// Accept both the wrapped shape (current backend) and a bare array of
// SearchResult (legacy / future), normalizing into SearchResult[] so callers
// see a stable shape.
export const searchResultListSchema = z.union([
  z
    .object({
      keyword: stringValue.optional(),
      total_count: numberValue.optional(),
      results: z.array(searchResultGroupSchema).default([]),
    })
    .transform((envelope): SearchResult[] =>
      envelope.results.map((group) => ({
        bo_table: group.bo_table,
        bo_subject: group.bo_subject,
        // 이 게시판의 전체 일치 수. list 는 그중 한 페이지분이라, 이 값이 없으면
        // 화면이 "더 있는지" 를 알 수 없다.
        count: group.count,
        list: group.posts,
      }))
    ),
  z.array(searchResultSchema),
]);

export type SearchResult = {
  bo_table: string;
  bo_subject: string;
  /** 그 게시판의 전체 일치 수. 목록보다 크면 더 볼 것이 남아 있다. */
  count?: number;
  list: z.infer<typeof searchResultItemSchema>[];
};

/** 접속자집계 — /v1/settings 가 cf_visit 을 네 수치로 갈라 내려 준다. */
export const visitStatsSchema = z.object({
  today: numberValue,
  yesterday: numberValue,
  max: numberValue,
  total: numberValue,
});

export type VisitStats = z.infer<typeof visitStatsSchema>;

const memberMediaRuleSchema = z
  .object({
    enabled: booleanValue,
    level: numberValue,
    size: numberValue,
    width: numberValue,
    height: numberValue,
  })
  .partial();

export const publicSettingsSchema = z
  .object({
    cf_bbs_rewrite: numberValue.optional(),
    /** 그누보드 관리자의 사이트 제목 — 제목·공유 카드·구조화 데이터의 사이트 이름. */
    cf_title: z.string().optional(),
    infinite_scroll: booleanValue.optional(),
    comment_editor: booleanValue.optional(),
    pwa_enabled: booleanValue.optional(),
    visit: visitStatsSchema.optional(),
    /** 회원아이콘 · 회원이미지 설정(관리자 > 기본환경설정 > 회원가입). size 는 바이트, width · height 는 px. */
    member_media: z
      .object({ icon: memberMediaRuleSchema, image: memberMediaRuleSchema })
      .partial()
      .optional(),
  })
  .passthrough();

export type PublicSettings = z.infer<typeof publicSettingsSchema>;

/** 인기검색어 — /v1/search/popular */
export const popularKeywordSchema = z.object({
  pp_word: stringValue,
  cnt: numberValue,
});

export const popularKeywordListSchema = z.array(popularKeywordSchema);

export type PopularKeyword = z.infer<typeof popularKeywordSchema>;

export const recentItemSchema = z
  .object({
    bn_id: numberValue,
    gr_id: stringValue,
    gr_subject: stringValue,
    bo_table: stringValue,
    bo_subject: stringValue,
    wr_id: numberValue,
    wr_parent: numberValue,
    wr_subject: stringValue,
    wr_seo_title: stringValue.optional(),
    is_comment: booleanValue,
    comment_excerpt: z.string().nullable().optional(),
    mb_id: stringValue,
    wr_name: stringValue,
    wr_email: stringValue,
    wr_homepage: stringValue,
    wr_datetime: stringValue,
    href: stringValue,
  })
  .passthrough() as unknown as z.ZodType<RecentItem>;

export const recentItemListSchema = z.array(recentItemSchema);

export const recentGroupSchema = z
  .object({
    gr_id: stringValue,
    gr_subject: stringValue,
  })
  .passthrough() as unknown as z.ZodType<RecentGroup>;

export const recentGroupListSchema = z.array(recentGroupSchema);

export const myPostSchema = z
  .object({
    wr_id: numberValue,
    wr_subject: stringValue,
    wr_seo_title: stringValue.optional(),
    wr_datetime: stringValue,
    bo_table: stringValue,
    bo_subject: optionalString,
  })
  .passthrough();

export const myPostListSchema = z.array(myPostSchema);

export const myCommentSchema = z
  .object({
    wr_id: numberValue,
    wr_content: stringValue,
    wr_datetime: stringValue,
    bo_table: stringValue,
    bo_subject: optionalString,
    wr_parent: numberValue,
  })
  .passthrough();

export const myCommentListSchema = z.array(myCommentSchema);

export const pointItemSchema = z
  .object({
    po_id: numberValue,
    po_content: stringValue,
    po_point: numberValue,
    po_use_point: numberValue,
    po_mb_point: numberValue,
    po_datetime: stringValue,
    po_rel_table: stringValue,
    po_rel_action: stringValue,
  })
  .passthrough();

export const pointItemListSchema = z.array(pointItemSchema);

export const couponSchema = z
  .object({
    cp_id: stringValue,
    cp_subject: stringValue,
    cp_method: stringValue,
    cp_price: numberValue,
    cp_start: stringValue,
    cp_end: stringValue,
    cp_minimum: numberValue,
    cp_used: stringValue,
  })
  .passthrough();

export const couponListSchema = z.array(couponSchema);

export const savedAddressSchema = z
  .object({
    ad_id: numberValue,
    ad_subject: stringValue,
    ad_default: numberValue,
    ad_name: stringValue,
    ad_tel: stringValue,
    ad_hp: stringValue,
    ad_zip1: stringValue,
    ad_zip2: stringValue,
    ad_addr1: stringValue,
    ad_addr2: stringValue,
    ad_addr3: stringValue,
    ad_jibeon: stringValue,
  })
  .passthrough();

export const savedAddressListSchema = z.array(savedAddressSchema);

export const contentDataSchema = z
  .object({
    co_id: stringValue,
    co_subject: stringValue,
    co_content: stringValue,
    co_html: numberValue,
    co_skin: stringValue,
  })
  .passthrough();

export type MyPost = z.infer<typeof myPostSchema>;
export type MyComment = z.infer<typeof myCommentSchema>;
export type PointItem = z.infer<typeof pointItemSchema>;
export type Coupon = z.infer<typeof couponSchema>;
export type SavedAddress = z.infer<typeof savedAddressSchema>;
export type ContentData = z.infer<typeof contentDataSchema>;

export * from "@/lib/schemas/shop";

export {
  authAvailabilitySchema,
  faqItemSchema,
  faqMasterSchema,
  faqPageDataSchema,
  memoListSchema,
  memoSchema,
  notificationItemSchema,
  notificationListSchema,
  notificationReadSchema,
  notificationResponseSchema,
  passwordResetRequestSchema,
  pollCommentSchema,
  pollOptionSchema,
  pollSchema,
  pollSummarySchema,
  qaConfigSchema,
  qaItemListSchema,
  qaItemSchema,
  scrapListSchema,
  scrapSchema,
} from "@/lib/schemas/community";

export type {
  AuthAvailability,
  NotificationItem,
} from "@/lib/schemas/community";
