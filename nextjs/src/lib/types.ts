// 회원 (g5_member)
export interface Member {
  mb_no: number;
  mb_id: string;
  mb_name: string;
  mb_nick: string;
  mb_email: string;
  mb_hp: string;
  mb_tel: string;
  mb_level: number;
  mb_point: number;
  mb_certify: string;
  mb_adult: number;
  mb_mailling: number;
  mb_sms: number;
  mb_open: number;
  mb_today_login: string;
  mb_datetime: string;
  mb_leave_date: string;
  mb_intercept_date: string;
  mb_email_certify: string;
  mb_icon_path?: string;
  mb_homepage?: string;
  mb_signature?: string;
  mb_profile?: string;
  mb_memo?: string;
  mb_1?: string;
  mb_2?: string;
  mb_3?: string;
  mb_4?: string;
  mb_5?: string;
  mb_6?: string;
  mb_7?: string;
  mb_8?: string;
  mb_9?: string;
  mb_10?: string;
}

export interface MemberProfile {
  mb_id: string;
  mb_nick: string;
  mb_level: number;
  mb_point: number;
  mb_open: number;
  mb_datetime: string;
  mb_icon_path?: string;
  mb_homepage?: string;
  mb_profile?: string;
  reg_days: number;
}

// 게시판 설정 (g5_board)
export interface Board {
  bo_table: string;
  gr_id: string;
  bo_subject: string;
  bo_mobile_subject: string;
  bo_device: string;
  bo_admin: string;
  bo_category_list: string;
  /** 분류별 글 수. 분류를 쓰는 게시판에만 온다. */
  category_counts?: Record<string, number>;
  bo_list_level: number;
  bo_read_level: number;
  bo_write_level: number;
  bo_reply_level: number;
  bo_comment_level: number;
  bo_upload_level: number;
  bo_download_level: number;
  bo_html_level: number;
  bo_link_level: number;
  bo_count_delete: number;
  bo_count_modify: number;
  bo_read_point: number;
  bo_write_point: number;
  bo_comment_point: number;
  bo_download_point: number;
  bo_use_category: number;
  bo_use_sideview: number;
  bo_use_file_content: number;
  bo_use_secret: number;
  bo_use_dhtml_editor: number;
  bo_use_rss_view: number;
  bo_use_good: number;
  bo_use_nogood: number;
  bo_use_name: number;
  bo_use_signature: number;
  bo_use_ip_view: number;
  bo_use_list_view: number;
  bo_use_list_file: number;
  bo_use_list_content: number;
  bo_use_email: number;
  bo_page_rows: number;
  bo_mobile_page_rows: number;
  bo_subject_len: number;
  bo_mobile_subject_len: number;
  bo_new: number;
  bo_hot: number;
  bo_image_width: number;
  bo_skin: string;
  bo_mobile_skin: string;
  bo_content_head: string;
  bo_content_tail: string;
  bo_mobile_content_head: string;
  bo_mobile_content_tail: string;
  bo_gallery_cols: number;
  bo_gallery_width: number;
  bo_gallery_height: number;
  bo_mobile_gallery_width: number;
  bo_mobile_gallery_height: number;
  bo_upload_size: number;
  bo_reply_order: number;
  bo_use_search: number;
  bo_order: number;
  bo_count_write: number;
  bo_count_comment: number;
  bo_write_min: number;
  bo_write_max: number;
  bo_comment_min: number;
  bo_comment_max: number;
  bo_notice: string;
  bo_upload_count: number;
  bo_content?: string;
}

// 게시글 (g5_write_*)
export interface Post {
  wr_id: number;
  wr_num: number;
  wr_reply: string;
  wr_parent: number;
  wr_is_comment: number;
  wr_comment: number;
  wr_comment_reply: string;
  ca_name: string;
  wr_option: string;
  wr_subject: string;
  wr_content: string;
  wr_seo_title: string;
  wr_link1: string;
  wr_link2: string;
  wr_link1_hit: number;
  wr_link2_hit: number;
  wr_hit: number;
  wr_good: number;
  wr_nogood: number;
  wr_name: string;
  wr_password?: string;
  mb_id: string;
  wr_email: string;
  wr_homepage: string;
  wr_datetime: string;
  wr_last: string;
  wr_ip: string;
  wr_1?: string;
  wr_2?: string;
  wr_3?: string;
  wr_4?: string;
  wr_5?: string;
  wr_6?: string;
  wr_7?: string;
  wr_8?: string;
  wr_9?: string;
  wr_10?: string;
  // 확장 필드 (API에서 추가)
  thumbnail?: string;
  images?: string[];
  files?: PostFile[];
  is_notice?: boolean;
  is_new?: boolean;
  is_hot?: boolean;
  is_secret?: boolean;
  mb_nick?: string;
  mb_icon_path?: string;
  bo_table?: string;
  bo_subject?: string;
  bo_use_good?: number;
  bo_use_nogood?: number;
  member?: Pick<Member, 'mb_id' | 'mb_nick' | 'mb_icon_path'>;
  // 단건 조회 응답에만 포함. 그누보드 표준 권한(cf_admin/gr_admin/bo_admin/owner) 결과.
  can_manage?: boolean;
  admin_role?: 'super' | 'group' | 'board' | '';
  is_scrapped?: boolean;
  scrap_id?: number;
}

// 게시글 목록용 (API 응답)
export type WritePost = Post;

export interface PostFile {
  bf_no: number;
  bo_table: string;
  wr_id: number;
  bf_source: string;
  bf_file: string;
  bf_download: number;
  bf_content: string;
  bf_fileurl?: string;    // DB 원본 컬럼 (외부 URL 저장용) — 백엔드 응답에서 누락 가능
  bf_thumburl?: string;
  bf_storage?: string;
  bf_filesize: number;
  bf_width: number;
  bf_height: number;
  bf_type: number;
  bf_datetime: string;
  /** API가 합성해 내려주는 다운로드/표시용 URL. 우선 사용. */
  bf_url?: string;
  bf_download_url?: string;
}

// 댓글
export interface Comment {
  wr_id: number;
  wr_parent: number;
  wr_is_comment: number;
  wr_comment: number;
  wr_comment_reply: string;
  wr_content: string;
  wr_name: string;
  mb_id: string;
  wr_datetime: string;
  wr_last: string;
  wr_ip: string;
  wr_option: string;
  mb_nick?: string;
  member?: Pick<Member, 'mb_id' | 'mb_nick' | 'mb_icon_path'>;
}

// 쇼핑몰 카테고리 (g5_shop_category)
export interface Category {
  ca_id: string;
  ca_name: string;
  ca_order: number;
  ca_skin: string;
  ca_mobile_skin: string;
  ca_skin_dir: string;
  ca_mobile_skin_dir: string;
  ca_img: string;
  ca_description: string;
  ca_use: number;
  ca_id_parent?: string;
  ca_name_full?: string;
  item_count?: number;
  children?: Category[];
}

// 상품 (g5_shop_item)
export interface ShopItem {
  it_id: string;
  ca_id: string;
  it_name: string;
  it_mobile_subject?: string;
  it_type: number;
  it_basic: string;
  it_cust_price: number;
  it_price: number;
  it_point: number;
  it_supply_point: number;
  it_notax: number;
  it_sell_email: string;
  it_use: number;
  it_nocoupon: number;
  it_point_type: number;
  it_img1: string;
  it_img2: string;
  it_img3: string;
  it_info: string;
  it_mobile_info?: string;
  it_explan: string;
  it_mobile_explan?: string;
  it_stock_qty: number;
  it_noti_qty: number;
  it_sc_type: number;
  it_sc_method: number;
  it_sc_price: number;
  it_sc_minimum: number;
  it_sc_qty: number;
  it_hit: number;
  it_sum_qty: number;
  it_use_avg: number;
  it_use_cnt: number;
  it_skin: string;
  it_mobile_skin: string;
  it_explan2: string;
  it_mobile_explan2?: string;
  it_datetime: string;
  it_update: string;
  it_order: number;
  // 확장 필드
  options?: ShopItemOption[];
  images?: string[];
  reviews_count?: number;
  qna_count?: number;
  category?: Category;
}

export interface ShopItemOption {
  io_no: number;
  it_id: string;
  io_id: string;
  io_type: string;
  io_value: string;
  io_price: number;
  io_stock_qty: number;
  io_use: number;
}

// 장바구니 (g5_shop_cart)
export interface CartItem {
  ct_id: number;
  mb_id: string;
  it_id: string;
  it_name: string;
  ct_status: string;
  ct_price: number;
  ct_point: number;
  ct_qty: number;
  line_total?: number;
  ct_option: string;
  ct_time: string;
  ct_notax: number;
  ct_send_cost: number;
  // 확장 필드 — 백엔드 cart.php GET 응답이 보내는 image_url 도 함께 매핑.
  item?: ShopItem;
  image?: string;
  image_url?: string;
}

// 주문 (g5_shop_order)
export interface Order {
  od_id: string;
  mb_id: string;
  od_name: string;
  od_tel: string;
  od_hp: string;
  od_email: string;
  od_zip: string;
  od_addr1: string;
  od_addr2: string;
  od_addr3: string;
  od_b_name: string;
  od_b_tel: string;
  od_b_hp: string;
  od_b_zip: string;
  od_b_addr1: string;
  od_b_addr2: string;
  od_b_addr3: string;
  od_memo: string;
  od_cart_price: number;
  od_send_cost: number;
  od_send_cost2: number;
  od_receipt_price: number;
  od_cancel_price: number;
  od_receipt_point: number;
  od_deposit_name: string;
  od_status: string;
  od_settle_case: string;
  od_test: string;
  od_misu: number;
  od_pg: string;
  od_tno: string;
  od_app_no: string;
  od_tax_flag: number;
  od_tax_mny: number;
  od_vat_mny: number;
  od_free_mny: number;
  od_coupon: number;
  od_send_coupon: number;
  od_point: number;
  od_cash_no: string;
  od_cash_res: string;
  od_datetime: string;
  od_ip: string;
  // 확장 필드
  items?: CartItem[];
}

// 상품후기 (g5_shop_item_use)
export interface Review {
  is_id: number;
  mb_id: string;
  it_id: string;
  it_name: string;
  is_name: string;
  is_score: number;
  is_subject: string;
  is_content: string;
  is_time: string;
  is_ip: string;
  is_confirm: string;
  // 확장 필드
  member?: Pick<Member, 'mb_id' | 'mb_nick' | 'mb_icon_path'>;
  item?: Pick<ShopItem, 'it_id' | 'it_name' | 'it_img1'>;
}

// 상품문의 (g5_shop_item_qa)
export interface QA {
  iq_id: number;
  mb_id: string;
  it_id: string;
  it_name: string;
  iq_name: string;
  iq_email: string;
  iq_hp: string;
  iq_subject: string;
  iq_question: string;
  iq_answer: string;
  iq_time: string;
  iq_ip: string;
  iq_secret: number;
  // 확장 필드
  member?: Pick<Member, 'mb_id' | 'mb_nick'>;
  item?: Pick<ShopItem, 'it_id' | 'it_name' | 'it_img1'>;
}

// 페이지네이션 메타
export interface PaginationMeta {
  total: number;
  current_page: number;
  per_page: number;
  last_page: number;
  from: number | null;
  to: number | null;
}

// API 응답 래퍼
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string>;
  meta?: PaginationMeta;
}

// 회원가입 데이터
export interface RegisterData {
  mb_id: string;
  mb_password: string;
  mb_password_confirm: string;
  mb_name: string;
  mb_nick: string;
  mb_email: string;
  mb_hp?: string;
  mb_zip?: string;
  mb_addr1?: string;
  mb_addr2?: string;
  mb_addr3?: string;
  mb_recommend?: string;
}

// 로그인 응답
export interface LoginResponse {
  token: string;
  /** Refresh token (30일 유효). 첫 로그인 응답에 포함, rotate 시 refresh 응답에도. */
  refresh_token?: string;
  /** Access token 수명(초). 클라이언트가 만료 임박 시 사전 갱신 판단용. */
  expires_in?: number;
  /** 그누보드5 자동로그인 체크 여부. 1이면 refresh cookie를 persistent로 저장. */
  auto_login?: 0 | 1 | boolean;
  user?: Pick<Member, 'mb_id' | 'mb_nick' | 'mb_name' | 'mb_email' | 'mb_level' | 'mb_point' | 'mb_icon_path'>;
  member?: Record<string, string | number | undefined>;
}

// 쪽지 (g5_memo)
export interface Memo {
  me_id: number;
  me_recv_mb_id: string;
  me_send_mb_id: string;
  me_send_datetime: string;
  me_read_datetime: string;
  me_memo: string;
  me_send_id: number;
  me_type: 'send' | 'recv';
  me_send_ip: string;
}

// 스크랩 (g5_scrap)
export interface Scrap {
  ms_id: number;
  mb_id: string;
  bo_table: string;
  wr_id: number;
  ms_datetime: string;
  bo_subject: string;
  wr_subject: string;
  wr_seo_title?: string;
  wr_datetime: string;
  wr_name: string;
  post_mb_id: string;
  href: string;
}

// FAQ (g5_faq, g5_faq_master)
export interface FaqMaster {
  fm_id: number;
  fm_subject: string;
  fm_head_html: string;
  fm_tail_html: string;
  fm_mobile_head_html: string;
  fm_mobile_tail_html: string;
  fm_order: number;
}

export interface FaqItem {
  fa_id: number;
  fm_id: number;
  fa_subject: string;
  fa_content: string;
  fa_order: number;
}

export interface FaqPageData {
  masters: FaqMaster[];
  current: FaqMaster | null;
  items: FaqItem[];
  meta: {
    total: number;
    per_page: number;
    current_page: number;
    last_page: number;
    from: number | null;
    to: number | null;
  };
}

// 설문조사 / 투표 (g5_poll, g5_poll_etc)
export interface PollOption {
  num: number;
  content: string;
  count: number;
  rate: number;
  bar: number;
}

export interface PollComment {
  pc_id: number;
  po_id: number;
  mb_id: string;
  pc_name: string;
  pc_idea: string;
  pc_datetime: string;
  can_delete: boolean;
}

export interface PollSummary {
  po_id: number;
  po_subject: string;
  po_date: string;
  po_use: number;
  is_current?: boolean;
}

export interface Poll {
  po_id: number;
  po_subject: string;
  po_etc: string;
  po_level: number;
  po_point: number;
  po_date: string;
  po_use: number;
  is_active: boolean;
  options: PollOption[];
  total_count: number;
  has_voted: boolean;
  can_vote: boolean;
  can_view_result: boolean;
  can_comment: boolean;
  etc_comments: PollComment[];
  other_polls: PollSummary[];
}

// 1:1 문의 (g5_qa_config, g5_qa_content)
export interface QaConfig {
  qa_title: string;
  qa_category: string;
  categories: string[];
  qa_use_email: number;
  qa_req_email: number;
  qa_use_hp: number;
  qa_req_hp: number;
  qa_use_sms: number;
  qa_subject_len: number;
  qa_page_rows: number;
  qa_mobile_page_rows: number;
  qa_insert_content: string;
  qa_content_head: string;
  qa_content_tail: string;
  qa_mobile_content_head: string;
  qa_mobile_content_tail: string;
}

export interface QaItem {
  qa_id: number;
  qa_num: number;
  qa_parent: number;
  qa_related: number;
  mb_id: string;
  qa_name: string;
  qa_email: string;
  qa_hp: string;
  qa_type: number;
  qa_category: string;
  qa_email_recv: number;
  qa_sms_recv: number;
  qa_html: number;
  qa_subject: string;
  qa_content: string;
  qa_status: number;
  qa_file1: string;
  qa_source1: string;
  qa_file2: string;
  qa_source2: string;
  qa_file1_url: string;
  qa_file2_url: string;
  qa_datetime: string;
  can_edit: boolean;
  can_delete: boolean;
  answer: QaItem | null;
  related_questions: QaItem[];
}

// 새글/새댓글 (g5_board_new join, /v1/recent)
export interface RecentItem {
  bn_id: number;
  gr_id: string;
  gr_subject: string;
  bo_table: string;
  bo_subject: string;
  wr_id: number;
  wr_parent: number;
  wr_subject: string;
  wr_seo_title?: string;
  is_comment: boolean;
  mb_id: string;
  wr_name: string;
  wr_email: string;
  wr_homepage: string;
  wr_datetime: string;
  href: string;
}

export interface RecentGroup {
  gr_id: string;
  gr_subject: string;
}
